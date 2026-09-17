import { extensionManifestSchema, type ExtensionDependency, type ExtensionManifest, type ExtensionPackageManifest, type ExtensionPermission, type ExtensionPermissionPreview, type ExtensionRegistrySnapshot, type ExporterExtension, type ImporterExtension, type ProviderExtension, type WorkflowNodeExtension } from '../../shared/extensions'
import { DomainError } from './errors'
import { verifyExtensionPackageManifest, type TrustedExtensionKey } from './extension-package'

/** Main-process registry for built-in and trusted extensions. No filesystem
 * discovery or arbitrary JS execution is performed by this registry. */
export class ExtensionRegistry {
  private state: {
    manifests: readonly (ExtensionManifest & { dependencies: readonly ExtensionDependency[] })[]
    providers: readonly ProviderExtension[]
    workflowNodes: readonly WorkflowNodeExtension[]
    importers: readonly ImporterExtension[]
    exporters: readonly ExporterExtension[]
  } = { manifests: [], providers: [], workflowNodes: [], importers: [], exporters: [] }
  private readonly permissionGrants = new Map<string, { version: string; permissions: readonly ExtensionPermission[] }>()

  registerManifest(input: unknown): ExtensionManifest {
    const parsed = extensionManifestSchema.safeParse(input)
    if (!parsed.success) throw new DomainError('VALIDATION_FAILED', '扩展权限声明无效', { details: parsed.error.issues })
    this.state = this.replaceManifest({ ...parsed.data, dependencies: [] })
    return parsed.data
  }

  registerPackageManifest(input: unknown, trustedKeys: readonly TrustedExtensionKey[], options: { allowRetired?: boolean } = {}): ExtensionManifest {
    const verified = verifyExtensionPackageManifest(input, trustedKeys, options)
    this.assertPackageDependencies(verified)
    this.state = this.replaceManifest(verified)
    return verified
  }

  assertPackageDependencies(manifest: Pick<ExtensionPackageManifest, 'id' | 'dependencies'>): void {
    this.assertDependencies(manifest.dependencies)
  }

  assertDependencies(dependencies: readonly ExtensionDependency[]): void {
    const missing = dependencies.filter((dependency) => !this.state.manifests.some((item) => item.id === dependency.id))
    if (missing.length) throw new DomainError('VALIDATION_FAILED', `扩展依赖未安装：${missing.map((dependency) => dependency.id).join('、')}`)
    const incompatible = dependencies.filter((dependency) => {
      const installed = this.state.manifests.find((item) => item.id === dependency.id)
      return installed !== undefined && !satisfiesVersion(installed.version, dependency.version)
    })
    if (incompatible.length) throw new DomainError('VALIDATION_FAILED', `扩展依赖版本不兼容：${incompatible.map((dependency) => `${dependency.id} ${dependency.version}`).join('、')}`)
  }

  uninstallManifest(id: string): void {
    const dependents = this.state.manifests.filter((manifest) => manifest.dependencies?.some((dependency) => dependency.id === id))
    if (dependents.length) throw new DomainError('VALIDATION_FAILED', `扩展仍被其他扩展依赖：${dependents.map((manifest) => manifest.id).join('、')}`)
    if (!this.state.manifests.some((manifest) => manifest.id === id)) throw new DomainError('PROJECT_NOT_FOUND', `扩展不存在: ${id}`)
    this.state = {
      ...this.state,
      manifests: this.state.manifests.filter((manifest) => manifest.id !== id),
      workflowNodes: this.state.workflowNodes.filter((node) => node.extensionId !== id)
    }
    this.permissionGrants.delete(id)
  }

  grantPermissions(id: string, permissions: readonly ExtensionPermission[]): void {
    const manifest = this.state.manifests.find((item) => item.id === id)
    if (!manifest) throw new DomainError('PROJECT_NOT_FOUND', `扩展不存在: ${id}`)
    const declared = new Set(manifest.permissions.map(({ permission }) => permission))
    const granted = new Set(permissions)
    if (granted.size !== permissions.length || granted.size !== declared.size || [...granted].some((permission) => !declared.has(permission))) {
      throw new DomainError('VALIDATION_FAILED', '扩展权限未获得用户批准')
    }
    this.permissionGrants.set(id, { version: manifest.version, permissions: [...granted] })
  }

