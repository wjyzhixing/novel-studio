import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ExtensionPackageManifest, ExtensionPermission, ExtensionPermissionPreview, ExtensionTrustStatus } from '../../shared/extensions'
import { verifyExtensionPackageManifest, type TrustedExtensionKey } from './extension-package'
import { ExtensionRegistry } from './extension-registry'
import { DomainError } from './errors'
import { ExtensionPermissionStore, type ExtensionPermissionGrant } from './extension-permission-store'

type InstalledExtension = Pick<ExtensionPackageManifest, 'id' | 'version'>

/**
 * Persists verified extension descriptors only. This store deliberately never
 * reads, imports, or executes package code; executable handlers remain a
 * separately provisioned Main-owned capability.
 */
export class ExtensionPackageStore {
  private readonly permissionStore: ExtensionPermissionStore
  constructor(
    private readonly rootPath: string,
    private readonly registry: ExtensionRegistry,
    private readonly trustedKeys: readonly TrustedExtensionKey[],
    permissionStore?: ExtensionPermissionStore
  ) { this.permissionStore = permissionStore ?? new ExtensionPermissionStore(join(rootPath, 'permissions.json')) }

  async preview(sourcePath: string): Promise<ExtensionPermissionPreview> {
    const manifest = await this.readAndVerify(sourcePath)
    return { id: manifest.id, name: manifest.name, version: manifest.version, permissions: manifest.permissions.map(({ permission }) => permission) }
  }

