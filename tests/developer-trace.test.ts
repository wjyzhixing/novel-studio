import { describe, expect, it } from 'vitest'
import { buildNodeTrace, filterTraceLogs } from '../src/renderer/src/lib/developer-trace'

describe('developer trace model', () => {
  it('filters logs case-insensitively and keeps all logs for an empty query', () => {
    expect(filterTraceLogs(['Provider connected', 'Retrying node', 'DONE'], 'retry')).toEqual(['Retrying node'])
    expect(filterTraceLogs(['Provider connected', 'Retrying node'], '  ')).toEqual(['Provider connected', 'Retrying node'])
  })

  it('orders trace entries by start time and keeps undated nodes last', () => {
    const result = buildNodeTrace([
      { nodeId: 'late', status: 'succeeded', input: null, attempts: 1, log: [], startedAt: '2026-01-01T00:00:02.000Z', finishedAt: '2026-01-01T00:00:03.000Z' },
      { nodeId: 'unknown', status: 'pending', input: null, attempts: 0, log: [] },
      { nodeId: 'first', status: 'running', input: null, attempts: 1, log: [], startedAt: '2026-01-01T00:00:01.000Z' }
    ])
    expect(result.map((entry) => entry.nodeId)).toEqual(['first', 'late', 'unknown'])
    expect(result[0]).toMatchObject({ durationMs: null, hasTiming: false })
    expect(result[1]).toMatchObject({ durationMs: 1000, hasTiming: true })
  })
})
