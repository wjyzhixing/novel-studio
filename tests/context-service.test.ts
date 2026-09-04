import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
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
})
