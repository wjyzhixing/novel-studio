import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AuthoringProgressService } from '../src/main/services/authoring-progress-service'
import { CanonService } from '../src/main/services/canon-service'
import { ChapterService } from '../src/main/services/chapter-service'
import { FullRevisionService } from '../src/main/services/full-revision-service'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { StoryService } from '../src/main/services/story-service'
import { VolumeService } from '../src/main/services/volume-service'
import { makeTempRoot } from './helpers'

async function makeProject() {
  const root = await makeTempRoot()
  const project = new ProjectService(new RecentProjectsStore(join(root, 'recents.json')))
  await project.create(join(root, 'novel'), 'Full revision')
  const volumes = new VolumeService(project)
  const chapters = new ChapterService(project, undefined, volumes)
  const story = new StoryService(project)
  const canon = new CanonService(project, story)
  const authoring = new AuthoringProgressService(project, chapters, volumes, canon)
  await authoring.initialize({ genre: '都市悬疑', premise: '在雾港找回一段被隐藏的声音。', targetWordCount: 2_000, chapterCount: 1, volumeTitles: ['第一卷'], chapterTitles: ['潮声'], chapterPlans: ['完成一次证据与选择'] })
  return { project, chapters, story, canon, authoring }
}

describe('FullRevisionService', () => {
  it('reports blocking completion gaps without changing chapter content', async () => {
    const services = await makeProject()
    const before = (await services.chapters.read((await services.chapters.list())[0]!.relPath)).markdown
    const service = new FullRevisionService(services.authoring, services.project, services.canon, services.story, services.chapters)

    const report = await service.prepare()
    expect(report.passed).toBe(false)
    expect(report.findings.some((finding) => finding.category === 'completion' && finding.severity === 'error')).toBe(true)
    expect((await services.chapters.read((await services.chapters.list())[0]!.relPath)).markdown).toBe(before)
    await services.project.close()
  })

  it('requires an approved report before completing revision and is idempotent after approval', async () => {
    const services = await makeProject()
    const chapter = (await services.chapters.list())[0]!
    await services.story.saveEntity({ id: 'ent_lin_lan', kind: 'character', name: '林岚', aliases: [], fields: {}, notes: '' })
    await services.story.saveEntity({ id: 'ent_harbor', kind: 'place', name: '雾港', aliases: [], fields: {}, notes: '' })
    await services.story.saveTimelineEvent({ id: 'evt_opening', title: '潮声抵达', at: '第1章', description: '录音抵达修复店。', chapterRelPath: chapter.relPath, entityIds: ['ent_lin_lan', 'ent_harbor'], locationId: 'ent_harbor', causes: '', effects: '林岚开始调查。' })
    await services.story.saveArtifact({ id: 'art_second_door', kind: 'foreshadowing', title: '第二个门', fields: { setup: '录音提到灯塔下的第二个门。', target: '在灯塔地下空间回收', payoffDeadline: '第14章', evidence: '录音', status: 'resolved', relatedChapters: [chapter.relPath] }, notes: '' })
    await services.chapters.save(chapter.relPath, `# 潮声\n\n${'林岚沿着潮线寻找旧灯塔，耳边始终回响着那段没有寄件人的录音。'.repeat(180)}`)
    await services.authoring.markChapterStatus(chapter.relPath, 'approved', 'run_chapter_1')

    const service = new FullRevisionService(services.authoring, services.project, services.canon, services.story, services.chapters)
    const report = await service.prepare()
    expect(report.passed).toBe(true)
    const completed = await service.approve(report.reportId)
    expect(completed.revision).toMatchObject({ completed: true, reportId: report.reportId })
    expect(completed.phase).toBe('export')
    await expect(service.approve('fullrev_missing')).rejects.toThrow('全稿修订报告不存在')
    const repeated = await service.approve(report.reportId)
    expect(repeated.revision).toEqual(completed.revision)
    await services.project.close()
  })
})
