import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore, workflowCompletionAction } from '../src/renderer/src/store/app-store'
import type { Result } from '../src/shared/result'

const saved = (wordCount = 1): Result<{ savedAt: string; wordCount: number }> => ({
  ok: true,
  data: { savedAt: new Date().toISOString(), wordCount }
})

function installApi(save: (path: string, markdown: string) => Promise<Result<{ savedAt: string; wordCount: number }>>) {
  vi.stubGlobal('window', {
    novelAPI: {
      chapter: {
        save,
        list: vi.fn(async () => ({ ok: true, data: [] }))
      },
      project: {
        listRecent: vi.fn(async () => ({ ok: true, data: [] }))
      }
    }
  })
}

beforeEach(() => {
  vi.useRealTimers()
  useAppStore.setState({
    project: { rootPath: '/tmp/project', manifest: { title: 'Test', language: 'zh-CN' } as never },
    activeRelPath: 'chapters/001-test.md',
    activeChapter: null,
    editorMarkdown: '# Test',
    saveStatus: 'dirty',
    liveWordCount: 1,
    chapters: [],
    notice: null
  })
})

describe('chapter autosave state', () => {
  it('refreshes only clean active chapters and reports conflicts for dirty content', () => {
    expect(workflowCompletionAction('chapters/001-test.md', 'chapters/001-test.md', 'saved')).toBe('refresh')
    expect(workflowCompletionAction('chapters/001-test.md', 'chapters/001-test.md', 'dirty')).toBe('conflict')
    expect(workflowCompletionAction('chapters/002-test.md', 'chapters/001-test.md', 'saved')).toBe('ignore')
  })

  it('keeps the latest chapter selected when clicks resolve out of order', async () => {
    let resolveFirst!: (value: Result<{ relPath: string; title: string; markdown: string }>) => void
    const firstRead = new Promise<Result<{ relPath: string; title: string; markdown: string }>>((resolve) => {
      resolveFirst = resolve
    })
    const read = vi.fn()
      .mockReturnValueOnce(firstRead)
      .mockResolvedValueOnce({ ok: true, data: { relPath: 'chapters/002-second.md', title: 'Second', markdown: '# Second' } })
    vi.stubGlobal('window', {
      novelAPI: {
        chapter: { read, list: vi.fn(async () => ({ ok: true, data: [] })) },
        scene: { list: vi.fn(async () => ({ ok: true, data: [] })) }
      }
    })
    useAppStore.setState({ activeRelPath: null, activeChapter: null, editorMarkdown: '', saveStatus: 'saved' })

    const first = useAppStore.getState().openChapter('chapters/001-first.md')
    const second = useAppStore.getState().openChapter('chapters/002-second.md')
    await second
    resolveFirst({ ok: true, data: { relPath: 'chapters/001-first.md', title: 'First', markdown: '# First' } })
    await first

    expect(useAppStore.getState().activeRelPath).toBe('chapters/002-second.md')
    expect(useAppStore.getState().editorMarkdown).toBe('# Second')
  })

  it('keeps dirty state when newer input arrives during an in-flight save', async () => {
    let resolveFirst!: (value: Result<{ savedAt: string; wordCount: number }>) => void
    const firstSave = new Promise<Result<{ savedAt: string; wordCount: number }>>((resolve) => {
      resolveFirst = resolve
    })
    const save = vi.fn()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce(saved(2))
    installApi(save)

    const first = useAppStore.getState().saveActiveChapter()
    await Promise.resolve()
    useAppStore.getState().setEditorMarkdown('# Test\n\n新内容')
    resolveFirst(saved())
    await first

    expect(useAppStore.getState().saveStatus).toBe('dirty')
    await useAppStore.getState().saveActiveChapter()
    expect(save).toHaveBeenLastCalledWith('chapters/001-test.md', '# Test\n\n新内容')
    expect(useAppStore.getState().saveStatus).toBe('saved')
  })

  it('flushes an in-flight save before allowing a chapter switch', async () => {
    let resolveSave!: (value: Result<{ savedAt: string; wordCount: number }>) => void
    const pending = new Promise<Result<{ savedAt: string; wordCount: number }>>((resolve) => {
      resolveSave = resolve
    })
    const save = vi.fn().mockReturnValue(pending)
    installApi(save)

    const saving = useAppStore.getState().saveActiveChapter()
    await Promise.resolve()
    const flushing = useAppStore.getState().flushAutosave()
    expect(save).toHaveBeenCalledTimes(1)
    resolveSave(saved())
    await Promise.all([saving, flushing])
    expect(useAppStore.getState().saveStatus).toBe('saved')
  })

  it('does not make chapter switching wait for the post-save chapter index refresh', async () => {
    let resolveList!: (value: Result<never[]>) => void
    const listPending = new Promise<Result<never[]>>((resolve) => { resolveList = resolve })
    const save = vi.fn().mockResolvedValue(saved())
    vi.stubGlobal('window', {
      novelAPI: {
        chapter: { save, list: vi.fn(() => listPending) },
        project: { listRecent: vi.fn(async () => ({ ok: true, data: [] })) }
      }
    })

    const saving = useAppStore.getState().saveActiveChapter()
    const completedBeforeIndexRefresh = await Promise.race([
      saving.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 50))
    ])

    expect(completedBeforeIndexRefresh).toBe(true)
    resolveList({ ok: true, data: [] })
    await saving
  })
})
