import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('command palette accessibility contract', () => {
  it('exposes the searchable command list and active option to assistive technology', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/CommandPalette.tsx', import.meta.url), 'utf8')

    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain('role="listbox"')
    expect(source).toContain('role="option"')
    expect(source).toContain('aria-selected={globalIdx === selected}')
    expect(source).toContain('aria-activedescendant')
    expect(source).toContain('const dialogRef = useRef<HTMLDivElement | null>(null)')
    expect(source).toContain("event.key === 'Tab'")
    expect(source).toContain('event.preventDefault()')
    expect(source).toContain('ref={dialogRef}')
  })
})
