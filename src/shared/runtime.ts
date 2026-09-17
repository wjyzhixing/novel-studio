import type { Workflow } from './workflow'
import type { TokenUsage } from './ai'

export type NodeRunStatus = 'pending' | 'running' | 'waiting_human' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'
export type NodeErrorCategory = 'validation' | 'provider' | 'timeout' | 'cancelled' | 'io' | 'unknown'
export type DraftMode = 'replace' | 'append' | 'rewrite'
export type DraftTarget = 'chapter' | 'selection'
export interface DraftOutput { kind: 'draft'; content: string; mode: DraftMode; target: DraftTarget; selection?: string; sourceNode: string }
export interface ReviewOutput { kind: 'review'; findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>; recommendation?: string }
export interface HumanReviewAction { action: 'approve' | 'reject' | 'edit'; draftId?: string; editedContent?: string; comment?: string; draft?: DraftOutput }
export interface NodeDiagnostics { profileId?: string; model?: string; requestId?: string; errorCode?: string; errorCategory?: NodeErrorCategory; context?: { recipeId: string; totalTokens: number; itemCount: number }; usage?: TokenUsage; cost?: { amount: number; currency: 'USD'; estimated: boolean }; durationMs?: number }
export interface NodeRun { nodeId: string; status: NodeRunStatus; input: unknown; inputSummary?: string; output?: unknown; outputSummary?: string; error?: string; attempts: number; idempotencyKey?: string; startedAt?: string; finishedAt?: string; log: string[]; diagnostics?: NodeDiagnostics }
export interface WorkflowSideEffect { status: 'succeeded'; output?: unknown }
export type WorkflowSideEffectClaim =
  | { kind: 'execute'; claimId: string }
  | { kind: 'in_progress' }
  | { kind: 'succeeded'; effect: WorkflowSideEffect }
export interface WorkflowSideEffectStore {
  claimSideEffect(idempotencyKey: string, runId: string, nodeId: string): Promise<WorkflowSideEffectClaim>
  getSideEffect(idempotencyKey: string): Promise<WorkflowSideEffect | undefined>
  renewSideEffect?(claimId: string, idempotencyKey: string): Promise<void>
  completeSideEffect(claimId: string, idempotencyKey: string, output: unknown): Promise<void>
  releaseSideEffect(claimId: string, idempotencyKey: string): Promise<void>
}
export interface WorkflowRun { id: string; workflowId: string; relPath?: string; sceneId?: string; relPathSource?: 'runtime' | 'legacy-node-output'; relPathRecovery?: 'unavailable'; status: 'running' | 'waiting_human' | 'succeeded' | 'failed' | 'cancelled'; nodes: Record<string, NodeRun>; outputs: Record<string, unknown>; sideEffects?: Record<string, WorkflowSideEffect>; createdAt: string; updatedAt: string }
export interface NodeInputEnvelope { value: unknown; context?: unknown; outputs: Record<string, unknown> }
export interface NodeExecutionContext { nodeId: string; input: unknown; inputEnvelope: NodeInputEnvelope; outputs: Record<string, unknown>; config: Record<string, unknown>; idempotencyKey: string; inheritedContext?: unknown; signal: AbortSignal }
export type NodeExecutionResult = { status: 'succeeded'; output?: unknown; log?: string[]; diagnostics?: NodeDiagnostics } | { status: 'waiting_human'; output?: unknown; log?: string[]; diagnostics?: NodeDiagnostics }
export type NodeExecutor = (context: NodeExecutionContext) => Promise<NodeExecutionResult>
export interface RuntimeOptions { runId?: string; relPath?: string; sceneId?: string; variables?: Record<string, unknown>; retry?: number; retryForNode?: (node: Workflow['nodes'][number]) => number; timeoutMs?: number; signal?: AbortSignal; initialState?: WorkflowRun; resumeInput?: unknown; resolveContext?: (outputs: Record<string, unknown>) => unknown; allowedNodeTypes?: Iterable<string>; sideEffectStore?: WorkflowSideEffectStore; sideEffectWaitMs?: number; persist?: (state: WorkflowRun) => Promise<void> | void }
export interface RuntimeResult { state: WorkflowRun; waitingNodeId?: string }
export interface RuntimeApiContract { run(workflowId: string, relPath: string, sceneId?: string): Promise<WorkflowRun>; start(workflowId: string, relPath: string, sceneId?: string): Promise<string>; cancel(runId: string): Promise<null>; retry(runId: string, relPath: string): Promise<string>; resume(runId: string, resumeInput?: unknown): Promise<WorkflowRun>; listRuns(recover?: boolean, summaries?: boolean): Promise<WorkflowRun[]> }
export interface WorkflowCompletion { targetRelPath: string; revisionId?: string }
export interface WorkflowRuntimeEvent { runId: string; state?: WorkflowRun; error?: string; completion?: WorkflowCompletion }
