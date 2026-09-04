import { z } from 'zod'
import type { Result } from './result'
import type { CanonProposal } from './canon'

export const memoryFactSchema = z.object({
  subjectId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  predicate: z.string().trim().min(1).max(160),
  object: z.unknown(),
  validFrom: z.string().max(100).nullable().default(null),
  validTo: z.string().max(100).nullable().default(null),
  confidence: z.number().min(0).max(1).default(1),
  range: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
})

export const memoryExtractionSchema = z.object({ facts: z.array(memoryFactSchema).max(100) })
export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>

export interface MemoryApiContract {
  extractFromChapter(profileId: string, relPath: string): Promise<Result<CanonProposal[]>>
}
