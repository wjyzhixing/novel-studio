import { describe, expect, it } from 'vitest'
import { buildDiff, buildParagraphDiff } from '../src/shared/diff'

describe('shared diff utilities', () => {
  it('handles empty, equal, and Unicode input deterministically', () => {
    expect(buildDiff('', '')).toEqual([])
    expect(buildDiff('同一段', '同一段')).toEqual([{ kind: 'equal', text: '同一段' }])
    expect(buildDiff('😀a', '😀b')).toEqual([
      { kind: 'equal', text: '😀' },
      { kind: 'remove', text: 'a' },
      { kind: 'add', text: 'b' }
    ])
  })

  it('preserves complete source and replacement text for insertions and removals', () => {
    const inserted = buildDiff('ab', 'aXYZb')
    expect(inserted.map((part) => part.text).join('')).toBe('aXYZb')
    expect(inserted.filter((part) => part.kind !== 'remove').map((part) => part.text).join('')).toBe('aXYZb')

    const removed = buildDiff('aXYZb', 'ab')
    expect(removed.map((part) => part.text).join('')).toBe('aXYZb')
    expect(removed.filter((part) => part.kind !== 'remove').map((part) => part.text).join('')).toBe('ab')
  })

  it('classifies equal, changed, added, and removed paragraphs', () => {
    const result = buildParagraphDiff('保留段落\n\n旧段落\n\n删除段落', '保留段落\n\n新段落\n\n新增段落')
    expect(result.map((part) => part.kind)).toEqual(['equal', 'changed', 'changed'])
    expect(result[0]).toMatchObject({ original: '保留段落', replacement: '保留段落', segments: [{ kind: 'equal', text: '保留段落' }] })
    expect(result[1].segments.some((segment) => segment.kind === 'remove')).toBe(true)
  })

  it('normalizes CRLF and aligns unmatched paragraph tails', () => {
    expect(buildParagraphDiff('第一段\r\n\r\n第二段', '第一段\n\n第二段\n\n第三段')).toEqual([
      expect.objectContaining({ kind: 'equal', original: '第一段' }),
      expect.objectContaining({ kind: 'equal', original: '第二段' }),
      expect.objectContaining({ kind: 'added', original: '', replacement: '第三段' })
    ])
    expect(buildParagraphDiff('仅有一段\n\n删除段', '仅有一段')).toEqual([
      expect.objectContaining({ kind: 'equal', original: '仅有一段' }),
      expect.objectContaining({ kind: 'removed', original: '删除段', replacement: '' })
    ])
  })
})
