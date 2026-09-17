import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Context Replay golden-path selectors', () => {
  it('exposes stable selectors for replay compatibility and per-source differences', async () => {
    const rightPanel = await readFile(new URL('../src/renderer/src/components/RightPanel.tsx', import.meta.url), 'utf8')
    expect(rightPanel).toContain('context-snapshot')
    expect(rightPanel).toContain('context-replay-compatibility')
    expect(rightPanel).toContain('context-differences')
    expect(rightPanel).toContain('context-difference')
    expect(rightPanel).toContain('context-difference-summary')
    expect(rightPanel).toContain('resultStrategy')
    expect(rightPanel).toContain('snapshotVersionSummary')
  })
})
