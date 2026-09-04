import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatWorkspace } from '../src/renderer/src/components/ChatWorkspace'

describe('Chat workspace component contract', () => {
  it('renders the independent workspace shell and safe composer scope without a project', () => {
    const markup = renderToStaticMarkup(<ChatWorkspace onClose={() => undefined} />)

    expect(markup).toContain('data-testid="chat-workspace"')
    expect(markup).toContain('开始一场写作对话')
    expect(markup).toContain('Chat 输入')
    expect(markup).toContain('未打开项目')
    expect(markup).toContain('未选择')
  })
})
