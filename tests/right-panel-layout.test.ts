import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('right Agent selection controls layout', () => {
  it('allows the title row and selection actions to wrap without horizontal overflow', async () => {
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(css).toContain('.agent-title{')
    expect(css).toContain('flex-wrap:wrap')
    expect(css).toContain('.agent-title>button')
    expect(css).toContain('max-width:100%')
    expect(css).toContain('overflow-wrap:anywhere')
  })

  it('keeps long Agent and Workflow content vertically scrollable without a horizontal scrollbar', async () => {
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.right-scroll\{[^}]*min-width:0[^}]*overflow-x:hidden[^}]*overflow-y:auto/)
  })

  it('wraps long Workflow node ids and diagnostics inside the runtime card', async () => {
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(css).toContain('.runtime-card{min-width:0')
    expect(css).toMatch(/\.runtime-node\{[^}]*min-width:0/)
    expect(css).toMatch(/\.runtime-node>span,\.runtime-node>em,\.runtime-node>small\{[^}]*overflow-wrap:anywhere/)
  })

  it('routes the image action to one mutually exclusive workspace', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/<RightPanel onOpenImages=\{\(\) => \{ setImagesOpen\(true\); setWorkflowOpen\(false\); setGraphOpen\(false\); setStorySection\(null\)/)
  })

  it('keeps the Bot icon as the topbar toggle', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(source).toContain("className={`right-panel-top-toggle${rightPanelCollapsed ? ' collapsed' : ' active'}`}")
    expect(source).toContain('<Bot size={15} />')
  })

  it('exposes the Bot toggle state to assistive technology', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')

    expect(source).toContain('aria-pressed={rightPanelCollapsed}')
  })

  it('keeps the original topbar Bot interaction states', async () => {
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')

    expect(css).toContain('.right-panel-top-toggle:hover')
  })

  it('keeps the topbar Bot stateful', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    expect(source).toContain('aria-pressed={rightPanelCollapsed}')
  })

  it('keeps the original Bot collapse control in the topbar', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/RightPanel.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('className="right-panel-collapse"')
  })

  it('keeps the original topbar Bot toggle when the right panel is collapsed', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')

    expect(source).toContain("className={`right-panel-top-toggle${rightPanelCollapsed ? ' collapsed' : ' active'}`}")
    expect(source).toContain('data-testid="right-panel-toggle"')
    expect(source).toContain('aria-pressed={rightPanelCollapsed}')
    expect(source).toContain("!rightPanelCollapsed ? `2px ${rightPanelWidth}px` : ''")
    expect(css).toContain('.right-panel-top-toggle.collapsed')
    expect(source).not.toContain('className="right-panel-collapsed-rail"')
  })

  it('removes the right panel from the workbench grid when collapsed', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')

    expect(source).toContain("!rightPanelCollapsed ? `2px ${rightPanelWidth}px` : ''")
  })

  it('persists sidebar collapse choices with the project layout', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    expect(source).toContain('leftSidebarCollapsed: false')
    expect(source).toContain('rightPanelCollapsed: false')
    expect(source).toContain('typeof parsed.leftSidebarCollapsed === \'boolean\'')
    expect(source).toContain('typeof parsed.rightPanelCollapsed === \'boolean\'')
    expect(source).toContain('setLeftSidebarCollapsed(layout.leftSidebarCollapsed)')
    expect(source).toContain('setRightPanelCollapsed(layout.rightPanelCollapsed)')
    expect(source).toContain('leftSidebarCollapsed, rightPanelWidth, rightPanelCollapsed')
    expect(source).toContain('layoutReadyFor')
    expect(source).toContain('layoutReadyFor !== rootPath')
  })
})
