import { useCallback, useState } from 'react'
import type { NotificationKind } from './notification'

export interface GlobalNotificationDetail {
  message: string
  kind?: NotificationKind
  durationMs?: number
}

export function inferNotificationKind(message: string): NotificationKind {
  if (/失败|错误|无效|拒绝|无法|异常|failed|error|invalid|rejected/i.test(message)) return 'error'
  if (/警告|过期|需要关注|注意|warning|expired|attention/i.test(message)) return 'warning'
  if (/成功|完成|已保存|已创建|已删除|已应用|success|completed|saved|created|deleted|applied/i.test(message)) return 'success'
  return 'info'
}

export function notifyGlobal(message: string, kind?: NotificationKind, durationMs = 6000): void {
  if (!message.trim() || typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent<GlobalNotificationDetail>('novel:global-notification', {
    detail: { message, kind: kind ?? inferNotificationKind(message), durationMs }
  }))
}

export function useGlobalMessage(initialMessage = ''): readonly [string, (message: string) => void] {
  const [message, setMessage] = useState(initialMessage)
  const publish = useCallback((next: string) => {
    setMessage(next)
    if (next.trim()) notifyGlobal(next)
  }, [])
  return [message, publish]
}
