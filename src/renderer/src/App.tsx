import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Archive, Bot, ChevronDown, Command, FolderOpen, Loader2, Search, Sparkles, Wrench } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import type { StorySection } from './components/Sidebar'
import { EditorPane } from './components/EditorPane'
import { RightPanel } from './components/RightPanel'
import { BottomPanel } from './components/BottomPanel'
import { Welcome } from './components/Welcome'
import { CommandPalette } from './components/CommandPalette'
import { StoryBible } from './components/StoryBible'
import { ProviderSettings } from './components/ProviderSettings'
import { WorkflowEditor } from './components/WorkflowEditor'
import { IllustrationStudio } from './components/IllustrationStudio'
import { GraphStudio } from './components/GraphStudio'
import { BackupActions, type BackupAction } from './components/BackupActions'
import { ImportExportActions } from './components/ImportExportActions'
import type { ImportExportAction } from './components/ImportExportActions'
import { CheckpointActions } from './components/CheckpointActions'
import { ProjectHealthPanel } from './components/ProjectHealthPanel'
import { AuthoringFlow } from './components/AuthoringFlow'
import { useAppStore, workflowCompletionAction } from './store/app-store'
import type { StoryEntity, StorySearchResult } from '../../shared/story'
import { commandAction } from './commands/action-registry'
import { NotificationCenter } from './components/NotificationCenter'
import { ChatWorkspace } from './components/ChatWorkspace'
import { dismissNotification, upsertNotification, type NotificationItem, type NotificationKind } from './lib/notification'
import { UpdateCard } from './components/UpdateCard'
import type { UpdateStatus } from '../../shared/update'
import { getUiText, useUiLocale, type UiLocale, type UiTextKey } from './lib/i18n'
import type { GlobalNotificationDetail } from './lib/global-notification'

const DEFAULT_LAYOUT = { bottomPanelHeight: 220, bottomCollapsed: false, bottomMaximized: false, sidebarWidth: 290, leftSidebarCollapsed: false, rightPanelWidth: 410, rightPanelCollapsed: false }
type LayoutState = typeof DEFAULT_LAYOUT
const layoutKey = (rootPath: string) => `novel-studio:layout:${rootPath}`
type ThemePreference = 'system' | 'dark' | 'light'
const themePreferenceKey = 'novel-studio:theme'

function readThemePreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'dark'
  const value = localStorage.getItem(themePreferenceKey)
  return value === 'system' || value === 'dark' || value === 'light' ? value : 'dark'
}

function readLayout(rootPath: string): LayoutState {
  try {
    const parsed = JSON.parse(localStorage.getItem(layoutKey(rootPath)) ?? 'null') as Partial<LayoutState> | null
    if (!parsed || typeof parsed !== 'object') return DEFAULT_LAYOUT
    return {
      bottomPanelHeight: typeof parsed.bottomPanelHeight === 'number' && parsed.bottomPanelHeight >= 140 && parsed.bottomPanelHeight <= 1200 ? parsed.bottomPanelHeight : DEFAULT_LAYOUT.bottomPanelHeight,
      bottomCollapsed: typeof parsed.bottomCollapsed === 'boolean' ? parsed.bottomCollapsed : DEFAULT_LAYOUT.bottomCollapsed,
      bottomMaximized: typeof parsed.bottomMaximized === 'boolean' ? parsed.bottomMaximized : DEFAULT_LAYOUT.bottomMaximized,
      sidebarWidth: typeof parsed.sidebarWidth === 'number' && parsed.sidebarWidth >= 220 && parsed.sidebarWidth <= 420 ? parsed.sidebarWidth : DEFAULT_LAYOUT.sidebarWidth,
      leftSidebarCollapsed: typeof parsed.leftSidebarCollapsed === 'boolean' ? parsed.leftSidebarCollapsed : DEFAULT_LAYOUT.leftSidebarCollapsed,
      rightPanelWidth: typeof parsed.rightPanelWidth === 'number' && parsed.rightPanelWidth >= 280 && parsed.rightPanelWidth <= 520 ? parsed.rightPanelWidth : DEFAULT_LAYOUT.rightPanelWidth,
      rightPanelCollapsed: typeof parsed.rightPanelCollapsed === 'boolean' ? parsed.rightPanelCollapsed : DEFAULT_LAYOUT.rightPanelCollapsed
    }
  } catch { return DEFAULT_LAYOUT }
}

