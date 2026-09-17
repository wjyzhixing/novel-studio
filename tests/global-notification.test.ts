import { describe, expect, it, vi } from 'vitest'
import { notifyGlobal } from '../src/renderer/src/lib/global-notification'

const messageComponents = [
  'CanonReview.tsx', 'DeveloperPanel.tsx', 'IllustrationStudio.tsx', 'ProjectHealthPanel.tsx',
  'ProviderSettings.tsx', 'RightPanel.tsx', 'ChatWorkspace.tsx', 'StoryBible.tsx', 'GraphStudio.tsx', 'WorkflowEditor.tsx'
]

describe('global notification bridge', () => {
  it('dispatches a typed notification event for non-empty feedback', () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })

    notifyGlobal('Workflow 已完成', 'success')

    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent
    expect(event.type).toBe('novel:global-notification')
    expect(event.detail).toEqual(expect.objectContaining({ message: 'Workflow 已完成', kind: 'success' }))
  })

  it('does not dispatch empty feedback', () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })

    notifyGlobal('   ')

    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('infers status color for hook-published feedback while honoring explicit kinds', () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })

    notifyGlobal('保存失败：磁盘不可写')
    notifyGlobal('项目已保存')
    notifyGlobal('需要关注：索引过期')
    notifyGlobal('操作失败', 'success')

    expect(dispatchEvent.mock.calls.map(([event]) => (event as CustomEvent).detail.kind)).toEqual(['error', 'success', 'warning', 'success'])
  })

  it('routes every renderer message surface through the global message hook', async () => {
    const { readFile } = await import('node:fs/promises')
    for (const name of messageComponents) {
      const source = await readFile(new URL(`../src/renderer/src/components/${name}`, import.meta.url), 'utf8')
      expect(source).toContain("useGlobalMessage")
    }
  })

  it('anchors the notification stack to the lower-right without horizontal overflow', async () => {
    const { readFile } = await import('node:fs/promises')
    const css = await readFile(new URL('../src/renderer/src/styles/backup.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.notification-center\{[^}]*position:fixed[^}]*bottom:20px[^}]*right:20px/)
    expect(css).not.toContain('position:fixed;z-index:1200;top:56px')
    expect(css).toContain('.global-notification-indicator{align-self:center')
    expect(css).toContain('.global-notification-message{flex:1;min-width:0')
  })

  it('uses shared design tokens for the notification surface and status rails', async () => {
    const { readFile } = await import('node:fs/promises')
    const css = await readFile(new URL('../src/renderer/src/styles/backup.css', import.meta.url), 'utf8')
    expect(css).toContain('.global-notification{border-color:var(--ns-color-border-strong)')
    expect(css).toContain('.global-notification-indicator{background:var(--ns-color-accent)')
    expect(css).toContain('.global-notification-error .global-notification-indicator{background:var(--ns-color-danger)')
  })
})
