import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Graph Studio golden-path selectors', () => {
  it('exposes stable selectors for opening and editing a relation', async () => {
    const sidebar = await readFile(new URL('../src/renderer/src/components/Sidebar.tsx', import.meta.url), 'utf8')
    const graph = await readFile(new URL('../src/renderer/src/components/GraphStudio.tsx', import.meta.url), 'utf8')
    expect(sidebar).toContain('data-testid="graph-open"')
    expect(graph).toContain('data-testid="graph-relation-edge"')
    expect(graph).toContain('data-testid="graph-relation-type"')
    expect(graph).toContain('data-testid="graph-relation-metadata"')
    expect(graph).toContain('data-testid="graph-relation-save"')
    expect(graph).toContain('data-testid="graph-relation-delete"')
    expect(graph).toContain('data-testid="graph-focus-neighborhood"')
    expect(graph).toContain('data-testid="graph-clear-focus"')
    expect(graph).toContain('data-testid="graph-neighborhood-depth"')
  })
})
