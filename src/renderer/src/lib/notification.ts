export type NotificationKind = 'info' | 'success' | 'warning' | 'error' | 'progress'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  message: string
  dismissible?: boolean
  progress?: number
}

export function upsertNotification(queue: NotificationItem[], item: NotificationItem): NotificationItem[] {
  const index = queue.findIndex((current) => current.id === item.id)
  if (index < 0) return [...queue, { ...item }]
  return queue.map((current, currentIndex) => currentIndex === index ? { ...current, ...item } : current)
}

export function dismissNotification(queue: NotificationItem[], id: string): NotificationItem[] {
  return queue.filter((item) => item.id !== id)
}

export function notificationAriaLive(kind: NotificationKind): 'polite' | 'assertive' {
  return kind === 'error' || kind === 'warning' ? 'assertive' : 'polite'
}
