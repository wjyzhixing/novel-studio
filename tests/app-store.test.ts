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
    editorSelection: '',
    editorSelectionSnapshot: null,
    editorSelectionActive: false,
    editorSelectionConfirmed: false,
    saveStatus: 'dirty',
    liveWordCount: 1,
    chapters: [],
    notice: null
  })
})

describe('chapter autosave state', () => {
  it('restores a newer local draft when reopening a chapter', async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
    const key = 'novel-studio:draft:' + encodeURIComponent('/tmp/project') + ':' + encodeURIComponent('chapters/001-test.md')
    values.set(key, JSON.stringify({ markdown: '# Recovered draft', savedAt: Date.parse('2026-01-02T00:00:00.000Z') }))
    vi.stubGlobal('window', { novelAPI: { chapter: { read: vi.fn(async () => ({ ok: true, data: { relPath: 'chapters/001-test.md', title: 'Test', markdown: '# Saved source' } })), list: vi.fn(async () => ({ ok: true, data: [] })) }, scene: { list: vi.fn(async () => ({ ok: true, data: [] })) } } })
    useAppStore.setState({ chapters: [{ relPath: 'chapters/001-test.md', number: 1, title: 'Test', wordCount: 2, updatedAt: '2026-01-01T00:00:00.000Z' }] })

    await useAppStore.getState().openChapter('chapters/001-test.md')

    expect(useAppStore.getState().editorMarkdown).toBe('# Recovered draft')
    expect(useAppStore.getState().saveStatus).toBe('dirty')
    expect(useAppStore.getState().notice).toContain('恢复本地未保存草稿')
  })

  it('opens an existing project during bootstrap and loads its workspace data', async () => {
    const info = { rootPath: '/tmp/recovered', manifest: { title: 'Recovered', language: 'zh-CN' } }
    vi.unstubAllGlobals()
    const getInfo = vi.fn(async () => ({ ok: true, data: info }))
    vi.stubGlobal('window', {
      novelAPI: {
        project: {
          getInfo,
          listRecent: vi.fn(async () => ({ ok: true, data: [] }))
        },
        chapter: { list: vi.fn(async () => ({ ok: true, data: [] })) },
        volume: { list: vi.fn(async () => ({ ok: true, data: [] })) }
      }
    })

    await useAppStore.getState().bootstrap()

    expect(useAppStore.getState().screen).toBe('workbench')
    expect(useAppStore.getState().project).toEqual(info)
    expect(useAppStore.getState().initializing).toBe(false)
  })

  it('validates project creation input and handles successful creation', async () => {
    const info = { rootPath: '/tmp/created', manifest: { title: 'Created', language: 'zh-CN' } }
    const create = vi.fn(async () => ({ ok: true, data: info }))
    vi.stubGlobal('window', {
      novelAPI: {
        project: { create, listRecent: vi.fn(async () => ({ ok: true, data: [] })) },
        chapter: { list: vi.fn(async () => ({ ok: true, data: [] })) },
        volume: { list: vi.fn(async () => ({ ok: true, data: [] })) }
      }
    })

    await expect(useAppStore.getState().createProject(null, '')).resolves.toBe(false)
    await expect(useAppStore.getState().createProject('/tmp/created', '  New project  ')).resolves.toBe(true)
    expect(create).toHaveBeenCalledWith({ rootPath: '/tmp/created', title: 'New project' })
    expect(useAppStore.getState().screen).toBe('workbench')
    expect(useAppStore.getState().busy).toBe(false)
  })

  it('surfaces recent-project read failures without replacing the list', async () => {
    vi.stubGlobal('window', { novelAPI: { project: { listRecent: vi.fn(async () => ({ ok: false, error: { code: 'IO_ERROR', message: 'recent unavailable' } })) } } })
    useAppStore.setState({ recents: [{ path: '/tmp/old', title: 'Old', lastOpenedAt: '2026-01-01' }] })

    await useAppStore.getState().refreshRecents()

    expect(useAppStore.getState().recents).toEqual([{ path: '/tmp/old', title: 'Old', lastOpenedAt: '2026-01-01' }])
    expect(useAppStore.getState().notice).toContain('读取最近项目失败')
  })

  it('handles open-project validation and IPC failures while clearing busy state', async () => {
    const open = vi.fn(async () => ({ ok: false, error: { code: 'INVALID_PROJECT', message: '格式无效' } }))
    vi.stubGlobal('window', { novelAPI: { project: { open } } })

    await expect(useAppStore.getState().openProject(null)).resolves.toBe(false)
    await expect(useAppStore.getState().openProject('/tmp/bad')).resolves.toBe(false)

    expect(open).toHaveBeenCalledWith('/tmp/bad')
    expect(useAppStore.getState().busy).toBe(false)
    expect(useAppStore.getState().notice).toContain('打开失败')
  })

  it('opens a project successfully and refreshes all workspace collections', async () => {
    const info = { rootPath: '/tmp/opened', manifest: { title: 'Opened', language: 'zh-CN' } }
    const chapter = { relPath: 'chapters/001-opened.md', number: 1, title: 'Opened', wordCount: 1, updatedAt: '2026-01-01' }
    const open = vi.fn(async () => ({ ok: true, data: info }))
    vi.stubGlobal('window', {
      novelAPI: {
        project: { open, listRecent: vi.fn(async () => ({ ok: true, data: [] })) },
        chapter: { list: vi.fn(async () => ({ ok: true, data: [chapter] })) },
        volume: { list: vi.fn(async () => ({ ok: true, data: [] })) }
      }
    })

    await expect(useAppStore.getState().openProject('/tmp/opened')).resolves.toBe(true)
    expect(useAppStore.getState().project).toEqual(info)
    expect(useAppStore.getState().chapters).toEqual([chapter])
    expect(useAppStore.getState().busy).toBe(false)
  })

  it('handles thrown recent-project reads and supports explicit notice updates', async () => {
    vi.stubGlobal('window', { novelAPI: { project: { listRecent: vi.fn(async () => { throw new Error('recent crashed') }) } } })

    await useAppStore.getState().refreshRecents()
    expect(useAppStore.getState().notice).toContain('recent crashed')
    useAppStore.getState().setNotice('自定义提示')
    expect(useAppStore.getState().notice).toBe('自定义提示')
  })

  it('loads the mock story, refreshes chapters and opens its first chapter', async () => {
    const chapter = { relPath: 'chapters/001-demo.md', number: 1, title: 'Demo', wordCount: 1, updatedAt: '2026-01-01' }
    const project = { rootPath: '/tmp/mock', manifest: { title: 'Mock', language: 'zh-CN' } } as never
    vi.stubGlobal('window', {
      novelAPI: {
        project: { seedMockStory: vi.fn(async () => ({ ok: true, data: null })) },
        chapter: {
          list: vi.fn(async () => ({ ok: true, data: [chapter] })),
          read: vi.fn(async () => ({ ok: true, data: { relPath: chapter.relPath, title: chapter.title, markdown: '# Demo\n\n正文' } }))
        },
        volume: { list: vi.fn(async () => ({ ok: true, data: [] })) },
        scene: { list: vi.fn(async () => ({ ok: true, data: [] })) }
      }
    })
    useAppStore.setState({ project, activeRelPath: null, chapters: [], volumes: [], editorMarkdown: '' })

    await expect(useAppStore.getState().seedMockStory()).resolves.toBe(true)
    expect(useAppStore.getState().activeRelPath).toBe(chapter.relPath)
    expect(useAppStore.getState().editorMarkdown).toContain('正文')
    expect(useAppStore.getState().busy).toBe(false)
  })

  it('reports thrown scene and volume operations and keeps scene busy state settled', async () => {
    vi.stubGlobal('window', {
      novelAPI: {
        scene: {
          list: vi.fn(async () => { throw new Error('scene offline') }),
          create: vi.fn(async () => { throw new Error('scene create offline') }),
          update: vi.fn(async () => { throw new Error('scene update offline') }),
          remove: vi.fn(async () => { throw new Error('scene remove offline') }),
          reorder: vi.fn(async () => { throw new Error('scene reorder offline') })
        },
        volume: {
          unassignChapter: vi.fn(async () => { throw new Error('volume offline') }),
          reorder: vi.fn(async () => { throw new Error('volume reorder offline') })
        }
      }
    })
    useAppStore.setState({ activeRelPath: 'chapters/001-test.md', sceneBusy: false })

    await useAppStore.getState().loadScenes()
    expect(useAppStore.getState().sceneMessage).toContain('读取场景失败')
    await expect(useAppStore.getState().createScene({ title: 'x', summary: '', startParagraph: 0, endParagraph: 0 })).resolves.toBe(false)
    await expect(useAppStore.getState().updateScene({ id: 'scene-1', title: 'x', summary: '', startParagraph: 0, endParagraph: 0 })).resolves.toBe(false)
    await expect(useAppStore.getState().deleteScene('scene-1')).resolves.toBe(false)
    await expect(useAppStore.getState().reorderScenes([])).resolves.toBe(false)
    expect(useAppStore.getState().sceneBusy).toBe(false)
    await expect(useAppStore.getState().unassignChapterFromVolume('chapters/001-test.md')).resolves.toBe(false)
    await expect(useAppStore.getState().reorderVolumes([])).resolves.toBe(false)
    expect(useAppStore.getState().notice).toContain('卷排序失败')
  })

  it('reports thrown volume creation, update, deletion and assignment operations', async () => {
    vi.stubGlobal('window', {
      novelAPI: {
        volume: {
          create: vi.fn(async () => { throw new Error('create volume offline') }),
          update: vi.fn(async () => { throw new Error('update volume offline') }),
          remove: vi.fn(async () => { throw new Error('delete volume offline') }),
          assignChapter: vi.fn(async () => { throw new Error('assign volume offline') })
        }
      }
    })

    await expect(useAppStore.getState().createVolume({ title: 'x' })).resolves.toBe(false)
    await expect(useAppStore.getState().updateVolume({ id: 'volume-1', title: 'x' })).resolves.toBe(false)
    await expect(useAppStore.getState().deleteVolume('volume-1')).resolves.toBe(false)
    await expect(useAppStore.getState().assignChapterToVolume('volume-1', 'chapters/001-test.md')).resolves.toBe(false)
    expect(useAppStore.getState().notice).toContain('归入卷失败')
  })

  it('keeps chapter navigation state synchronized after rename, move and delete', async () => {
    const original = { relPath: 'chapters/001-old.md', number: 1, title: 'Old', wordCount: 2, updatedAt: '2026-01-01' }
    const renamed = { ...original, relPath: 'chapters/001-new.md', title: 'New' }
    const moved = { ...renamed, relPath: 'chapters/002-new.md', number: 2 }
    const other = { relPath: 'chapters/001-other.md', number: 1, title: 'Other', wordCount: 2, updatedAt: '2026-01-01' }
    vi.stubGlobal('window', {
      novelAPI: {
        chapter: {
          rename: vi.fn(async () => ({ ok: true, data: [renamed] })),
          move: vi.fn(async () => ({ ok: true, data: [other, moved] })),
          remove: vi.fn(async () => ({ ok: true, data: null })),
          list: vi.fn(async () => ({ ok: true, data: [] }))
        },
        volume: { list: vi.fn(async () => ({ ok: true, data: [] })) }
      }
    })
    useAppStore.setState({ chapters: [original], activeRelPath: null, activeChapter: null })

    await expect(useAppStore.getState().renameChapter(original.relPath, 'New')).resolves.toBe(true)
    expect(useAppStore.getState().chapters).toEqual([renamed])
    useAppStore.setState({ activeRelPath: renamed.relPath, activeChapter: renamed })
    await expect(useAppStore.getState().moveChapter(renamed.relPath, 1)).resolves.toBe(true)
    expect(useAppStore.getState().activeRelPath).toBe(moved.relPath)
    await useAppStore.getState().deleteChapter(moved.relPath)
    expect(useAppStore.getState().activeRelPath).toBeNull()
    expect(useAppStore.getState().editorMarkdown).toBe('')
  })

  it('keeps a menu-confirmed selection until explicit cancellation', () => {
    useAppStore.getState().setEditorSelectionSnapshot({ from: 2, to: 8, text: '正文选区', relPath: 'chapters/001-test.md' })
    expect(useAppStore.getState().editorSelection).toBe('正文选区')
    expect(useAppStore.getState().editorSelectionConfirmed).toBe(true)

    useAppStore.getState().setEditorSelectionSnapshot(null)
    expect(useAppStore.getState().editorSelection).toBe('')
    expect(useAppStore.getState().editorSelectionConfirmed).toBe(false)
  })

  it('turns rejected suggestion acceptance into visible feedback', async () => {
    vi.stubGlobal('window', {
      novelAPI: {
        aiEdit: { accept: vi.fn(async () => { throw new Error('revision is stale') }) }
      }
    })
    useAppStore.setState({ pendingSuggestion: {
      id: 'suggestion-1', requestId: 'request-1', profileId: 'profile-1', relPath: 'chapters/001-test.md',
      original: '旧正文', suggested: '新正文', prompt: '改写', selection: null, status: 'pending', createdAt: '2026-01-01'
    } })

    await expect(useAppStore.getState().acceptPendingSuggestion()).resolves.toBe(false)
    expect(useAppStore.getState().notice).toContain('应用建议失败')
    expect(useAppStore.getState().pendingSuggestion?.id).toBe('suggestion-1')
  })

  it('turns recent-project removal exceptions into visible feedback', async () => {
    vi.stubGlobal('window', {
      novelAPI: {
        project: { removeRecent: vi.fn(async () => { throw new Error('recent file is locked') }) }
      }
    })

    await expect(useAppStore.getState().removeRecent('/tmp/locked-project')).resolves.toBeUndefined()
    expect(useAppStore.getState().notice).toContain('移除最近项目失败')
  })

  it('keeps the workbench open when flushing edits fails during close', async () => {
    const close = vi.fn(async () => ({ ok: true as const, data: null }))
    vi.stubGlobal('window', {
      novelAPI: {
        chapter: { save: vi.fn(async () => { throw new Error('disk is full') }) },
        project: { close }
      }
    })
    useAppStore.setState({ screen: 'workbench', saveStatus: 'dirty', editorMarkdown: '# 未保存内容' })

    await expect(useAppStore.getState().closeProject()).resolves.toBeUndefined()
    expect(close).not.toHaveBeenCalled()
    expect(useAppStore.getState().screen).toBe('workbench')
    expect(useAppStore.getState().activeRelPath).toBe('chapters/001-test.md')
    expect(useAppStore.getState().notice).toContain('保存失败')
  })

  it('keeps the active chapter when chapter removal throws', async () => {
    vi.stubGlobal('window', {
      novelAPI: {
        chapter: { remove: vi.fn(async () => { throw new Error('chapter is locked') }) }
      }
    })
    useAppStore.setState({ screen: 'workbench', editorMarkdown: '# 未删除章节' })

    await expect(useAppStore.getState().deleteChapter('chapters/001-test.md')).resolves.toBeUndefined()
    expect(useAppStore.getState().activeRelPath).toBe('chapters/001-test.md')
    expect(useAppStore.getState().editorMarkdown).toBe('# 未删除章节')
    expect(useAppStore.getState().notice).toContain('删除章节失败')
  })

  it('settles save state to error when chapter save rejects', async () => {
    vi.stubGlobal('window', {
      novelAPI: {
        chapter: { save: vi.fn(async () => { throw new Error('disk is full') }) }
      }
    })
    useAppStore.setState({ saveStatus: 'dirty', editorMarkdown: '# 待保存正文' })

    await expect(useAppStore.getState().saveActiveChapter()).resolves.toBeUndefined()
    expect(useAppStore.getState().saveStatus).toBe('error')
    expect(useAppStore.getState().editorMarkdown).toBe('# 待保存正文')
    expect(useAppStore.getState().notice).toContain('保存失败')
  })

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

  it('updates scene state through the complete scene action lifecycle', async () => {
    const scene = { id: 'scene-1', chapterRelPath: 'chapters/001-test.md', title: '雨夜', summary: '街灯下', startParagraph: 0, endParagraph: 8, order: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    const updated = { ...scene, title: '雨夜（修改）', updatedAt: '2026-01-02' }
    vi.stubGlobal('window', {
      novelAPI: {
        scene: {
          list: vi.fn(async () => ({ ok: true, data: [scene] })),
          create: vi.fn(async () => ({ ok: true, data: updated })),
          update: vi.fn(async () => ({ ok: true, data: { ...updated, summary: '新的街灯下' } })),
          remove: vi.fn(async () => ({ ok: true, data: null })),
          reorder: vi.fn(async () => ({ ok: true, data: [] }))
        }
      }
    })
    useAppStore.setState({ activeRelPath: 'chapters/001-test.md', scenes: [], selectedSceneId: null })

    await useAppStore.getState().loadScenes()
    expect(useAppStore.getState().scenes).toEqual([scene])
    useAppStore.getState().selectScene(scene.id)
    expect(await useAppStore.getState().createScene({ title: '新场景', summary: '', startParagraph: 2, endParagraph: 4 })).toBe(true)
    expect(useAppStore.getState().selectedSceneId).toBe(updated.id)
    expect(await useAppStore.getState().updateScene({ id: updated.id, title: updated.title, summary: '新的街灯下', startParagraph: 2, endParagraph: 4 })).toBe(true)
    expect(useAppStore.getState().scenes[0].summary).toBe('新的街灯下')
    expect(await useAppStore.getState().reorderScenes([updated.id])).toBe(true)
    expect(await useAppStore.getState().deleteScene(updated.id)).toBe(true)
    expect(useAppStore.getState().selectedSceneId).toBeNull()
    expect(useAppStore.getState().sceneMessage).toBe('场景已删除，正文未改变')
  })

  it('clears stale scene feedback when there is no active chapter', async () => {
    useAppStore.setState({ activeRelPath: null, scenes: [], selectedSceneId: 'stale-scene', sceneMessage: '上一章节读取场景失败' })
    await useAppStore.getState().loadScenes()
    expect(useAppStore.getState().scenes).toEqual([])
    expect(useAppStore.getState().selectedSceneId).toBeNull()
    expect(useAppStore.getState().sceneMessage).toBeNull()
  })

  it('keeps volume actions deterministic and surfaces failed mutations', async () => {
    const volume = { id: 'volume-1', title: '第一卷', order: 0, chapterRelPaths: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    const next = { ...volume, title: '序章卷' }
    vi.stubGlobal('window', {
      novelAPI: {
        volume: {
          create: vi.fn(async () => ({ ok: true, data: volume })),
          update: vi.fn(async () => ({ ok: true, data: next })),
          remove: vi.fn(async () => ({ ok: true, data: null })),
          assignChapter: vi.fn(async () => ({ ok: true, data: [{ ...next, chapterRelPaths: ['chapters/001-test.md'] }] })),
          unassignChapter: vi.fn(async () => ({ ok: true, data: [next] })),
          reorder: vi.fn(async () => ({ ok: false, error: { code: 'VALIDATION_FAILED', message: '排序失败' } }))
        }
      }
    })
    useAppStore.setState({ volumes: [] })

    expect(await useAppStore.getState().createVolume({ title: '第一卷' })).toBe(true)
    expect(await useAppStore.getState().updateVolume({ id: volume.id, title: '序章卷' })).toBe(true)
    expect(await useAppStore.getState().assignChapterToVolume(volume.id, 'chapters/001-test.md')).toBe(true)
    expect(useAppStore.getState().volumes[0].chapterRelPaths).toEqual(['chapters/001-test.md'])
    expect(await useAppStore.getState().unassignChapterFromVolume('chapters/001-test.md')).toBe(true)
    expect(await useAppStore.getState().reorderVolumes([volume.id])).toBe(false)
    expect(useAppStore.getState().notice).toContain('排序失败')
    expect(await useAppStore.getState().deleteVolume(volume.id)).toBe(true)
    expect(useAppStore.getState().volumes).toEqual([])
  })

  it('surfaces explicit IPC failures for chapter, scene, and volume actions', async () => {
    const failure = { ok: false as const, error: { code: 'VALIDATION_FAILED', message: '拒绝操作' } }
    vi.stubGlobal('window', {
      novelAPI: {
        chapter: {
          list: vi.fn(async () => failure),
          read: vi.fn(async () => failure),
          create: vi.fn(async () => failure),
          rename: vi.fn(async () => failure),
          move: vi.fn(async () => failure),
          remove: vi.fn(async () => failure)
        },
        scene: {
          list: vi.fn(async () => failure),
          create: vi.fn(async () => failure),
          update: vi.fn(async () => failure),
          remove: vi.fn(async () => failure),
          reorder: vi.fn(async () => failure)
        },
        volume: {
          list: vi.fn(async () => failure),
          create: vi.fn(async () => failure),
          update: vi.fn(async () => failure),
          remove: vi.fn(async () => failure),
          assignChapter: vi.fn(async () => failure),
          unassignChapter: vi.fn(async () => failure),
          reorder: vi.fn(async () => failure)
        }
      }
    })
    useAppStore.setState({ saveStatus: 'saved', activeRelPath: 'chapters/001-test.md' })

    await useAppStore.getState().loadChapters()
    await useAppStore.getState().loadVolumes()
    await useAppStore.getState().openChapter('chapters/001-test.md')
    await useAppStore.getState().createChapter('新章')
    expect(await useAppStore.getState().renameChapter('chapters/001-test.md', '新标题')).toBe(false)
    expect(await useAppStore.getState().moveChapter('chapters/001-test.md', 1)).toBe(false)
    await useAppStore.getState().deleteChapter('chapters/001-test.md')

    await useAppStore.getState().loadScenes()
    expect(await useAppStore.getState().createScene({ title: '场景', summary: '', startParagraph: 0, endParagraph: 1 })).toBe(false)
    expect(await useAppStore.getState().updateScene({ id: 'scene-1', title: '场景', summary: '', startParagraph: 0, endParagraph: 1 })).toBe(false)
    expect(await useAppStore.getState().deleteScene('scene-1')).toBe(false)
    expect(await useAppStore.getState().reorderScenes([])).toBe(false)

    expect(await useAppStore.getState().createVolume({ title: '卷' })).toBe(false)
    expect(await useAppStore.getState().updateVolume({ id: 'volume-1', title: '卷' })).toBe(false)
    expect(await useAppStore.getState().deleteVolume('volume-1')).toBe(false)
    expect(await useAppStore.getState().assignChapterToVolume('volume-1', 'chapters/001-test.md')).toBe(false)
    expect(await useAppStore.getState().unassignChapterFromVolume('chapters/001-test.md')).toBe(false)
    expect(await useAppStore.getState().reorderVolumes([])).toBe(false)
    expect(useAppStore.getState().notice).toContain('卷排序失败')
    expect(useAppStore.getState().sceneMessage).toContain('排序场景失败')
  })
})
