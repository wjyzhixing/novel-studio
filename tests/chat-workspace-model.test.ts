import { describe, expect, it } from 'vitest'
import type { ChatEvent } from '../src/shared/ai'
import { applyChatEvent, chatHistory, createChatTurn, resolveConfirmedChatSelection, sanitizeChatMessages, stopChatTurn, type ChatWorkspaceMessage } from '../src/renderer/src/lib/chat-workspace-model'

const base: ChatWorkspaceMessage[] = [{ id: 'old', role: 'assistant', content: '已有回答', streaming: false }]

describe('ChatWorkspace pure interaction model', () => {
  it('creates a user turn and streaming assistant turn without mutating messages', () => {
    const next = createChatTurn(base, 'assistant-1', '请分析', 'analysis')
    expect(next).toEqual([...base, { id: 'assistant-1_user', role: 'user', content: '请分析' }, { id: 'assistant-1', role: 'assistant', content: '', kind: 'analysis', streaming: true }])
    expect(base).toEqual([{ id: 'old', role: 'assistant', content: '已有回答', streaming: false }])
  })

  it('accumulates deltas and replaces streamed content with the authoritative done result', () => {
    const started = createChatTurn([], 'assistant-1', '写一段', 'draft')
    const delta = applyChatEvent(started, 'assistant-1', { type: 'delta', text: '第一段' })
    expect(delta.messages.find((item) => item.id === 'assistant-1')?.content).toBe('第一段')
    expect(delta.terminal).toBe(false)
    const done = applyChatEvent(delta.messages, 'assistant-1', { type: 'done', result: { text: '最终结果', model: 'mock', context: { recipeId: 'chat', items: [], omittedSources: [], totalTokens: 1, budgetTokens: 10, retrievalVersion: 1, generatedAt: '2026-01-01T00:00:00.000Z', retrieval: { query: '写一段', selectionIncluded: false, candidateCounts: { pinned: 0, structured: 0, semantic: 0 }, selectedSources: [], omittedSources: [] } } } })
    expect(done.messages.find((item) => item.id === 'assistant-1')).toMatchObject({ content: '最终结果', streaming: false, context: { recipeId: 'chat' } })
    expect(done.terminal).toBe(true)
  })

  it('terminates the assistant row on stream errors without losing the partial text', () => {
    const started = createChatTurn([], 'assistant-1', '分析', 'analysis')
    const partial = applyChatEvent(started, 'assistant-1', { type: 'delta', text: '已收到' })
    const failed = applyChatEvent(partial.messages, 'assistant-1', { type: 'error', message: '网络失败' })
    expect(failed.messages.find((item) => item.id === 'assistant-1')).toMatchObject({ content: '已收到', streaming: false })
    expect(failed.terminal).toBe(true)
  })

  it('marks a locally cancelled turn complete even when the provider emits no terminal event', () => {
    const started = createChatTurn([], 'assistant-1', '分析', 'analysis')
    expect(stopChatTurn(started, 'assistant-1')).toEqual([
      { id: 'assistant-1_user', role: 'user', content: '分析' },
      { id: 'assistant-1', role: 'assistant', content: '', kind: 'analysis', streaming: false }
    ])
  })

  it('builds history only from non-empty, non-streaming chat rows', () => {
    const rows: ChatWorkspaceMessage[] = [
      { id: 'u', role: 'user', content: '问题' },
      { id: 'a', role: 'assistant', content: '回答', streaming: false },
      { id: 'empty', role: 'assistant', content: '', streaming: false },
      { id: 'stream', role: 'assistant', content: '未完成', streaming: true }
    ]
    expect(chatHistory(rows)).toEqual([{ role: 'user', content: '问题' }, { role: 'assistant', content: '回答' }])
  })

  it('only exposes a selection when it is confirmed for the active chapter', () => {
    expect(resolveConfirmedChatSelection(true, { relPath: 'chapters/001.md' }, 'chapters/001.md', '选中的正文')).toBe('选中的正文')
    expect(resolveConfirmedChatSelection(false, { relPath: 'chapters/001.md' }, 'chapters/001.md', '普通拖选')).toBe('')
    expect(resolveConfirmedChatSelection(true, { relPath: 'chapters/002.md' }, 'chapters/001.md', '旧章节选区')).toBe('')
    expect(resolveConfirmedChatSelection(true, null, 'chapters/001.md', '无快照')).toBe('')
  })

  it('sanitizes persisted messages while preserving valid fields', () => {
    const event: ChatEvent = { type: 'delta', text: 'ignored in fixture' }
    expect(event.type).toBe('delta')
    expect(sanitizeChatMessages([
      { id: 'valid', role: 'assistant', content: 'ok', streaming: true },
      { id: '', role: 'assistant', content: 'bad' },
      { id: 'bad-role', role: 'system', content: 'bad' },
      null
    ])).toEqual([{ id: 'valid', role: 'assistant', content: 'ok', streaming: false }])
  })
})
