import { app, BrowserWindow, dialog, Menu, safeStorage } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { ProjectService } from './services/project-service'
import { RecentProjectsStore } from './services/recent-projects'
import { ChapterService } from './services/chapter-service'
import { StoryService } from './services/story-service'
import { AiService } from './services/ai-service'
import { SafeStorageSecretStore } from './services/secret-store'
import { RevisionService } from './services/revision-service'
import { AiEditService } from './services/ai-edit-service'
import { ContextService } from './services/context-service'
import { CanonService } from './services/canon-service'
import { WorkflowService } from './services/workflow-service'
import { WorkflowRuntimeService } from './services/workflow-runtime-service'
import { WorkflowRunStore } from './services/workflow-run-store'
import { ImageService, OpenAICompatibleImageProvider } from './services/image-service'
import { BackupService } from './services/backup-service'
import { PromptService } from './services/prompt-service'
import { AgentService } from './services/agent-service'
import { CheckpointService } from './services/checkpoint-service'
import { DiagnosticsService } from './services/diagnostics-service'
import { MemoryService } from './services/memory-service'
import { EmbeddingIndexService } from './services/embedding-index-service'
import { SceneService } from './services/scene-service'
import { VolumeService } from './services/volume-service'
import { IPC } from '../shared/ipc'
import type { ExportFormat } from '../shared/chapter'

app.setName('Novel Studio')

// electron-vite runs the main bundle from out/main during development while
// electron-builder keeps resources at the application root. Resolve from the
// bundle directory so both layouts use the same icon path.
const applicationIconPath = () => join(__dirname, '../../assets/novel-studio-icon.png')

function createWindow(): void {
  const iconPath = applicationIconPath()
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1360,
    minHeight: 760,
    backgroundColor: '#0a0b10',
    title: 'Novel Studio',
    icon: iconPath,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 15 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('will-redirect', (event) => event.preventDefault())
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())

  if (app.isPackaged) {
    const strictCsp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'"
    ].join('; ')
    win.webContents.session.webRequest.onHeadersReceived({ urls: ['file://*/*'] }, (details, callback) => {
      const responseHeaders = { ...details.responseHeaders, 'Content-Security-Policy': [strictCsp] }
      callback({ responseHeaders })
    })
  }

  // Dev diagnostics: only process health/load failures are logged. Renderer
  // console content can contain prose or provider payloads and is intentionally
  // not copied to the main-process log.
  if (!app.isPackaged) {
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(`[did-fail-load] ${code} ${desc.slice(0, 240)} ${url.startsWith('file://') || url.startsWith('http://localhost:') ? url : '[redacted-url]'}`)
    })
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error(`[render-process-gone] ${details.reason}`)
    })
  }
}

