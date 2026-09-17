import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { ChapterService } from '../src/main/services/chapter-service'
import { ImageService } from '../src/main/services/image-service'
import { MockImageProvider, OpenAICompatibleImageProvider, UnconfiguredImageProvider } from '../src/main/services/image-service'
import { MemorySecretStore } from '../src/main/services/secret-store'
import { makeTempRoot } from './helpers'
import { limitImageReferences, toggleImageReference } from '../src/renderer/src/lib/image-reference-model'

describe('image reference selection', () => {
  it('toggles a persistent reference without disturbing insertion selection', () => {
    expect(toggleImageReference([], 'asset_one')).toEqual(['asset_one'])
    expect(toggleImageReference(['asset_one', 'asset_two'], 'asset_one')).toEqual(['asset_two'])
    expect(toggleImageReference(['asset_one'], 'asset_two')).toEqual(['asset_one', 'asset_two'])
  })

  it('deduplicates and caps references at the image request limit', () => {
    expect(limitImageReferences(['asset_one', 'asset_one', 'asset_two'], 2)).toEqual(['asset_one', 'asset_two'])
  })
})

describe('ImageService', () => {
  it('proposes a scene from a chapter and supports idempotent generation', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Proposal test')
    const chapters = new ChapterService(project); const chapter = await chapters.create('雨夜')
    await chapters.save(chapter.relPath, '# 雨夜\n\n街灯下有人等待。\n\n远处传来脚步声。')
    let calls = 0
    const provider = { generate: async (request: { prompt: string }) => {
      calls += 1
      return [{ assetId: `asset_custom_${calls}`, relPath: '', mimeType: 'image/png', provider: 'custom', model: 'custom-v1', prompt: request.prompt, references: [], createdAt: new Date().toISOString(), data: new Uint8Array([1, 2, 3]) }]
    }}
    const images = new ImageService(project, chapters, provider)
    const proposal = await images.proposeScene(chapter.relPath)
    expect(proposal).toMatchObject({ chapterRelPath: chapter.relPath, title: '雨夜' })
    const concurrent = await Promise.all([
      images.generate({ prompt: 'concurrent', references: [], aspectRatio: '16:9', idempotencyKey: 'concurrent-request' }),
      images.generate({ prompt: 'concurrent', references: [], aspectRatio: '16:9', idempotencyKey: 'concurrent-request' })
    ])
    expect(concurrent[0]).toEqual(concurrent[1])
    expect(calls).toBe(1)
    const first = await images.generate({ prompt: proposal.suggestedPrompt, references: [], aspectRatio: '16:9', idempotencyKey: 'same-request' })
    const second = await images.generate({ prompt: proposal.suggestedPrompt, references: [], aspectRatio: '16:9', idempotencyKey: 'same-request' })
    expect(first).toEqual(second)
    expect(calls).toBe(2)
  })

  it('handles scene selection and rejects missing or unconfigured image providers', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Provider errors')
    const chapters = new ChapterService(project); const chapter = await chapters.create('章节')
    const images = new ImageService(project, chapters, new UnconfiguredImageProvider())
    await expect(images.generate({ prompt: '', references: [], aspectRatio: '16:9' })).rejects.toThrow()
    await expect(images.proposeScene(chapter.relPath, 'scene_missing')).rejects.toThrow('场景不存在')
    await expect(images.insertIntoChapter(chapter.relPath, 'asset_missing', 'caption')).rejects.toThrow('Asset 不存在')
    await expect(images.readAsset('asset_missing')).rejects.toThrow('Asset 不存在')
    await expect(images.deleteAsset('asset_missing')).rejects.toThrow('Asset 不存在')
  })

  it('normalizes legacy asset records before they reach the renderer', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Legacy image test')
    project.database.raw.prepare('INSERT INTO assets(id, rel_path, mime_type, provider, model, provenance_json, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)').run('asset_legacy', 'assets/scenes/asset_legacy.png', 'image/png', 'mock', 'mock', '{"id":"asset_legacy","relPath":"assets/scenes/asset_legacy.png","mimeType":"image/png","provider":"mock","model":"mock","prompt":"legacy","references":[],"createdAt":"2026-01-01T00:00:00.000Z"}', '2026-01-01T00:00:00.000Z')
    const images = new ImageService(project, new ChapterService(project))
    expect((await images.listAssets())[0].assetId).toBe('asset_legacy')
  })

  it('generates an asset with provenance and inserts a reference into Markdown', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Image test'); const chapters = new ChapterService(project); const chapter = await chapters.create('雨夜')
    await chapters.save(chapter.relPath, '# 雨夜\n\n街灯下有人等待。'); const images = new ImageService(project, chapters)
    const assets = await images.generate({ prompt: 'cinematic rain', references: [], aspectRatio: '16:9' })
    expect(assets[0].provider).toBe('mock'); expect(existsSync(join(project.getInfo()!.rootPath, assets[0].relPath))).toBe(true)
    const sidecar = parse(await readFile(join(project.getInfo()!.rootPath, `assets/scenes/${assets[0].assetId}.yaml`), 'utf8')) as Record<string, unknown>
    expect(sidecar).not.toHaveProperty('data')
    expect(sidecar).not.toHaveProperty('previewDataUrl')
    const inserted = await images.insertIntoChapter(chapter.relPath, assets[0].assetId, '雨夜插图')
  expect(inserted.markdown).toContain(`![雨夜插图](../${assets[0].relPath} "${assets[0].assetId}")`); expect((await images.listAssets())).toHaveLength(1)
  })

  it('imports a local PNG as a file-backed asset without embedding bytes in metadata', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'PNG import test'); const chapters = new ChapterService(project); const chapter = await chapters.create('插图')
    const source = join(root, 'source.png'); await writeFile(source, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const images = new ImageService(project, chapters)
    const asset = await images.importFile(source, '本地 PNG')
    expect(asset.mimeType).toBe('image/png')
    expect(await readFile(join(project.getInfo()!.rootPath, asset.relPath))).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const metadata = parse(await readFile(join(project.getInfo()!.rootPath, `assets/scenes/${asset.assetId}.yaml`), 'utf8')) as Record<string, unknown>
    expect(metadata).toMatchObject({ assetId: asset.assetId, relPath: asset.relPath, prompt: '本地 PNG' })
    expect(metadata).not.toHaveProperty('data')
    await images.insertIntoChapter(chapter.relPath, asset.assetId, '本地 PNG')
    expect((await chapters.read(chapter.relPath)).markdown).toContain(`../${asset.relPath}`)
  })

  it('rejects unsupported, missing, and oversized local image imports', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Import validation'); const chapters = new ChapterService(project); const images = new ImageService(project, chapters)
    await expect(images.importFile(join(root, 'unknown.txt'))).rejects.toThrow('只支持导入')
    await expect(images.importFile(join(root, 'missing.png'))).rejects.toThrow('找不到要导入')
  })

  it('deletes file-backed assets and removes Markdown references', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Delete image'); const chapters = new ChapterService(project); const chapter = await chapters.create('插图')
    const images = new ImageService(project, chapters, new MockImageProvider())
    const asset = (await images.generate({ prompt: 'delete me', references: [], aspectRatio: '1:1', variants: 1 }))[0]
    await images.insertIntoChapter(chapter.relPath, asset.assetId, 'Delete me')
    expect((await images.readAsset(asset.assetId)).bytes.byteLength).toBeGreaterThan(0)
    await images.deleteAsset(asset.assetId)
    expect((await chapters.read(chapter.relPath)).markdown).not.toContain(asset.assetId)
    expect(await images.listAssets()).toEqual([])
    await expect(images.readAsset(asset.assetId)).rejects.toThrow('Asset 不存在')
  })
})

