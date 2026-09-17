import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Right Panel keyboard navigation contract', () => {
  it('uses a roving tab index and supports horizontal/home/end navigation', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/RightPanel.tsx', import.meta.url), 'utf8')
    expect(source).toContain('tabIndex={activeTab === tab ? 0 : -1}')
    expect(source).toContain('onRightTabKeyDown')
    expect(source).toContain("event.key === 'ArrowRight'")
    expect(source).toContain("event.key === 'ArrowLeft'")
    expect(source).toContain("event.key === 'Home'")
    expect(source).toContain("event.key === 'End'")
  })
})
