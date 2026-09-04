import type { Result } from './result'

export interface CheckpointSummary { id: string; name: string; createdAt: string; fileCount: number; totalBytes: number }
export interface CheckpointApiContract {
  list(): Promise<Result<CheckpointSummary[]>>
  create(name: string): Promise<Result<CheckpointSummary>>
  restore(id: string): Promise<Result<CheckpointSummary>>
}
