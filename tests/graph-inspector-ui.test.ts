import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Graph selected entity inspector UI contract', () => {
  it('renders a selected entity inspector with adjacent relation exploration', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/GraphStudio.tsx', import.meta.url), 'utf8')
    expect(source).toContain("import { getAdjacentRelations }")
    expect(source).toContain('data-testid="graph-entity-inspector"')
    expect(source).toContain('graphAdjacentRelations')
    expect(source).toContain('graphInspectEntity')
    expect(source).toContain('graphFocusNeighbor')
  })

  it('exposes a human-gated Canon proposal action for edited relations', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/GraphStudio.tsx', import.meta.url), 'utf8')
    expect(source).toContain('proposeRelationUpdate')
    expect(source).toContain('data-testid="graph-relation-propose"')
    expect(source).toContain('graphProposeRelation')
  })

  it('styles long entity details and neighbor controls without overflow', async () => {
    const css = await readFile(new URL('../src/renderer/src/styles/graph.css', import.meta.url), 'utf8')
    expect(css).toContain('.graph-entity-inspector')
    expect(css).toContain('.graph-entity-inspector button:hover')
    expect(css).toContain('overflow-wrap:anywhere')
    expect(css).toContain('.graph-entity-neighbors')
  })

  it('provides bilingual labels for entity inspection and relation direction', async () => {
    const source = await readFile(new URL('../src/renderer/src/lib/i18n.ts', import.meta.url), 'utf8')
    expect(source).toContain('graphInspectEntity')
    expect(source).toContain('graphAdjacentRelations')
    expect(source).toContain('graphFocusNeighbor')
    expect(source).toContain('graphIncoming')
    expect(source).toContain('graphOutgoing')
  })
})
