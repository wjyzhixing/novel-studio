import { renderToStaticMarkup } from 'react-dom/server'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tiptap/react/menus', () => ({
  BubbleMenu: ({ children }: { children: unknown }) => children
}))

import { SelectionToolbar } from '../src/renderer/src/components/SelectionToolbar'

describe('SelectionToolbar component contract', () => {
  it('routes visible selection action copy through locale keys', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/SelectionToolbar.tsx', import.meta.url), 'utf8')
    expect(source).toContain('useUiText()')
    expect(source).not.toContain('aria-label="选区 AI 操作"')
    expect(source).toContain('selectionActionLabel')
    expect(source).toContain('selectionActionPrompt')
    expect(source).toContain('actionId')
  })

  it('renders every selection action inside the BubbleMenu toolbar', () => {
    const markup = renderToStaticMarkup(<SelectionToolbar editor={{} as never} onAction={() => undefined} />)
    for (const label of ['润写', '改写', '扩写', '缩写', '续写', '解释', '翻译', '选中']) expect(markup).toContain(`>${label}</button>`)
    expect(markup).not.toContain('>取消选中</button>')
    expect(markup).toContain('data-action="select"')
    expect(markup).toContain('data-action="rewrite"')
    expect(markup).toContain('role="toolbar"')
    expect(markup).toContain('aria-label="选区 AI 操作"')
  })

  it('does not render without an editor instance', () => {
    expect(renderToStaticMarkup(<SelectionToolbar editor={null} onAction={() => undefined} />)).toBe('')
  })
})
