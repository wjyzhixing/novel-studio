import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Bot, ChevronDown, Command, Loader2, Search, Sparkles } from 'lucide-react'
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
import { useAppStore, workflowCompletionAction } from './store/app-store'
import type { StoryEntity } from '../../shared/story'
import { commandAction } from './commands/action-registry'
import { NotificationCenter } from './components/NotificationCenter'
import { ChatWorkspace } from './components/ChatWorkspace'
import { dismissNotification, upsertNotification, type NotificationItem, type NotificationKind } from './lib/notification'

const SAVE_LABEL: Record<string, { text: string; cls: string }> = {
  dirty: { text: '● 未保存', cls: 'save-dirty' },
  saving: { text: '⋯ 保存中', cls: 'save-saving' },
  saved: { text: '● 已保存', cls: 'save-saved' },
  error: { text: '● 保存失败', cls: 'save-error' }
}

const DEFAULT_LAYOUT = { bottomPanelHeight: 220, bottomCollapsed: false, bottomMaximized: false, sidebarWidth: 290, rightPanelWidth: 410 }
type LayoutState = typeof DEFAULT_LAYOUT
const layoutKey = (rootPath: string) => `novel-studio:layout:${rootPath}`

function readLayout(rootPath: string): LayoutState {
  try {
    const parsed = JSON.parse(localStorage.getItem(layoutKey(rootPath)) ?? 'null') as Partial<LayoutState> | null
    if (!parsed || typeof parsed !== 'object') return DEFAULT_LAYOUT
    return {
      bottomPanelHeight: typeof parsed.bottomPanelHeight === 'number' && parsed.bottomPanelHeight >= 140 && parsed.bottomPanelHeight <= 1200 ? parsed.bottomPanelHeight : DEFAULT_LAYOUT.bottomPanelHeight,
      bottomCollapsed: typeof parsed.bottomCollapsed === 'boolean' ? parsed.bottomCollapsed : DEFAULT_LAYOUT.bottomCollapsed,
      bottomMaximized: typeof parsed.bottomMaximized === 'boolean' ? parsed.bottomMaximized : DEFAULT_LAYOUT.bottomMaximized,
      sidebarWidth: typeof parsed.sidebarWidth === 'number' && parsed.sidebarWidth >= 220 && parsed.sidebarWidth <= 420 ? parsed.sidebarWidth : DEFAULT_LAYOUT.sidebarWidth,
      rightPanelWidth: typeof parsed.rightPanelWidth === 'number' && parsed.rightPanelWidth >= 280 && parsed.rightPanelWidth <= 520 ? parsed.rightPanelWidth : DEFAULT_LAYOUT.rightPanelWidth
    }
  } catch { return DEFAULT_LAYOUT }
}

