import { describe, expect, it } from 'vitest'
import { dismissNotification, notificationAriaLive, upsertNotification, type NotificationItem } from '../src/renderer/src/lib/notification'

describe('global notification model', () => {
  it('keeps multiline messages readable and updates one operation in place', () => {
    const first: NotificationItem = { id: 'project-check', kind: 'error', message: '检查失败：\nstory/volumes.yaml\n格式无效' }
    const updated: NotificationItem = { ...first, message: '检查失败：已定位到 story/volumes.yaml 格式无效' }
    const queue = upsertNotification(upsertNotification([], first), updated)

    expect(queue).toHaveLength(1)
    expect(queue[0]).toEqual(updated)
    expect(queue[0].message.split('\n')).toHaveLength(1)
    expect(notificationAriaLive(queue[0].kind)).toBe('assertive')
  })

  it('preserves notification order and supports immutable dismissal', () => {
    const first: NotificationItem = { id: 'one', kind: 'success', message: '已保存' }
    const second: NotificationItem = { id: 'two', kind: 'progress', message: '正在生成' }
    const queue = upsertNotification(upsertNotification([], first), second)

    expect(queue.map((item) => item.id)).toEqual(['one', 'two'])
    expect(dismissNotification(queue, 'one')).toEqual([second])
    expect(queue).toEqual([first, second])
    expect(notificationAriaLive('progress')).toBe('polite')
  })
})
