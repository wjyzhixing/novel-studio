import type { ChatEvent } from '../../../shared/ai'
import type { ContextManifest } from '../../../shared/context'
import type { ChatMessageKind } from './chat'

export type ChatWorkspaceMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  kind?: ChatMessageKind
  context?: ContextManifest
  streaming?: boolean
  rejected?: boolean
}

export function createChatTurn(
  messages: readonly ChatWorkspaceMessage[],
  assistantId: string,
  prompt: string,
  kind: ChatMessageKind
): ChatWorkspaceMessage[] {
  return [
    ...messages,
    { id: `${assistantId}_user`, role: 'user', content: prompt },
    { id: assistantId, role: 'assistant', content: '', kind, streaming: true }
  ]
}

export function applyChatEvent(
  messages: readonly ChatWorkspaceMessage[],
  assistantId: string,
  event: ChatEvent
): { messages: ChatWorkspaceMessage[]; terminal: boolean } {
  if (event.type === 'delta') {
    return {
      messages: messages.map((message) => message.id === assistantId
        ? { ...message, content: message.content + event.text }
        : { ...message }),
      terminal: false
    }
  }

  return {
    messages: messages.map((message) => {
      if (message.id !== assistantId) return { ...message }
      if (event.type === 'done') return { ...message, content: event.result.text, context: event.result.context, streaming: false }
      return { ...message, streaming: false }
    }),
    terminal: true
  }
}

export function stopChatTurn(messages: readonly ChatWorkspaceMessage[], assistantId: string): ChatWorkspaceMessage[] {
  return messages.map((message) => message.id === assistantId ? { ...message, streaming: false } : { ...message })
}

export function chatHistory(messages: readonly ChatWorkspaceMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((message) => Boolean(message.content) && !message.streaming)
    .map(({ role, content }) => ({ role, content }))
}

export function resolveConfirmedChatSelection(
  confirmed: boolean,
  snapshot: { relPath: string | null } | null | undefined,
  activeRelPath: string | null | undefined,
  rawSelection: string
): string {
  if (!confirmed || !snapshot || !activeRelPath || snapshot.relPath !== activeRelPath) return ''
  return rawSelection.trim() ? rawSelection : ''
}

export function sanitizeChatMessages(value: unknown): ChatWorkspaceMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .filter((item) => (item.role === 'user' || item.role === 'assistant') && typeof item.id === 'string' && item.id.length > 0 && typeof item.content === 'string')
    .map((item) => ({
      id: item.id as string,
      role: item.role as 'user' | 'assistant',
      content: item.content as string,
      ...(typeof item.kind === 'string' ? { kind: item.kind as ChatMessageKind } : {}),
      ...(item.streaming === true ? { streaming: false } : {}),
      ...(item.rejected === true ? { rejected: true } : {})
    }))
}
