import { beforeEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { StoryService } from '../src/main/services/story-service'
import { ChapterService } from '../src/main/services/chapter-service'
import { makeTempRoot } from './helpers'

let story: StoryService
let project: ProjectService

beforeEach(async () => {
  const root = await makeTempRoot()
  project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
  await project.create(join(root, 'novel'), 'Story test')
  story = new StoryService(project)
})

describe('StoryService entities', () => {
  it('creates and updates a character with aliases and structured fields', async () => {
    const created = await story.saveEntity({
      kind: 'character', name: '林默', aliases: ['阿默'],
      fields: { role: 'protagonist', status: { alive: true } }, notes: '主角'
    })
    expect(created.id).toMatch(/^ent_/)
    expect(existsSync(join(project.getInfo()!.rootPath, `characters/${created.id}.yaml`))).toBe(true)
    expect(await readFile(join(project.getInfo()!.rootPath, `characters/${created.id}.yaml`), 'utf8')).toContain('林默')
    expect((await story.search('阿默'))[0].id).toBe(created.id)

    const updated = await story.saveEntity({
      id: created.id, kind: 'character', name: '林默', aliases: ['阿默', '小默'],
      fields: { role: 'protagonist', status: { alive: false } }, notes: '已更新'
    })
    expect(updated.id).toBe(created.id)
    expect((await story.getEntity(created.id)).fields).toEqual({ role: 'protagonist', status: { alive: false } })
    expect((await story.listEntities('character'))).toHaveLength(1)
  })

  it('rejects missing entities and deletes existing entities', async () => {
    await expect(story.getEntity('ent_missing')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    const entity = await story.saveEntity({ kind: 'place', name: '朱雀大街', aliases: [], fields: {}, notes: '' })
    await story.deleteEntity(entity.id)
    expect(await story.search('朱雀大街')).toEqual([])
  })
})

describe('StoryService timeline', () => {
  it('saves and lists events with entity links in chronological order', async () => {
    const char = await story.saveEntity({ kind: 'character', name: '苏璃', aliases: [], fields: {}, notes: '' })
    await story.saveTimelineEvent({ title: '进入地下城', at: '2127-05-17 21:42', description: '两人同行', chapterRelPath: null, entityIds: [char.id] })
    await story.saveTimelineEvent({ title: '雨夜相遇', at: '2127-05-01', description: '', chapterRelPath: null, entityIds: [char.id] })

    const events = await story.listTimeline()
    expect(events.map((event) => event.title)).toEqual(['雨夜相遇', '进入地下城'])
    expect(events[0].entityIds).toEqual([char.id])
  })

  it('rejects dangling chapter, participant, and non-place location references', async () => {
    const chapter = await new ChapterService(project).create('关联章节')
    const character = await story.saveEntity({ kind: 'character', name: '参与者', aliases: [], fields: {}, notes: '' })
    const character2 = await story.saveEntity({ kind: 'character', name: '非地点', aliases: [], fields: {}, notes: '' })
    await expect(story.saveTimelineEvent({ title: '悬空参与者', chapterRelPath: chapter.relPath, entityIds: ['ent_missing'] })).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    await expect(story.saveTimelineEvent({ title: '悬空章节', chapterRelPath: 'chapters/999-missing.md', entityIds: [character.id] })).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    await expect(story.saveTimelineEvent({ title: '地点类型错误', chapterRelPath: chapter.relPath, entityIds: [character.id], locationId: character2.id })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})
