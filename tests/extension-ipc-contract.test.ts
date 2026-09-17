import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { IPC } from '../src/shared/ipc'

describe('extension IPC contract', () => {
  it('exposes only read-only extension inventory and permission preview', async () => {
    expect(IPC.extensionList).toBe('extension:list')
    expect(IPC.extensionPermissionPreview).toBe('extension:permission-preview')
    expect(IPC.extensionPreview).toBe('extension:preview')

    const preload = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
    expect(preload).toContain('extensions:')
    expect(preload).toContain("list: () => ipcRenderer.invoke(IPC.extensionList)")
    expect(preload).toContain('permissionPreview:')
    expect(preload).toContain('satisfies ExtensionApiContract')
    expect(preload).not.toContain('execute')
    expect(preload).not.toContain('loadExternal')
  })

  it('exposes verified package install, uninstall, rollback and trust status through typed IPC', async () => {
    expect(IPC.extensionInstall).toBe('extension:install')
    expect(IPC.extensionUninstall).toBe('extension:uninstall')
    expect(IPC.extensionRollback).toBe('extension:rollback')
    expect(IPC.extensionTrustStatus).toBe('extension:trust-status')

    const shared = await readFile(new URL('../src/shared/extensions.ts', import.meta.url), 'utf8')
    expect(shared).toContain('preview(sourcePath: string)')
    expect(shared).toContain('install(sourcePath: string, approvedPermissions?')
    expect(shared).toContain('uninstall(id: string)')
    expect(shared).toContain('rollback(id: string)')
    expect(shared).toContain('trustStatus()')

    const preload = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
    expect(preload).toContain('preview: (sourcePath: string) => ipcRenderer.invoke(IPC.extensionPreview, sourcePath)')
    expect(preload).toContain('install: (sourcePath: string, approvedPermissions = []) => ipcRenderer.invoke(IPC.extensionInstall, { sourcePath, approvedPermissions })')
    expect(preload).toContain('uninstall: (id: string) => ipcRenderer.invoke(IPC.extensionUninstall, id)')
    expect(preload).toContain('rollback: (id: string) => ipcRenderer.invoke(IPC.extensionRollback, id)')
    expect(preload).toContain('trustStatus: () => ipcRenderer.invoke(IPC.extensionTrustStatus)')
  })

  it('registers main handlers with validated extension ids', async () => {
    const mainIpc = await readFile(new URL('../src/main/ipc.ts', import.meta.url), 'utf8')
    expect(mainIpc).toContain('extensionRegistry.snapshot()')
    expect(mainIpc).toContain('extensionRegistry.permissionPreview(')
    expect(mainIpc).toContain('extensionPackageStore.preview(')
    expect(mainIpc).toContain("z.string().regex(/^ext_[a-zA-Z0-9_-]+$/)")
    expect(mainIpc).toContain('extensionPackageStore.install(')
    expect(mainIpc).toContain('extensionPackageStore.uninstall(')
    expect(mainIpc).toContain('extensionPackageStore.rollback(')
    expect(mainIpc).toContain('extensionPackageStore.trustStatus()')
  })

  it('provides a read-only extension view in the developer inspector', async () => {
    const developerPanel = await readFile(new URL('../src/renderer/src/components/DeveloperPanel.tsx', import.meta.url), 'utf8')
    expect(developerPanel).toContain('window.novelAPI.extensions.list()')
    expect(developerPanel).toContain('window.novelAPI.extensions.permissionPreview(')
    expect(developerPanel).toContain('window.novelAPI.extensions.preview(')
    expect(developerPanel).toContain("uiText('extensionsPermissions')")
    expect(developerPanel).not.toContain('executeExtension')
  })

  it('lets the renderer pass registered importer extensions and custom exporter formats', async () => {
    const shared = await readFile(new URL('../src/shared/ipc.ts', import.meta.url), 'utf8')
    const preload = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
    const mainIpc = await readFile(new URL('../src/main/ipc.ts', import.meta.url), 'utf8')
    const main = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    const io = await readFile(new URL('../src/renderer/src/components/ImportExportActions.tsx', import.meta.url), 'utf8')

    expect(shared).toContain('pickTextImport(extensions?: readonly string[])')
    expect(shared).toContain('pickExportSave(format: import(\'./chapter\').ExportFormat)')
    expect(preload).toContain('pickTextImport: (extensions?: readonly string[])')
    expect(preload).toContain('pickExportSave: (format: import(\'../shared/chapter\').ExportFormat)')
    expect(mainIpc).toContain('extensionRegistry.snapshot().importers')
    expect(mainIpc).toContain('extensionRegistry.snapshot().exporters')
    expect(mainIpc).toContain('extensionRegistry.snapshot().exporters.some')
    expect(main).toContain('extensions:')
    expect(io).toContain('window.novelAPI.extensions.list()')
    expect(io).toContain('importer.extensions')
    expect(io).toContain('exporter.format')
  })

  it('exposes one bounded Story Bible search surface to Command Palette', async () => {
    const shared = await readFile(new URL('../src/shared/story.ts', import.meta.url), 'utf8')
    const ipc = await readFile(new URL('../src/shared/ipc.ts', import.meta.url), 'utf8')
    const preload = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
    const mainIpc = await readFile(new URL('../src/main/ipc.ts', import.meta.url), 'utf8')
    const palette = await readFile(new URL('../src/renderer/src/components/CommandPalette.tsx', import.meta.url), 'utf8')
    expect(shared).toContain('searchAll(query: string): Promise<Result<StorySearchResult[]>>')
    expect(ipc).toContain("storySearchAll: 'story:search-all'")
    expect(preload).toContain('searchAll: (query: string) => ipcRenderer.invoke(IPC.storySearchAll, query)')
    expect(mainIpc).toContain('storyService.searchAll(')
    expect(palette).toContain('window.novelAPI.story.searchAll(q)')
    expect(palette).toContain('result.kind === \'timeline\'')
    expect(palette).toContain('onOpenStoryResult')
  })

  it('keeps relation search results able to open the Graph edge inspector', async () => {
    const story = await readFile(new URL('../src/shared/story.ts', import.meta.url), 'utf8')
    const service = await readFile(new URL('../src/main/services/story-service.ts', import.meta.url), 'utf8')
    const palette = await readFile(new URL('../src/renderer/src/components/CommandPalette.tsx', import.meta.url), 'utf8')
    const app = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    const graph = await readFile(new URL('../src/renderer/src/components/GraphStudio.tsx', import.meta.url), 'utf8')
    expect(story).toContain("'relation'")
    expect(service).toContain('relation_type LIKE ?')
    expect(palette).toContain('onOpenStoryResult?.(result)')
    expect(app).toContain('result.kind === \'relation\'')
    expect(graph).toContain('focusRelationId')
  })
})
