import type { Result } from './result'
import type { TokenUsage } from './ai'
import type { WorkflowRun } from './runtime'

export interface AiInvocationAudit {
  id: string
  kind: 'chat' | 'stream'
  profileId: string
  model?: string
  requestId?: string
  agentId?: string
  contextRecipeId?: string
  messageCount: number
  inputChars: number
  usage?: TokenUsage
  outcome: 'succeeded' | 'failed' | 'cancelled'
  errorCategory?: string
  startedAt: string
  durationMs: number
}

export interface DiagnosticsBundle {
  schemaVersion: 1
  generatedAt: string
  project: { title: string; schemaVersion: number }
  workflowRuns: WorkflowRun[]
  aiInvocations: AiInvocationAudit[]
}

export interface DiagnosticsApiContract {
  export(destination: string): Promise<Result<{ destination: string; runCount: number; invocationCount: number }>>
  exportCompressed(destination: string): Promise<Result<{ destination: string; runCount: number; invocationCount: number }>>
}
