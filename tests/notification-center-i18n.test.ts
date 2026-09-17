import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('notification center i18n contract', () => {
  it('routes global notification labels through locale keys', async () => {
    const component = await readFile(new URL('../src/renderer/src/components/NotificationCenter.tsx', import.meta.url), 'utf8')
    const i18n = await readFile(new URL('../src/renderer/src/lib/i18n.ts', import.meta.url), 'utf8')
    for (const key of ['globalNotifications', 'closeNotification']) expect(i18n).toContain(`${key}:`)
    expect(component).not.toContain('aria-label="全局通知"')
    expect(component).not.toContain('aria-label="关闭通知"')
    expect(component).toContain("uiText('globalNotifications')")
    expect(component).toContain("uiText('closeNotification')")
  })
})
