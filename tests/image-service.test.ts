import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { ChapterService } from '../src/main/services/chapter-service'
import { ImageService } from '../src/main/services/image-service'
import { makeTempRoot } from './helpers'

describe('ImageService', () => {
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
})