function installApplicationMenu(): void {
  const send = (action: string) => BrowserWindow.getFocusedWindow()?.webContents.send(IPC.menuAction, action)
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Novel Studio', submenu: [{ label: '关于 Novel Studio', role: 'about' }, { type: 'separator' }, { label: '退出', role: 'quit' }] },
    { label: '项目', submenu: [{ label: '运行 Workflow', click: () => send('open-workflow') }, { label: '打开 Illustration Studio', click: () => send('open-images') }, { type: 'separator' }, { label: '创建备份', click: () => send('create-backup') }, { label: '创建增量', click: () => send('create-incremental-backup') }, { label: '修复索引', click: () => send('repair-indexes') }, { type: 'separator' }, { label: '导入章节…', click: () => send('import-chapter') }, { label: '导出 Markdown…', click: () => send('export-markdown') }, { label: '导出 TXT…', click: () => send('export-plain') }, { label: '导出 HTML…', click: () => send('export-html') }, { type: 'separator' }, { label: 'Provider 设置', click: () => send('open-settings') }, { label: '载入小牛示例', click: () => send('seed-mock') }] },
    { label: '编辑', submenu: [{ label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' }, { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' }, { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }] },
    { label: '视图', submenu: [{ label: '重新加载', role: 'reload' }, { label: '强制重新加载', role: 'forceReload' }, { label: '开发者工具', role: 'toggleDevTools' }, { type: 'separator' }, { label: '全屏', role: 'togglefullscreen' }] },
    { label: '窗口', submenu: [{ label: '最小化', role: 'minimize' }, { label: '关闭窗口', role: 'close' }] },
    { label: '帮助', submenu: [{ label: 'Novel Studio 使用说明', click: () => send('help') }] }
  ]))
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(applicationIconPath())
  }
  const recents = new RecentProjectsStore(join(app.getPath('userData'), 'recent-projects.json'))
  const projectService = new ProjectService(recents)
  const volumeService = new VolumeService(projectService)
  let revisionService!: RevisionService
  const chapterService = new ChapterService(projectService, (input) => revisionService.create(input), volumeService)
  const sceneService = new SceneService(projectService)
  const storyService = new StoryService(projectService)
  const promptService = new PromptService(projectService)
  const agentService = new AgentService(promptService)
  const secretStore = new SafeStorageSecretStore(safeStorage, join(app.getPath('userData'), 'provider-secrets.json'))
  const aiService = new AiService(projectService, secretStore)
  const embeddingIndex = new EmbeddingIndexService(projectService, chapterService, aiService)
  const canonService = new CanonService(projectService)
  revisionService = new RevisionService(projectService, chapterService)
  const contextService = new ContextService(projectService, chapterService, storyService, canonService, embeddingIndex, sceneService)
  const memoryService = new MemoryService(chapterService, contextService, aiService, agentService, canonService)
  const aiEditService = new AiEditService(chapterService, aiService, revisionService, promptService, contextService, agentService)
  const workflowService = new WorkflowService(projectService)
  const imageService = new ImageService(projectService, chapterService, new OpenAICompatibleImageProvider(projectService, secretStore), storyService, revisionService, sceneService)
  const workflowRuntime = new WorkflowRuntimeService(workflowService, new WorkflowRunStore(projectService), aiService, chapterService, contextService, memoryService, imageService, agentService, revisionService)
  workflowRuntime.onEvent((event) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.workflowRuntimeEvent, event) })
  const backupService = new BackupService(projectService)
  const checkpointService = new CheckpointService(projectService)
  const diagnosticsService = new DiagnosticsService(projectService, new WorkflowRunStore(projectService))

  registerIpc(projectService, recents, chapterService, storyService, aiService, aiEditService, contextService, canonService, workflowService, workflowRuntime, memoryService, imageService, backupService, revisionService, checkpointService, diagnosticsService, sceneService, volumeService, {
    pickDirectory: async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        message: '选择项目文件夹（新建项目请选择空目录）'
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    pickArchiveSave: async () => {
      const result = await dialog.showSaveDialog({ title: '导出 Novel Studio 备份', defaultPath: 'novel-studio-backup.zip', filters: [{ name: 'ZIP Archive', extensions: ['zip'] }] })
      return result.canceled ? null : (result.filePath ?? null)
    },
    pickArchiveOpen: async () => {
      const result = await dialog.showOpenDialog({ title: '选择 Novel Studio 备份', properties: ['openFile'], filters: [{ name: 'ZIP Archive', extensions: ['zip'] }] })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    pickTextImport: async () => {
      const result = await dialog.showOpenDialog({ title: '导入章节', properties: ['openFile'], filters: [{ name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] }] })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    pickImageImport: async () => {
      const result = await dialog.showOpenDialog({ title: '导入图片', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }] })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    pickExportSave: async (format: ExportFormat) => {
      const extension = format === 'markdown' ? 'md' : format === 'plain' ? 'txt' : 'html'
      const result = await dialog.showSaveDialog({ title: `导出全部章节（${format}）`, defaultPath: `novel-studio-export.${extension}`, filters: [{ name: format === 'html' ? 'HTML' : format === 'plain' ? 'Plain Text' : 'Markdown', extensions: [extension] }] })
      return result.canceled ? null : (result.filePath ?? null)
    },
    pickDiagnosticsSave: async () => {
      const result = await dialog.showSaveDialog({ title: '导出 Novel Studio 诊断包', defaultPath: 'novel-studio-diagnostics.json', filters: [{ name: 'JSON Diagnostics', extensions: ['json'] }] })
      return result.canceled ? null : (result.filePath ?? null)
    }
  })


  installApplicationMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
