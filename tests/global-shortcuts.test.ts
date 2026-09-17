import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('global IDE shortcuts', () => {
  it('routes Cmd/Ctrl+Shift+F to the existing full-project search palette', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')

    expect(source).toContain("if (e.key.toLowerCase() === 'f' && e.shiftKey)")
    expect(source).toContain("setFocusMode(false); setPaletteOpen(true); return")
    expect(source).toContain('<CommandPalette open={paletteOpen}')
  })

  it('does not advertise Shift+F as the Focus Mode shortcut', async () => {
    const i18n = await readFile(new URL('../src/renderer/src/lib/i18n.ts', import.meta.url), 'utf8')

    expect(i18n).toContain('focusModeHint:')
    expect(i18n).toContain('通过状态栏按钮切换 Focus Mode，Escape 退出')
    expect(i18n).toContain('Use the status bar button to toggle Focus Mode; Escape exits')
  })
})
