import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('project menu backup actions', () => {
  it('routes backup and index actions through the controlled action state', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')

    expect(source).toContain("uiText('backupCreate')")
    expect(source).toContain("uiText('backupCreateIncremental')")
    expect(source).toContain("uiText('repairIndexes')")
    expect(source).toContain("setBackupAction('create')")
    expect(source).toContain("setBackupAction('incremental')")
    expect(source).toContain("setBackupAction('repair')")
    expect(source).toContain('onActionHandled={() => setBackupAction(null)}')
  })

  it('exposes explicit project archive import and export actions', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    const backup = await readFile(new URL('../src/renderer/src/components/BackupActions.tsx', import.meta.url), 'utf8')

    expect(source).toContain("uiText('projectArchiveExport')")
    expect(source).toContain("uiText('projectArchiveImport')")
    expect(source).toContain("triggerBackupAction('project-export')")
    expect(source).toContain("triggerBackupAction('project-import')")
    expect(backup).toContain("'project-export'")
    expect(backup).toContain("'project-import'")
  })

  it('keeps the original Bot toggle when the right panel is collapsed', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')

    expect(source).toContain('<Bot size={15} />')
    expect(css).toContain('.right-panel-top-toggle')
  })

  it('keeps project menu entries aligned and keyboard accessible', async () => {
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(css).toContain('.project-menu-dropdown .menu-item{display:flex')
    expect(css).toContain('.project-menu-dropdown .menu-item:focus-visible')
  })
})
