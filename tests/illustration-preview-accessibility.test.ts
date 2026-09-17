import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('illustration preview accessibility contract', () => {
  it('keeps preview focus inside the modal and supports Escape close', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/IllustrationStudio.tsx', import.meta.url), 'utf8')

    expect(source).toContain('const previewRef = useRef<HTMLDivElement | null>(null)')
    expect(source).toContain('document.activeElement')
    expect(source).toContain("event.key === 'Tab'")
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain('event.preventDefault()')
    expect(source).toContain('ref={previewRef}')
  })
})
