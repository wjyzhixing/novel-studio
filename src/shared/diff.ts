import type { DiffSegment } from './ai-edit'

/** Deterministic character diff; works for both CJK and Latin without a model. */
export function buildDiff(original: string, suggested: string): DiffSegment[] {
  const a = Array.from(original)
  const b = Array.from(suggested)
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const parts: DiffSegment[] = []
  const push = (kind: DiffSegment['kind'], text: string) => {
    if (!text) return
    const previous = parts.at(-1)
    if (previous?.kind === kind) previous.text += text
    else parts.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push('equal', a[i]); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('remove', a[i]); i++ }
    else { push('add', b[j]); j++ }
  }
  while (i < a.length) push('remove', a[i++])
  while (j < b.length) push('add', b[j++])
  return parts
}

export type ParagraphDiffKind = 'equal' | 'changed' | 'added' | 'removed'

export interface ParagraphDiff {
  kind: ParagraphDiffKind
  original: string
  replacement: string
  segments: DiffSegment[]
}

function splitParagraphs(value: string): string[] {
  return value.replace(/\r\n/g, '\n').split(/\n{2,}/)
}

/** Preserves equal paragraph anchors and gives changed paragraphs a character-level diff. */
export function buildParagraphDiff(original: string, replacement: string): ParagraphDiff[] {
  const before = splitParagraphs(original)
  const after = splitParagraphs(replacement)
  const common = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0))
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      common[i][j] = before[i] === after[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1])
    }
  }
  const anchors: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) { anchors.push([i, j]); i++; j++ }
    else if (common[i + 1][j] >= common[i][j + 1]) i++
    else j++
  }
  const result: ParagraphDiff[] = []
  const push = (left: string | undefined, right: string | undefined) => {
    const kind: ParagraphDiffKind = left === undefined ? 'added' : right === undefined ? 'removed' : left === right ? 'equal' : 'changed'
    result.push({ kind, original: left ?? '', replacement: right ?? '', segments: buildDiff(left ?? '', right ?? '') })
  }
  let beforeCursor = 0
  let afterCursor = 0
  for (const [beforeAnchor, afterAnchor] of anchors) {
    const unmatchedCount = Math.max(beforeAnchor - beforeCursor, afterAnchor - afterCursor)
    for (let offset = 0; offset < unmatchedCount; offset++) push(before[beforeCursor + offset], after[afterCursor + offset])
    push(before[beforeAnchor], after[afterAnchor])
    beforeCursor = beforeAnchor + 1
    afterCursor = afterAnchor + 1
  }
  const tailCount = Math.max(before.length - beforeCursor, after.length - afterCursor)
  for (let offset = 0; offset < tailCount; offset++) push(before[beforeCursor + offset], after[afterCursor + offset])
  return result
}
