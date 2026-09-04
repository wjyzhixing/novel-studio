import type { Result } from './result'

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
  list(): Promise<Result<JobRecord[]>>
}
