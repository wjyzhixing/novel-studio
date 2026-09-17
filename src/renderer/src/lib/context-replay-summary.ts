import type { ContextReplayDifference } from '../../../shared/context'

export type ContextDifferenceSummary = {
  added: number
  removed: number
  changed: number
  previousTokens: number
  currentTokens: number
  tokenDelta: number
}

export function summarizeContextDifferences(differences: readonly ContextReplayDifference[]): ContextDifferenceSummary {
  const summary = differences.reduce<ContextDifferenceSummary>((current, difference) => ({
    ...current,
    [difference.kind]: current[difference.kind] + 1,
    previousTokens: current.previousTokens + (difference.previousTokens ?? 0),
    currentTokens: current.currentTokens + (difference.currentTokens ?? 0)
  }), { added: 0, removed: 0, changed: 0, previousTokens: 0, currentTokens: 0, tokenDelta: 0 })
  return { ...summary, tokenDelta: summary.currentTokens - summary.previousTokens }
}
