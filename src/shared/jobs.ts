import type { Result } from './result'
import type { WorkflowRuntimeEvent } from './runtime'

export type JobStatus = 'queued' | 'running' | 'waiting_human' | 'succeeded' | 'failed' | 'cancelled'

export interface JobRecord {
  id: string
  kind: 'workflow'
  refId: string
  status: JobStatus
  attempts: number
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface JobsApiContract {
  list(recover?: boolean): Promise<Result<JobRecord[]>>
  cancel(jobId: string): Promise<Result<null>>
  retry(jobId: string): Promise<Result<string>>
  onEvent(listener: (event: WorkflowRuntimeEvent) => void): () => void
}
