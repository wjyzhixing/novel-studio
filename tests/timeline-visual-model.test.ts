import { describe, expect, it } from 'vitest'
import { buildTimelineTrack, formatTimelineDate, formatTimelineGroupLabel } from '../src/renderer/src/lib/timeline-visual-model'
import type { TimelineEvent } from '../src/shared/story'

const event = (id: string, at: string | null, title = id): TimelineEvent => ({
  id,
  title,
  at,
  description: '',
  chapterRelPath: null,
  entityIds: [],
  locationId: null,
  causes: '',
  effects: '',
  updatedAt: '2026-01-01T00:00:00.000Z'
})

describe('timeline visual model', () => {
  it('formats timeline group labels for the active locale while preserving invalid dates', () => {
    expect(formatTimelineGroupLabel('2127-05-17T21:42:00Z', 'zh-CN', '未指定')).toContain('2127')
    expect(formatTimelineGroupLabel('not-a-date', 'en-US', 'Unspecified')).toBe('not-a-date')
    expect(formatTimelineGroupLabel(null, 'en-US', 'Unspecified')).toBe('Unspecified')
  })
  it('orders dated events and places them on a stable horizontal scale', () => {
    const track = buildTimelineTrack([event('late', '2127-05-03'), event('early', '2127-05-01'), event('middle', '2127-05-02')])

    expect(track.points.map((point) => point.event.id)).toEqual(['early', 'middle', 'late'])
    expect(track.points.map((point) => point.position)).toEqual([0, 0.5, 1])
    expect(track.minAt).toBe(Date.parse('2127-05-01'))
    expect(track.maxAt).toBe(Date.parse('2127-05-03'))
  })

  it('keeps undated events visible without corrupting the dated range', () => {
    const track = buildTimelineTrack([event('undated', null), event('dated', '2127-05-01')])

    expect(track.points.map((point) => point.event.id)).toEqual(['dated'])
    expect(track.undated.map((item) => item.id)).toEqual(['undated'])
    expect(track.minAt).toBe(Date.parse('2127-05-01'))
    expect(track.maxAt).toBe(Date.parse('2127-05-01'))
  })

  it('formats axis dates using the active UI locale', () => {
    const timestamp = Date.parse('2127-05-01T00:00:00.000Z')

    expect(formatTimelineDate(timestamp, 'zh-CN')).toContain('2127')
    expect(formatTimelineDate(timestamp, 'en-US')).toContain('2127')
    expect(formatTimelineDate(timestamp, 'zh-CN')).not.toBe(formatTimelineDate(timestamp, 'en-US'))
  })
})
