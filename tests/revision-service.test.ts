import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ChapterService } from '../src/main/services/chapter-service'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { RevisionService } from '../src/main/services/revision-service'
import { makeTempRoot } from './helpers'

describe('RevisionService', () => {
  it('creates, lists, reads, and safely reverts a revision', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Revision lifecycle')
    const chapters = new ChapterService(project)
    const chapter = await chapters.create('第一章')
    await chapters.save(chapter.relPath, '# 第一章\n\n原始正文')
    const revisions = new RevisionService(project, chapters)

    const revision = await revisions.create({ relPath: chapter.relPath, actor: 'agent', source: 'suggestion:test', original: '# 第一章\n\n原始正文', replacement: '# 第一章\n\n修改正文' })
    expect(revision.id).toMatch(/^rev_/)
    expect(await revisions.get(revision.id)).toMatchObject({ id: revision.id, actor: 'agent' })
    expect((await revisions.list(chapter.relPath)).map((item) => item.id)).toContain(revision.id)
    expect((await revisions.list('chapters/other.md'))).toEqual([])

    await chapters.save(chapter.relPath, revision.replacement)
    const reverted = await revisions.revert(revision.id)
    expect(reverted.relPath).toBe(chapter.relPath)
    expect(await chapters.read(chapter.relPath)).toMatchObject({ markdown: revision.original })
    expect(await revisions.get(reverted.revisionId)).toMatchObject({ actor: 'human', source: `revert:${revision.id}`, replacement: revision.original })
  })

  it('rejects missing, stale, and unconfigured revert requests', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Revision guards')
    const chapters = new ChapterService(project)
    const chapter = await chapters.create('第一章')
    await chapters.save(chapter.relPath, '# 第一章\n\n原始正文')
    const revisions = new RevisionService(project, chapters)
    const revision = await revisions.create({ relPath: chapter.relPath, actor: 'human', source: 'test', original: '# 第一章\n\n原始正文', replacement: '# 第一章\n\n替换正文' })

    await expect(revisions.get('rev_missing')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    await chapters.save(chapter.relPath, '# 第一章\n\n后续编辑')
    await expect(revisions.revert(revision.id)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    const withoutChapters = new RevisionService(project)
    await expect(withoutChapters.revert(revision.id)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})
