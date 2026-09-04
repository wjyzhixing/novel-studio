export type SelectionSnapshot = {
  from: number
  to: number
  text: string
}

export type PersistedSelectionRange = { from: number; to: number }
export type PersistedSelectionMeta = { from?: number; to?: number; clear?: boolean }

type TextBlockLike = { isTextblock: boolean; textContent: string; nodeSize?: number }
type DocumentLike = { content: { size: number }; descendants: (callback: (node: TextBlockLike, position: number) => void) => void }

export function persistedSelectionContainsPosition(range: PersistedSelectionRange | null, position: number): boolean {
  return Boolean(range && position >= range.from && position < range.to)
}

export function nextPersistedSelection(current: PersistedSelectionRange | null, meta: PersistedSelectionMeta | undefined, docSize: number): PersistedSelectionRange | null {
  if (meta?.clear) return null
  if (typeof meta?.from !== 'number' || typeof meta.to !== 'number' || meta.to <= meta.from) return current
  const from = Math.max(0, Math.min(meta.from, docSize))
  const to = Math.max(from, Math.min(meta.to, docSize))
  return from < to ? { from, to } : null
}

export function captureSelectionSnapshot(doc: { textBetween: (from: number, to: number, blockSeparator?: string) => string }, from: number, to: number): SelectionSnapshot | null {
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  if (start === end) return null
  const text = doc.textBetween(start, end, '\n')
  return text.trim() ? { from: start, to: end, text } : null
}

export function selectionContainsText(snapshot: SelectionSnapshot | null, text: string): boolean {
  return Boolean(snapshot?.text.trim() && text.includes(snapshot.text))
}

/** Find a text selection in a freshly parsed ProseMirror document. */
export function findSelectionRangeByText(doc: DocumentLike, selectedText: string): PersistedSelectionRange | null {
  const needle = selectedText.trim()
  if (!needle) return null

  const blocks: Array<{ from: number; text: string }> = []
  doc.descendants((node, position) => {
    if (node.isTextblock && node.textContent) blocks.push({ from: position + 1, text: node.textContent })
  })
  const fullText = blocks.map((block) => block.text).join('\n')
  const offset = fullText.indexOf(needle)
  if (offset < 0) return null

  const endOffset = offset + needle.length
  let from: number | null = null
  let to: number | null = null
  let cursor = 0
  for (const block of blocks) {
    const blockEnd = cursor + block.text.length
    if (from === null && offset >= cursor && offset <= blockEnd) from = block.from + offset - cursor
    if (to === null && endOffset >= cursor && endOffset <= blockEnd) to = block.from + endOffset - cursor
    if (from !== null && to !== null) break
    cursor = blockEnd + 1
  }

  if (from === null || to === null || to <= from) return null
  return { from: Math.max(0, from), to: Math.min(doc.content.size, to) }
}
