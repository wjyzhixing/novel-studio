import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText } from '../src/renderer/src/lib/i18n'

describe('MarkdownMessage i18n contract', () => {
  it('provides bilingual copy labels for the message action', () => {
    expect(getUiText('zh-CN', 'chatActionCopy')).toBe('复制')
    expect(getUiText('en-US', 'chatActionCopy')).toBe('Copy')
    expect(getUiText('zh-CN', 'chatCopied')).toBe('已复制回答')
    expect(getUiText('en-US', 'chatCopied')).toBe('Answer copied')
  })

  it('routes the copy button through locale keys', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/MarkdownMessage.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain("copied ? '已复制' : '复制内容'")
    expect(source).toContain('useUiText()')
    expect(source).toContain("uiText('chatCopied')")
    expect(source).toContain("uiText('chatActionCopy')")
  })
})
