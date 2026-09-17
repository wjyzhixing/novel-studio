import type { TimelineEvent } from '../../../shared/story'

export type TimelineLocale = 'zh-CN' | 'en-US'

export interface TimelinePoint { event: TimelineEvent; timestamp: number; position: number }
export interface TimelineTrack { points: TimelinePoint[]; undated: TimelineEvent[]; minAt: number | null; maxAt: number | null }

export function formatTimelineDate(timestamp: number, locale: TimelineLocale): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(timestamp)
}

export function formatTimelineGroupLabel(value: string | null, locale: TimelineLocale, unspecified: string): string {
  if (!value?.trim()) return unspecified
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? value : formatTimelineDate(timestamp, locale)
}

function timestampOf(event: TimelineEvent): number | null {
  if (!event.at?.trim()) return null
  const timestamp = Date.parse(event.at)
  return Number.isNaN(timestamp) ? null : timestamp
}

export function buildTimelineTrack(events: TimelineEvent[]): TimelineTrack {
  const dated = events.map((event) => ({ event, timestamp: timestampOf(event) }))
    .filter((item): item is { event: TimelineEvent; timestamp: number } => item.timestamp !== null)
    .sort((left, right) => left.timestamp - right.timestamp || left.event.title.localeCompare(right.event.title) || left.event.id.localeCompare(right.event.id))
  const undated = events.filter((event) => timestampOf(event) === null).sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
  const minAt = dated[0]?.timestamp ?? null
  const maxAt = dated.at(-1)?.timestamp ?? null
  const range = minAt !== null && maxAt !== null ? maxAt - minAt : 0
  return { points: dated.map(({ event, timestamp }) => ({ event, timestamp, position: range === 0 ? 0.5 : (timestamp - minAt!) / range })), undated, minAt, maxAt }
}
