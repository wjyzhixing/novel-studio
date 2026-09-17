import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('WorkflowEditor node accessibility contract', () => {
  it('makes workflow nodes focusable and keyboard-activatable with a visible selected state', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/WorkflowEditor.tsx', import.meta.url), 'utf8')

    expect(source).toContain('role="button"')
    expect(source).toContain('tabIndex={0}')
    expect(source).toContain('aria-pressed={selected}')
    expect(source).toContain('onKeyDown={')
    expect(source).toContain('event.key')
    expect(source).toContain('"Enter"')
    expect(source).toContain('" "')
  })
})
