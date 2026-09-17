import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { ChapterService } from '../src/main/services/chapter-service'
import { StoryService } from '../src/main/services/story-service'
import { ContextService } from '../src/main/services/context-service'
import { makeTempRoot } from './helpers'

describe('ContextService', () => {
  it('builds reproducible pinned, structured and semantic context within budget', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Context test')
    const chapters = new ChapterService(project); const story = new StoryService(project)
    const chapter = await chapters.create('雨夜'); await chapters.save(chapter.relPath, '# 雨夜\n\n林默站在朱雀大街。')
    await story.saveEntity({ kind: 'character', name: '林默', aliases: ['阿默'], fields: { role: '主角' }, notes: '' })
    const context = new ContextService(project, chapters, story)
    const result = await context.build({ relPath: chapter.relPath, selection: '朱雀大街', query: '朱雀', recipe: { id: 'review', maxTokens: 40, includeSelection: true, entityLimit: 20, semanticLimit: 5 } })
    expect(result.manifest.recipeId).toBe('review')
    expect(result.manifest.totalTokens).toBeLessThanOrEqual(40)
    expect(result.manifest.items.some((item) => item.layer === 'pinned')).toBe(true)
    expect(result.manifest.items.some((item) => item.layer === 'structured')).toBe(true)
    expect(result.manifest.items.some((item) => item.layer === 'semantic')).toBe(true)
    expect(result.text).toContain('[Pinned]')
  })

  it('caches a deterministic chapter summary in project state', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Summary test')
    const chapters = new ChapterService(project); const story = new StoryService(project); const chapter = await chapters.create('一章')
    await chapters.save(chapter.relPath, '# 一章\n\n第一段摘要。\n\n第二段正文。')
    const context = new ContextService(project, chapters, story)
    const first = await context.summarize(chapter.relPath); const second = await context.summarize(chapter.relPath)
    expect(second).toBe(first); expect(first).toContain('第一段摘要')
    await chapters.save(chapter.relPath, '# 一章\n\n更新后的摘要。')
    expect(await context.summarize(chapter.relPath)).toContain('更新后的摘要')
  })

  it('declares that replay results are recomputed and old retrieval results are not reused', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Replay compatibility test')
    const chapters = new ChapterService(project); const story = new StoryService(project); const chapter = await chapters.create('一章')
    await chapters.save(chapter.relPath, '# 一章\n\n正文内容。')
    const context = new ContextService(project, chapters, story)
    await context.build({ relPath: chapter.relPath, selection: null, query: '正文', recipe: { id: 'replay-compatibility', maxTokens: 100, includeSelection: false, entityLimit: 1, semanticLimit: 0 } })
    const snapshot = (await context.listSnapshots(chapter.relPath))[0]
    const replay = await context.replaySnapshot(snapshot.id)

    expect(replay.compatibility.fromProjectSchemaVersion).toBe(1)
    expect(replay.compatibility.resultStrategy).toBe('recompute')
    expect(replay.compatibility.sourceResultReusable).toBe(false)
  })

  it('rejects snapshots from a future project schema instead of replaying them silently', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Future snapshot test')
    const chapters = new ChapterService(project); const story = new StoryService(project); const chapter = await chapters.create('一章')
    await chapters.save(chapter.relPath, '# 一章\n\n正文内容。')
    const context = new ContextService(project, chapters, story)
    await context.build({ relPath: chapter.relPath, selection: null, query: '正文', recipe: { id: 'future-schema', maxTokens: 100, includeSelection: false, entityLimit: 1, semanticLimit: 0 } })
    const snapshot = (await context.listSnapshots(chapter.relPath))[0]
    const row = project.database.raw.prepare('SELECT file_path FROM context_snapshots WHERE id = ?').get(snapshot.id) as { file_path: string }
    const filePath = project.resolveInProject(row.file_path)
    const value = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>
    await writeFile(filePath, JSON.stringify({ ...value, projectSchemaVersion: 999 }), 'utf8')

    await expect(context.replaySnapshot(snapshot.id)).rejects.toThrow('项目 schema v999 高于当前支持的')
  })

  it('rejects a snapshot whose request or result no longer matches its integrity hash', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Tampered snapshot test')
    const chapters = new ChapterService(project); const story = new StoryService(project); const chapter = await chapters.create('一章')
    await chapters.save(chapter.relPath, '# 一章\n\n正文内容。')
    const context = new ContextService(project, chapters, story)
    await context.build({ relPath: chapter.relPath, selection: null, query: '正文', recipe: { id: 'tamper-check', maxTokens: 100, includeSelection: false, entityLimit: 1, semanticLimit: 0 } })
    const snapshot = (await context.listSnapshots(chapter.relPath))[0]
    const row = project.database.raw.prepare('SELECT file_path FROM context_snapshots WHERE id = ?').get(snapshot.id) as { file_path: string }
    const filePath = project.resolveInProject(row.file_path)
    const value = JSON.parse(await readFile(filePath, 'utf8')) as { result: { text: string } }
    await writeFile(filePath, JSON.stringify({ ...value, result: { ...value.result, text: `${value.result.text}\n篡改内容` } }), 'utf8')

    await expect(context.readSnapshot(snapshot.id)).rejects.toThrow('完整性校验失败')
  })

  it('adds recent preceding chapter summaries as a budgeted recency layer', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Recency test')
    const chapters = new ChapterService(project); const story = new StoryService(project)
    const previous = await chapters.create('上一章'); await chapters.save(previous.relPath, '# 上一章\n\n上一章发生了关键冲突。\n\n更多正文。')
    const current = await chapters.create('当前章'); await chapters.save(current.relPath, '# 当前章\n\n当前章节开头。')
    const context = new ContextService(project, chapters, story)
    const result = await context.build({ relPath: current.relPath, selection: null, query: '', recipe: { id: 'recency', maxTokens: 200, includeSelection: false, entityLimit: 0, semanticLimit: 0, recencyLimit: 1 } })

    expect(result.manifest.items).toEqual(expect.arrayContaining([expect.objectContaining({ layer: 'recency', source: previous.relPath, text: expect.stringContaining('关键冲突') })]))
    expect(result.manifest.retrieval.candidateCounts.recency).toBe(1)
  })
})