  revokePermissions(id: string): void { this.permissionGrants.delete(id) }

  assertPermissionsGranted(id: string, permissions: readonly ExtensionPermission[]): void {
    if (!permissions.length) return
    const manifest = this.state.manifests.find((item) => item.id === id)
    const grant = this.permissionGrants.get(id)
    const allowed = grant && manifest && grant.version === manifest.version && permissions.every((permission) => grant.permissions.includes(permission))
    if (!allowed) throw new DomainError('VALIDATION_FAILED', `扩展权限未获得批准：${id}`)
  }

  permissionPreview(id: string): ExtensionPermissionPreview | null {
    const manifest = this.state.manifests.find((item) => item.id === id)
    if (!manifest) return null
    return { id: manifest.id, name: manifest.name, version: manifest.version, permissions: manifest.permissions.map(({ permission }) => permission) }
  }

  registerProvider(extension: ProviderExtension): void {
    this.state = { ...this.state, providers: this.replaceUnique(this.state.providers, extension, (item) => item.id) }
  }

  registerWorkflowNode(extension: WorkflowNodeExtension): void {
    if (extension.extensionId && !this.state.manifests.some((manifest) => manifest.id === extension.extensionId)) {
      throw new DomainError('PROJECT_NOT_FOUND', `扩展不存在: ${extension.extensionId}`)
    }
    if (extension.permissions?.length) {
      if (!extension.extensionId) throw new DomainError('VALIDATION_FAILED', '带权限的 Workflow handler 必须声明所属扩展')
      const manifest = this.state.manifests.find((item) => item.id === extension.extensionId)
      const declared = new Set(manifest?.permissions.map(({ permission }) => permission))
      const requested = new Set(extension.permissions)
      if (requested.size !== extension.permissions.length || [...requested].some((permission) => !declared.has(permission))) {
        throw new DomainError('VALIDATION_FAILED', `Workflow handler 所需权限未声明：${extension.type}`)
      }
    }
    this.state = { ...this.state, workflowNodes: this.replaceUnique(this.state.workflowNodes, extension, (item) => item.type) }
  }

  getWorkflowNode(type: string): WorkflowNodeExtension {
    const extension = this.state.workflowNodes.find((item) => item.type === type)
    if (!extension) throw new DomainError('PROJECT_NOT_FOUND', `Workflow Node extension 不存在: ${type}`)
    return extension
  }

  registerImporter(extension: ImporterExtension): void {
    this.assertDescriptorOwner(extension)
    this.state = { ...this.state, importers: this.replaceUnique(this.state.importers, extension, (item) => item.id) }
  }

  registerExporter(extension: ExporterExtension): void {
    this.assertDescriptorOwner(extension)
    this.state = { ...this.state, exporters: this.replaceUnique(this.state.exporters, extension, (item) => item.id) }
  }

  getProvider(id: string): ProviderExtension {
    const extension = this.state.providers.find((item) => item.id === id)
    if (!extension) throw new DomainError('PROJECT_NOT_FOUND', `Provider extension 不存在: ${id}`)
    return extension
  }

  getImporterForExtension(extension: string): ImporterExtension {
    const normalized = extension.toLowerCase().replace(/^\./, '')
    const importer = this.state.importers.find((item) => item.extensions.some((value) => value.toLowerCase().replace(/^\./, '') === normalized))
    if (!importer) throw new DomainError('VALIDATION_FAILED', `没有支持 .${normalized} 的导入器`)
    return importer
  }

  getExporter(format: string): ExporterExtension {
    const exporter = this.state.exporters.find((item) => item.format === format)
    if (!exporter) throw new DomainError('VALIDATION_FAILED', `没有支持 ${format} 的导出器`)
    return exporter
  }

