import { buildDiff } from '../../../shared/diff'

export interface DiffPreviewPart {
  kind: 'equal' | 'add' | 'remove'
  text: string
}

/** Builds presentation data only; neither input is mutated. */
export function buildDiffPreview(original: string, suggested: string): DiffPreviewPart[] {
  return buildDiff(original, suggested).map((part) => ({ ...part }))
}

export function addedPreviewText(original: string, suggested: string): string {
  return buildDiffPreview(original, suggested).filter((part) => part.kind !== 'remove').map((part) => part.text).join('')
}
