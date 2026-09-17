import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('design system token contract', () => {
  it('loads dark-first tokens and applies them to the workbench shell', async () => {
    const entry = await readFile(new URL('../src/renderer/src/main.tsx', import.meta.url), 'utf8')
    const tokens = await readFile(new URL('../src/renderer/src/styles/tokens.css', import.meta.url), 'utf8')
    const app = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')

    expect(entry).toContain("import './styles/tokens.css'")
    expect(tokens).toContain('--ns-color-accent:')
    expect(tokens).toContain('--ns-control-height:')
    expect(tokens).toContain('--ns-motion-fast:')
    expect(app).toContain('var(--ns-color-app)')
    expect(app).toContain('border-bottom:1px solid var(--ns-color-border)')
    expect(app).toContain('.right-panel{background:var(--ns-color-panel)')
    expect(app).toContain('transition:background-color var(--ns-motion-fast)')
    expect(app).toContain('height:var(--ns-control-height)')
  })

  it('provides an explicit light palette and follows the operating-system preference', async () => {
    const tokens = await readFile(new URL('../src/renderer/src/styles/tokens.css', import.meta.url), 'utf8')
    expect(tokens).toContain('[data-theme="light"]')
    expect(tokens).toContain('--ns-color-app: #f5f6f8')
    expect(tokens).toContain('@media (prefers-color-scheme: light)')
    expect(tokens).toContain('color-scheme: light')
  })

  it('offers a persistent system/dark/light preference in the shell', async () => {
    const app = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    expect(app).toContain("type ThemePreference = 'system' | 'dark' | 'light'")
    expect(app).toContain('document.documentElement.dataset.theme')
    expect(app).toContain('themeSystem')
    expect(app).toContain('themeLight')
    expect(app).toContain('novel-studio:theme')
  })

  it('maps Welcome and core editor surfaces to light semantic tokens', async () => {
    const app = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(app).toContain(':root[data-theme="light"] .welcome-card')
    expect(app).toContain(':root[data-theme="light"] .editor-shell')
    expect(app).toContain(':root:not([data-theme="dark"]) .welcome-card')
    expect(app).toContain(':root:not([data-theme="dark"]) .novel-editor')
    expect(app).toContain('box-shadow:0 30px 80px rgba(30,38,55,.16)')
  })

  it('maps high-frequency Agent, illustration, and backup surfaces to light tokens', async () => {
    const rightPanel = await readFile(new URL('../src/renderer/src/styles/right-panel.css', import.meta.url), 'utf8')
    const illustration = await readFile(new URL('../src/renderer/src/styles/illustration.css', import.meta.url), 'utf8')
    const backup = await readFile(new URL('../src/renderer/src/styles/backup.css', import.meta.url), 'utf8')
    expect(rightPanel).toContain(':root[data-theme="light"] .right-panel .ask-box')
    expect(illustration).toContain(':root[data-theme="light"] .asset-preview-modal>div')
    expect(backup).toContain(':root[data-theme="light"] .checkpoint-popover')
    expect(rightPanel).toContain('@media (prefers-color-scheme: light)')
    expect(illustration).toContain('var(--ns-color-border)')
    expect(backup).toContain('var(--ns-color-surface-raised)')
  })

  it('applies shared tokens to the update notification surface', async () => {
    const app = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(app).toContain('.update-card{border-color:var(--ns-color-border-strong)')
    expect(app).toContain('.update-card button{min-height:var(--ns-control-height)')
    expect(app).toContain('.update-card-ready{border-color:var(--ns-color-success)}')
  })

  it('applies shared tokens to the project integrity dialog', async () => {
    const health = await readFile(new URL('../src/renderer/src/styles/health.css', import.meta.url), 'utf8')
    expect(health).toContain('.health-panel{border-color:var(--ns-color-border-strong)')
    expect(health).toContain('.health-summary.error{border-color:var(--ns-color-danger)')
    expect(health).toContain('.health-panel>footer .health-primary{border-color:var(--ns-color-accent)')
  })

  it('applies shared tokens to provider settings controls', async () => {
    const app = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(app).toContain('.provider-settings{border-color:var(--ns-color-border-strong)')
    expect(app).toContain('.provider-body main input,.provider-body main select{height:var(--ns-control-height)')
    expect(app).toContain('.provider-actions button.primary{border-color:var(--ns-color-accent)')
  })

  it('applies shared tokens to Developer Inspector surfaces', async () => {
    const developer = await readFile(new URL('../src/renderer/src/styles/developer.css', import.meta.url), 'utf8')
    expect(developer).toContain('.developer-runs,.developer-detail{border-color:var(--ns-color-border)')
    expect(developer).toContain('.developer-toolbar button{min-height:var(--ns-control-height)')
    expect(developer).toContain('.developer-nodes button.active{border-color:var(--ns-color-accent)')
  })

  it('applies shared tokens and the Agent icon to graph and workflow workspaces', async () => {
    const graph = await readFile(new URL('../src/renderer/src/styles/graph.css', import.meta.url), 'utf8')
    const graphMeta = await readFile(new URL('../src/renderer/src/styles/graph-meta.css', import.meta.url), 'utf8')
    const app = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    const graphSource = await readFile(new URL('../src/renderer/src/components/GraphStudio.tsx', import.meta.url), 'utf8')
    const workflowSource = await readFile(new URL('../src/renderer/src/components/WorkflowEditor.tsx', import.meta.url), 'utf8')

    expect(graph).toContain('.graph-shell{background:var(--ns-color-app)')
    expect(graph).toContain('border-bottom:1px solid var(--ns-color-border)')
    expect(app).toContain('.workflow-shell{background:var(--ns-color-app)')
    expect(app).toContain('.workflow-properties{border-left:1px solid var(--ns-color-border)')
    expect(app).toContain('.properties-toggle-control{color:var(--ns-color-text-muted)')
    expect(graph).toContain(':root[data-theme="light"] .graph-block')
    expect(graphMeta).toContain(':root[data-theme="light"] .graph-search-group')
    expect(app).toContain(':root[data-theme="light"] .workflow-block')
    expect(app).toContain(':root[data-theme="light"] .workflow-message')
    expect(graphSource).toContain('Bot,')
    expect(workflowSource).toContain('Bot,')
    expect(graphSource).toContain('<Bot size={15} aria-hidden="true" />')
    expect(workflowSource).toContain('<Bot size={15} aria-hidden="true" />')
  })
})
