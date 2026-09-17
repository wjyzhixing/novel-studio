import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('bottom panel accessibility contract', () => {
  it('exposes the bottom workspace tabs as a tablist with selected state', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/BottomPanel.tsx', import.meta.url), 'utf8')

    expect(source).toContain('role="tablist"')
    expect(source).toContain('role="tab"')
    expect(source).toContain('aria-selected={activeTab === tab}')
  })
})
