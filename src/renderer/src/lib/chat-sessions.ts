import type { ChatMessageKind } from './chat'
import type { ContextManifest } from '../../../shared/context'

export type ChatSessionMessage = { id: string; role: 'user' | 'assistant'; content: string; kind?: ChatMessageKind; context?: ContextManifest; streaming?: boolean; rejected?: boolean }

export type ChatSessionRecord = {
  id: string
  title: string
  scope: string
  messages: ChatSessionMessage[]
  createdAt: string
  updatedAt: string
  archived?: boolean
}

export function chatSessionsStorageKey(projectRoot: string | null | undefined, scope: string): string {
  return `novel-studio:chat-sessions:${projectRoot ?? 'local'}:${scope}`
}

export function activeChatSessionStorageKey(projectRoot: string | null | undefined, scope: string): string {
  return `${chatSessionsStorageKey(projectRoot, scope)}:active`
}

export function createChatSession(scope: string, title = '新对话'): ChatSessionRecord {
  const now = new Date().toISOString()
  return { id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, title: title.trim() || '新对话', scope, messages: [], createdAt: now, updatedAt: now }
}

export function upsertChatSession(sessions: readonly ChatSessionRecord[], session: ChatSessionRecord): ChatSessionRecord[] {
  const index = sessions.findIndex((item) => item.id === session.id)
  if (index < 0) return [...sessions, { ...session, messages: [...session.messages] }]
  return sessions.map((item, itemIndex) => itemIndex === index ? { ...session, messages: [...session.messages] } : item)
}

export function selectChatSession(sessions: readonly ChatSessionRecord[], id: string): ChatSessionRecord | undefined {
  return sessions.find((session) => session.id === id && !session.archived)
}

export function resolveActiveChatSession(sessions: readonly ChatSessionRecord[], savedId?: string | null): ChatSessionRecord | undefined {
  return (savedId ? selectChatSession(sessions, savedId) : undefined) ?? sessions.find((session) => !session.archived)
}

export function renameChatSession(sessions: readonly ChatSessionRecord[], id: string, title: string): ChatSessionRecord[] {
  const nextTitle = title.trim()
  if (!nextTitle) return sessions.map((session) => ({ ...session, messages: [...session.messages] }))
  return sessions.map((session) => session.id === id ? { ...session, title: nextTitle, messages: [...session.messages], updatedAt: new Date().toISOString() } : { ...session, messages: [...session.messages] })
}

export function archiveChatSession(sessions: readonly ChatSessionRecord[], id: string): ChatSessionRecord[] {
  return sessions.map((session) => session.id === id ? { ...session, archived: true, messages: [...session.messages], updatedAt: new Date().toISOString() } : { ...session, messages: [...session.messages] })
}
