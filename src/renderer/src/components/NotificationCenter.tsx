import { X } from 'lucide-react'
import { notificationAriaLive, type NotificationItem } from '../lib/notification'

export function NotificationCenter({ items, onDismiss }: { items: NotificationItem[]; onDismiss: (id: string) => void }) {
  if (!items.length) return null
  return <div className="notification-center" aria-label="全局通知">
    {items.map((item) => <div className={`global-notification global-notification-${item.kind}`} role={item.kind === 'error' || item.kind === 'warning' ? 'alert' : 'status'} aria-live={notificationAriaLive(item.kind)} aria-atomic="true" key={item.id}>
      <span className="global-notification-indicator" aria-hidden="true" />
      <span className="global-notification-message">{item.message}</span>
      {item.progress !== undefined && <span className="global-notification-progress" aria-label={`${item.progress}%`}>{item.progress}%</span>}
      {item.dismissible !== false && <button type="button" aria-label="关闭通知" onClick={() => onDismiss(item.id)}><X size={15} /></button>}
    </div>)}
  </div>
}
