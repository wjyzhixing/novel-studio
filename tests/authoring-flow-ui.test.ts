import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('authoring flow UI contract', () => {
  it('renders the complete book-level stage list and persisted progress actions', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/AuthoringFlow.tsx', import.meta.url), 'utf8')
    for (const stage of ['premise', 'bible', 'outline', 'chapter_plan', 'chapter_writing', 'canon_review', 'full_revision', 'export']) expect(source).toContain(`id: '${stage}'`)
    expect(source).toContain('window.novelAPI.authoring.get()')
    expect(source).toContain('window.novelAPI.authoring.refresh()')
    expect(source).toContain('window.novelAPI.workflowRuntime.start')
    expect(source).toContain('window.novelAPI.workflowRuntime.onEvent')
    expect(source).toContain('completion.targetRelPath')
    expect(source).toContain('authoring.refresh()')
    expect(source).toContain('window.novelAPI.fullRevision.prepare()')
    expect(source).toContain('window.novelAPI.fullRevision.approve')
    expect(source).toContain('human.review')
    expect(source).toContain('Canon')
    expect(source).toContain('authoringSetupIncomplete')
    expect(source).toContain('authoringFoundation')
    expect(source).toContain('authoring.saveFoundation')
    expect(source).toContain('onOpenChapter(activeChapter.relPath)')
    expect(source).toContain('open-workflow-tab')
  })

  it('exposes a stable navigation event for the application shell', async () => {
    const app = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    const sidebar = await readFile(new URL('../src/renderer/src/components/Sidebar.tsx', import.meta.url), 'utf8')
    expect(app).toContain('AuthoringFlow')
    expect(app).toContain('authoringOpen')
    expect(sidebar).toContain('onOpenAuthoring')
    expect(sidebar).toContain('authoringFlow')
  })

  it('hands a started chapter run to the visible workflow review panel', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/RightPanel.tsx', import.meta.url), 'utf8')
    expect(source).toContain('open-workflow-tab')
    expect(source).toContain("setActiveTab('Workflow')")
  })
})
