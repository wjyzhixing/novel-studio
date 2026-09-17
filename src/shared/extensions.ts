import type { AgentId, ChatRequest, ChatResult, LLMProvider, ModelInfo, ProviderProfile } from './ai'
import type { ExportFormat } from './chapter'
import type { ImageRequest, ImageResult } from './image'
import type { Workflow } from './workflow'
import type { Result } from './result'
import { z } from 'zod'

export type WorkflowNode = Workflow['nodes'][number]

export const extensionPermissionSchema = z.enum([
  'project.read',
  'project.write',
  'filesystem.read',
  'filesystem.write',
  'network.request'
])
export type ExtensionPermission = z.infer<typeof extensionPermissionSchema>

export const extensionManifestSchema = z.object({
  id: z.string().regex(/^ext_[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(160),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  permissions: z.array(z.object({
    permission: extensionPermissionSchema,
    reason: z.string().trim().min(1).max(500)
  })).max(20)
}).superRefine((manifest, context) => {
  const seen = new Set<string>()
  for (const [index, declaration] of manifest.permissions.entries()) {
    if (seen.has(declaration.permission)) context.addIssue({ code: 'custom', path: ['permissions', index, 'permission'], message: '权限不能重复声明' })
    seen.add(declaration.permission)
  }
})
export type ExtensionManifest = z.infer<typeof extensionManifestSchema>
export type ExtensionPermissionPreview = Pick<ExtensionManifest, 'id' | 'name' | 'version'> & { permissions: readonly ExtensionPermission[] }
export interface ExtensionInstallResult { id: string; version: string }
export interface ExtensionTrustStatus { trustedPublisherCount: number; installEnabled: boolean }

export const extensionDependencySchema = z.object({
  id: z.string().regex(/^ext_[a-zA-Z0-9_-]+$/),
  version: z.string().regex(/^(?:\^|~)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
})
export type ExtensionDependency = z.infer<typeof extensionDependencySchema>

export const extensionSignatureSchema = z.object({
  algorithm: z.literal('ed25519'),
  keyId: z.string().regex(/^key_[a-zA-Z0-9_-]+$/),
  value: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).min(80)
})

export const extensionPackageManifestSchema = z.object({
  id: z.string().regex(/^ext_[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(160),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  permissions: z.array(z.object({ permission: extensionPermissionSchema, reason: z.string().trim().min(1).max(500) })).max(20),
  dependencies: z.array(extensionDependencySchema).max(50),
  signature: extensionSignatureSchema
}).superRefine((manifest, context) => {
  const permissions = new Set<string>()
  for (const [index, declaration] of manifest.permissions.entries()) {
    if (permissions.has(declaration.permission)) context.addIssue({ code: 'custom', path: ['permissions', index, 'permission'], message: '权限不能重复声明' })
    permissions.add(declaration.permission)
  }
  const dependencies = new Set<string>()
  for (const [index, dependency] of manifest.dependencies.entries()) {
    if (dependency.id === manifest.id) context.addIssue({ code: 'custom', path: ['dependencies', index, 'id'], message: '扩展不能依赖自身' })
    if (dependencies.has(dependency.id)) context.addIssue({ code: 'custom', path: ['dependencies', index, 'id'], message: '依赖不能重复声明' })
    dependencies.add(dependency.id)
  }
})
export type ExtensionPackageManifest = z.infer<typeof extensionPackageManifestSchema>

/** Stable bytes signed by package publishers; signature itself is excluded. */
export function extensionManifestSigningPayload(manifest: Omit<ExtensionPackageManifest, 'signature'> | ExtensionPackageManifest): string {
  const { signature: _signature, ...unsigned } = manifest as ExtensionPackageManifest
  return JSON.stringify({
    ...unsigned,
    permissions: [...unsigned.permissions].sort((left, right) => left.permission.localeCompare(right.permission)),
    dependencies: [...unsigned.dependencies].sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version))
  })
}

/** Typed extension boundary (Blueprint §23). Extensions are descriptors and
 * Main-owned handlers; the Renderer never receives executable plugin code. */
export interface ProviderExtension {
  readonly id: string
  readonly kind: 'llm' | 'image'
  readonly label: string
  readonly models: (profile: ProviderProfile, signal?: AbortSignal) => Promise<ModelInfo[]>
  readonly chat?: (profile: ProviderProfile, request: ChatRequest, signal?: AbortSignal) => Promise<ChatResult>
  readonly generateImage?: (profile: ProviderProfile, request: ImageRequest, signal?: AbortSignal) => Promise<ImageResult[]>
}

export interface WorkflowNodeExtension {
  readonly type: string
  readonly label: string
  /** Present for third-party handlers; built-in handlers omit ownership. */
  readonly extensionId?: string
  readonly permissions?: readonly ExtensionPermission[]
  readonly inputTypes: readonly string[]
  readonly outputTypes: readonly string[]
  readonly run: (node: WorkflowNode, input: unknown, context: { runId: string; signal: AbortSignal }) => Promise<unknown>
}

export interface ImporterExtension {
  readonly id: string
  readonly label: string
  readonly extensions: readonly string[]
  readonly extensionId?: string
  readonly permissions?: readonly ExtensionPermission[]
  readonly import: (sourcePath: string, context: { signal: AbortSignal }) => Promise<{ title: string; markdown: string }>
}

export interface ExporterExtension {
  readonly id: string
  readonly label: string
  readonly format: ExportFormat | (string & {})
  readonly extensionId?: string
  readonly permissions?: readonly ExtensionPermission[]
  readonly export: (chapters: readonly { title: string; markdown: string }[], context: { signal: AbortSignal }) => Promise<string | Uint8Array>
}

export interface ExtensionRegistrySnapshot {
  manifests: readonly Pick<ExtensionManifest, 'id' | 'name' | 'version' | 'permissions'>[]
  providers: readonly Pick<ProviderExtension, 'id' | 'kind' | 'label'>[]
  workflowNodes: readonly Pick<WorkflowNodeExtension, 'type' | 'label'>[]
  importers: readonly Pick<ImporterExtension, 'id' | 'label' | 'extensions'>[]
  exporters: readonly Pick<ExporterExtension, 'id' | 'label' | 'format'>[]
}

/** Renderer-facing extension surface. It intentionally contains inventory
 * and permission preview only; extension execution remains Main-owned. */
export interface ExtensionApiContract {
  list(): Promise<Result<ExtensionRegistrySnapshot>>
  permissionPreview(id: string): Promise<Result<ExtensionPermissionPreview | null>>
  preview(sourcePath: string): Promise<Result<ExtensionPermissionPreview>>
  install(sourcePath: string, approvedPermissions?: readonly ExtensionPermission[]): Promise<Result<ExtensionInstallResult>>
  uninstall(id: string): Promise<Result<null>>
  rollback(id: string): Promise<Result<ExtensionInstallResult>>
  trustStatus(): Promise<Result<ExtensionTrustStatus>>
}

export type BuiltinProvider = LLMProvider
export type SupportedAgent = AgentId
