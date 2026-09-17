import { describe, expect, it } from 'vitest'
import { addedPreviewText, buildDiffPreview } from '../src/renderer/src/lib/diff-preview'

describe('diff preview model', () => {
  it('preserves diff parts and returns the proposed text without removals', () => {
    const preview = buildDiffPreview('old line', 'new line')
    expect(preview).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'remove', text: 'old' }),
      expect.objectContaining({ kind: 'add', text: 'new' })
    ]))
    expect(addedPreviewText('old line', 'new line')).toContain('new')
    expect(addedPreviewText('same', 'same')).toBe('same')
  })
})
