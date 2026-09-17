import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('sidebar chapter virtualization contract', () => {
  it('uses explicit CSS variables for virtual geometry instead of typed attr arithmetic', async () => {
    const component = await readFile(new URL('../src/renderer/src/components/Sidebar.tsx', import.meta.url), 'utf8')
    const styles = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    expect(component).toContain("--chapter-count")
    expect(component).toContain("--chapter-offset")
    expect(styles).toContain('height:calc(var(--chapter-count) * var(--chapter-row-height))')
    expect(styles).toContain('transform:translateY(var(--chapter-offset))')
    expect(styles).not.toContain('calc(attr(data-count type(<number>))')
  })

  it('keeps the whole explorer reachable when volumes exceed the viewport', async () => {
    const styles = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')
    const sidebarRule = [...styles.matchAll(/\.sidebar\{[^}]*\}/g)].at(-1)?.[0] ?? ''
    expect(sidebarRule).toContain('overflow-y:auto')
    expect(sidebarRule).toContain('overflow-x:hidden')
    expect(sidebarRule).not.toContain('overflow:hidden')
  })
})
