import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('foreshadowing dashboard UI contract', () => {
  it('renders lifecycle summary, evidence warning, and filter actions', async () => {
    const component = await readFile(new URL('../src/renderer/src/components/BottomPanel.tsx', import.meta.url), 'utf8')
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(component).toContain('foreshadow-dashboard-stats')
    expect(component).toContain('foreshadow-dashboard-warning')
    expect(component).toContain('setForeshadowingStatus(status)')
    expect(css).toContain('.foreshadow-dashboard-stats button:hover')
    expect(css).toContain('.foreshadow-dashboard-warning')
  })
})