export default function App() {
  const { screen, project, initializing, bootstrap, saveStatus, liveWordCount, closeProject, seedMockStory, notice, setNotice } = useAppStore()
  const [uiLocale, setUiLocale] = useUiLocale()
  const uiText = (key: UiTextKey) => getUiText(uiLocale, key)
  const formatUiText = (key: UiTextKey, values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  const [modelLabel, setModelLabel] = useState(() => uiText('modelUnconfigured'))
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [storySection, setStorySection] = useState<StorySection | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [authoringOpen, setAuthoringOpen] = useState(false)
  const [imagesOpen, setImagesOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null)
  const [focusedStoryResultId, setFocusedStoryResultId] = useState<string | null>(null)
  const [focusedRelationId, setFocusedRelationId] = useState<string | null>(null)
  const [topNotice, setTopNotice] = useState<string | null>(null)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(220)
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
  const [bottomMaximized, setBottomMaximized] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(290)
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightPanelWidth, setRightPanelWidth] = useState(410)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [backupAction, setBackupAction] = useState<BackupAction | null>(null)
  const [importExportAction, setImportExportAction] = useState<ImportExportAction | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const layoutLoadedFor = useRef<string | null>(null)
  const [layoutReadyFor, setLayoutReadyFor] = useState<string | null>(null)

  useEffect(() => {
    if (themePreference === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = themePreference
    try { localStorage.setItem(themePreferenceKey, themePreference) } catch { /* Optional local preference. */ }
  }, [themePreference])

  useEffect(() => {
    const rootPath = project?.rootPath
    if (!rootPath) { layoutLoadedFor.current = null; setLayoutReadyFor(null); return }
    setLayoutReadyFor(null)
    const layout = readLayout(rootPath)
    setBottomPanelHeight(layout.bottomPanelHeight)
    setBottomCollapsed(layout.bottomCollapsed)
    setBottomMaximized(layout.bottomMaximized)
    setSidebarWidth(layout.sidebarWidth)
    setLeftSidebarCollapsed(layout.leftSidebarCollapsed)
    setRightPanelWidth(layout.rightPanelWidth)
    setRightPanelCollapsed(layout.rightPanelCollapsed)
    layoutLoadedFor.current = rootPath
    setLayoutReadyFor(rootPath)
  }, [project?.rootPath])

  useEffect(() => {
    const rootPath = project?.rootPath
    if (!rootPath || layoutLoadedFor.current !== rootPath || layoutReadyFor !== rootPath) return
    try { localStorage.setItem(layoutKey(rootPath), JSON.stringify({ bottomPanelHeight, bottomCollapsed, bottomMaximized, sidebarWidth, leftSidebarCollapsed, rightPanelWidth, rightPanelCollapsed })) } catch { /* Layout persistence is optional and must not affect authoring. */ }
  }, [project?.rootPath, layoutReadyFor, bottomPanelHeight, bottomCollapsed, bottomMaximized, sidebarWidth, leftSidebarCollapsed, rightPanelWidth, rightPanelCollapsed])

  // Main workbench views are mutually exclusive. Closing Illustration Studio
  // here prevents it from winning the render priority over Story Bible views.
  useEffect(() => {
    if (storySection || graphOpen || workflowOpen || authoringOpen) setImagesOpen(false)
  }, [storySection, graphOpen, workflowOpen, authoringOpen])

  useEffect(() => {
    const openChat = () => { setChatOpen(true); setRightPanelCollapsed(true); setStorySection(null); setWorkflowOpen(false); setGraphOpen(false); setImagesOpen(false) }
    window.addEventListener('novel:open-chat', openChat)
    const openImages = () => { setChatOpen(false); setImagesOpen(true); setWorkflowOpen(false); setGraphOpen(false); setStorySection(null); setRightPanelCollapsed(false) }
    window.addEventListener('novel:open-images', openImages)
    const openWorkflow = () => { setChatOpen(false); setWorkflowOpen(true); setGraphOpen(false); setImagesOpen(false); setStorySection(null); setRightPanelCollapsed(false) }
    const openAuthoring = () => { setChatOpen(false); setAuthoringOpen(true); setWorkflowOpen(false); setGraphOpen(false); setImagesOpen(false); setStorySection(null); setRightPanelCollapsed(true) }
    window.addEventListener('novel:open-workflow', openWorkflow)
    window.addEventListener('novel:open-authoring', openAuthoring)
    return () => { window.removeEventListener('novel:open-chat', openChat); window.removeEventListener('novel:open-images', openImages); window.removeEventListener('novel:open-workflow', openWorkflow); window.removeEventListener('novel:open-authoring', openAuthoring) }
  }, [])

  useEffect(() => {
    const focusStoryResult = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      if (typeof id === 'string' && id) setFocusedStoryResultId(id)
    }
    window.addEventListener('novel:focus-story-result', focusStoryResult)
    return () => window.removeEventListener('novel:focus-story-result', focusStoryResult)
  }, [])

  const resizePanel = (side: 'left' | 'right', event: ReactPointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = side === 'left' ? sidebarWidth : rightPanelWidth
    const minimum = side === 'left' ? 220 : 280
    const maximum = side === 'left' ? 420 : 520
    handle.setPointerCapture(event.pointerId)
    const onMove = (moveEvent: PointerEvent) => {
      const delta = side === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX
      const nextWidth = Math.max(minimum, Math.min(maximum, startWidth + delta))
      if (side === 'left') setSidebarWidth(nextWidth)
      else setRightPanelWidth(nextWidth)
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (!window.novelAPI?.update) return
    const unsubscribe = window.novelAPI.update.onEvent((event) => setUpdateStatus(event))
    return unsubscribe
  }, [])

  const checkForUpdate = async () => {
    if (!window.novelAPI?.update) return
    const result = await window.novelAPI.update.check()
    if (result.ok) setUpdateStatus(result.data)
    else setUpdateStatus({ state: 'failed', reason: 'network' })
  }
  const downloadUpdate = async () => {
    if (!window.novelAPI?.update) return
    const result = await window.novelAPI.update.download()
    if (result.ok) setUpdateStatus(result.data)
    else setUpdateStatus({ state: 'failed', reason: 'destination' })
  }
  const installUpdate = async () => {
    if (!window.novelAPI?.update) return
    const result = await window.novelAPI.update.install()
    if (result.ok) setUpdateStatus(result.data)
    else setUpdateStatus({ state: 'failed', reason: 'installation' })
  }
  const cancelUpdate = async () => {
    if (!window.novelAPI?.update) return
    const result = await window.novelAPI.update.cancel()
    if (result.ok) setUpdateStatus(result.data)
  }
  useEffect(() => window.novelAPI.workflowRuntime.onEvent((event) => {
    const completion = event.completion
    if (!completion) return
    const current = useAppStore.getState()
    const action = workflowCompletionAction(completion.targetRelPath, current.activeRelPath, current.saveStatus)
    if (action === 'refresh') {
      void current.openChapter(completion.targetRelPath)
    } else if (action === 'conflict') {
      current.setNotice(formatUiText('workflowWritebackConflict', { path: completion.targetRelPath }))
    }
  }), [])

  // The main process can retain an open project while a renderer reloads.
  // Recover the visible workbench if a late bootstrap result left this store
  // on Welcome even though the authoritative Main project is still open.
  useEffect(() => {
    if (screen !== 'welcome' || project || !window.novelAPI) return
    let active = true
    let timer: ReturnType<typeof setInterval> | null = null
    const reconcile = async () => {
      const result = await window.novelAPI.project.getInfo()
      if (!active || !result.ok || !result.data) return
      useAppStore.setState({ project: result.data, screen: 'workbench', notice: null })
      await useAppStore.getState().loadChapters()
      await useAppStore.getState().loadVolumes()
      if (timer) clearInterval(timer)
    }
    void reconcile().catch(() => { /* bootstrap owns user-visible startup errors */ })
    timer = setInterval(() => { void reconcile().catch(() => { /* retry while Main may still be opening */ }) }, 250)
    return () => { active = false; if (timer) clearInterval(timer) }
  }, [screen, project])

  useEffect(() => {
    if (!project) return
    void window.novelAPI.ai.listProfiles().then((result) => {
      if (!result.ok) return
      const selected = result.data.find((profile) => profile.id === project.manifest.providerProfile)
      setModelLabel(selected?.model ?? uiText('modelUnconfiguredShort'))
    })
  }, [project])

  useEffect(() => {
    const sources: Array<[string, string | null]> = [['action', topNotice], ['system', notice]]
    const active = sources.filter((source): source is [string, string] => Boolean(source[1]))
    const activeIds = new Set(active.map(([id]) => id))
    setNotifications((current) => current.filter((item) => !['action', 'system'].includes(item.id) || activeIds.has(item.id)))
    if (!active.length) return
    const kindFor = (message: string): NotificationKind => /失败|错误|无效|拒绝|failed|error|invalid|rejected/i.test(message) ? 'error' : /警告|过期|需要关注|warning|expired|attention/i.test(message) ? 'warning' : 'info'
    setNotifications((current) => active.reduce((queue, [id, message]) => upsertNotification(queue, { id, kind: kindFor(message), message, dismissible: true }), current))
    const timers = active.map(([id]) => window.setTimeout(() => {
      setNotifications((current) => dismissNotification(current, id))
      if (id === 'action') setTopNotice(null)
      else setNotice(null)
    }, 6000))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [topNotice, notice, setNotice])

  useEffect(() => {
    let sequence = 0
    const timers = new Set<number>()
    const allowedKinds: NotificationKind[] = ['info', 'success', 'warning', 'error', 'progress']
    const onGlobalNotification = (event: Event) => {
      const detail = (event as CustomEvent<GlobalNotificationDetail>).detail
      if (!detail || typeof detail.message !== 'string' || !detail.message.trim()) return
      const kind = allowedKinds.includes(detail.kind ?? 'info') ? detail.kind ?? 'info' : 'info'
      const durationMs = typeof detail.durationMs === 'number' && Number.isFinite(detail.durationMs)
        ? Math.max(1000, Math.min(15000, detail.durationMs))
        : 6000
      const id = `global-${++sequence}`
      setNotifications((current) => upsertNotification(current, { id, kind, message: detail.message, dismissible: true }))
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        setNotifications((current) => dismissNotification(current, id))
      }, durationMs)
      timers.add(timer)
    }
    window.addEventListener('novel:global-notification', onGlobalNotification)
    return () => {
      window.removeEventListener('novel:global-notification', onGlobalNotification)
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const syncProvider = (value: import('../../shared/ai').ProviderProfile | null) => {
    setModelLabel(value?.model ?? uiText('modelUnconfiguredShort'))
    void window.novelAPI.project.getInfo().then((result) => {
      if (result.ok && result.data) useAppStore.setState({ project: result.data })
    })
  }

  // Cmd+K toggles the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setFocusMode(false); setPaletteOpen(false); setProjectMenuOpen(false); return }
      const modifier = e.metaKey || e.ctrlKey
      if (!modifier) return
      if (e.key.toLowerCase() === 'k' || (e.key.toLowerCase() === 'p' && !e.shiftKey)) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (e.key.toLowerCase() === 'p' && e.shiftKey) {
        e.preventDefault(); setWorkflowOpen(true); setGraphOpen(false); setImagesOpen(false); setStorySection(null); setPaletteOpen(false); return
      }
      if (e.key.toLowerCase() === 's') {
        e.preventDefault(); void useAppStore.getState().flushAutosave(); return
      }
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault(); setLeftSidebarCollapsed((collapsed) => !collapsed); return
      }
      if (e.key.toLowerCase() === 'j') {
        e.preventDefault(); setBottomCollapsed((value) => !value); return
      }
      if (e.key.toLowerCase() === 'f' && e.shiftKey) {
        e.preventDefault(); setFocusMode(false); setPaletteOpen(true); return
      }
      if ((e.key === '\\' || e.key === '|') && e.shiftKey) {
        e.preventDefault(); setRightPanelCollapsed((value) => !value); return
      }
      if (e.key === '\\') {
        e.preventDefault(); window.dispatchEvent(new CustomEvent('novel:toggle-agent')); return
      }
      if (e.key === 'Enter') {
        e.preventDefault(); window.dispatchEvent(new CustomEvent('novel:ask-selection')); return
      }
      if (!e.shiftKey && ['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault()
        setPaletteOpen(false); setGraphOpen(false); setImagesOpen(false); setWorkflowOpen(false); setStorySection(null)
        if (e.key === '2') setStorySection('character')
        if (e.key === '3') setWorkflowOpen(true)
        if (e.key === '4') setImagesOpen(true)
        if (e.key === '5') setGraphOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!projectMenuOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.project-menu')) setProjectMenuOpen(false)
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [projectMenuOpen])

  useEffect(() => window.novelMenu?.onAction((action) => {
    if (action === commandAction('open-workflow').id) { setWorkflowOpen(true); setGraphOpen(false); setImagesOpen(false); setStorySection(null) }
    if (action === commandAction('open-images').id) { setImagesOpen(true); setGraphOpen(false); setWorkflowOpen(false); setStorySection(null) }
    if (action === commandAction('open-settings').id) setSettingsOpen(true)
    if (action === 'import-chapter') setImportExportAction('import')
    if (action === 'export-markdown') setImportExportAction('markdown')
    if (action === 'export-plain') setImportExportAction('plain')
    if (action === 'export-html') setImportExportAction('html')
    if (action === 'create-backup') setBackupAction('create')
    if (action === 'create-incremental-backup') setBackupAction('incremental')
    if (action === 'repair-indexes') setBackupAction('repair')
    if (action === 'seed-mock') void seedMockStory()
    if (action === 'help') setPaletteOpen(true)
  }) ?? undefined, [seedMockStory])

  if (screen === 'loading') {
    return (
      <div className="boot-screen">
        <Loader2 className="spin" size={22} />
        <span>{uiText('startupLoading')}</span>
      </div>
    )
  }

  if (screen === 'welcome' || !project) return <Welcome />

  const saveLabels: Record<string, { text: string; cls: string }> = {
    dirty: { text: `● ${uiText('saveDirty')}`, cls: 'save-dirty' },
    saving: { text: `⋯ ${uiText('saveSaving')}`, cls: 'save-saving' },
    saved: { text: `● ${uiText('saveSaved')}`, cls: 'save-saved' },
    error: { text: `● ${uiText('saveFailed')}`, cls: 'save-error' }
  }
  const save = saveLabels[saveStatus] ?? saveLabels.saved
  const triggerBackupAction = (action: BackupAction) => { setProjectMenuOpen(false); setBackupAction(action) }
  const workbenchColumns = focusMode
    ? 'minmax(520px, 1fr)'
    : [
      !leftSidebarCollapsed ? `${sidebarWidth}px 2px` : '',
      'minmax(520px, 1fr)',
      !rightPanelCollapsed ? `2px ${rightPanelWidth}px` : ''
    ].filter(Boolean).join(' ')

  return (
    <div className={focusMode ? 'app focus-mode' : 'app'}>
      <header className="topbar">
        <div className="brand"><div className="brand-icon">N</div><b>Novel Studio</b></div>
        <div className="project-menu">
          <button className="project-name" title={uiText('openProjectMenu')} aria-haspopup="menu" aria-expanded={projectMenuOpen} onClick={() => setProjectMenuOpen((open) => !open)}>
             {uiText('projectMenuLabel')} <strong>{project.manifest.title}</strong> <ChevronDown size={13} />
          </button>
          {projectMenuOpen && <div className="project-menu-dropdown" role="menu">
            <button className="menu-item" role="menuitem" onClick={() => { setProjectMenuOpen(false); setLeftSidebarCollapsed((collapsed) => !collapsed) }}>{leftSidebarCollapsed ? uiText('expandDirectoryActions') : uiText('collapseDirectoryActions')}</button>
            <div className="menu-separator" />
            <button className="menu-item" role="menuitem" onClick={() => triggerBackupAction('create')}><Archive size={14} />{uiText('backupCreate')}</button>
            <button className="menu-item" role="menuitem" onClick={() => triggerBackupAction('incremental')}><Archive size={14} />{uiText('backupCreateIncremental')}</button>
            <button className="menu-item" role="menuitem" onClick={() => triggerBackupAction('project-export')}><Archive size={14} />{uiText('projectArchiveExport')}</button>
            <button className="menu-item" role="menuitem" onClick={() => triggerBackupAction('project-import')}><FolderOpen size={14} />{uiText('projectArchiveImport')}</button>
            <button className="menu-item" role="menuitem" onClick={() => triggerBackupAction('repair')}><Wrench size={14} />{uiText('repairIndexes')}</button>
            <div className="menu-separator" />
            <button className="menu-item danger" role="menuitem" onClick={() => { setProjectMenuOpen(false); void closeProject() }}>{uiText('closeProject')}</button>
          </div>}
        </div>
        <div className="command-box" role="button" tabIndex={0} onClick={() => setPaletteOpen(true)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPaletteOpen(true) } }}>
          <Search size={14} /><span>{uiText('commandPlaceholder')}</span><kbd><Command size={12} />K</kbd>
        </div>
        <div className="top-actions">
          <CheckpointActions onNotice={setTopNotice} /><button className="health-trigger" onClick={() => setHealthOpen(true)} title={uiText('checkIntegrity')}><span className="health-trigger-dot" />{uiText('projectHealth')}</button>
          <button type="button" data-testid="right-panel-toggle" className={`right-panel-top-toggle${rightPanelCollapsed ? ' collapsed' : ' active'}`} onClick={() => setRightPanelCollapsed((collapsed) => !collapsed)} title={rightPanelCollapsed ? uiText('expandAgentPanel') : uiText('collapseAgentPanel')} aria-label={rightPanelCollapsed ? uiText('expandAgentPanel') : uiText('collapseAgentPanel')} aria-pressed={rightPanelCollapsed}><Bot size={15} /></button>
          <label className="ui-language-control"><span className="sr-only">{uiText('uiLanguage')}</span><select aria-label={uiText('uiLanguage')} value={uiLocale} onChange={(event) => setUiLocale(event.target.value as UiLocale)}><option value="zh-CN">{uiText('languageChinese')}</option><option value="en-US">{uiText('languageEnglish')}</option></select></label>
          <button className="model" onClick={() => setSettingsOpen(true)} title={uiText('currentModel')}>{modelLabel}</button>
          <label className="theme-control"><span className="sr-only">{uiText('themePreference')}</span><select aria-label={uiText('themePreference')} value={themePreference} onChange={(event) => setThemePreference(event.target.value as ThemePreference)}><option value="system">{uiText('themeSystem')}</option><option value="dark">{uiText('themeDark')}</option><option value="light">{uiText('themeLight')}</option></select></label>
        </div>
      </header>
      <NotificationCenter items={notifications} onDismiss={(id) => { setNotifications((current) => dismissNotification(current, id)); if (id === 'action') setTopNotice(null); if (id === 'system') setNotice(null) }} />
      <UpdateCard status={updateStatus} onCheck={() => void checkForUpdate()} onDownload={() => void downloadUpdate()} onInstall={() => void installUpdate()} onCancel={() => void cancelUpdate()} />
      {initializing && <div className="startup-loading" role="status" aria-live="polite"><Loader2 className="spin" size={18} /><span>{uiText('loadingProjectContent')}</span></div>}
      <div className="workbench" style={{ gridTemplateColumns: workbenchColumns }}>
        {!focusMode && !leftSidebarCollapsed && <Sidebar activeSection={storySection} activeTool={authoringOpen ? 'authoring' : workflowOpen ? 'workflow' : graphOpen ? 'graph' : imagesOpen ? 'images' : null} onOpenChapter={(relPath) => { setAuthoringOpen(false); setWorkflowOpen(false); setGraphOpen(false); setImagesOpen(false); setStorySection(null); void useAppStore.getState().openChapter(relPath) }} onOpenStory={(section) => { setAuthoringOpen(false); setStorySection(section); setWorkflowOpen(false); setGraphOpen(false) }} onOpenAuthoring={() => { setAuthoringOpen(true); setWorkflowOpen(false); setGraphOpen(false); setImagesOpen(false); setStorySection(null) }} onOpenWorkflow={() => { setAuthoringOpen(false); setWorkflowOpen(true); setGraphOpen(false); setImagesOpen(false); setStorySection(null) }} onOpenGraph={() => { setAuthoringOpen(false); setGraphOpen(true); setWorkflowOpen(false); setImagesOpen(false); setStorySection(null) }} onOpenImages={() => { setAuthoringOpen(false); setImagesOpen(true); setWorkflowOpen(false); setGraphOpen(false); setStorySection(null) }} />}
         {!focusMode && !leftSidebarCollapsed && <div className="panel-resizer" role="separator" aria-orientation="vertical" aria-label={uiText('adjustSidebarWidth')} aria-valuemin={220} aria-valuemax={420} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={(event) => resizePanel('left', event)} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setSidebarWidth((width) => Math.max(220, width - 16)); if (event.key === 'ArrowRight') setSidebarWidth((width) => Math.min(420, width + 16)) }} />}
        <div className="center-stack" style={{ gridTemplateRows: chatOpen || bottomMaximized ? 'minmax(0, 1fr)' : `minmax(0, 1fr) ${bottomCollapsed ? '38px' : `${bottomPanelHeight}px`}` }}>
          {chatOpen ? <ChatWorkspace onClose={() => { setChatOpen(false); setRightPanelCollapsed(false) }} /> : !bottomMaximized && (imagesOpen ? <IllustrationStudio /> : graphOpen ? <GraphStudio focusRelationId={focusedRelationId} /> : workflowOpen ? <WorkflowEditor /> : authoringOpen ? <AuthoringFlow onOpenStory={(section) => { setAuthoringOpen(false); setStorySection(section) }} onOpenWorkflow={() => { setAuthoringOpen(false); setWorkflowOpen(false); setRightPanelCollapsed(false) }} onOpenChapter={(relPath) => { setAuthoringOpen(false); void useAppStore.getState().openChapter(relPath) }} /> : storySection ? <StoryBible section={storySection} focusEntityId={focusedEntityId} focusStoryResultId={focusedStoryResultId} /> : <EditorPane />)}
          {!focusMode && !chatOpen && <BottomPanel collapsed={bottomCollapsed && !bottomMaximized} maximized={bottomMaximized} onToggleCollapsed={() => setBottomCollapsed((value) => !value)} onToggleMaximized={() => { setBottomMaximized((value) => { const next = !value; if (next) setBottomCollapsed(false); return next }); setBottomPanelHeight((height) => height >= 520 ? 220 : 520) }} onResize={(delta) => { const availableHeight = Math.max(140, window.innerHeight - 74); setBottomMaximized((current) => { if (current && delta > 0) return false; return bottomPanelHeight + delta >= availableHeight - 2 }); setBottomPanelHeight((height) => Math.max(140, Math.min(availableHeight, height + delta))) }} />}
        </div>
        {!focusMode && !rightPanelCollapsed && <div className="panel-resizer" role="separator" aria-orientation="vertical" aria-label={uiText('adjustRightPanelWidth')} aria-valuemin={280} aria-valuemax={520} aria-valuenow={rightPanelWidth} tabIndex={0} onPointerDown={(event) => resizePanel('right', event)} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setRightPanelWidth((width) => Math.min(520, width + 16)); if (event.key === 'ArrowRight') setRightPanelWidth((width) => Math.max(280, width - 16)) }} />}
        {!focusMode && !rightPanelCollapsed && <RightPanel onOpenImages={() => { setImagesOpen(true); setWorkflowOpen(false); setGraphOpen(false); setStorySection(null) }} />}
      </div>
      <BackupActions onNotice={setTopNotice} action={backupAction} onActionHandled={() => setBackupAction(null)} controls={false} />
      <ImportExportActions onNotice={setTopNotice} action={importExportAction} onActionHandled={() => setImportExportAction(null)} controls={false} />
      <footer className="statusbar">
        <span className="save-ok">{uiText('connected')}</span>
        <span className={`status-save ${save.cls}`}>{save.text}</span>
        <span>{liveWordCount.toLocaleString()} {uiText('words')}</span>
        <span>{project.manifest.language}</span>
        <span className="status-grow" />
         <span className="meter-r">{uiText('contextUsage')}</span><span>0%</span>
         <button type="button" className="focus-mode-toggle" aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)} title={uiText('focusModeHint')}><Sparkles size={12} /> {focusMode ? uiText('exitFocusMode') : uiText('focusMode')}</button>
      </footer>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpenWorkflow={() => { setWorkflowOpen(true); setGraphOpen(false); setImagesOpen(false); setStorySection(null) }} onOpenImages={() => { setImagesOpen(true); setWorkflowOpen(false); setGraphOpen(false); setStorySection(null) }} onOpenSettings={() => setSettingsOpen(true)} onOpenHealth={() => setHealthOpen(true)} onOpenEntity={(entity: StoryEntity) => { setFocusedEntityId(entity.id); setFocusedRelationId(null); setStorySection(entity.kind === 'org' ? 'org' : entity.kind); setWorkflowOpen(false); setGraphOpen(false); setImagesOpen(false) }} onOpenStoryResult={(result: StorySearchResult) => { if (result.kind === 'document' || result.type === 'document') return; setFocusedEntityId(null); if (result.kind === 'relation' || result.type === 'relation') { setFocusedRelationId(result.id); setStorySection(null); setGraphOpen(true) } else { setFocusedEntityId(null); setFocusedRelationId(null); setStorySection(result.kind === 'timeline' ? 'timeline' : result.type === 'plot' ? 'plots' : result.type === 'note' ? 'notes' : result.type); setGraphOpen(false) } setWorkflowOpen(false); setImagesOpen(false) }} />
      {settingsOpen && <ProviderSettings onClose={() => setSettingsOpen(false)} onProviderChange={syncProvider} />}
      {healthOpen && <ProjectHealthPanel onClose={() => setHealthOpen(false)} />}
    </div>
  )
}
