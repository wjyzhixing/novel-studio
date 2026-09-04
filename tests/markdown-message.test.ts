import { describe, expect, it } from 'vitest'
import { markdownToHtml } from '../src/renderer/src/lib/markdown'
import { sanitizeMarkdownHtml } from '../src/renderer/src/components/MarkdownMessage'

describe('Markdown chat rendering safety', () => {
  it('removes event handlers and dangerous URLs in every common attribute form', () => {
    const unsafe = `<a href="javascript:alert(1)" onclick="alert(2)">x</a><img src=data:text/html,bad onerror=alert(3)>`
    const safe = sanitizeMarkdownHtml(unsafe)
    expect(safe).not.toMatch(/javascript|data:text\/html|onclick|onerror/i)
  })

  it('does not turn raw HTML from an answer into executable markup', () => {
    const html = sanitizeMarkdownHtml(markdownToHtml('<script>alert(1)</script>\n\n**正文**'))
    expect(html).not.toContain('<script>')
    expect(html).toContain('<strong>正文</strong>')
  })
})
