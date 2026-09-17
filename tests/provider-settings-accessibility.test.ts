import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('provider settings accessibility contract', () => {
  it('traps keyboard focus inside the modal and restores the previous focus', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ProviderSettings.tsx', import.meta.url), 'utf8')

    expect(source).toContain('const dialogRef = useRef<HTMLElement | null>(null)')
    expect(source).toContain('document.activeElement')
    expect(source).toContain("event.key === 'Tab'")
    expect(source).toContain('event.preventDefault()')
    expect(source).toContain('ref={dialogRef}')
  })
})
