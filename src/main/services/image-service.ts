import { randomBytes } from 'node:crypto'
import { readFile, stat, unlink } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { stringify as stringifyYaml } from 'yaml'
import type { ImageRequest, ImageResult, SceneProposal } from '../../shared/image'
import { imageRequestSchema } from '../../shared/image'
import type { ProjectService } from './project-service'
import type { ChapterService } from './chapter-service'
import type { StoryService } from './story-service'
import { compileImagePrompt } from './image-prompt-compiler'
import { atomicWriteFile } from './atomic-fs'
import { DomainError, redactSensitive } from './errors'
import { imageSecretId } from '../../shared/ai'
import type { ProviderProfile, SecretStore } from '../../shared/ai'
import type { RevisionService } from './revision-service'
import type { SceneService } from './scene-service'

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function escapeMarkdownLabel(value: string): string { return value.replace(/[\\\[\]\r\n]/g, ' ').trim() }

export interface ImageProvider { generate(request: ImageRequest, signal?: AbortSignal, profileId?: string): Promise<ImageResult[]> }
type ImagePayload = ImageResult & { data?: Uint8Array }
const MAX_PERSISTED_ASSET_JSON_BYTES = 1_000_000
const MAX_IMPORTED_IMAGE_BYTES = 50 * 1024 * 1024

function decodeBase64Image(value: string): { data: Uint8Array; mimeType: string } {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i)
  const encoded = match?.[2] ?? value
  return { data: Uint8Array.from(Buffer.from(encoded, 'base64')), mimeType: match?.[1]?.toLowerCase() ?? 'image/png' }
}

function imageMimeType(value: string | null | undefined): string {
  const mime = value?.split(';', 1)[0]?.trim().toLowerCase()
  return mime?.startsWith('image/') ? mime : 'image/png'
}

export class UnconfiguredImageProvider implements ImageProvider {
  async generate(): Promise<ImageResult[]> { throw new DomainError('VALIDATION_FAILED', '当前 Provider 未配置 Image Model') }
}

export class OpenAICompatibleImageProvider implements ImageProvider {
  constructor(private readonly project: ProjectService, private readonly secrets: SecretStore, private readonly fetcher: typeof fetch = fetch) {}
  async generate(request: ImageRequest, signal?: AbortSignal, profileId?: string): Promise<ImageResult[]> {
    const profile = await this.profile(profileId)
    if (!profile?.imageBaseURL || !profile.imageModel) throw new DomainError('VALIDATION_FAILED', '请在 Provider 中配置 Image Base URL 和 Image Model')
    const key = await this.secrets.get(imageSecretId(profile.id))
    if (!key) throw new DomainError('VALIDATION_FAILED', '当前 Provider 没有独立的 Image API Key')
    const output: ImagePayload[] = []
    const count = request.variants ?? 1
    for (let index = 0; index < count; index += 1) {
      // TokenRhythm's qwen-image endpoint accepts the common minimal image
      // request. Keep negativePrompt in local provenance, but don't send
      // provider-specific fields that its strict schema rejects.
      const providerPrompt = request.negativePrompt ? `${request.prompt}\n\nAvoid: ${request.negativePrompt}` : request.prompt
      // TokenRhythm and several OpenAI-compatible image endpoints use a
      // stricter schema than chat completions. Variants are intentionally
      // handled by this loop, so the wire payload stays to the portable
      // fields accepted by the strictest endpoint.
      const response = await this.fetcher(`${profile.imageBaseURL.replace(/\/$/, '')}/images/generations`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: profile.imageModel, prompt: providerPrompt }), signal })
      if (!response.ok) {
        const detail = redactSensitive((await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300))
        throw new Error(`Image Provider 请求失败 (${response.status})${detail ? `：${detail}` : ''}`)
      }
      const body = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> }
      for (const item of body.data ?? []) {
        let data: Uint8Array | undefined
        let mimeType = 'image/png'
        if (item.b64_json) {
          const decoded = decodeBase64Image(item.b64_json)
          data = decoded.data
          mimeType = decoded.mimeType
        } else if (item.url) {
          const image = await this.fetcher(item.url, { signal })
          if (!image.ok) throw new Error(`图片下载失败 (${image.status})`)
          data = new Uint8Array(await image.arrayBuffer())
          mimeType = imageMimeType(image.headers.get('content-type'))
        }
        if (data?.byteLength) output.push({ assetId: `asset_${randomBytes(10).toString('hex')}`, relPath: '', mimeType, provider: 'openai-compatible', model: profile.imageModel, prompt: request.prompt, negativePrompt: request.negativePrompt, seed: request.seed, references: request.references ?? [], workflowRunId: request.workflowRunId, createdAt: new Date().toISOString(), data })
      }
    }
    if (output.length === 0) throw new DomainError('INTERNAL', 'Image Provider 未返回可保存的图像数据')
    return output
  }
  private async profile(profileId?: string): Promise<ProviderProfile | undefined> {
    const raw = this.project.database.getSetting('ai.providerProfiles'); if (!raw) return undefined
    try {
      const profiles = JSON.parse(raw) as ProviderProfile[]
      const currentId = profileId ?? this.project.getInfo()?.manifest.providerProfile
      const configured = profiles.find((item) => item.id === currentId)
      if (profileId && !configured) throw new DomainError('PROJECT_NOT_FOUND', `Provider profile 不存在: ${profileId}`)
      return configured
    } catch (error) {
      if (error instanceof DomainError) throw error
      return undefined
    }
  }
}