  snapshot(): ExtensionRegistrySnapshot {
    return {
      manifests: this.state.manifests.map(({ id, name, version, permissions }) => ({ id, name, version, permissions: permissions.map(({ permission, reason }) => ({ permission, reason })) })),
      providers: this.state.providers.map(({ id, kind, label }) => ({ id, kind, label })),
      workflowNodes: this.state.workflowNodes.map(({ type, label }) => ({ type, label })),
      importers: this.state.importers.map(({ id, label, extensions }) => ({ id, label, extensions: [...extensions] })),
      exporters: this.state.exporters.map(({ id, label, format }) => ({ id, label, format }))
    }
  }

  private replaceUnique<T>(items: readonly T[], next: T, key: (item: T) => string): readonly T[] {
    const id = key(next)
    if (!id.trim()) throw new DomainError('VALIDATION_FAILED', '扩展 ID 不能为空')
    return [...items.filter((item) => key(item) !== id), next]
  }

  private assertDescriptorOwner(descriptor: { extensionId?: string; permissions?: readonly ExtensionPermission[] }): void {
    if (descriptor.permissions?.length && !descriptor.extensionId) throw new DomainError('VALIDATION_FAILED', '带权限的扩展描述必须声明所属扩展')
    if (descriptor.extensionId && !this.state.manifests.some((manifest) => manifest.id === descriptor.extensionId)) throw new DomainError('PROJECT_NOT_FOUND', `扩展不存在: ${descriptor.extensionId}`)
    if (descriptor.extensionId && descriptor.permissions?.length) {
      const manifest = this.state.manifests.find((item) => item.id === descriptor.extensionId)
      const declared = new Set(manifest?.permissions.map(({ permission }) => permission))
      if (descriptor.permissions.some((permission) => !declared.has(permission))) throw new DomainError('VALIDATION_FAILED', '扩展描述所需权限未声明')
    }
  }

  private replaceManifest(next: ExtensionManifest & { dependencies: readonly ExtensionDependency[] }): typeof this.state {
    this.permissionGrants.delete(next.id)
    return {
      ...this.state,
      manifests: this.replaceUnique(this.state.manifests, next, (item) => item.id),
      workflowNodes: this.state.workflowNodes.filter((node) => node.extensionId !== next.id)
    }
  }
}

function satisfiesVersion(version: string, range: string): boolean {
  const requested = parseVersion(range.replace(/^[~^]/, ''))
  const actual = parseVersion(version)
  if (!requested || !actual) return false
  if (actual.prerelease && !requested.prerelease) return false
  if (range.startsWith('^')) {
    const upper = requested.major > 0 ? [requested.major + 1, 0, 0] : requested.minor > 0 ? [0, requested.minor + 1, 0] : [0, 0, requested.patch + 1]
    return compareVersion(actual, requested) >= 0 && compareNumeric(actual, upper) < 0
  }
  if (range.startsWith('~')) {
    return compareVersion(actual, requested) >= 0 && compareNumeric(actual, [requested.major, requested.minor + 1, 0]) < 0
  }
  return compareVersion(actual, requested) === 0
}

function parseVersion(value: string): { major: number; minor: number; patch: number; prerelease?: string } | undefined {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] } : undefined
}

function compareVersion(left: { major: number; minor: number; patch: number; prerelease?: string }, right: { major: number; minor: number; patch: number; prerelease?: string }): number {
  const numeric = compareNumeric(left, [right.major, right.minor, right.patch])
  if (numeric !== 0) return numeric
  if (!left.prerelease && !right.prerelease) return 0
  if (!left.prerelease) return 1
  if (!right.prerelease) return -1
  return left.prerelease.localeCompare(right.prerelease)
}

function compareNumeric(value: { major: number; minor: number; patch: number }, target: readonly number[]): number {
  return value.major - target[0] || value.minor - target[1] || value.patch - target[2]
}
