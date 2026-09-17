import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('standalone Chat interactive controls', () => {
  it('provides IDE-style pointer, hover, active and keyboard-focus feedback', async () => {
    const css = await readFile(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')

    expect(css).toContain('.chat-workspace button{cursor:pointer')
    expect(css).toContain('.chat-workspace button:hover:not(:disabled)')
    expect(css).toContain('.chat-workspace button:active:not(:disabled)')
    expect(css).toContain('.chat-workspace button:focus-visible')
    expect(css).toContain('.chat-workspace button:disabled')
    expect(css).toContain('.chat-composer-input textarea:focus-visible')
    expect(css).toContain('.chat-workspace .chat-session-select,.chat-workspace .chat-session-actions button,.chat-workspace .chat-copy-button')
    expect(css).toContain('.chat-workspace .chat-copy-button:hover:not(:disabled)')
    expect(css).toContain('.chat-workspace .chat-scope-chip-toggle:hover:not(:disabled)')
    expect(css).toContain('.chat-workspace .chat-composer-input button:active:not(:disabled)')
    expect(css).toContain('.chat-workspace .chat-session:hover{')
    expect(css).toContain('.chat-workspace .chat-new-session:hover:not(:disabled)')
    expect(css).toContain('.chat-workspace .chat-selection-clear:active:not(:disabled)')
    expect(css).toContain('.chat-workspace .chat-message-actions button:focus-visible')
  })
})