/** Explicitly retained for deterministic fixtures; production defaults to UnconfiguredImageProvider. */
export class MockImageProvider implements ImageProvider {
  async generate(request: ImageRequest): Promise<ImageResult[]> { const result: ImagePayload = { assetId: `asset_${randomBytes(10).toString('hex')}`, relPath: '', mimeType: 'image/svg+xml', provider: 'mock', model: 'mock-image-v1', prompt: request.prompt, seed: request.seed, references: request.references ?? [], workflowRunId: request.workflowRunId, createdAt: new Date().toISOString(), data: new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#6d4dff"/></svg>`) }; return [result] }
}

export class ImageService {
  private readonly inFlightGenerations = new Map<string, Promise<ImageResult[]>>()
  constructor(private readonly project: ProjectService, private readonly chapters: ChapterService, private readonly provider: ImageProvider = new MockImageProvider(), private readonly story?: StoryService, private readonly revisions?: RevisionService, private readonly scenes?: SceneService) {}
  private async profile(profileId?: string): Promise<ProviderProfile | undefined> {
    const raw = this.project.database.getSetting('ai.providerProfiles')
    if (!raw) return undefined
    try {
      const profiles = JSON.parse(raw) as ProviderProfile[]
      const currentId = profileId ?? this.project.getInfo()?.manifest.providerProfile
      const configured = profiles.find((item) => item.id === currentId)
      if (profileId && !configured) throw new DomainError('PROJECT_NOT_FOUND', `Provider profile 不存在: ${profileId}`)
      return configured
    } catch (error) {
      if (error instanceof DomainError) throw error
      return undefined
    }
  }
  private async hasProfile(profileId: string): Promise<boolean> {
    const raw = this.project.database.getSetting('ai.providerProfiles')
    if (!raw) return false
    try {
      const profiles = JSON.parse(raw) as Array<{ id?: unknown }>
      return profiles.some((profile) => profile.id === profileId)
    } catch { return false }
  }
  async proposeScene(relPath: string, sceneId?: string): Promise<SceneProposal> {
    const chapter = await this.chapters.read(relPath)
    const paragraphs = chapter.markdown.replace(/^#{1,6}\s+/gm, '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
    const selected = sceneId && this.scenes ? (await this.scenes.list(relPath)).find((scene) => scene.id === sceneId) : undefined
    if (sceneId && !selected) throw new DomainError('PROJECT_NOT_FOUND', `场景不存在: ${sceneId}`)
    const sceneParagraphs = selected ? paragraphs.slice(selected.startParagraph, selected.endParagraph + 1) : paragraphs
    const description = sceneParagraphs.join('\n\n').slice(0, 1_000)
    const entities = this.story ? await this.story.listEntities() : []
    const subject = entities.filter((entity) => entity.kind === 'character' || entity.kind === 'place').map((entity) => entity.name).slice(0, 4).join('、') || '当前章节的主要人物与环境'
    const camera = '中景，略低机位，保持主体与环境关系清晰'
    const composition = '主体位于视觉焦点，前景留出空间层次，背景交代场景线索'
    const lighting = '与情节时间一致的自然光，主体边缘有轻微轮廓光'
    const visualAnchors = [chapter.title, ...entities.flatMap((entity) => {
      const visual = entity.fields.visualIdentity ?? entity.fields.appearance
      return visual ? [`${entity.name}: ${typeof visual === 'string' ? visual : JSON.stringify(visual)}`] : []
    }).slice(0, 6)]
    const title = selected?.title ?? chapter.title
    const compiled = compileImagePrompt({ title, description, artDirection: this.project.getInfo()?.manifest.artDirection ?? '', entities, subject, camera, composition, lighting, visualAnchors })
    return { id: `scene_${randomBytes(8).toString('hex')}`, chapterRelPath: relPath, sceneId, title, description, subject, camera, composition, lighting, visualAnchors, suggestedPrompt: compiled.prompt, negativePrompt: compiled.negativePrompt, visualContext: compiled.visualContext }
  }
  async generate(input: ImageRequest): Promise<ImageResult[]> {
    const request = imageRequestSchema.parse(input)
    if (request.idempotencyKey) {
      const existing = (await this.listAssets()).filter((asset) => asset.idempotencyKey === request.idempotencyKey)
      if (existing.length > 0) return existing
      const running = this.inFlightGenerations.get(request.idempotencyKey)
      if (running) return running
    }
    const operation = this.generateFresh(request)
    if (!request.idempotencyKey) return operation
    this.inFlightGenerations.set(request.idempotencyKey, operation)
    try { return await operation } finally {
      if (this.inFlightGenerations.get(request.idempotencyKey) === operation) this.inFlightGenerations.delete(request.idempotencyKey)
    }
  }

  private async generateFresh(request: ImageRequest): Promise<ImageResult[]> {
    const profile = await this.profile()
    const provider = profile?.kind === 'mock' ? new MockImageProvider() : this.provider
    const results = await provider.generate(request); const assets: ImageResult[] = []
    for (const result of results) {
      const payload = result as ImagePayload; if (!payload.data) throw new DomainError('INTERNAL', 'Image Provider 未返回图像数据')
      const extension = result.mimeType === 'image/jpeg' ? 'jpg' : result.mimeType === 'image/webp' ? 'webp' : 'png'; const relPath = `assets/scenes/${result.assetId}.${extension}`
      await atomicWriteFile(this.project.resolveInProject(relPath), payload.data)
      const { data: _data, ...metadata } = payload
      const asset: ImageResult = { ...metadata, sceneId: result.sceneId ?? request.sceneId, relPath, idempotencyKey: request.idempotencyKey }
      const storedAsset = asset
      await atomicWriteFile(this.project.resolveInProject(`assets/scenes/${result.assetId}.yaml`), stringifyYaml(storedAsset)); assets.push(asset)
      this.project.database.raw.prepare('INSERT INTO assets(id, rel_path, mime_type, provider, model, provenance_json, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)').run(asset.assetId, asset.relPath, asset.mimeType, asset.provider, asset.model, JSON.stringify(storedAsset), asset.createdAt)
    }
    return assets
  }
  async importFile(sourcePath: string, prompt?: string): Promise<ImageResult> {
    const extension = extname(sourcePath).toLowerCase()
    const mimeType = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' } as Record<string, string>)[extension]
    if (!mimeType) throw new DomainError('VALIDATION_FAILED', '只支持导入 PNG、JPG、WEBP、GIF 或 SVG 图片')
    const fileInfo = await stat(sourcePath).catch(() => undefined)
    if (!fileInfo?.isFile()) throw new DomainError('PROJECT_NOT_FOUND', '找不到要导入的图片文件')
    if (fileInfo.size > MAX_IMPORTED_IMAGE_BYTES) throw new DomainError('VALIDATION_FAILED', '图片文件不能超过 50MB')
    const bytes = await readFile(sourcePath)
    const assetId = `asset_${randomBytes(10).toString('hex')}`
    const relPath = `assets/scenes/${assetId}${extension}`
    const createdAt = new Date().toISOString()
    const asset: ImageResult = { assetId, relPath, mimeType, provider: 'local', model: 'file-import', prompt: prompt?.trim() || basename(sourcePath, extension), references: [], createdAt }
    await atomicWriteFile(this.project.resolveInProject(relPath), bytes)
    await atomicWriteFile(this.project.resolveInProject(`assets/scenes/${assetId}.yaml`), stringifyYaml(asset))
    this.project.database.raw.prepare('INSERT INTO assets(id, rel_path, mime_type, provider, model, provenance_json, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)').run(asset.assetId, asset.relPath, asset.mimeType, asset.provider, asset.model, JSON.stringify(asset), asset.createdAt)
    return asset
  }
  async testConnection(profileId: string): Promise<{ provider: string; model: string }> {
    if (!(await this.hasProfile(profileId))) throw new DomainError('PROJECT_NOT_FOUND', `Provider profile 不存在: ${profileId}`)
    const profile = await this.profile(profileId)
    const provider = profile?.kind === 'mock' ? new MockImageProvider() : this.provider
    const results = await provider.generate({ prompt: 'Novel Studio image provider connection test', negativePrompt: '', variants: 1, references: [], aspectRatio: '1:1' }, undefined, profileId)
    const first = results[0]
    if (!first) throw new DomainError('INTERNAL', 'Image Provider 未返回测试图像')
    return { provider: first.provider, model: first.model }
  }
  async listAssets(): Promise<ImageResult[]> {
    const rows = this.project.database.raw.prepare('SELECT id, rel_path, mime_type, provider, model, created_at, provenance_json FROM assets ORDER BY created_at DESC').all() as unknown as Array<{ id: string; rel_path: string; mime_type: string; provider: string; model: string; created_at: string; provenance_json: string }>
    return rows.flatMap((row): ImageResult[] => {
      // Older versions accidentally persisted the complete image byte array
      // inside provenance_json. Do not parse those records; the PNG remains
      // available at rel_path and the indexed columns are enough to render a
      // safe legacy asset card.
      if (Buffer.byteLength(row.provenance_json, 'utf8') > MAX_PERSISTED_ASSET_JSON_BYTES) return [{ assetId: row.id, relPath: row.rel_path, mimeType: row.mime_type, provider: row.provider, model: row.model, prompt: '历史图片资产', references: [], createdAt: row.created_at }]
      try {
        const value = JSON.parse(row.provenance_json) as Partial<ImageResult> & { id?: string }
        const assetId = value.assetId ?? value.id ?? row.id
        return typeof assetId === 'string' && assetId.length > 0 ? [{ assetId, relPath: value.relPath ?? row.rel_path, mimeType: value.mimeType ?? row.mime_type, provider: value.provider ?? row.provider, model: value.model ?? row.model, prompt: value.prompt ?? '历史图片资产', negativePrompt: value.negativePrompt, seed: value.seed, references: value.references ?? [], createdAt: value.createdAt ?? row.created_at, sceneId: value.sceneId, workflowRunId: value.workflowRunId, idempotencyKey: value.idempotencyKey }] : []
      } catch { return [] }
    })
  }
  async deleteAsset(assetId: string): Promise<null> {
    const row = this.project.database.raw.prepare('SELECT rel_path FROM assets WHERE id = ?').get(assetId) as { rel_path: string } | undefined
    if (!row) throw new DomainError('PROJECT_NOT_FOUND', `Asset 不存在: ${assetId}`)
    const chapters = await this.chapters.list()
    // Asset ID is the durable reference. Also match ./-prefixed and
    // title-less references written by older versions.
    const relPath = escapeRegex(row.rel_path.replace(/^\.\//, ''))
    const referencePattern = new RegExp(`!\\[[^\\]]*\\]\\((?:\\.\\.?\\/)?${relPath}(?:\\?[^\\s)]*)?(?:\\s+"[^"]*")?\\)\\s*\\n?`, 'g')
    for (const chapter of chapters) {
      const content = await this.chapters.read(chapter.relPath)
      const cleaned = content.markdown.replace(referencePattern, '')
      if (cleaned !== content.markdown) {
        if (this.revisions) await this.revisions.create({ relPath: chapter.relPath, actor: 'human', source: `asset-delete:${assetId}`, original: content.markdown, replacement: cleaned })
        await this.chapters.save(chapter.relPath, cleaned)
      }
    }
    try { await unlink(this.project.resolveInProject(row.rel_path)) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    try { await unlink(this.project.resolveInProject(`${row.rel_path.replace(/\.[^.]+$/, '')}.yaml`)) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    this.project.database.raw.prepare('DELETE FROM assets WHERE id = ?').run(assetId)
    return null
  }
  async readAsset(assetId: string): Promise<{ bytes: Uint8Array; mimeType: string }> { const row = this.project.database.raw.prepare('SELECT rel_path, mime_type FROM assets WHERE id = ?').get(assetId) as { rel_path: string; mime_type: string } | undefined; if (!row) throw new DomainError('PROJECT_NOT_FOUND', `Asset 不存在: ${assetId}`); return { bytes: await readFile(this.project.resolveInProject(row.rel_path)), mimeType: row.mime_type } }
  async insertIntoChapter(relPath: string, assetId: string, caption: string, idempotencyKey?: string): Promise<{ markdown: string }> {
    const asset = (await this.listAssets()).find((value) => value.assetId === assetId)
    if (!asset) throw new DomainError('PROJECT_NOT_FOUND', `Asset 不存在: ${assetId}`)
    const chapter = await this.chapters.read(relPath)
    if (idempotencyKey && chapter.markdown.includes(`"${assetId}"`)) return { markdown: chapter.markdown }
    const label = escapeMarkdownLabel(caption || 'Illustration') || 'Illustration'
    // The path carries the stable asset ID; the title makes the reference
    // explicit to other Markdown tooling without embedding image bytes.
    // Chapters live one directory below the project root, while assets live
    // at the project root. Keep the Markdown source portable for renderers
    // that resolve image URLs relative to the Markdown file.
    const markdownAssetPath = relPath.startsWith('chapters/') ? `../${asset.relPath}` : asset.relPath
    const reference = `![${label}](${markdownAssetPath} "${asset.assetId}")`
    const markdown = `${chapter.markdown.trimEnd()}\n\n${reference}\n`
    if (this.revisions) await this.revisions.create({ relPath, actor: 'human', source: `image-insert:${asset.assetId}`, original: chapter.markdown, replacement: markdown })
    await this.chapters.save(relPath, markdown)
    return { markdown }
  }
}
