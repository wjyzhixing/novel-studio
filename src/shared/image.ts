import { z } from 'zod'
import type { Result } from './result'

export const imageRequestSchema = z.object({ sceneId: z.string().optional(), prompt: z.string().min(1).max(20_000), negativePrompt: z.string().max(5_000).default(''), references: z.array(z.string().min(1)).max(20).default([]), aspectRatio: z.string().regex(/^\d+:\d+$/).default('16:9'), variants: z.number().int().min(1).max(4).default(4), seed: z.number().int().optional(), workflowRunId: z.string().min(1).max(200).optional(), idempotencyKey: z.string().min(1).max(240).optional() })
export type ImageRequest = z.input<typeof imageRequestSchema>
export const imageAssetMetadataSchema = z.object({
  assetId: z.string().regex(/^asset_[a-zA-Z0-9_-]+$/),
  relPath: z.string().regex(/^assets\/scenes\/[^/]+\.(png|jpe?g|webp|gif|svg)$/i),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/i),
  provider: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(200),
  prompt: z.string().max(20_000),
  negativePrompt: z.string().max(5_000).optional(),
  seed: z.number().int().optional(),
  references: z.array(z.string().min(1)).max(20),
  createdAt: z.string().min(1),
  sceneId: z.string().regex(/^scene_[a-zA-Z0-9_-]+$/).optional(),
  workflowRunId: z.string().min(1).max(200).optional(),
  idempotencyKey: z.string().min(1).max(240).optional()
})
export type ImageAssetMetadata = z.infer<typeof imageAssetMetadataSchema>
export interface ImageResult { assetId: string; relPath: string; mimeType: string; provider: string; model: string; prompt: string; negativePrompt?: string; seed?: number; references: string[]; createdAt: string; sceneId?: string; workflowRunId?: string; idempotencyKey?: string }
export interface SceneProposal {
  id: string
  chapterRelPath: string
  sceneId?: string
  title: string
  description: string
  subject?: string
  camera?: string
  composition?: string
  lighting?: string
  visualAnchors?: string[]
  suggestedPrompt: string
  negativePrompt: string
  visualContext: string[]
}
export interface ImageApiContract { proposeScene(relPath: string, sceneId?: string): Promise<Result<SceneProposal>>; generate(request: ImageRequest): Promise<Result<ImageResult[]>>; importFile(sourcePath: string, prompt?: string): Promise<Result<ImageResult>>; testConnection(profileId: string): Promise<Result<{ provider: string; model: string }>>; listAssets(): Promise<Result<ImageResult[]>>; deleteAsset(assetId: string): Promise<Result<null>>; readAsset(assetId: string): Promise<Result<{ bytes: Uint8Array; mimeType: string }>>; insertIntoChapter(relPath: string, assetId: string, caption: string): Promise<Result<{ markdown: string }>> }
