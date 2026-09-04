import { z } from 'zod'
import type { Result } from './result'

export const diffKindSchema = z.enum(['equal', 'add', 'remove'])
export type DiffKind = z.infer<typeof diffKindSchema>
export interface DiffSegment { kind: DiffKind; text: string }

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'stale'
export interface AiSuggestion {
  id: string; requestId: string; profileId: string; relPath: string; original: string; suggested: string; prompt: string
  selection: string | null; status: SuggestionStatus; createdAt: string
}

export interface AiEditRequest { requestId?: string; profileId: string; relPath: string; prompt: string; selection?: string | null }
export interface AiEditTextRequest { profileId: string; relPath: string; prompt: string; selection?: string | null; suggested: string }
export interface AiEditApiContract {
  listPending(relPath?: string): Promise<Result<AiSuggestion[]>>
  run(request: AiEditRequest): Promise<Result<AiSuggestion>>
  createFromText(request: AiEditTextRequest): Promise<Result<AiSuggestion>>
  accept(id: string): Promise<Result<{ relPath: string; markdown: string; revisionId: string }>>
  reject(id: string): Promise<Result<null>>
  cancel(requestId: string): Promise<Result<null>>
  retry(id: string): Promise<Result<AiSuggestion>>
}
