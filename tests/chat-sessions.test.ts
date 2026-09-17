import { describe, expect, it } from 'vitest'
import { activeChatSessionStorageKey, archiveChatSession, chatSessionsStorageKey, createChatSession, renameChatSession, resolveActiveChatSession, selectChatSession, upsertChatSession, type ChatSessionRecord } from '../src/renderer/src/lib/chat-sessions'

const initial: ChatSessionRecord[] = [{ id: 'chat-1', title: '当前章节对话', scope: 'chapters/001.md', messages: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' }]

describe('chat session model', () => {
  it('creates, renames, selects and archives sessions without mutating the source list', () => {
    const created = createChatSession('chapters/001.md', '逻辑检查')
    const withCreated = upsertChatSession(initial, created)
    expect(withCreated).toHaveLength(2)
    expect(initial).toHaveLength(1)
    const renamed = renameChatSession(withCreated, created.id, '人物动机')
    expect(renamed.find((session) => session.id === created.id)).toMatchObject({ id: created.id, title: '人物动机' })
    expect(selectChatSession(renamed, created.id)?.id).toBe(created.id)
    expect(archiveChatSession(renamed, created.id).find((session) => session.id === created.id)?.archived).toBe(true)
  })

  it('prefers the persisted active session when switching between Chat surfaces', () => {
    const second = createChatSession('chapters/001.md', '第二个目标')
    const sessions = upsertChatSession(initial, second)
    expect(resolveActiveChatSession(sessions, second.id)?.title).toBe('第二个目标')
    expect(resolveActiveChatSession(sessions, 'missing')?.id).toBe('chat-1')
    expect(selectChatSession(sessions, 'missing')).toBeUndefined()
  })

  it('scopes persisted sessions by project and updates an existing session immutably', () => {
    expect(chatSessionsStorageKey(null, 'chapter')).toBe('novel-studio:chat-sessions:local:chapter')
    expect(activeChatSessionStorageKey('/tmp/project', 'chapter')).toBe('novel-studio:chat-sessions:/tmp/project:chapter:active')
    const updated = { ...initial[0], title: '已更新', messages: [{ id: 'm1', role: 'user' as const, content: 'hi' }] }
    const result = upsertChatSession(initial, updated)
    expect(result).toEqual([updated])
    expect(result).not.toBe(initial)
    expect(result[0].messages).not.toBe(updated.messages)
  })
})