  async install(sourcePath: string, approvedPermissions: readonly ExtensionPermission[] = []): Promise<InstalledExtension> {
    const manifest = await this.readAndVerify(sourcePath)
    assertPermissionApproval(manifest, approvedPermissions)
    this.registry.assertPackageDependencies(manifest)
    const target = join(this.rootPath, manifest.id)
    const staging = join(this.rootPath, `.${manifest.id}.${randomUUID()}.staging`)
    const previous = this.rollbackPath(manifest.id)
    const previousGrantPath = this.rollbackGrantPath(manifest.id)
    let movedPrevious = false
    let registeredNew = false
    const previousManifest = await this.readInstalledManifest(target)
    const previousGrants = await this.permissionStore.list()
    const previousGrant = previousGrants.find((item) => item.extensionId === manifest.id)
    try {
      await mkdir(this.rootPath, { recursive: true })
      await mkdir(staging, { recursive: true })
      await writeFile(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      if (await exists(target)) {
        await rm(previous, { recursive: true, force: true })
        await rm(previousGrantPath, { force: true })
        await rename(target, previous)
        movedPrevious = true
        if (previousGrant) await writeFile(previousGrantPath, `${JSON.stringify(previousGrant)}\n`, { encoding: 'utf8', mode: 0o600 })
      }
      await rename(staging, target)
      this.registry.registerPackageManifest(manifest, this.trustedKeys)
      registeredNew = true
      this.registry.grantPermissions(manifest.id, manifest.permissions.map(({ permission }) => permission))
      await this.permissionStore.grant({ extensionId: manifest.id, version: manifest.version, permissions: manifest.permissions.map(({ permission }) => permission) })
      return { id: manifest.id, version: manifest.version }
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      if (movedPrevious) {
        await rm(target, { recursive: true, force: true })
        if (await exists(previous)) await rename(previous, target).catch(() => undefined)
        await rm(previousGrantPath, { force: true })
      }
      if (previousManifest) {
        this.registry.registerPackageManifest(previousManifest, this.trustedKeys, { allowRetired: true })
        const grant = previousGrants.find((item) => item.extensionId === previousManifest.id && item.version === previousManifest.version)
        if (grant) this.registry.grantPermissions(previousManifest.id, grant.permissions)
      } else if (registeredNew) {
        this.registry.uninstallManifest(manifest.id)
      }
      if (previousGrant) await this.permissionStore.grant(previousGrant).catch(() => undefined)
      else await this.permissionStore.revoke(manifest.id).catch(() => undefined)
      throw error
    }
  }

  async load(): Promise<readonly InstalledExtension[]> {
    const entries = await readdir(this.rootPath, { withFileTypes: true }).catch(() => [])
    const grants = await this.permissionStore.list()
    const pending = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => join(this.rootPath, entry.name)).sort()
    const installed: InstalledExtension[] = []
    while (pending.length) {
      let progressed = false
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const directory = pending[index]
        const manifest = await this.readAndVerify(join(directory, 'manifest.json'), true)
        try {
          this.registry.assertPackageDependencies(manifest)
        } catch {
          continue
        }
        this.registry.registerPackageManifest(manifest, this.trustedKeys, { allowRetired: true })
        const grant = grants.find((item) => item.extensionId === manifest.id && item.version === manifest.version)
        if (grant) {
          try { this.registry.grantPermissions(manifest.id, grant.permissions) } catch { /* stale or malformed grants fail closed */ }
        }
        installed.unshift({ id: manifest.id, version: manifest.version })
        pending.splice(index, 1)
        progressed = true
      }
      if (!progressed) throw new Error(`扩展依赖无法满足：${pending.map((path) => basename(path)).join('、')}`)
    }
    return installed
  }

  async uninstall(id: string): Promise<void> {
    if (!/^ext_[a-zA-Z0-9_-]+$/.test(id)) throw new DomainError('VALIDATION_FAILED', '扩展 ID 无效')
    const target = join(this.rootPath, id)
    if (!this.registry.permissionPreview(id)) throw new DomainError('PROJECT_NOT_FOUND', `扩展不存在: ${id}`)
    const quarantine = join(this.rootPath, `.${id}.${randomUUID()}.uninstalling`)
    const previousGrant = (await this.permissionStore.list()).find((grant) => grant.extensionId === id)
    await rename(target, quarantine)
    let removedFromRegistry = false
    try {
      this.registry.uninstallManifest(id)
      removedFromRegistry = true
      await this.permissionStore.revoke(id)
      await rm(quarantine, { recursive: true, force: false })
      await rm(this.rollbackPath(id), { recursive: true, force: true }).catch(() => undefined)
      await rm(this.rollbackGrantPath(id), { force: true }).catch(() => undefined)
    } catch (error) {
      if (await exists(quarantine) && !(await exists(target))) await rename(quarantine, target).catch(() => undefined)
      if (removedFromRegistry) {
        const manifest = await this.readAndVerify(join(target, 'manifest.json'), true)
        this.registry.registerPackageManifest(manifest, this.trustedKeys, { allowRetired: true })
        if (previousGrant) {
          await this.permissionStore.grant(previousGrant).catch(() => undefined)
          this.registry.grantPermissions(manifest.id, previousGrant.permissions)
        }
      }
      throw error
    }
  }

  async rollback(id: string): Promise<InstalledExtension> {
    if (!/^ext_[a-zA-Z0-9_-]+$/.test(id)) throw new DomainError('VALIDATION_FAILED', '扩展 ID 无效')
    const target = join(this.rootPath, id)
    const previous = this.rollbackPath(id)
    if (!this.registry.permissionPreview(id) || !(await exists(target))) throw new DomainError('PROJECT_NOT_FOUND', `扩展不存在: ${id}`)
    if (!(await exists(previous))) throw new DomainError('PROJECT_NOT_FOUND', `扩展没有可回滚版本: ${id}`)

    const currentManifest = await this.readAndVerify(join(target, 'manifest.json'), true)
    const previousManifest = await this.readAndVerify(join(previous, 'manifest.json'), true)
    const grants = await this.permissionStore.list()
    const currentGrant = grants.find((grant) => grant.extensionId === id)
    const previousGrant = await this.readRollbackGrant(id)
    const quarantine = join(this.rootPath, `.${id}.${randomUUID()}.rollback`)
    let removedCurrent = false
    let registeredPrevious = false
    try {
      await rename(target, quarantine)
      removedCurrent = true
      this.registry.uninstallManifest(id)
      this.registry.registerPackageManifest(previousManifest, this.trustedKeys, { allowRetired: true })
      registeredPrevious = true
      if (previousGrant) {
        this.registry.grantPermissions(id, previousGrant.permissions)
        await this.permissionStore.grant(previousGrant)
      } else await this.permissionStore.revoke(id)
      await rename(previous, target)
      await rm(this.rollbackGrantPath(id), { force: true })
      await rename(quarantine, previous)
      if (currentGrant) await writeFile(this.rollbackGrantPath(id), `${JSON.stringify(currentGrant)}\n`, { encoding: 'utf8', mode: 0o600 })
      return { id: previousManifest.id, version: previousManifest.version }
    } catch (error) {
      await rm(target, { recursive: true, force: true })
      if (await exists(quarantine)) await rename(quarantine, target).catch(() => undefined)
      if (registeredPrevious) this.registry.uninstallManifest(id)
      if (removedCurrent) this.registry.registerPackageManifest(currentManifest, this.trustedKeys, { allowRetired: true })
      if (currentGrant) await this.permissionStore.grant(currentGrant).catch(() => undefined)
      else await this.permissionStore.revoke(id).catch(() => undefined)
      throw error
    }
  }

  trustStatus(): ExtensionTrustStatus {
    return { trustedPublisherCount: this.trustedKeys.length, installEnabled: this.trustedKeys.length > 0 }
  }

  private async readAndVerify(path: string, allowRetired = false): Promise<ExtensionPackageManifest> {
    const source = await readFile(path, 'utf8')
    let value: unknown
    try { value = JSON.parse(source) } catch { throw new Error('扩展包 manifest 不是有效 JSON') }
    return verifyExtensionPackageManifest(value, this.trustedKeys, { allowRetired })
  }

  private async readInstalledManifest(target: string): Promise<ExtensionPackageManifest | undefined> {
    if (!(await exists(target))) return undefined
    try { return await this.readAndVerify(join(target, 'manifest.json'), true) } catch { return undefined }
  }

  private rollbackPath(id: string): string { return join(this.rootPath, `.${id}.rollback`) }

  private rollbackGrantPath(id: string): string { return join(this.rootPath, `.${id}.rollback-grant.json`) }

  private async readRollbackGrant(id: string): Promise<ExtensionPermissionGrant | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(this.rollbackGrantPath(id), 'utf8'))
      if (!value || typeof value !== 'object') return undefined
      const grant = value as Partial<ExtensionPermissionGrant>
      return grant.extensionId === id && typeof grant.version === 'string' && Array.isArray(grant.permissions)
        ? { extensionId: id, version: grant.version, permissions: grant.permissions }
        : undefined
    } catch { return undefined }
  }
}

function assertPermissionApproval(manifest: ExtensionPackageManifest, approvedPermissions: readonly ExtensionPermission[]): void {
  const required = new Set(manifest.permissions.map(({ permission }) => permission))
  const approved = new Set(approvedPermissions)
  if (approved.size !== approvedPermissions.length || [...approved].some((permission) => !required.has(permission)) || approved.size !== required.size) {
    throw new DomainError('VALIDATION_FAILED', '扩展权限未获得用户批准')
  }
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}
