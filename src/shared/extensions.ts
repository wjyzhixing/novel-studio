import type { AgentId, ChatRequest, ChatResult, LLMProvider, ModelInfo, ProviderProfile } from './ai'
import type { ExportFormat } from './chapter'
import type { ImageRequest, ImageResult } from './image'
import type { Workflow } from './workflow'

export type WorkflowNode = Workflow['nodes'][number]

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
  readonly inputTypes: readonly string[]
  readonly outputTypes: readonly string[]
  readonly run: (node: WorkflowNode, input: unknown, context: { runId: string; signal: AbortSignal }) => Promise<unknown>
}

export interface ImporterExtension {
  readonly id: string
  readonly label: string
  readonly extensions: readonly string[]
  readonly import: (sourcePath: string, context: { signal: AbortSignal }) => Promise<{ title: string; markdown: string }>
}

export interface ExporterExtension {
  readonly id: string
  readonly label: string
  readonly format: ExportFormat | (string & {})
  readonly export: (chapters: readonly { title: string; markdown: string }[], context: { signal: AbortSignal }) => Promise<string | Uint8Array>
}

export interface ExtensionRegistrySnapshot {
  providers: readonly Pick<ProviderExtension, 'id' | 'kind' | 'label'>[]
  workflowNodes: readonly Pick<WorkflowNodeExtension, 'type' | 'label'>[]
  importers: readonly Pick<ImporterExtension, 'id' | 'label' | 'extensions'>[]
  exporters: readonly Pick<ExporterExtension, 'id' | 'label' | 'format'>[]
}

export type BuiltinProvider = LLMProvider
export type SupportedAgent = AgentId
