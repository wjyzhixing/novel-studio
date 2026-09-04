import { z } from 'zod'
import type { Result } from './result'
export const CONTEXT_SNAPSHOT_FORMAT_VERSION = 1
export const CONTEXT_RETRIEVAL_VERSION = 1

export const contextRecipeSchema = z.object({ id: z.string().min(1).max(100), maxTokens: z.number().int().positive().max(200_000), includeSelection: z.boolean().default(true), entityLimit: z.number().int().nonnegative().max(100).default(20), semanticLimit: z.number().int().nonnegative().max(20).default(5) })
export type ContextRecipe = z.input<typeof contextRecipeSchema>
export type ContextLayer = 'pinned' | 'structured' | 'semantic'
export interface ContextItem { id: string; layer: ContextLayer; source: string; text: string; priority: number; estimatedTokens: number; originalEstimatedTokens?: number; truncated?: boolean }
export interface ContextRetrievalTrace { query: string; selectionIncluded: boolean; method?: 'embedding' | 'fts'; candidateCounts: Record<ContextLayer, number>; selectedSources: string[]; omittedSources: string[] }
export interface ContextManifest { recipeId: string; budgetTokens: number; totalTokens: number; omittedSources: string[]; items: ContextItem[]; retrieval: ContextRetrievalTrace; retrievalVersion: number; generatedAt: string }
export interface ContextRequest { relPath: string; sceneId?: string; selection?: string | null; query?: string; recipe: ContextRecipe }
export interface ContextResult { text: string; manifest: ContextManifest }
export interface ContextSnapshotSummary {
  id: string
  relPath: string
  recipeId: string
  query: string
  requestHash: string
  resultHash: string
  totalTokens: number
  itemCount: number
  createdAt: string
  formatVersion: number
  projectSchemaVersion: number
  retrievalVersion: number
}
export interface ContextSnapshot extends ContextSnapshotSummary {
  request: ContextRequest
  result: ContextResult
  sourceFormatVersion?: number
  sourceRetrievalVersion?: number
  sourceProjectSchemaVersion?: number
}
export interface ContextReplayResult {
  snapshot: ContextSnapshot
  current: ContextResult
  currentResultHash: string
  changed: boolean
  differences: ContextReplayDifference[]
  compatibility: { migrated: boolean; fromFormatVersion: number; fromRetrievalVersion: number; notes: string[] }
}
export interface ContextReplayDifference { source: string; kind: 'added' | 'removed' | 'changed'; previousTokens?: number; currentTokens?: number }
export interface ContextApiContract {
  build(request: ContextRequest): Promise<Result<ContextResult>>
  summarize(relPath: string): Promise<Result<string>>
  listSnapshots(relPath?: string): Promise<Result<ContextSnapshotSummary[]>>
  readSnapshot(id: string): Promise<Result<ContextSnapshot>>
  replaySnapshot(id: string): Promise<Result<ContextReplayResult>>
}
