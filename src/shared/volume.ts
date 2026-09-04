import { z } from 'zod'
import type { Result } from './result'

export const volumeIdSchema = z.string().regex(/^volume_[a-zA-Z0-9_-]+$/)
export const volumeSchema = z.object({
  id: volumeIdSchema,
  title: z.string().min(1).max(200),
  order: z.number().int().nonnegative(),
  chapterRelPaths: z.array(z.string().startsWith('chapters/').endsWith('.md')).max(100_000),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
})
export const volumeFileSchema = z.object({ version: z.literal(1), volumes: z.array(volumeSchema).max(10_000) })
export const volumeCreateInputSchema = z.object({ title: z.string().min(1).max(200) })
export const volumeUpdateInputSchema = volumeCreateInputSchema.extend({ id: volumeIdSchema })
export const volumeChapterInputSchema = z.object({ volumeId: volumeIdSchema, chapterRelPath: z.string().startsWith('chapters/').endsWith('.md') })
export const volumeReorderInputSchema = z.object({ volumeIds: z.array(volumeIdSchema).max(10_000) })

export type Volume = z.infer<typeof volumeSchema>
export type VolumeCreateInput = z.infer<typeof volumeCreateInputSchema>
export type VolumeUpdateInput = z.infer<typeof volumeUpdateInputSchema>

export interface VolumeApiContract {
  list(): Promise<Result<Volume[]>>
  create(input: VolumeCreateInput): Promise<Result<Volume>>
  update(input: VolumeUpdateInput): Promise<Result<Volume>>
  remove(id: string): Promise<Result<null>>
  assignChapter(volumeId: string, chapterRelPath: string): Promise<Result<Volume[]>>
  unassignChapter(chapterRelPath: string): Promise<Result<Volume[]>>
  reorder(volumeIds: string[]): Promise<Result<Volume[]>>
}
