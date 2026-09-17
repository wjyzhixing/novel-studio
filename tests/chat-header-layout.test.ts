import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('standalone Chat header selection chip layout', () => {
  it('does not apply the back-button width constraint to the selection chip', async () => {
    const component = await readFile(new URL('../src/renderer/src/components/ChatWorkspace.tsx', import.meta.url), 'utf8')
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(component).toContain('chat-selection-clear')
    expect(css).toContain('.chat-workspace-header>button:nth-of-type(2)')
    expect(css).toContain('.chat-selection-clear')
    expect(css).toContain('max-width:100%')
    expect(css).toContain('overflow-wrap:anywhere')
  })
})
