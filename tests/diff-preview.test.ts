import { describe, expect, it } from 'vitest'
import { buildDiffPreview } from '../src/renderer/src/lib/diff-preview'

describe('inline AI diff preview', () => {
  it('keeps unchanged and added text separate without changing the source', () => {
    const original = '林默走进雨里。'
    const suggested = '林默撑着伞走进冰冷的雨里。'
    const preview = buildDiffPreview(original, suggested)

    expect(preview.filter((part) => part.kind === 'equal').map((part) => part.text).join('')).toContain('林默')
    expect(preview.filter((part) => part.kind === 'add').map((part) => part.text).join('')).toContain('撑着伞')
    expect(preview.map((part) => part.text).join('')).toBe(suggested)
    expect(original).toBe('林默走进雨里。')
  })

  it('retains removals for the review view while exposing replacement text', () => {
    const preview = buildDiffPreview('他迅速地跑过去。', '他跑过去。')
    expect(preview.some((part) => part.kind === 'remove' && part.text === '迅速地')).toBe(true)
    expect(preview.map((part) => part.text).join('')).toBe('他迅速地跑过去。')
  })
})
