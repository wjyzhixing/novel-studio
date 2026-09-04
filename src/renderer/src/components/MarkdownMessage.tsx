import { useState } from 'react'
import { markdownToHtml } from '../lib/markdown'

export function sanitizeMarkdownHtml(html: string): string {
  return html
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, (attribute) => {
      const normalized = attribute.toLowerCase()
      return normalized.includes('javascript:') || normalized.includes('data:text/html') || normalized.includes('vbscript:') ? '' : attribute
    })
}

export function MarkdownMessage({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)
  const html = sanitizeMarkdownHtml(markdownToHtml(content))
  const copy = async () => {
    try { await navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1400) } catch { /* clipboard permission is optional */ }
  }
  return <div className="chat-markdown-message">
    <div className="chat-markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
    <button type="button" className="chat-copy-button" onClick={() => void copy()}>{copied ? '已复制' : '复制内容'}</button>
  </div>
}
