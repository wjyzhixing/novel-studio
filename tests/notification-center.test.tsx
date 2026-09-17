import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NotificationCenter } from '../src/renderer/src/components/NotificationCenter'

describe('NotificationCenter component contract', () => {
  it('renders ordered multiline errors as assertive dismissible alerts', () => {
    const markup = renderToStaticMarkup(<NotificationCenter
      items={[
        { id: 'first', kind: 'info', message: '正在读取项目' },
        { id: 'second', kind: 'error', message: '读取失败：\nstory/volumes.yaml\n格式无效' }
      ]}
      onDismiss={() => undefined}
    />)

    expect(markup.indexOf('正在读取项目')).toBeLessThan(markup.indexOf('story/volumes.yaml'))
    expect(markup).toContain('role="status"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('aria-live="assertive"')
    expect(markup).toContain('global-notification-message')
    expect(markup).toContain('aria-label="关闭通知"')
  })

  it('does not render an empty shell when the queue is empty', () => {
    expect(renderToStaticMarkup(<NotificationCenter items={[]} onDismiss={() => undefined} />)).toBe('')
  })
})
