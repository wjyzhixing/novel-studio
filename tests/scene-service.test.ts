import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { DomainError } from '../src/main/services/errors'
import { SceneService, paragraphCount, sceneSidecarRelPath } from '../src/main/services/scene-service'
import { makeTempRoot } from './helpers'

let project: ProjectService
let scenes: SceneService
let root: string
const chapter = 'chapters/001-第一章.md'

beforeEach(async () => {
  const temp = await makeTempRoot('novel-scene-test-')
  root = join(temp, 'project')
  project = new ProjectService(new RecentProjectsStore(join(temp, 'recents.json')))
  await project.create(root, '场景测试')
  await writeFile(join(root, chapter), '# 第一章\n\n第一段。\n\n第二段。\n\n第三段。\n', 'utf8')
  scenes = new SceneService(project)
})

afterEach(async () => { await project.close() })

describe('scene path and paragraph helpers', () => {
  it('derives sidecar paths and counts non-empty paragraphs', () => {
    expect(sceneSidecarRelPath(chapter)).toBe('chapters/001-第一章.scenes.yaml')
    expect(paragraphCount('# 标题\n\n正文\n\n  \n\n第二段')).toBe(3)
  })

  it('rejects paths outside chapter markdown files', () => {
    expect(() => sceneSidecarRelPath('../novel.yaml')).toThrow(DomainError)
    expect(() => sceneSidecarRelPath('story/notes.md')).toThrow(DomainError)
  })
})

describe('SceneService CRUD and ordering', () => {
  it('creates, lists, updates, reorders, and removes scenes with a sidecar index', async () => {
    expect(await scenes.list(chapter)).toEqual([])
    const first = await scenes.create({ chapterRelPath: chapter, title: '开场', startParagraph: 0, endParagraph: 1, summary: '建立场景' })
    const second = await scenes.create({ chapterRelPath: chapter, title: '转折', startParagraph: 2, endParagraph: 2, summary: '发生转折' })
    expect((await scenes.list(chapter)).map((scene) => scene.title)).toEqual(['开场', '转折'])

    const updated = await scenes.update({ id: first.id, chapterRelPath: chapter, title: '开场修订', startParagraph: 0, endParagraph: 0, summary: '修订后的开场' })
    expect(updated.title).toBe('开场修订')
    expect((await scenes.reorder(chapter, [second.id, first.id])).map((scene) => scene.order)).toEqual([0, 1])
    expect((await scenes.list(chapter)).map((scene) => scene.title)).toEqual(['转折', '开场修订'])

    await scenes.remove(chapter, second.id)
    expect((await scenes.list(chapter)).map((scene) => scene.title)).toEqual(['开场修订'])
    expect(await readFile(join(root, sceneSidecarRelPath(chapter)), 'utf8')).toContain('开场修订')
    expect((project.database.raw.prepare('SELECT COUNT(*) AS count FROM chapter_scenes').get() as { count: number }).count).toBe(1)
  })

  it('rejects invalid ranges, missing scenes, and incomplete reorder lists', async () => {
    await expect(scenes.create({ chapterRelPath: chapter, title: '越界', startParagraph: 0, endParagraph: 99, summary: '' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(scenes.update({ id: 'scene_missing', chapterRelPath: chapter, title: '不存在', startParagraph: 0, endParagraph: 0, summary: '' })).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    const created = await scenes.create({ chapterRelPath: chapter, title: '唯一场景', startParagraph: 0, endParagraph: 0, summary: '' })
    await expect(scenes.reorder(chapter, [])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(scenes.remove(chapter, 'scene_missing')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    await expect(scenes.reorder(chapter, [created.id, created.id])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})
