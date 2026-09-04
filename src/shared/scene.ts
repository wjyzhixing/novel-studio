import { z } from 'zod'
import type { Result } from './result'

export const SCENE_SCHEMA_VERSION = 1

export const chapterSceneSchema = z.object({
  id: z.string().regex(/^scene_[a-zA-Z0-9_-]+$/),
  chapterRelPath: z.string().startsWith('chapters/').endsWith('.md'),
  title: z.string().min(1).max(200),
  order: z.number().int().nonnegative(),
  startParagraph: z.number().int().nonnegative(),
  endParagraph: z.number().int().nonnegative(),
  summary: z.string().max(20_000),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).superRefine((value, ctx) => {
  if (value.startParagraph > value.endParagraph) ctx.addIssue({ code: 'custom', path: ['endParagraph'], message: '场景结束段落不能早于开始段落' })
})

export type ChapterScene = z.infer<typeof chapterSceneSchema>

export const sceneSidecarSchema = z.object({
  schemaVersion: z.literal(SCENE_SCHEMA_VERSION),
  scenes: z.array(chapterSceneSchema).max(10_000)
})

export const sceneCreateInputSchema = z.object({
  chapterRelPath: z.string().startsWith('chapters/').endsWith('.md'),
  title: z.string().min(1).max(200),
  startParagraph: z.number().int().nonnegative(),
  endParagraph: z.number().int().nonnegative(),
  summary: z.string().max(20_000).default('')
})
export type SceneCreateInput = z.infer<typeof sceneCreateInputSchema>

export const sceneUpdateInputSchema = sceneCreateInputSchema.extend({
  id: z.string().regex(/^scene_[a-zA-Z0-9_-]+$/)
})
export type SceneUpdateInput = z.infer<typeof sceneUpdateInputSchema>

export const sceneRemoveInputSchema = z.object({
  chapterRelPath: z.string().startsWith('chapters/').endsWith('.md'),
  sceneId: z.string().regex(/^scene_[a-zA-Z0-9_-]+$/)
})

export const sceneReorderInputSchema = z.object({
  chapterRelPath: z.string().startsWith('chapters/').endsWith('.md'),
  sceneIds: z.array(z.string().regex(/^scene_[a-zA-Z0-9_-]+$/)).max(10_000)
})

export interface SceneApiContract {
  list(chapterRelPath: string): Promise<Result<ChapterScene[]>>
  create(input: SceneCreateInput): Promise<Result<ChapterScene>>
  update(input: SceneUpdateInput): Promise<Result<ChapterScene>>
  remove(chapterRelPath: string, sceneId: string): Promise<Result<null>>
  reorder(chapterRelPath: string, sceneIds: string[]): Promise<Result<ChapterScene[]>>
}

