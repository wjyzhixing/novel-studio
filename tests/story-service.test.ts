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

  it('searches entities, timeline events, and Story Bible artifacts through one bounded result set', async () => {
    const entity = await story.saveEntity({ kind: 'character', name: '星河旅人', aliases: [], fields: {}, notes: '' })
    await story.saveTimelineEvent({ title: '星河旅人抵达', description: '进入港口', entityIds: [entity.id] })
    await story.saveArtifact({ kind: 'foreshadowing', title: '星河旅人的秘密', fields: { setup: '秘密', target: '回收' }, notes: '' })

    const results = await story.searchAll('星河旅人')
    expect(results.map((result) => result.kind)).toEqual(['entity', 'timeline', 'artifact'])
    expect(results.every((result) => result.title.includes('星河旅人'))).toBe(true)
    expect(results.every((result) => result.hint.length <= 160)).toBe(true)
  })

  it('includes matching relations in the global Story search', async () => {
    const from = await story.saveEntity({ kind: 'character', name: '甲', aliases: [], fields: {}, notes: '' })
    const to = await story.saveEntity({ kind: 'character', name: '乙', aliases: [], fields: {}, notes: '' })
    const relation = await story.saveRelation({ fromId: from.id, relationType: '宿敌', toId: to.id, metadata: { source: 'chapter-1' } })

    await expect(story.searchAll('宿敌')).resolves.toEqual([expect.objectContaining({ id: relation.id, kind: 'relation', type: 'relation', title: '甲 — 宿敌 → 乙' })])
  })

  it('includes chapter正文 hits with a stable path and bounded snippet', async () => {
    const chapter = new ChapterService(project)
    const meta = await chapter.create('夜航日志')
    await chapter.save(meta.relPath, '# 夜航日志\n\n船进入了雾港，灯塔在远处闪烁。')
    const results = await story.searchAll('雾港')
    expect(results).toEqual([expect.objectContaining({ kind: 'document', type: 'document', relPath: meta.relPath, title: '夜航日志' })])
    expect(results[0]?.hint).toContain('雾港')
    expect(results[0]?.hint.length).toBeLessThanOrEqual(160)
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

  it('updates and deletes timeline source records', async () => {
    const event = await story.saveTimelineEvent({ title: '事件', at: null, description: 'desc', chapterRelPath: null, entityIds: [] })
    expect((await story.listTimeline()).map((item) => item.id)).toContain(event.id)
    expect(await readFile(join(project.getInfo()!.rootPath, 'story/timeline.yaml'), 'utf8')).toContain(event.id)
    await story.deleteTimelineEvent(event.id)
    expect((await story.listTimeline()).map((item) => item.id)).not.toContain(event.id)
    await expect(story.deleteTimelineEvent(event.id)).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
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

describe('StoryService relations and artifacts', () => {
  it('creates, updates, filters, and deletes entity relations', async () => {
    const from = await story.saveEntity({ kind: 'character', name: '甲', aliases: [], fields: {}, notes: '' })
    const to = await story.saveEntity({ kind: 'place', name: '乙地', aliases: [], fields: {}, notes: '' })
    const relation = await story.saveRelation({ fromId: from.id, relationType: '居住于', toId: to.id, metadata: { confidence: 1 } })
    expect(await story.listRelations()).toHaveLength(1)
    const updated = await story.saveRelation({ id: relation.id, fromId: from.id, relationType: '曾居住于', toId: to.id, metadata: {} })
    expect(updated.relationType).toBe('曾居住于')
    await expect(story.saveRelation({ fromId: from.id, relationType: '自指', toId: from.id, metadata: {} })).rejects.toThrow()
    await expect(story.saveRelation({ fromId: from.id, relationType: '悬空', toId: 'ent_missing', metadata: {} })).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    await story.deleteRelation(relation.id)
    expect(await story.listRelations()).toEqual([])
  })

  it('persists lore and foreshadowing artifacts and maintains the foreshadowing index', async () => {
    const lore = await story.saveArtifact({ kind: 'lore', title: '魔法规则', fields: { scope: '世界', rule: '必须支付代价' }, notes: '例外很少' })
    expect(existsSync(join(project.getInfo()!.rootPath, `world/lore/${lore.id}.md`))).toBe(true)
    const foreshadowing = await story.saveArtifact({ kind: 'foreshadowing', title: '旧钥匙', fields: { setup: '出现钥匙', target: '打开禁门', status: 'planted', relatedChapters: ['chapters/001-a.md'], evidenceItems: [{ chapterRelPath: 'chapters/001-a.md', quote: '钥匙泛光', note: '伏笔' }] }, notes: '' })
    expect(await story.listForeshadowing('planted')).toEqual([expect.objectContaining({ id: foreshadowing.id, relatedChapters: ['chapters/001-a.md'], evidenceItems: [expect.objectContaining({ quote: '钥匙泛光' })] })])
    await story.saveArtifact({ id: lore.id, kind: 'note', title: '普通笔记', fields: {}, notes: '' })
    expect(existsSync(join(project.getInfo()!.rootPath, `world/lore/${lore.id}.md`))).toBe(false)
    await story.deleteArtifact(foreshadowing.id)
    expect(await story.listForeshadowing()).toEqual([])
    await expect(story.deleteArtifact('art_missing')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
  })

  it('prevents deleting entities referenced by Canon facts', async () => {
    const entity = await story.saveEntity({ kind: 'character', name: '有事实', aliases: [], fields: {}, notes: '' })
    project.database.raw.prepare('INSERT INTO facts(id, subject_id, predicate, object_json, valid_from, valid_to, confidence, source_document_id, source_start, source_end, canonical, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('fact_guard', entity.id, 'status', 'true', null, null, 1, 'doc_guard', 0, 1, 1, new Date().toISOString())
    await expect(story.deleteEntity(entity.id)).rejects.toThrow('已有 Canon 事实')
  })
})
