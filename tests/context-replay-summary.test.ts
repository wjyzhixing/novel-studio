import { describe, expect, it } from 'vitest'
import { summarizeContextDifferences } from '../src/renderer/src/lib/context-replay-summary'

describe('Context Replay difference summary', () => {
  it('counts each change kind and calculates the token delta', () => {
    expect(summarizeContextDifferences([
      { source: 'a', kind: 'added', currentTokens: 10 },
      { source: 'b', kind: 'removed', previousTokens: 4 },
      { source: 'c', kind: 'changed', previousTokens: 8, currentTokens: 12 }
    ])).toEqual({ added: 1, removed: 1, changed: 1, previousTokens: 12, currentTokens: 22, tokenDelta: 10 })
  })

  it('treats missing token measurements as zero', () => {
    expect(summarizeContextDifferences([{ source: 'a', kind: 'added' }])).toEqual({ added: 1, removed: 0, changed: 0, previousTokens: 0, currentTokens: 0, tokenDelta: 0 })
  })
})