export default function App() {
  const { screen, project, initializing, bootstrap, saveStatus, liveWordCount, closeProject, seedMockStory, notice, setNotice } = useAppStore()
  const [modelLabel, setModelLabel] = useState('未配置 Provider')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [storySection, setStorySection] = useState<StorySection | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [imagesOpen, setImagesOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null)
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
  const layoutLoadedFor = useRef<string | null>(null)

  useEffect(() => {
    const rootPath = project?.rootPath
    if (!rootPath) { layoutLoadedFor.current = null; return }
    const layout = readLayout(rootPath)
    setBottomPanelHeight(layout.bottomPanelHeight)
    setBottomCollapsed(layout.bottomCollapsed)
    setBottomMaximized(layout.bottomMaximized)
    setSidebarWidth(layout.sidebarWidth)
    setRightPanelWidth(layout.rightPanelWidth)
    layoutLoadedFor.current = rootPath
  }, [project?.rootPath])

  useEffect(() => {
    const rootPath = project?.rootPath
    if (!rootPath || layoutLoadedFor.current !== rootPath) return
    try { localStorage.setItem(layoutKey(rootPath), JSON.stringify({ bottomPanelHeight, bottomCollapsed, bottomMaximized, sidebarWidth, rightPanelWidth })) } catch { /* Layout persistence is optional and must not affect authoring. */ }
  }, [project?.rootPath, bottomPanelHeight, bottomCollapsed, bottomMaximized, sidebarWidth, rightPanelWidth])

  // Main workbench views are mutually exclusive. Closing Illustration Studio
  // here prevents it from winning the render priority over Story Bible views.
  useEffect(() => {
    if (storySection || graphOpen || workflowOpen) setImagesOpen(false)
  }, [storySection, graphOpen, workflowOpen])

  useEffect(() => {
    const openChat = () => { setChatOpen(true); setRightPanelCollapsed(true); setStorySection(null); setWorkflowOpen(false); setGraphOpen(false); setImagesOpen(false) }
    window.addEventListener('novel:open-chat', openChat)
    const openImages = () => { setChatOpen(false); setImagesOpen(true); setWorkflowOpen(false); setGraphOpen(false); setStorySection(null); setRightPanelCollapsed(false) }
    window.addEventListener('novel:open-images', openImages)
    const openWorkflow = () => { setChatOpen(false); setWorkflowOpen(true); setGraphOpen(false); setImagesOpen(false); setStorySection(null); setRightPanelCollapsed(false) }
    window.addEventListener('novel:open-workflow', openWorkflow)
    return () => { window.removeEventListener('novel:open-chat', openChat); window.removeEventListener('novel:open-images', openImages); window.removeEventListener('novel:open-workflow', openWorkflow) }
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

  useEffect(() => window.novelAPI.workflowRuntime.onEvent((event) => {
    const completion = event.completion
    if (!completion) return
    const current = useAppStore.getState()
    const action = workflowCompletionAction(completion.targetRelPath, current.activeRelPath, current.saveStatus)
    if (action === 'refresh') {
      void current.openChapter(completion.targetRelPath)
    } else if (action === 'conflict') {
      current.setNotice(`Workflow 已写回 ${completion.targetRelPath}，但当前章节有未保存修改；请先保存或重新载入后比较。`)
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
      setModelLabel(selected?.model ?? '未配置模型')
    })
  }, [project])

  useEffect(() => {
    const sources: Array<[string, string | null]> = [['action', topNotice], ['system', notice]]
    const active = sources.filter((source): source is [string, string] => Boolean(source[1]))
    const activeIds = new Set(active.map(([id]) => id))
    setNotifications((current) => current.filter((item) => activeIds.has(item.id)))
    if (!active.length) return
    const kindFor = (message: string): NotificationKind => /失败|错误|无效|拒绝/i.test(message) ? 'error' : /警告|过期|需要关注/i.test(message) ? 'warning' : 'info'
    setNotifications((current) => active.reduce((queue, [id, message]) => upsertNotification(queue, { id, kind: kindFor(message), message, dismissible: true }), current))
    const timers = active.map(([id]) => window.setTimeout(() => {
      setNotifications((current) => dismissNotification(current, id))
      if (id === 'action') setTopNotice(null)
      else setNotice(null)
    }, 6000))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [topNotice, notice, setNotice])

  const syncProvider = (value: import('../../shared/ai').ProviderProfile | null) => {
    setModelLabel(value?.model ?? '未配置模型')
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
        e.preventDefault(); setFocusMode((value) => !value); return
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
        <span>Novel Studio 启动中…</span>
      </div>
    )
  }

  if (screen === 'welcome' || !project) return <Welcome />

  const save = SAVE_LABEL[saveStatus] ?? SAVE_LABEL.saved

  return (
    <div className={focusMode ? 'app focus-mode' : 'app'}>
      <header className="topbar">
        <div className="brand"><div className="brand-icon">N</div><b>Novel Studio</b></div>
        <div className="project-menu">
          <button className="project-name" title="打开项目菜单" aria-haspopup="menu" aria-expanded={projectMenuOpen} onClick={() => setProjectMenuOpen((open) => !open)}>
            Project <strong>{project.manifest.title}</strong> <ChevronDown size={13} />
          </button>
          {projectMenuOpen && <div className="project-menu-dropdown" role="menu">
            <button className="menu-item" role="menuitem" onClick={() => { setProjectMenuOpen(false); setLeftSidebarCollapsed((collapsed) => !collapsed) }}>{leftSidebarCollapsed ? '展开目录操作区' : '收起目录操作区'}</button>
            <div className="menu-separator" />
            <button className="menu-item danger" role="menuitem" onClick={() => { setProjectMenuOpen(false); void closeProject() }}>关闭项目</button>
          </div>}
        </div>
        <div className="command-box" role="button" tabIndex={0} onClick={() => setPaletteOpen(true)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPaletteOpen(true) } }}>
          <Search size={14} /><span>搜索命令或章节…</span><kbd><Command size={12} />K</kbd>
        </div>
        <div className="top-actions">
          <CheckpointActions onNotice={setTopNotice} /><button className="health-trigger" onClick={() => setHealthOpen(true)} title="检查项目完整性"><span className="health-trigger-dot" />项目健康</button>
          <button type="button" className={`right-panel-top-toggle${rightPanelCollapsed ? ' collapsed' : ' active'}`} onClick={() => setRightPanelCollapsed((collapsed) => !collapsed)} title={rightPanelCollapsed ? '展开右侧 Agent 面板' : '收起右侧 Agent 面板'} aria-label={rightPanelCollapsed ? '展开右侧 Agent 面板' : '收起右侧 Agent 面板'}><Bot size={15} /></button>
          <button className="model" onClick={() => setSettingsOpen(true)} title="当前模型">{modelLabel}</button>
        </div>
      </header>
      <NotificationCenter items={notifications} onDismiss={(id) => { setNotifications((current) => dismissNotification(current, id)); if (id === 'action') setTopNotice(null); if (id === 'system') setNotice(null) }} />
      {initializing && <div className="startup-loading" role="status" aria-live="polite"><Loader2 className="spin" size={18} /><span>正在加载项目内容…</span></div>}
      <div className="workbench" style={{ gridTemplateColumns: focusMode ? 'minmax(520px, 1fr)' : `${leftSidebarCollapsed ? '' : `${sidebarWidth}px 2px `}minmax(520px, 1fr) 2px ${rightPanelCollapsed ? '0px' : `${rightPanelWidth}px`}` }}>
        {!focusMode && !leftSidebarCollapsed && <Sidebar activeSection={storySection} activeTool={workflowOpen ? 'workflow' : graphOpen ? 'graph' : imagesOpen ? 'images' : null} onOpenChapter={(relPath) => { setWorkflowOpen(false); setGraphOpen(false); setImagesOpen(false); setStorySection(null); void useAppStore.getState().openChapter(relPath) }} onOpenStory={(section) => { setStorySection(section); setWorkflowOpen(false); setGraphOpen(false) }} onOpenWorkflow={() => { setWorkflowOpen(true); setGraphOpen(false); setImagesOpen(false); setStorySection(null) }} onOpenGraph={() => { setGraphOpen(true); setWorkflowOpen(false); setImagesOpen(false); setStorySection(null) }} onOpenImages={() => { setImagesOpen(true); setWorkflowOpen(false); setGraphOpen(false); setStorySection(null) }} />}
        {!focusMode && !leftSidebarCollapsed && <div className="panel-resizer" role="separator" aria-orientation="vertical" aria-label="调整左侧栏宽度" aria-valuemin={220} aria-valuemax={420} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={(event) => resizePanel('left', event)} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setSidebarWidth((width) => Math.max(220, width - 16)); if (event.key === 'ArrowRight') setSidebarWidth((width) => Math.min(420, width + 16)) }} />}
        <div className="center-stack" style={{ gridTemplateRows: bottomMaximized ? 'minmax(0, 1fr)' : `minmax(0, 1fr) ${bottomCollapsed ? '38px' : `${bottomPanelHeight}px`}` }}>
          {!bottomMaximized && (chatOpen ? <ChatWorkspace onClose={() => { setChatOpen(false); setRightPanelCollapsed(false) }} /> : imagesOpen ? <IllustrationStudio /> : graphOpen ? <GraphStudio /> : workflowOpen ? <WorkflowEditor /> : storySection ? <StoryBible section={storySection} focusEntityId={focusedEntityId} /> : <EditorPane />)}
          {!focusMode && !chatOpen && <BottomPanel collapsed={bottomCollapsed && !bottomMaximized} maximized={bottomMaximized} onToggleCollapsed={() => setBottomCollapsed((value) => !value)} onToggleMaximized={() => { setBottomMaximized((value) => { const next = !value; if (next) setBottomCollapsed(false); return next }); setBottomPanelHeight((height) => height >= 520 ? 220 : 520) }} onResize={(delta) => { const availableHeight = Math.max(140, window.innerHeight - 74); setBottomMaximized((current) => { if (current && delta > 0) return false; return bottomPanelHeight + delta >= availableHeight - 2 }); setBottomPanelHeight((height) => Math.max(140, Math.min(availableHeight, height + delta))) }} />}
        </div>
        {!focusMode && <div className="panel-resizer" role="separator" aria-orientation="vertical" aria-label="调整右侧栏宽度" aria-valuemin={280} aria-valuemax={520} aria-valuenow={rightPanelWidth} tabIndex={0} onPointerDown={(event) => resizePanel('right', event)} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setRightPanelWidth((width) => Math.min(520, width + 16)); if (event.key === 'ArrowRight') setRightPanelWidth((width) => Math.max(280, width - 16)) }} />}
        {!focusMode && !rightPanelCollapsed && <RightPanel onOpenImages={() => { setImagesOpen(true); setWorkflowOpen(false); setStorySection(null) }} />}
      </div>
      <BackupActions onNotice={setTopNotice} action={backupAction} onActionHandled={() => setBackupAction(null)} controls={false} />
      <ImportExportActions onNotice={setTopNotice} action={importExportAction} onActionHandled={() => setImportExportAction(null)} controls={false} />
      <footer className="statusbar">
        <span className="save-ok">● 已连接本地项目</span>
        <span className={`status-save ${save.cls}`}>{save.text}</span>
        <span>{liveWordCount.toLocaleString()} 字</span>
        <span>{project.manifest.language}</span>
        <span className="status-grow" />
        <span className="meter-r">Context Usage</span><span>0%</span>
        <button type="button" className="focus-mode-toggle" aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)} title="⌘/Ctrl+Shift+F 切换，Escape 退出"><Sparkles size={12} /> {focusMode ? '退出 Focus Mode' : 'Focus Mode'}</button>
      </footer>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpenWorkflow={() => { setWorkflowOpen(true); setGraphOpen(false); setImagesOpen(false); setStorySection(null) }} onOpenImages={() => { setImagesOpen(true); setWorkflowOpen(false); setGraphOpen(false); setStorySection(null) }} onOpenSettings={() => setSettingsOpen(true)} onOpenHealth={() => setHealthOpen(true)} onOpenEntity={(entity: StoryEntity) => { setFocusedEntityId(entity.id); setStorySection(entity.kind === 'org' ? 'org' : entity.kind); setWorkflowOpen(false); setGraphOpen(false); setImagesOpen(false) }} />
      {settingsOpen && <ProviderSettings onClose={() => setSettingsOpen(false)} onProviderChange={syncProvider} />}
      {healthOpen && <ProjectHealthPanel onClose={() => setHealthOpen(false)} />}
    </div>
  )
}
