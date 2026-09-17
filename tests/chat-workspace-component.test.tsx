import { readFile } from 'node:fs/promises'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatWorkspace } from '../src/renderer/src/components/ChatWorkspace'

describe('ChatWorkspace component shell', () => {
  it('renders the empty standalone chat shell without a browser runtime', () => {
    const html = renderToStaticMarkup(<ChatWorkspace onClose={() => undefined} />)
    expect(html).toContain('data-testid="chat-workspace"')
    expect(html).toContain('开始一场写作对话')
    expect(html).toContain('整章上下文')
  })

  it('renders Chat scope from the confirmed selection resolver', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ChatWorkspace.tsx', import.meta.url), 'utf8')
    expect(source).toContain('resolveConfirmedChatSelection(editorSelectionConfirmed, editorSelectionSnapshot, activeRelPath, rawEditorSelection)')
    expect(source).toContain("editorSelection ? <button type=\"button\" className=\"chat-scope-chip chat-selection-clear\"")
    expect(source).toContain("{uiText('clearSelection')}")
  })

  it('keeps unconfirmed browser selection out of the request scope', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ChatWorkspace.tsx', import.meta.url), 'utf8')
    expect(source).toContain('const requestSelection = selectionScopeEnabled ? editorSelection || null : null')
    expect(source).toContain('selection: requestSelection')
  })

})
