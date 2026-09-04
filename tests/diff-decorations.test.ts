import { describe, expect, it } from 'vitest'
import { applySuggestionRegion, buildSuggestionDecorations, buildSuggestionRegions } from '../src/renderer/src/lib/diff-decorations'

describe('suggestion diff decorations', () => {
  it('exposes equal, remove and add content without mutating either source', () => {
    const original = '雨落在屋檐'
    const suggested = '雨落在青石板屋檐'
    const result = buildSuggestionDecorations(original, suggested)
    expect(result).toEqual([
      { kind: 'equal', text: '雨落在', className: 'ai-diff-equal' },
      { kind: 'add', text: '青石板', className: 'ai-diff-add' },
      { kind: 'equal', text: '屋檐', className: 'ai-diff-equal' }
    ])
    expect(original).toBe('雨落在屋檐')
    expect(suggested).toBe('雨落在青石板屋檐')
  })

  it('marks replacement pairs distinctly while preserving both sides', () => {
    const result = buildSuggestionDecorations('旧句', '新句')
    expect(result.map((item) => item.kind)).toEqual(['replace', 'add', 'equal'])
    expect(result.map((item) => item.text).join('')).toBe('旧新句')
  })

  it('splits multiple changed regions and can materialize only one region', () => {
    const original = '甲旧乙。\n\n丙旧丁。'
    const suggested = '甲新乙。\n\n丙新丁。'
    const regions = buildSuggestionRegions(original, suggested)
    expect(regions).toHaveLength(2)
    expect(regions.map((region) => [region.original, region.replacement])).toEqual([['旧', '新'], ['旧', '新']])
    expect(applySuggestionRegion(original, regions[0])).toBe('甲新乙。\n\n丙旧丁。')
  })
})
