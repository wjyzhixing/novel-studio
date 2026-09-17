import { create } from 'zustand'
import type { ProjectInfo, RecentProject } from '../../../shared/ipc'
import type { ChapterMeta } from '../../../shared/chapter'
import type { AiSuggestion } from '../../../shared/ai-edit'
import { countWords } from '../lib/wordcount'
import type { ChapterScene, SceneCreateInput, SceneUpdateInput } from '../../../shared/scene'
import type { Volume, VolumeCreateInput, VolumeUpdateInput } from '../../../shared/volume'
import { DEFAULT_UI_LOCALE, getUiText, readUiLocale, type UiTextKey } from '../lib/i18n'
import { clearDraft, draftStorageKey, readDraft, writeDraft } from '../lib/autosave-draft'

export type AppScreen = 'loading' | 'welcome' | 'workbench'
export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error'
export type EditorSelectionSnapshot = { from: number; to: number; text: string; relPath: string | null }

export function workflowCompletionAction(targetRelPath: string, activeRelPath: string | null, saveStatus: SaveStatus): 'refresh' | 'conflict' | 'ignore' {
  if (targetRelPath !== activeRelPath) return 'ignore'
  return saveStatus === 'dirty' || saveStatus === 'saving' || saveStatus === 'error' ? 'conflict' : 'refresh'
}

interface AppState {
  screen: AppScreen
  project: ProjectInfo | null
  recents: RecentProject[]
  busy: boolean
  initializing: boolean
  notice: string | null

  // Sprint 2: chapter authoring
  chapters: ChapterMeta[]
  volumes: Volume[]
  activeChapter: ChapterMeta | null
  activeRelPath: string | null
  editorMarkdown: string
  editorSelection: string
  editorSelectionSnapshot: EditorSelectionSnapshot | null
  editorSelectionActive: boolean
  editorSelectionConfirmed: boolean
  saveStatus: SaveStatus
  liveWordCount: number
  pendingSuggestion: AiSuggestion | null
  scenes: ChapterScene[]
  selectedSceneId: string | null
  sceneBusy: boolean
  sceneMessage: string | null

  bootstrap(): Promise<void>
  refreshRecents(): Promise<void>
  createProject(rootPath: string | null, title: string): Promise<boolean>
  seedMockStory(): Promise<boolean>
  openProject(rootPath: string | null): Promise<boolean>
  closeProject(): Promise<void>
  removeRecent(path: string): Promise<void>
  setNotice(notice: string | null): void

  loadChapters(): Promise<void>
  loadVolumes(): Promise<void>
  openChapter(relPath: string): Promise<void>
  createChapter(title: string): Promise<void>
  renameChapter(relPath: string, title: string): Promise<boolean>
  moveChapter(relPath: string, toIndex: number): Promise<boolean>
  setEditorMarkdown(markdown: string): void
  setEditorSelection(selection: string): void
  setEditorSelectionSnapshot(snapshot: EditorSelectionSnapshot | null): void
  setEditorSelectionActive(active: boolean): void
  setEditorSelectionConfirmed(confirmed: boolean): void
  setPendingSuggestion(suggestion: AiSuggestion | null): void
  acceptPendingSuggestion(): Promise<boolean>
  saveActiveChapter(): Promise<void>
  flushAutosave(): Promise<void>
  deleteChapter(relPath: string): Promise<void>
  loadScenes(relPath?: string | null, requestVersion?: number): Promise<void>
  selectScene(sceneId: string | null): void
  createScene(input: Omit<SceneCreateInput, 'chapterRelPath'>): Promise<boolean>
  updateScene(input: Omit<SceneUpdateInput, 'chapterRelPath'>): Promise<boolean>
  deleteScene(sceneId: string): Promise<boolean>
  reorderScenes(sceneIds: string[]): Promise<boolean>
  createVolume(input: VolumeCreateInput): Promise<boolean>
  updateVolume(input: VolumeUpdateInput): Promise<boolean>
  deleteVolume(id: string): Promise<boolean>
  assignChapterToVolume(volumeId: string, chapterRelPath: string): Promise<boolean>
  unassignChapterFromVolume(chapterRelPath: string): Promise<boolean>
  reorderVolumes(volumeIds: string[]): Promise<boolean>
}

