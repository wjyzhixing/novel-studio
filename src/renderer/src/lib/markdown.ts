import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'

/**
 * Markdown <-> Tiptap HTML conversion (Sprint 2).
 * Markdown is the canonical on-disk format; the editor works on HTML
 * produced from it. Blueprint §8 / ADR-003: prose lives in .md files.
 */

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false
})

const td = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced'
})

td.addRule('novelAssetImage', {
  filter: (node) => node.nodeName === 'IMG' && Boolean(node.getAttribute('data-asset-id')),
  replacement: (_content, node) => {
    const assetId = node.getAttribute('data-asset-id')
    const alt = node.getAttribute('alt') ?? ''
    const src = node.getAttribute('src') ?? ''
    const sourcePath = node.getAttribute('data-asset-path')?.trim()
    const extension = sourcePath?.match(/\.(jpe?g|webp|gif|svg)$/i)?.[1].toLowerCase() ?? (src.match(/^data:image\/(jpeg|webp)/)?.[1] === 'jpeg' ? 'jpg' : src.match(/^data:image\/(webp)/)?.[1] ?? 'png')
    const title = node.getAttribute('title')?.trim()
    const markdownPath = sourcePath || `../assets/scenes/${assetId}.${extension}`
    return `![${alt}](${markdownPath} "${title && !title.startsWith('Asset 缺失') ? title : assetId}")`
  }
})

td.addRule('markdownTable', {
  filter: ['table'],
  replacement: (_content, node) => {
    const rows = Array.from(node.querySelectorAll('tr')).map((row) => Array.from(row.children).map((cell) => (cell.textContent ?? '').trim().replace(/\|/g, '\\|')))
    if (!rows.length) return ''
    const width = Math.max(...rows.map((row) => row.length))
    const normalized = rows.map((row) => [...row, ...Array.from({ length: Math.max(0, width - row.length) }, () => '')])
    const separator = Array.from({ length: width }, () => '---')
    return `\n| ${normalized[0].join(' | ')} |\n| ${separator.join(' | ')} |\n${normalized.slice(1).map((row) => `| ${row.join(' | ')} |`).join('\n')}\n`
  }
})

td.addRule('taskListItem', {
  filter: (node) => node.nodeName === 'LI' && (node.getAttribute('data-type') === 'taskItem' || /^\[[ xX]\]\s/.test(node.textContent?.trim() ?? '')),
  replacement: (content, node) => {
    const text = (node.textContent ?? '').trim()
    const taskNode = node.getAttribute('data-type') === 'taskItem'
    const checked = taskNode ? node.getAttribute('data-checked') === 'true' || Boolean(node.querySelector('input[checked]')) : /^\[[xX]\]/.test(text)
    const taskText = taskNode ? content.trim() : text.slice(3).trim()
    return `\n- [${checked ? 'x' : ' '}] ${taskText}\n`
  }
})

// Tiptap StarterKit emits <mark> for highlight; map it to nothing special.
td.addRule('mark', {
  filter: ['mark'],
  replacement: (_content, node) => {
    const text = node.textContent ?? ''
    return text
  }
})

/** Markdown (from disk) -> HTML (for Tiptap editor). */
export function markdownToHtml(source: string, projectRoot?: string): string {
  const html = md.render(source).replace(/<li>\[([ xX])\]\s*([\s\S]*?)<\/li>/g, (_match, checked: string, content: string) => `<li data-type="taskItem" data-checked="${checked.toLowerCase() === 'x'}"><label><input type="checkbox"${checked.toLowerCase() === 'x' ? ' checked="checked"' : ''}><span></span></label><div>${content}</div></li>`)
  if (!projectRoot) return html
  return html.replace(/<img\b[^>]*\bsrc="((?:\.\.?\/)?assets\/[^"?]+)"[^>]*>/g, (match, relPath: string) => {
    const title = match.match(/\stitle="([^"\r\n]*)"/i)?.[1]
    const decodedPath = (() => { try { return decodeURIComponent(relPath) } catch { return relPath } })()
    const assetId = title?.match(/^(asset_[a-zA-Z0-9_-]+)$/)?.[1] ?? decodedPath.split('/').pop()?.match(/^(asset_[a-zA-Z0-9_-]+)\./)?.[1]
    // Keep the stable ID in the DOM, but do not make the editor depend on
    // file:// loading. EditorPane hydrates this marker through the privileged
    // readAsset IPC and replaces it with a local Blob URL before mounting Tiptap.
    return assetId ? match.replace(/\ssrc="[^"]*"/, ` data-asset-id="${assetId}" data-asset-path="${decodedPath}" src=""`) : match.replace(/\ssrc="[^"]*"/, ' src=""')
  })
}

/** HTML (from Tiptap editor.getHTML()) -> Markdown (to persist to disk). */
export function htmlToMarkdown(html: string): string {
  return td.turndown(html).replace(/\]\(file:\/\/.*?\/(assets\/[^)]+)\)/g, ']($1)')
}
