import { X } from 'lucide-react'
import { notificationAriaLive, type NotificationItem } from '../lib/notification'
import { useUiText } from '../lib/i18n'

export function NotificationCenter({ items, onDismiss }: { items: NotificationItem[]; onDismiss: (id: string) => void }) {
  const uiText = useUiText()
  if (!items.length) return null
  return <div className="notification-center" aria-label={uiText('globalNotifications')}>
    {items.map((item) => <div className={`global-notification global-notification-${item.kind}`} role={item.kind === 'error' || item.kind === 'warning' ? 'alert' : 'status'} aria-live={notificationAriaLive(item.kind)} aria-atomic="true" key={item.id}>
      <span className="global-notification-indicator" aria-hidden="true" />
      <span className="global-notification-message">{item.message}</span>
      {item.progress !== undefined && <span className="global-notification-progress" aria-label={`${item.progress}%`}>{item.progress}%</span>}
      {item.dismissible !== false && <button type="button" aria-label={uiText('closeNotification')} onClick={() => onDismiss(item.id)}><X size={15} /></button>}
    </div>)}
  </div>
}