function localizedStoreText(key: UiTextKey, values: Record<string, string | number> = {}): string {
  const locale = typeof localStorage === 'undefined' ? DEFAULT_UI_LOCALE : readUiLocale(localStorage)
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), getUiText(locale, key))
}

function unwrapError(prefix: string, r: { ok: false; error: { code: string; message: string } } | { ok: true }): string {
  return r.ok ? '' : `${prefix}[${r.error.code}] ${r.error.message}`
}

const AUTOSAVE_MS = 800
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let editVersion = 0
let savePromise: Promise<void> | null = null
let bootstrapPromise: Promise<void> | null = null
let chapterOpenVersion = 0

function draftStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

/** Project lifecycle + chapter authoring state (Sprint 1 + Sprint 2). */
export const useAppStore = create<AppState>((set, get) => ({
  screen: 'loading',
  project: null,
  recents: [],
  busy: false,
  initializing: false,
  notice: null,

  chapters: [],
  volumes: [],
  activeChapter: null,
  activeRelPath: null,
  editorMarkdown: '',
  editorSelection: '',
  editorSelectionSnapshot: null,
  editorSelectionActive: false,
  editorSelectionConfirmed: false,
  saveStatus: 'saved',
  liveWordCount: 0,
  pendingSuggestion: null,
  scenes: [],
  selectedSceneId: null,
  sceneBusy: false,
  sceneMessage: null,

  async bootstrap() {
    if (bootstrapPromise) return bootstrapPromise
    bootstrapPromise = (async () => {
      try {
      if (typeof window === 'undefined' || !window.novelAPI) {
        set({
          screen: 'welcome',
          notice: localizedStoreText('preloadBridgeMissing')
        })
        return
      }
      const info = await window.novelAPI.project.getInfo()
      if (info.ok && info.data) {
        set({ project: info.data, screen: 'workbench', initializing: true })
        await Promise.all([get().loadChapters(), get().loadVolumes(), get().refreshRecents()])
        set({ initializing: false })
        return
      }
      // Crash recovery: silently reopen the most recent healthy project.
      const recents = await window.novelAPI.project.listRecent()
      const list = recents.ok ? recents.data : []
      if (list.length > 0) {
        const reopen = await window.novelAPI.project.open(list[0].path)
        if (reopen.ok) {
          set({ project: reopen.data, recents: list, screen: 'workbench', initializing: true })
          await Promise.all([get().loadChapters(), get().loadVolumes()])
          set({ initializing: false })
          return
        }
        await window.novelAPI.project.removeRecent(list[0].path)
      }
      set({ recents: list, screen: 'welcome' })
      } catch (e) {
        set({ initializing: false })
        const notice = localizedStoreText('startupFailed', { error: e instanceof Error ? e.message : String(e) })
        // A late bootstrap failure must not demote an already recovered
        // workbench to Welcome. Keep the project visible and surface the
        // recoverable error instead.
        if (get().project) set({ notice })
        else set({ screen: 'welcome', notice })
      } finally {
        bootstrapPromise = null
      }
    })()
    return bootstrapPromise
  },

  async refreshRecents() {
    try {
      const r = await window.novelAPI.project.listRecent()
      if (r.ok) set({ recents: r.data })
      else set({ notice: unwrapError(localizedStoreText('recentProjectsLoadFailed'), r) })
    } catch (e) { set({ notice: `${localizedStoreText('recentProjectsLoadFailed')}: ${e instanceof Error ? e.message : String(e)}` }) }
  },

  async createProject(rootPath, title) {
    if (!rootPath || !title.trim()) {
      set({ notice: localizedStoreText('projectNameRequired') })
      return false
    }
    set({ busy: true, notice: null })
    try {
      const r = await window.novelAPI.project.create({ rootPath, title: title.trim() })
      if (!r.ok) { set({ notice: unwrapError(localizedStoreText('projectCreateFailed'), r) }); return false }
      set({ project: r.data, screen: 'workbench', initializing: true })
      await Promise.all([get().loadChapters(), get().loadVolumes(), get().refreshRecents()])
      set({ initializing: false })
      return true
    } catch (e) { set({ notice: `${localizedStoreText('projectCreateFailed')}: ${e instanceof Error ? e.message : String(e)}` }); return false }
    finally { set({ busy: false }) }
  },

  async openProject(rootPath) {
    if (!rootPath) return false
    set({ busy: true, notice: null })
    try {
      const r = await window.novelAPI.project.open(rootPath)
      if (!r.ok) { set({ notice: unwrapError(localizedStoreText('projectOpenFailed'), r) }); return false }
      set({ project: r.data, screen: 'workbench', initializing: true })
      await Promise.all([get().loadChapters(), get().loadVolumes(), get().refreshRecents()])
      set({ initializing: false })
      return true
    } catch (e) { set({ notice: `${localizedStoreText('projectOpenFailed')}: ${e instanceof Error ? e.message : String(e)}` }); return false }
    finally { set({ busy: false }) }
  },

  async seedMockStory() {
    set({ busy: true, notice: null })
    try {
      const r = await window.novelAPI.project.seedMockStory()
      if (!r.ok) { set({ notice: unwrapError(localizedStoreText('mockStoryLoadFailed'), r) }); return false }
      await get().loadChapters()
      await get().loadVolumes()
      const first = get().chapters[0]
      if (first) await get().openChapter(first.relPath)
      return true
    } catch (e) { set({ notice: `${localizedStoreText('mockStoryLoadFailed')}: ${e instanceof Error ? e.message : String(e)}` }); return false }
    finally { set({ busy: false }) }
  },

  async closeProject() {
    try {
      await get().flushAutosave()
      if (get().saveStatus === 'error') return
      editVersion += 1
      await window.novelAPI.project.close()
      set({
        project: null,
        screen: 'welcome',
        chapters: [],
        volumes: [],
        activeChapter: null,
        activeRelPath: null,
        editorMarkdown: '',
        editorSelection: '',
        editorSelectionSnapshot: null,
        editorSelectionActive: false,
        editorSelectionConfirmed: false,
        saveStatus: 'saved',
        notice: null,
        scenes: [],
        selectedSceneId: null,
        sceneMessage: null
      })
      await get().refreshRecents()
    } catch (error) {
      set({ notice: `${localizedStoreText('projectCloseFailed')}: ${error instanceof Error ? error.message : String(error)}` })
    }
  },

  async removeRecent(path) {
    try {
      const result = await window.novelAPI.project.removeRecent(path)
      if (!result.ok) { set({ notice: unwrapError(localizedStoreText('recentProjectRemoveFailed'), result) }); return }
      await get().refreshRecents()
    } catch (error) {
      set({ notice: `${localizedStoreText('recentProjectRemoveFailed')}: ${error instanceof Error ? error.message : String(error)}` })
    }
  },

  async loadChapters() {
    try {
      const r = await window.novelAPI.chapter.list()
      if (r.ok) set({ chapters: r.data })
      else set({ notice: unwrapError(localizedStoreText('chapterListFailed'), r) })
    } catch (e) { set({ notice: `${localizedStoreText('chapterListFailed')}: ${e instanceof Error ? e.message : String(e)}` }) }
  },

  async loadVolumes() {
    try {
      const result = await window.novelAPI.volume.list()
      if (result.ok) set({ volumes: result.data })
      else set({ notice: `${localizedStoreText('volumeListFailed')}：${result.error.message}` })
    } catch (error) { set({ notice: `${localizedStoreText('volumeListFailed')}: ${error instanceof Error ? error.message : String(error)}` }) }
  },

  async openChapter(relPath) {
    const requestVersion = ++chapterOpenVersion
    try {
      await get().flushAutosave()
      const r = await window.novelAPI.chapter.read(relPath)
      if (!r.ok) { set({ notice: unwrapError(localizedStoreText('chapterOpenFailed'), r) }); return }
      if (requestVersion !== chapterOpenVersion) return
      const known = get().chapters.find((c) => c.relPath === relPath)
      const key = get().project?.rootPath ? draftStorageKey(get().project!.rootPath, relPath) : null
      const storage = draftStorage()
      const draft = key && storage ? readDraft(storage, key) : null
      const savedAt = known?.updatedAt ? Date.parse(known.updatedAt) : 0
      const restoredDraft = draft && draft.markdown !== r.data.markdown && draft.savedAt > (Number.isFinite(savedAt) ? savedAt : 0) ? draft : null
      const loadedMarkdown = restoredDraft?.markdown ?? r.data.markdown
      set({ activeChapter: { relPath: r.data.relPath, number: known?.number ?? 0, title: r.data.title, wordCount: countWords(loadedMarkdown), updatedAt: known?.updatedAt ?? new Date().toISOString() }, activeRelPath: relPath, editorMarkdown: loadedMarkdown, editorSelection: '', editorSelectionSnapshot: null, editorSelectionActive: false, editorSelectionConfirmed: false, pendingSuggestion: null, saveStatus: restoredDraft ? 'dirty' : 'saved', liveWordCount: countWords(loadedMarkdown), scenes: [], selectedSceneId: null, sceneMessage: null, notice: restoredDraft ? localizedStoreText('autosaveDraftRecovered') : get().notice })
      if (restoredDraft) { if (autosaveTimer) clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => { void get().saveActiveChapter() }, AUTOSAVE_MS) }
      void get().loadScenes(relPath, requestVersion)
      void get().loadChapters()
    } catch (e) { set({ notice: `${localizedStoreText('chapterOpenFailed')}: ${e instanceof Error ? e.message : String(e)}` }) }
  },

  async createChapter(title) {
    if (!title.trim()) return
    try {
      const r = await window.novelAPI.chapter.create(title.trim())
      if (!r.ok) { set({ notice: unwrapError(localizedStoreText('chapterCreateFailed'), r) }); return }
      await get().loadChapters(); await get().openChapter(r.data.relPath)
    } catch (e) { set({ notice: `${localizedStoreText('chapterCreateFailed')}: ${e instanceof Error ? e.message : String(e)}` }) }
  },

  async renameChapter(relPath, title) {
    const nextTitle = title.trim()
    if (!nextTitle) return false
    try {
      const current = get().chapters.find((chapter) => chapter.relPath === relPath)
      const result = await window.novelAPI.chapter.rename(relPath, nextTitle)
      if (!result.ok) { set({ notice: `${localizedStoreText('chapterRenameFailed')}: ${result.error.message}` }); return false }
      const nextRelPath = result.data.find((chapter) => chapter.number === current?.number)?.relPath
      const active = get().activeRelPath === relPath
      set({ chapters: result.data, notice: localizedStoreText('chapterRenamed', { title: nextTitle }) })
      if (active && nextRelPath) {
        await get().openChapter(nextRelPath)
      }
      await get().loadVolumes()
      return true
    } catch (error) { set({ notice: `${localizedStoreText('chapterRenameFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
  },

  async moveChapter(relPath, toIndex) {
    try {
      const current = get().chapters.find((chapter) => chapter.relPath === relPath)
      const result = await window.novelAPI.chapter.move(relPath, toIndex)
      if (!result.ok) { set({ notice: `${localizedStoreText('chapterMoveFailed')}: ${result.error.message}` }); return false }
      set({ chapters: result.data, notice: localizedStoreText('chapterOrderSaved') })
      if (get().activeRelPath === relPath && current) {
        const moved = result.data.find((chapter) => chapter.number === Math.min(result.data.length, Math.max(1, toIndex + 1)) && chapter.title === current.title)
        if (moved && moved.relPath !== relPath) {
          set({ activeRelPath: moved.relPath, activeChapter: get().activeChapter ? { ...get().activeChapter!, relPath: moved.relPath, number: moved.number } : null })
        }
      }
      await get().loadVolumes()
      return true
    } catch (error) { set({ notice: `${localizedStoreText('chapterMoveFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
  },

  setEditorMarkdown(markdown) {
    editVersion += 1
    const wordCount = countWords(markdown)
    set((state) => ({
      editorMarkdown: markdown,
      saveStatus: 'dirty',
      liveWordCount: wordCount,
      activeChapter: state.activeChapter ? { ...state.activeChapter, wordCount } : state.activeChapter,
      chapters: state.activeRelPath
        ? state.chapters.map((chapter) => chapter.relPath === state.activeRelPath ? { ...chapter, wordCount } : chapter)
      : state.chapters
    }))
    const rootPath = get().project?.rootPath
    const relPath = get().activeRelPath
    const storage = draftStorage()
    if (rootPath && relPath && storage) writeDraft(storage, draftStorageKey(rootPath, relPath), markdown)
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => {
      void get().saveActiveChapter()
    }, AUTOSAVE_MS)
  },

  setEditorSelection(selection) {
    set({ editorSelection: selection })
  },

  setEditorSelectionSnapshot(snapshot) {
    set({ editorSelectionSnapshot: snapshot, editorSelection: snapshot?.text ?? '', editorSelectionActive: Boolean(snapshot), editorSelectionConfirmed: Boolean(snapshot) })
  },

  setEditorSelectionActive(active) {
    set({ editorSelectionActive: active })
  },

  setEditorSelectionConfirmed(confirmed) {
    set({ editorSelectionConfirmed: confirmed })
  },

  setPendingSuggestion(suggestion) { set({ pendingSuggestion: suggestion }) },
  async acceptPendingSuggestion() {
    const suggestion = get().pendingSuggestion
    if (!suggestion) return false
    try {
      const result = await window.novelAPI.aiEdit.accept(suggestion.id)
      if (!result.ok) { set({ notice: unwrapError(localizedStoreText('suggestionApplyFailed'), result) }); return false }
      set({ pendingSuggestion: null })
      await get().openChapter(result.data.relPath)
      return true
    } catch (error) {
      set({ notice: `${localizedStoreText('suggestionApplyFailed')}: ${error instanceof Error ? error.message : String(error)}` })
      return false
    }
  },

  async saveActiveChapter() {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer)
      autosaveTimer = null
    }
    if (savePromise) return savePromise
    const { activeRelPath, editorMarkdown, saveStatus } = get()
    if (!activeRelPath) return
    if (saveStatus !== 'dirty' && saveStatus !== 'error') return
    const snapshotPath = activeRelPath
    const snapshotMarkdown = editorMarkdown
    const snapshotVersion = editVersion
    set({ saveStatus: 'saving' })
    const operation = (async () => {
      try {
        const r = await window.novelAPI.chapter.save(snapshotPath, snapshotMarkdown)
        const current = get()
        const isCurrentEdit = current.activeRelPath === snapshotPath && editVersion === snapshotVersion
        if (!r.ok) {
          set({
            saveStatus: isCurrentEdit ? 'error' : 'dirty',
            notice: unwrapError(localizedStoreText('saveFailed'), r)
          })
          return
        }
        if (isCurrentEdit) {
          const rootPath = current.project?.rootPath
          const storage = draftStorage()
          if (rootPath && storage) clearDraft(storage, draftStorageKey(rootPath, snapshotPath))
          set((state) => ({
            saveStatus: 'saved',
            activeChapter: state.activeChapter
              ? { ...state.activeChapter, wordCount: r.data.wordCount, updatedAt: r.data.savedAt }
              : state.activeChapter
          }))
        } else if (current.activeRelPath === snapshotPath) {
          set({ saveStatus: 'dirty' })
        }
        // Refresh the sidebar in the background. Chapter navigation only needs
        // the file save to finish; waiting for a full index refresh makes a
        // click in the editor feel unresponsive on larger projects.
        void get().loadChapters()
      } catch (error) {
        const current = get()
        const isCurrentEdit = current.activeRelPath === snapshotPath && editVersion === snapshotVersion
        set({ saveStatus: isCurrentEdit ? 'error' : 'dirty', notice: `${localizedStoreText('saveFailed')}: ${error instanceof Error ? error.message : String(error)}` })
      }
    })()
    const tracked = operation.finally(() => {
      if (savePromise === tracked) savePromise = null
    })
    savePromise = tracked
    return tracked
  },

  async flushAutosave() {
    if (savePromise) await savePromise
    const s = get().saveStatus
    if (s === 'dirty' || s === 'error') {
      await get().saveActiveChapter()
    }
  },

  async deleteChapter(relPath) {
    try {
      const result = await window.novelAPI.chapter.remove(relPath)
      if (!result.ok) {
        set({ notice: `${localizedStoreText('chapterDeleteFailed')}: ${result.error.message}` })
        return
      }
      if (get().activeRelPath === relPath) {
        set({
          activeChapter: null,
          activeRelPath: null,
          editorMarkdown: '',
          saveStatus: 'saved',
          liveWordCount: 0,
          scenes: [],
          selectedSceneId: null,
          sceneMessage: null
        })
      }
      await get().loadChapters()
      set({ notice: localizedStoreText('chapterDeleted') })
    } catch (error) {
      set({ notice: `${localizedStoreText('chapterDeleteFailed')}: ${error instanceof Error ? error.message : String(error)}` })
    }
  },

  async loadScenes(relPath = get().activeRelPath, requestVersion?: number) {
    if (!relPath) { set({ scenes: [], selectedSceneId: null, sceneMessage: null }); return }
    try {
      const result = await window.novelAPI.scene.list(relPath)
      if (!result.ok) { set({ sceneMessage: `${localizedStoreText('sceneLoadFailed')}：${result.error.message}` }); return }
      if (requestVersion !== undefined && requestVersion !== chapterOpenVersion) return
      const selected = get().selectedSceneId
      set({ scenes: result.data, selectedSceneId: selected && result.data.some((scene) => scene.id === selected) ? selected : null, sceneMessage: null })
    } catch (error) { set({ sceneMessage: `${localizedStoreText('sceneLoadFailed')}: ${error instanceof Error ? error.message : String(error)}` }) }
  },

  selectScene(sceneId) { set({ selectedSceneId: sceneId }) },

  async createScene(input) {
    const chapterRelPath = get().activeRelPath
    if (!chapterRelPath) return false
    set({ sceneBusy: true, sceneMessage: null })
    try {
      const result = await window.novelAPI.scene.create({ ...input, chapterRelPath })
      if (!result.ok) { set({ sceneMessage: `${localizedStoreText('sceneCreateFailed')}：${result.error.message}` }); return false }
      set((state) => ({ scenes: [...state.scenes, result.data].sort((a, b) => a.order - b.order), selectedSceneId: result.data.id, sceneMessage: localizedStoreText('sceneCreated') }))
      return true
    } catch (error) { set({ sceneMessage: `${localizedStoreText('sceneCreateFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
    finally { set({ sceneBusy: false }) }
  },

  async updateScene(input) {
    const chapterRelPath = get().activeRelPath
    if (!chapterRelPath) return false
    set({ sceneBusy: true, sceneMessage: null })
    try {
      const result = await window.novelAPI.scene.update({ ...input, chapterRelPath })
      if (!result.ok) { set({ sceneMessage: `${localizedStoreText('sceneSaveFailed')}：${result.error.message}` }); return false }
      set((state) => ({ scenes: state.scenes.map((scene) => scene.id === result.data.id ? result.data : scene).sort((a, b) => a.order - b.order), sceneMessage: localizedStoreText('sceneSaved') }))
      return true
    } catch (error) { set({ sceneMessage: `${localizedStoreText('sceneSaveFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
    finally { set({ sceneBusy: false }) }
  },

  async deleteScene(sceneId) {
    const chapterRelPath = get().activeRelPath
    if (!chapterRelPath) return false
    set({ sceneBusy: true, sceneMessage: null })
    try {
      const result = await window.novelAPI.scene.remove(chapterRelPath, sceneId)
      if (!result.ok) { set({ sceneMessage: `${localizedStoreText('sceneDeleteFailed')}：${result.error.message}` }); return false }
      set((state) => ({ scenes: state.scenes.filter((scene) => scene.id !== sceneId).map((scene, order) => ({ ...scene, order })), selectedSceneId: state.selectedSceneId === sceneId ? null : state.selectedSceneId, sceneMessage: localizedStoreText('sceneDeleted') }))
      return true
    } catch (error) { set({ sceneMessage: `${localizedStoreText('sceneDeleteFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
    finally { set({ sceneBusy: false }) }
  },

  async reorderScenes(sceneIds) {
    const chapterRelPath = get().activeRelPath
    if (!chapterRelPath) return false
    set({ sceneBusy: true, sceneMessage: null })
    try {
      const result = await window.novelAPI.scene.reorder(chapterRelPath, sceneIds)
      if (!result.ok) { set({ sceneMessage: `${localizedStoreText('sceneOrderFailed')}：${result.error.message}` }); return false }
      set({ scenes: result.data, sceneMessage: localizedStoreText('sceneOrderSaved') })
      return true
    } catch (error) { set({ sceneMessage: `${localizedStoreText('sceneOrderFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
    finally { set({ sceneBusy: false }) }
  },

  async createVolume(input) {
    try {
      const result = await window.novelAPI.volume.create(input)
       if (!result.ok) { set({ notice: `${localizedStoreText('volumeCreateFailed')}：${result.error.message}` }); return false }
       set((state) => ({ volumes: [...state.volumes, result.data].sort((a, b) => a.order - b.order), notice: localizedStoreText('volumeCreated', { title: result.data.title }) }))
      return true
     } catch (error) { set({ notice: `${localizedStoreText('volumeCreateFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
  },

  async updateVolume(input) {
    try {
      const result = await window.novelAPI.volume.update(input)
       if (!result.ok) { set({ notice: `${localizedStoreText('volumeSaveFailed')}：${result.error.message}` }); return false }
       set((state) => ({ volumes: state.volumes.map((volume) => volume.id === result.data.id ? result.data : volume), notice: localizedStoreText('volumeSaved') }))
      return true
     } catch (error) { set({ notice: `${localizedStoreText('volumeSaveFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
  },

  async deleteVolume(id) {
    try {
      const result = await window.novelAPI.volume.remove(id)
       if (!result.ok) { set({ notice: `${localizedStoreText('volumeDeleteFailed')}：${result.error.message}` }); return false }
       set((state) => ({ volumes: state.volumes.filter((volume) => volume.id !== id), notice: localizedStoreText('volumeDeleted') }))
      return true
     } catch (error) { set({ notice: `${localizedStoreText('volumeDeleteFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
  },

  async assignChapterToVolume(volumeId, chapterRelPath) {
    try {
      const result = await window.novelAPI.volume.assignChapter(volumeId, chapterRelPath)
       if (!result.ok) { set({ notice: `${localizedStoreText('volumeAssignFailed')}：${result.error.message}` }); return false }
       set({ volumes: result.data, notice: localizedStoreText('volumeAssigned') })
      return true
     } catch (error) { set({ notice: `${localizedStoreText('volumeAssignFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
  },

  async unassignChapterFromVolume(chapterRelPath) {
    try {
      const result = await window.novelAPI.volume.unassignChapter(chapterRelPath)
       if (!result.ok) { set({ notice: `${localizedStoreText('volumeUnassignFailed')}：${result.error.message}` }); return false }
       set({ volumes: result.data, notice: localizedStoreText('volumeUnassigned') })
      return true
     } catch (error) { set({ notice: `${localizedStoreText('volumeUnassignFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
  },

  async reorderVolumes(volumeIds) {
    try {
      const result = await window.novelAPI.volume.reorder(volumeIds)
       if (!result.ok) { set({ notice: `${localizedStoreText('volumeOrderFailed')}：${result.error.message}` }); return false }
       set({ volumes: result.data, notice: localizedStoreText('volumeOrderSaved') })
      return true
     } catch (error) { set({ notice: `${localizedStoreText('volumeOrderFailed')}: ${error instanceof Error ? error.message : String(error)}` }); return false }
  },

  setNotice(notice) {
    set({ notice })
  }
}))
