import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { AuthoringProgressService } from '../src/main/services/authoring-progress-service'
import { CanonService } from '../src/main/services/canon-service'
import { ChapterService } from '../src/main/services/chapter-service'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { StoryService } from '../src/main/services/story-service'
import { VolumeService } from '../src/main/services/volume-service'
import { authoringProgressSchema } from '../src/shared/authoring'
import { makeTempRoot } from './helpers'
import { countWords } from '../src/main/services/words'

async function makeServices() {
  const root = await makeTempRoot()
  const projectRoot = join(root, 'novel')
  const project = new ProjectService(new RecentProjectsStore(join(root, 'recents.json')))
  await project.create(projectRoot, '测试小说')
  const volumes = new VolumeService(project)
  const chapters = new ChapterService(project, undefined, volumes)
  await chapters.rebuildIndex()
  const story = new StoryService(project)
  const canon = new CanonService(project, story)
  return { root, projectRoot, project, chapters, volumes, canon }
}

describe('authoring progress service', () => {
  it('initializes a project, creates planned chapters, and assigns volumes', async () => {
    const services = await makeServices()
    const service = new AuthoringProgressService(services.project, services.chapters, services.volumes, services.canon)
    const progress = await service.initialize({
      genre: '都市悬疑',
      premise: '修复师从旧磁带里听见失踪父亲的求救声。',
      targetWordCount: 30_000,
      chapterCount: 3,
      volumeTitles: ['雾起', '潮落'],
      chapterTitles: ['录音', '坐标', '门'],
      chapterPlans: ['建立谜团', '追查线索', '面对真相']
    })

    expect(progress.phase).toBe('bible')
    expect(progress.chapters).toHaveLength(3)
    expect(await services.chapters.list()).toHaveLength(3)
    expect((await services.volumes.list()).every((volume) => volume.chapterRelPaths.length > 0)).toBe(true)
    expect(existsSync(join(services.projectRoot, 'story/authoring-progress.yaml'))).toBe(true)
    expect(services.project.getInfo()?.manifest.defaultWorkflow).toBe('flow_my_authoring')
    expect(existsSync(join(services.projectRoot, 'workflows/flow_my_authoring.novelflow.json'))).toBe(true)
    expect(await readFile(join(services.projectRoot, 'story/premise.md'), 'utf8')).toContain('修复师从旧磁带')
    expect(authoringProgressSchema.parse(parseYaml(await readFile(join(services.projectRoot, 'story/authoring-progress.yaml'), 'utf8')))).toEqual(progress)
    await services.project.close()
  })

  it('rejects re-initialization and unsafe inputs', async () => {
    const services = await makeServices()
    const service = new AuthoringProgressService(services.project, services.chapters, services.volumes, services.canon)
    const input = { genre: '悬疑', premise: '寻找答案。', targetWordCount: 10_000, chapterCount: 1, volumeTitles: ['一'], chapterTitles: ['开始'] }
    await service.initialize(input)
    await expect(service.initialize(input)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await services.project.close()
  })

  it('refreshes word counts from disk without promoting a chapter past review', async () => {
    const services = await makeServices()
    const service = new AuthoringProgressService(services.project, services.chapters, services.volumes, services.canon)
    await service.initialize({ genre: '悬疑', premise: '寻找答案。', targetWordCount: 10_000, chapterCount: 1, volumeTitles: ['一'], chapterTitles: ['开始'] })
    const chapter = (await services.chapters.list())[0]!
    await services.chapters.save(chapter.relPath, '# 开始\n\n这里是已经写下的正文。')
    const savedMarkdown = (await services.chapters.read(chapter.relPath)).markdown
    expect(savedMarkdown).toContain('这里是已经写下的正文')
    expect(countWords(savedMarkdown.replace(/^#{1,6}[ \t]+[^\r\n]*(?:\r?\n|$)/m, ''))).toBe(10)
    const refreshed = await service.refresh()
    expect(refreshed.chapters[0]).toMatchObject({ wordCount: 10, status: 'draft' })
    await services.project.close()
  })

  it('persists runtime review and approval states across refreshes', async () => {
    const services = await makeServices()
    const service = new AuthoringProgressService(services.project, services.chapters, services.volumes, services.canon)
    await service.initialize({ genre: '悬疑', premise: '寻找答案。', targetWordCount: 10_000, chapterCount: 1, volumeTitles: ['一'], chapterTitles: ['开始'] })
    const chapter = (await services.chapters.list())[0]!
    await service.markChapterStatus(chapter.relPath, 'review', 'run_review')
    expect((await service.refresh()).chapters[0]?.status).toBe('review')
    await services.chapters.save(chapter.relPath, '# 开始\n\n审核通过的正文。')
    await service.markChapterStatus(chapter.relPath, 'approved', 'run_review')
    expect((await service.refresh()).chapters[0]).toMatchObject({ status: 'approved', workflowRunId: 'run_review' })
    await services.project.close()
  })

  it('persists a generated chapter plan without changing the chapter body or review status', async () => {
    const services = await makeServices()
    const service = new AuthoringProgressService(services.project, services.chapters, services.volumes, services.canon)
    await service.initialize({ genre: '悬疑', premise: '寻找答案。', targetWordCount: 10_000, chapterCount: 1, volumeTitles: ['一'], chapterTitles: ['开始'] })
    const chapter = (await services.chapters.list())[0]!
    const before = await services.chapters.read(chapter.relPath)

    const saved = await service.saveChapterPlan(chapter.relPath, '目标：找到第一条线索\n结尾：留下新问题。', 'run_plan')

    expect(saved.chapters[0]).toMatchObject({ status: 'planned', plan: '目标：找到第一条线索\n结尾：留下新问题。' })
    expect((await services.chapters.read(chapter.relPath)).markdown).toBe(before.markdown)
    expect((await service.refresh()).chapters[0]?.plan).toContain('第一条线索')
    await services.project.close()
  })

  it('saves the editable story foundation and recalculates its completion stages', async () => {
    const services = await makeServices()
    const service = new AuthoringProgressService(services.project, services.chapters, services.volumes, services.canon)
    await service.initialize({ genre: '悬疑', premise: '寻找答案。', targetWordCount: 10_000, chapterCount: 1, volumeTitles: ['一'], chapterTitles: ['开始'] })

    const saved = await service.saveFoundation({
      premise: '# 故事前提\n\n一个修复师追查一盘旧磁带。',
      outline: '# 大纲\n\n## 第一幕\n\n### 第1章 开始\n\n- 冲突：她必须打开磁带。'
    })

    expect(saved.premise.completed).toBe(true)
    expect(saved.outline.completed).toBe(true)
    expect(await services.project.readText('story/premise.md')).toContain('一个修复师')
    expect(await services.project.readText('story/outline.md')).toContain('第1章 开始')
    await services.project.close()
  })

  it('rejects direct attempts to bypass full-revision and export gates', async () => {
    const services = await makeServices()
    const service = new AuthoringProgressService(services.project, services.chapters, services.volumes, services.canon)
    await service.initialize({ genre: '悬疑', premise: '寻找答案。', targetWordCount: 10_000, chapterCount: 1, volumeTitles: ['一'], chapterTitles: ['开始'] })
    const current = await service.get()
    await expect(service.save({ ...current, phase: 'export', revision: { completed: true, reportId: 'fullrev_fake' } })).rejects.toThrow('必须通过全稿修订确认')
    await expect(service.markExported('/tmp/final.md')).rejects.toThrow('全稿修订完成后才能记录导出')
    await services.project.close()
  })
})