describe('OpenAI-compatible image provider', () => {
  it('sends image credentials and supports base64 and URL image responses', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Image provider')
    const profile = { id: 'profile_image_test', name: 'Image', kind: 'openai-compatible' as const, model: 'chat', imageBaseURL: 'https://images.example/v1/', imageModel: 'image-v1', temperature: 0, maxOutputTokens: 10 }
    project.database.setSetting('ai.providerProfiles', JSON.stringify([profile]))
    const secrets = new MemorySecretStore(); await secrets.set('profile_image_test:image', 'image-secret')
    const png = Buffer.from([137, 80, 78, 71]).toString('base64')
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: `data:image/png;base64,${png}` }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/image.webp' }] })))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/webp' } }))
    const provider = new OpenAICompatibleImageProvider(project, secrets, fetcher)
    const first = await provider.generate({ prompt: 'rain', negativePrompt: 'blur', references: [], aspectRatio: '1:1', variants: 1 }, undefined, profile.id)
    expect(first[0]).toMatchObject({ mimeType: 'image/png', prompt: 'rain', negativePrompt: 'blur' })
    const second = await provider.generate({ prompt: 'rain', references: [], aspectRatio: '1:1', variants: 1 }, undefined, profile.id)
    expect(second[0]).toMatchObject({ mimeType: 'image/webp' })
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer image-secret' })
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ model: 'image-v1', prompt: 'rain\n\nAvoid: blur' })
  })

  it('reports configuration, HTTP, and empty response failures', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Image provider errors'); const secrets = new MemorySecretStore()
    const profile = { id: 'profile_image_error', name: 'Image', kind: 'openai-compatible' as const, model: 'chat', temperature: 0, maxOutputTokens: 10 }
    project.database.setSetting('ai.providerProfiles', JSON.stringify([profile]))
    const provider = new OpenAICompatibleImageProvider(project, secrets, vi.fn())
    await expect(provider.generate({ prompt: 'x', references: [], aspectRatio: '1:1' }, undefined, profile.id)).rejects.toThrow('Image Base URL')
    await expect(provider.generate({ prompt: 'x', references: [], aspectRatio: '1:1' }, undefined, 'profile_missing')).rejects.toThrow('Provider profile 不存在')
    const configured = { ...profile, imageBaseURL: 'https://images.example', imageModel: 'image' }
    project.database.setSetting('ai.providerProfiles', JSON.stringify([configured]))
    await expect(new OpenAICompatibleImageProvider(project, secrets, vi.fn()).generate({ prompt: 'x', references: [], aspectRatio: '1:1' }, undefined, configured.id)).rejects.toThrow('独立的 Image API Key')
    await secrets.set('profile_image_error:image', 'key')
    await expect(new OpenAICompatibleImageProvider(project, secrets, vi.fn(async () => new Response('provider secret', { status: 500 }))).generate({ prompt: 'x', references: [], aspectRatio: '1:1' }, undefined, configured.id)).rejects.toThrow('Image Provider 请求失败 (500)')
    await expect(new OpenAICompatibleImageProvider(project, secrets, vi.fn(async () => new Response(JSON.stringify({ data: [] })))).generate({ prompt: 'x', references: [], aspectRatio: '1:1' }, undefined, configured.id)).rejects.toThrow('未返回可保存')
  })
})
