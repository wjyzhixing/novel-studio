import type { Result } from './result'

export type RevisionActor = 'human' | 'agent' | 'workflow' | 'import'
export interface Revision { id: string; relPath: string; actor: RevisionActor; source: string; original: string; replacement: string; createdAt: string }
export interface RevisionApiContract {
  list(relPath?: string): Promise<Result<Revision[]>>
  get(id: string): Promise<Result<Revision>>
  revert(id: string): Promise<Result<{ relPath: string; revisionId: string }>>
}
