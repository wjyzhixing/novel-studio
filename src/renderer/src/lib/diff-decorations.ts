import { buildDiff } from '../../../shared/diff'

export type SuggestionDecorationKind = 'equal' | 'add' | 'remove' | 'replace'
export interface SuggestionDecoration {
  kind: SuggestionDecorationKind
  text: string
  className: `ai-diff-${SuggestionDecorationKind}`
}

export interface SuggestionChangeRegion {
  id: string
  original: string
  replacement: string
  originalStart: number
  originalEnd: number
}

/** Presentation-only diff data. The canonical Markdown is never changed. */
export function buildSuggestionDecorations(original: string, suggested: string): SuggestionDecoration[] {
  const source = buildDiff(original, suggested)
  const result: SuggestionDecoration[] = []
  for (let index = 0; index < source.length; index += 1) {
    const segment = source[index]
    const next = source[index + 1]
    const replacement = segment.kind === 'remove' && next?.kind === 'add'
    const kind: SuggestionDecorationKind = replacement ? 'replace' : segment.kind
    const className = `ai-diff-${kind}` as `ai-diff-${SuggestionDecorationKind}`
    result.push({ kind, text: segment.text, className })
    if (replacement) { result.push({ kind: 'add', text: next.text, className: 'ai-diff-add' }); index += 1 }
  }
  return result
}

/** Return contiguous changed regions for selective review of a suggestion. */
export function buildSuggestionRegions(original: string, suggested: string): SuggestionChangeRegion[] {
  const regions: SuggestionChangeRegion[] = []
  let originalCursor = 0
  let suggestedCursor = 0
  let current: SuggestionChangeRegion | null = null
  const flush = () => {
    if (current) regions.push(current)
    current = null
  }
  for (const segment of buildDiff(original, suggested)) {
    if (segment.kind === 'equal') {
      originalCursor += Array.from(segment.text).length
      suggestedCursor += Array.from(segment.text).length
      flush()
      continue
    }
    if (!current) current = { id: `region-${regions.length + 1}`, original: '', replacement: '', originalStart: originalCursor, originalEnd: originalCursor }
    if (segment.kind === 'remove') {
      current.original += segment.text
      originalCursor += Array.from(segment.text).length
      current.originalEnd = originalCursor
    } else {
      current.replacement += segment.text
      suggestedCursor += Array.from(segment.text).length
    }
  }
  flush()
  return regions
}

/** Materialize a new candidate containing only the requested changed region. */
export function applySuggestionRegion(original: string, region: SuggestionChangeRegion): string {
  const characters = Array.from(original)
  return [...characters.slice(0, region.originalStart), ...Array.from(region.replacement), ...characters.slice(region.originalEnd)].join('')
}
