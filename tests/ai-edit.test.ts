import { describe, expect, it } from 'vitest'
import { buildDiff } from '../src/main/services/diff'
import { AiEditService } from '../src/main/services/ai-edit-service'
import { RevisionService } from '../src/main/services/revision-service'
import { ChapterService } from '../src/main/services/chapter-service'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { makeTempRoot } from './helpers'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

describe('buildDiff', () => {
  it('returns word-level additions and removals', () => {
    expect(buildDiff('雨落在屋檐', '雨落在青石板屋檐')).toEqual([
      { kind: 'equal', text: '雨落在' }, { kind: 'add', text: '青石板' }, { kind: 'equal', text: '屋檐' }
    ])
  })

  it('does not silently discard replacement content', () => {
    const diff = buildDiff('旧句', '新句')
    expect(diff.filter((part) => part.kind !== 'add').map((part) => part.text).join('')).toBe('旧句')
    expect(diff.filter((part) => part.kind !== 'remove').map((part) => part.text).join('')).toBe('新句')
  })

  it('requires explicit accept before writing and records a revision', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Edit test')
    const chapters = new ChapterService(project)
    const chapter = await chapters.create('第一章')
    await chapters.save(chapter.relPath, '# 第一章\n\n旧内容')
    const ai = { chat: async () => ({ text: '新内容', model: 'mock' }) }
    const edits = new AiEditService(chapters, ai as never, new RevisionService(project))
    const suggestion = await edits.run({ profileId: 'profile_mock', relPath: chapter.relPath, prompt: '改写', selection: '旧内容' })
    expect(await readFile(join(project.getInfo()!.rootPath, chapter.relPath), 'utf8')).toContain('旧内容')
    const accepted = await edits.accept(suggestion.id)
    expect(accepted.revisionId).toMatch(/^rev_/)
    expect(await readFile(join(project.getInfo()!.rootPath, chapter.relPath), 'utf8')).toContain('新内容')
    expect(await readFile(join(project.getInfo()!.rootPath, `.novel/revisions/${accepted.revisionId}.yaml`), 'utf8')).toContain('actor: agent')
  })

  it('reloads pending suggestions from project persistence', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Suggestion persistence')
    const chapters = new ChapterService(project); const chapter = await chapters.create('第一章'); await chapters.save(chapter.relPath, '# 第一章\n\n原文')
    const ai = { chat: async () => ({ text: '新内容', model: 'mock' }) }
    const first = new AiEditService(chapters, ai as never, new RevisionService(project))
    const created = await first.run({ profileId: 'profile_mock', relPath: chapter.relPath, prompt: '改写', selection: '原文' })
    const second = new AiEditService(chapters, ai as never, new RevisionService(project))
    await expect(second.listPending(chapter.relPath)).resolves.toEqual([created])
  })

  it('can cancel an in-flight job and retry a pending suggestion', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Cancel test')
    const chapters = new ChapterService(project)
    const chapter = await chapters.create('第一章')
    await chapters.save(chapter.relPath, '# 第一章\n\n原文')
    const ai = { chat: async (_profile: string, _request: unknown, signal?: AbortSignal) => new Promise<{ text: string; model: string }>((resolve, reject) => { if (signal?.aborted) { reject(new Error('aborted')); return }; signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }) }) }
    const edits = new AiEditService(chapters, ai as never, new RevisionService(project))
    const requestId = 'job_cancel_test'
    const pending = edits.run({ requestId, profileId: 'profile_mock', relPath: chapter.relPath, prompt: '改写', selection: '原文' })
    await Promise.resolve()
    await edits.cancel(requestId)
    await expect(pending).rejects.toThrow('aborted')

    const retryAi = { chat: async () => ({ text: '重试结果', model: 'mock' }) }
    const retryEdits = new AiEditService(chapters, retryAi as never, new RevisionService(project))
    const original = await retryEdits.run({ profileId: 'profile_mock', relPath: chapter.relPath, prompt: '改写', selection: '原文' })
    const retried = await retryEdits.retry(original.id)
    expect(retried.id).not.toBe(original.id)
    expect(retried.suggested).toContain('重试结果')
  })

  it('keeps the chapter heading and body when continuing without a selection', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Continuation test')
    const chapters = new ChapterService(project)
    const chapter = await chapters.create('第一章')
    await chapters.save(chapter.relPath, '# 第一章\n\n原有正文')
    const ai = { chat: async () => ({ text: '这是续写内容。', model: 'mock' }) }
    const edits = new AiEditService(chapters, ai as never, new RevisionService(project))

    const suggestion = await edits.run({ profileId: 'profile_mock', relPath: chapter.relPath, prompt: '续写当前章节', selection: null })

    expect(suggestion.suggested).toBe('# 第一章\n\n原有正文\n\n这是续写内容。')
  })

  it('creates a pending suggestion from Chat text without writing immediately', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Chat suggestion')
    const chapters = new ChapterService(project); const chapter = await chapters.create('第一章'); await chapters.save(chapter.relPath, '# 第一章\n\n原文')
    const edits = new AiEditService(chapters, { chat: async () => ({ text: 'unused', model: 'mock' }) } as never, new RevisionService(project))

    const suggestion = await edits.createFromText({ profileId: 'profile_mock', relPath: chapter.relPath, prompt: '应用到选区', selection: '原文', suggested: '# 第一章\n\n新文' })

    expect(suggestion.status).toBe('pending')
    expect(suggestion.suggested).toContain('新文')
    expect(await readFile(join(project.getInfo()!.rootPath, chapter.relPath), 'utf8')).toContain('原文')
  })

  it('rejects accepting a stale suggestion without overwriting newer chapter edits', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Stale suggestion')
    const chapters = new ChapterService(project); const chapter = await chapters.create('第一章'); await chapters.save(chapter.relPath, '# 第一章\n\n原文')
    const edits = new AiEditService(chapters, { chat: async () => ({ text: 'AI 内容', model: 'mock' }) } as never, new RevisionService(project))
    const suggestion = await edits.run({ profileId: 'profile_mock', relPath: chapter.relPath, prompt: '改写', selection: '原文' })
    await chapters.save(chapter.relPath, '# 第一章\n\n人类新编辑')

    await expect(edits.accept(suggestion.id)).rejects.toThrow('章节内容已变化')
    expect(await readFile(join(project.getInfo()!.rootPath, chapter.relPath), 'utf8')).toContain('人类新编辑')
    await expect(edits.listPending(chapter.relPath)).resolves.toEqual([])
  })
})
