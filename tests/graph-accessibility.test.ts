import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('graph studio accessibility contract', () => {
  it('makes graph entities keyboard focusable and activatable', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/GraphStudio.tsx', import.meta.url), 'utf8')
    const styles = await readFile(new URL('../src/renderer/src/styles/graph.css', import.meta.url), 'utf8')

    expect(source).toContain('role="button"')
    expect(source).toContain('tabIndex={0}')
    expect(source).toContain('aria-label={`${data.label} · ${data.kind}`}')
    expect(source).toContain('event.key === "Enter"')
    expect(source).toContain('event.key === " "')
    expect(source).toContain('onClick={() => data.onActivate?.(data.entityId)}')
    expect(source).toContain('graphNodes(nextEntities, locale, activateEntity)')
    expect(styles).toContain('.graph-block:focus-visible')
  })
})
