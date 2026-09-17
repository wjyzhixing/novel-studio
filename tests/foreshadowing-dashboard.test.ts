import { describe, expect, it } from 'vitest'
import { buildForeshadowingDashboard } from '../src/renderer/src/lib/foreshadowing-dashboard'
import type { ForeshadowingRecord } from '../src/shared/story'

const record = (overrides: Partial<ForeshadowingRecord>): ForeshadowingRecord => ({
  id: 'art_1', title: '黑色芯片', setup: '出现', target: '身份揭示', payoffDeadline: '', status: 'planned', evidence: '', evidenceItems: [], relatedChapters: [], notes: '', updatedAt: '2026-09-09', ...overrides
})

describe('foreshadowing dashboard summary', () => {
  it('counts lifecycle states and calculates resolution progress', () => {
    expect(buildForeshadowingDashboard([
      record({ id: 'art_1', status: 'planned' }),
      record({ id: 'art_2', status: 'resolved', evidence: 'chapter quote' }),
      record({ id: 'art_3', status: 'abandoned', evidenceItems: [{ chapterRelPath: 'chapters/001.md', quote: '证据', note: '' }] })
    ])).toEqual({ total: 3, statusCounts: { planned: 1, planted: 0, echoed: 0, resolved: 1, abandoned: 1 }, resolvedPercent: 33, evidencePercent: 67, missingEvidenceIds: ['art_1'] })
  })

  it('handles an empty project without producing NaN percentages', () => {
    expect(buildForeshadowingDashboard([])).toEqual({ total: 0, statusCounts: { planned: 0, planted: 0, echoed: 0, resolved: 0, abandoned: 0 }, resolvedPercent: 0, evidencePercent: 0, missingEvidenceIds: [] })
  })
})
