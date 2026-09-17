import { ArrowLeft, Bot, Copy, MessageSquarePlus, MoreHorizontal, Send, Square, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChatEvent } from '../../../shared/ai'
import { chatDraftTarget, chatMessageActionIds, classifyChatPrompt, parseStructuredCanonProposal, type ChatActionId, type ChatMessageKind } from '../lib/chat'
import { activeChatSessionStorageKey, archiveChatSession, chatSessionsStorageKey, createChatSession, renameChatSession, resolveActiveChatSession, upsertChatSession, type ChatSessionRecord } from '../lib/chat-sessions'
import { applyChatEvent, chatHistory, createChatTurn, resolveConfirmedChatSelection, sanitizeChatMessages, stopChatTurn, type ChatWorkspaceMessage } from '../lib/chat-workspace-model'
import { MarkdownMessage } from './MarkdownMessage'
import { useAppStore } from '../store/app-store'
import { useUiText, type UiTextKey } from '../lib/i18n'
import { useGlobalMessage } from '../lib/global-notification'

type ChatRow = ChatWorkspaceMessage

export function ChatWorkspace({ onClose }: { onClose: () => void }) {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  const chatKindKeys: Record<ChatMessageKind, UiTextKey> = { explanation: 'chatKindExplanation', analysis: 'chatKindAnalysis', review: 'chatKindReview', draft: 'chatKindDraft', 'canon-proposal': 'chatKindCanonProposal', 'image-proposal': 'chatKindImageProposal', workflow: 'chatKindWorkflow' }
  const messageAuthor = (kind?: ChatMessageKind) => formatUiText('chatMessageAuthor', { kind: uiText(chatKindKeys[kind ?? 'explanation']) })
  const actionKeys: Record<ChatActionId, Parameters<typeof uiText>[0]> = { copy: 'chatActionCopy', quote: 'chatActionQuote', 'follow-up': 'chatActionFollowUp', continue: 'chatActionContinue', regenerate: 'chatActionRegenerate', 'save-note': 'chatActionSaveNote', 'preview-diff': 'chatActionPreviewDiff', 'apply-selection': 'chatActionApplySelection', 'append-chapter': 'chatActionAppendChapter', 'replace-chapter': 'chatActionReplaceChapter', reject: 'chatActionReject', 'submit-canon': 'chatActionSubmitCanon', 'open-canon-review': 'chatActionOpenCanonReview', 'open-illustration': 'chatActionOpenIllustration', 'open-workflow': 'chatActionOpenWorkflow', 'retry-workflow': 'chatActionRetryFailedNodes' }
  const actionLabel = (actionId: ChatActionId) => uiText(actionKeys[actionId])
  const rawEditorSelection = useAppStore((state) => state.editorSelection)
  const editorSelectionConfirmed = useAppStore((state) => state.editorSelectionConfirmed)
  const editorSelectionSnapshot = useAppStore((state) => state.editorSelectionSnapshot)
  const activeRelPath = useAppStore((state) => state.activeRelPath)
  const editorSelection = resolveConfirmedChatSelection(editorSelectionConfirmed, editorSelectionSnapshot, activeRelPath, rawEditorSelection)
  const activeChapter = useAppStore((state) => state.activeChapter)
  const selectedSceneId = useAppStore((state) => state.selectedSceneId)
  const scenes = useAppStore((state) => state.scenes)
  const project = useAppStore((state) => state.project)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<ChatRow[]>([])
  const [sessions, setSessions] = useState<ChatSessionRecord[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useGlobalMessage()
  const [cancel, setCancel] = useState<(() => void) | null>(null)
  const [selectionScopeEnabled, setSelectionScopeEnabled] = useState(true)
  const messageEnd = useRef<HTMLDivElement>(null)
  const streamingMessageId = useRef<string | null>(null)
  const cancelRequested = useRef(false)
  const loadedScope = useRef<string | null>(null)
  const hydratingScope = useRef(false)
  const profileId = project?.manifest.providerProfile
  const scope = activeRelPath ?? '__no-chapter__'
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId)
  const requestSelection = selectionScopeEnabled ? editorSelection || null : null

  useEffect(() => { messageEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages])

  useEffect(() => {
    if (loadedScope.current === scope) return
    loadedScope.current = scope
    hydratingScope.current = true
    try {
      const raw = localStorage.getItem(chatSessionsStorageKey(project?.rootPath, scope))
      const stored = raw ? JSON.parse(raw) as ChatSessionRecord[] : []
      const valid = Array.isArray(stored) ? stored.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && item.scope === scope && Array.isArray(item.messages)) : []
      const savedId = localStorage.getItem(activeChatSessionStorageKey(project?.rootPath, scope))
      const fallback = resolveActiveChatSession(valid, savedId) ?? createChatSession(scope, uiText('currentChapterConversation'))
      const next = valid.length > 0 ? valid : [fallback]
      setSessions(next)
      setActiveSessionId(fallback.id)
      localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, scope), fallback.id)
      setMessages(sanitizeChatMessages(fallback.messages).slice(-100))
    } catch {
      const fallback = createChatSession(scope, uiText('currentChapterConversation'))
      setSessions([fallback]); setActiveSessionId(fallback.id); localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, scope), fallback.id); setMessages([])
    } finally { queueMicrotask(() => { hydratingScope.current = false }) }
  }, [project?.rootPath, scope])

  useEffect(() => { setSelectionScopeEnabled(true) }, [scope])


  useEffect(() => {
    if (loadedScope.current !== scope || hydratingScope.current || !activeSessionId) return
    setSessions((current) => current.map((session) => session.id === activeSessionId ? { ...session, messages: messages.filter((item) => !item.streaming).slice(-100), updatedAt: new Date().toISOString() } : session))
  }, [activeSessionId, messages, scope])

  useEffect(() => {
    if (loadedScope.current !== scope || hydratingScope.current || sessions.length === 0) return
    try { localStorage.setItem(chatSessionsStorageKey(project?.rootPath, scope), JSON.stringify(sessions)); if (activeSessionId) localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, scope), activeSessionId) } catch { /* optional history */ }
  }, [project?.rootPath, scope, sessions])

  const switchSession = (session: ChatSessionRecord) => {
    if (session.archived) return
    setActiveSessionId(session.id)
    localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, scope), session.id)
    setMessages(sanitizeChatMessages(session.messages).slice(-100))
    setNotice('')
  }

  const newSession = () => {
    const session = createChatSession(scope, uiText('newConversationTitle'))
    setSessions((current) => upsertChatSession(current, session))
    setActiveSessionId(session.id)
    localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, scope), session.id)
    setMessages([])
     setNotice(uiText('chatConversationCreated'))
  }

  const renameActiveSession = () => {
    if (!activeSessionId) return
    const current = sessions.find((session) => session.id === activeSessionId)
     const title = window.prompt(uiText('renameConversation'), current?.title ?? '')
    if (title === null) return
    setSessions((items) => renameChatSession(items, activeSessionId, title))
  }

  const archiveActiveSession = () => {
    if (!activeSessionId) return
    const next = archiveChatSession(sessions, activeSessionId)
    const replacement = next.find((session) => !session.archived)
    if (replacement) {
      setSessions(next)
      setActiveSessionId(replacement.id)
      localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, scope), replacement.id)
      setMessages(sanitizeChatMessages(replacement.messages).slice(-100))
    } else {
      const created = createChatSession(scope, uiText('currentChapterConversation'))
      setSessions([...next, created]); setActiveSessionId(created.id); localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, scope), created.id); setMessages([])
    }
     setNotice(uiText('chatConversationArchived'))
  }

  const send = async (requestedText?: string) => {
    const text = (requestedText ?? prompt).trim()
    if (!text || busy) return
     if (!profileId) { setNotice(uiText('providerRequired')); return }
     if (!activeRelPath) { setNotice(uiText('chatNoChapter')); return }
    const assistantId = `chat_${Date.now()}`
    streamingMessageId.current = assistantId
    cancelRequested.current = false
    const kind = classifyChatPrompt(text)
    if (!requestedText) setPrompt('')
    setNotice(''); setBusy(true)
    setMessages((current) => createChatTurn(current, assistantId, text, kind))
    try {
      const history = chatHistory(messages)
      const stop = await window.novelAPI.ai.stream(profileId, { messages: [...history, { role: 'user', content: text }] }, (event: ChatEvent) => {
        if (event.type === 'error' && !cancelRequested.current) setNotice(event.message)
        if (event.type === 'error' || event.type === 'done') { setBusy(false); setCancel(null); streamingMessageId.current = null }
        setMessages((current) => applyChatEvent(current, assistantId, event).messages)
      }, { agentId: 'writer', contextRequest: { relPath: activeRelPath, sceneId: selectedSceneId ?? undefined, selection: requestSelection, query: text, recipe: { id: 'chat-workspace', maxTokens: 6000, includeSelection: Boolean(requestSelection), entityLimit: 40, semanticLimit: 10 } } })
      if (cancelRequested.current) { stop(); return }
      setCancel(() => stop)
     } catch (error) { if (!cancelRequested.current) setNotice(formatUiText('chatFailed', { error: error instanceof Error ? error.message : String(error) })); setBusy(false); setCancel(null) }
  }

  const stopGeneration = () => {
    cancelRequested.current = true
    cancel?.()
    const id = streamingMessageId.current
    if (id) setMessages((current) => stopChatTurn(current, id))
    setBusy(false)
    setCancel(null)
    setNotice(uiText('chatCancelled'))
  }

  const action = async (actionId: ChatActionId, message: ChatRow) => {
     if (actionId === 'copy') { void navigator.clipboard?.writeText(message.content); setNotice(uiText('chatCopied')) }
    else if (actionId === 'quote') {
      const quote = message.content.split('\n').map((line) => `> ${line}`).join('\n')
      setPrompt((current) => `${current ? `${current}\n\n` : ''}${quote}\n\n`)
       setNotice(uiText('chatQuoted'))
     }
     else if (actionId === 'follow-up') { setPrompt(uiText('followUpPrompt')); setNotice(uiText('chatFollowUpReady')) }
    else if (actionId === 'continue') { void send(uiText('continuePrompt')) }
    else if (actionId === 'regenerate') {
      const index = messages.findIndex((item) => item.id === message.id)
      const previous = index > 0 ? [...messages.slice(0, index)].reverse().find((item) => item.role === 'user') : undefined
      if (previous) void send(previous.content)
       else setNotice(uiText('chatSourceMissing'))
    }
    else if (actionId === 'save-note') {
      try {
         if (!activeRelPath) { setNotice(uiText('chatNoteChapterRequired')); return }
        const current = await window.novelAPI.chapter.readNote(activeRelPath)
         if (!current.ok) { setNotice(formatUiText('chatNoteReadFailed', { error: current.error.message })); return }
        const next = `${current.data.trimEnd()}${current.data.trim() ? '\n\n' : ''}## ${uiText('agentNoteHeading')} · ${new Date().toLocaleString()}\n\n${message.content.trim()}\n`
        const result = await window.novelAPI.chapter.saveNote(activeRelPath, next)
         setNotice(result.ok ? uiText('chatNoteSaved') : formatUiText('chatNoteSaveFailed', { error: result.error.message }))
       } catch (error) { setNotice(formatUiText('chatNoteSaveFailed', { error: error instanceof Error ? error.message : String(error) })) }
     }
     else if (actionId === 'open-canon-review') { window.dispatchEvent(new Event('novel:open-canon-review')); setNotice(uiText('chatCanonReviewOpened')) }
    else if (actionId === 'submit-canon') {
       if (!activeRelPath) { setNotice(uiText('chatNoChapter')); return }
      const proposal = parseStructuredCanonProposal(message.content, activeRelPath)
       if (!proposal) { setNotice(uiText('chatCanonProposalInvalid')); return }
      try {
        const result = proposal.id
          ? await window.novelAPI.canon.proposeFactUpdate({ ...proposal, id: proposal.id })
          : await window.novelAPI.canon.proposeFact(proposal)
         if (!result.ok) { setNotice(formatUiText('chatCanonSubmitFailed', { error: result.error.message })); return }
         setNotice(uiText('chatCanonSubmitted'))
        window.dispatchEvent(new Event('novel:open-canon-review'))
       } catch (error) { setNotice(formatUiText('chatCanonSubmitFailed', { error: error instanceof Error ? error.message : String(error) })) }
    }
     else if (actionId === 'open-illustration') { window.dispatchEvent(new Event('novel:open-images')); setNotice(uiText('chatIllustrationOpened')) }
     else if (actionId === 'open-workflow') { window.dispatchEvent(new Event('novel:open-workflow')); setNotice(uiText('chatWorkflowOpened')) }
     else if (actionId === 'retry-workflow') { window.dispatchEvent(new Event('novel:open-workflow')); setNotice(uiText('chatRetryWorkflowOpened')) }
    else if (actionId === 'reject') {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, rejected: true } : item))
       setNotice(uiText('chatDraftRejected'))
    }
    else if (actionId === 'preview-diff' || actionId === 'apply-selection' || actionId === 'append-chapter' || actionId === 'replace-chapter') {
      try {
         if (!profileId || !activeRelPath) { setNotice(uiText('providerRequired')); return }
        const targetKind = chatDraftTarget(actionId, editorSelection)
         if (targetKind === 'missing-selection') { setNotice(uiText('chatDiffSelectionMissing')); return }
        const chapter = await window.novelAPI.chapter.read(activeRelPath)
         if (!chapter.ok) { setNotice(formatUiText('chatChapterReadFailed', { error: chapter.error.message })); return }
        const target = targetKind === 'chapter' ? null : editorSelection || null
         if (target && !chapter.data.markdown.includes(target)) { setNotice(uiText('chatSelectionChanged')); return }
         const suggested = actionId === 'replace-chapter' ? message.content.trim() : target ? chapter.data.markdown.replace(target, message.content) : `${chapter.data.markdown.trimEnd()}\n\n${message.content.trim()}`
         const result = await window.novelAPI.aiEdit.createFromText({ profileId, relPath: activeRelPath, prompt: actionLabel(actionId), selection: target, suggested })
         if (result.ok) { useAppStore.getState().setPendingSuggestion(result.data); setNotice(formatUiText('chatDiffCreated', { action: actionLabel(actionId) })) } else setNotice(formatUiText('chatDiffFailed', { error: result.error.message }))
       } catch (error) { setNotice(formatUiText('chatDiffFailed', { error: error instanceof Error ? error.message : String(error) })) }
    }
    else setNotice(formatUiText('chatActionRecorded', { action: actionLabel(actionId) }))
  }

  return <main className="chat-workspace" data-testid="chat-workspace">
       <header className="chat-workspace-header"><button type="button" onClick={onClose} aria-label={uiText('chatBack')}><ArrowLeft size={16}/></button><div><b>Agent Chat</b><small>{uiText('standaloneChat')} · {activeRelPath ?? uiText('noSelection')}</small></div>{editorSelection ? <button type="button" className="chat-scope-chip chat-selection-clear" onClick={() => { useAppStore.getState().setEditorSelectionSnapshot(null); window.dispatchEvent(new Event('novel:clear-selection')) }}>{formatUiText('selectionScope', { count: editorSelection.length })} · {uiText('clearSelection')}</button> : <span className="chat-scope-chip">{uiText('wholeChapterContext')}</span>}</header>
       <div className="chat-workspace-body"><aside className="chat-session-list"><button type="button" className="chat-new-session" onClick={newSession}><MessageSquarePlus size={14}/>{uiText('newConversation')}</button>{sessions.filter((session) => !session.archived).map((session) => <div className={`chat-session${session.id === activeSessionId ? ' active' : ''}`} key={session.id}><button type="button" className="chat-session-select" onClick={() => switchSession(session)}><Bot size={14}/><span>{session.title}</span></button>{session.id === activeSessionId && <div className="chat-session-actions"><button type="button" title={uiText('renameConversation')} aria-label={uiText('renameConversation')} onClick={renameActiveSession}>{uiText('renameConversationShort')}</button><button type="button" title={uiText('archiveConversation')} aria-label={uiText('archiveConversation')} onClick={archiveActiveSession}>{uiText('archiveConversationShort')}</button></div>}</div>)}<div className="chat-session-muted">{uiText('recentMessages')}</div></aside>
       <section className="chat-conversation"><div className="chat-message-list">{messages.length === 0 && <div className="chat-empty"><Bot size={28}/><h2>{uiText('startWritingConversation')}</h2><p>{uiText('chatEmptyHint')}</p></div>}{messages.map((message) => <article className={`chat-workspace-message ${message.role}`} key={message.id}><div className="chat-message-avatar">{message.role === 'user' ? <User size={14}/> : <Bot size={14}/>}</div><div className="chat-message-main"><small>{message.role === 'user' ? uiText('you') : messageAuthor(message.kind)}</small>{message.role === 'assistant' ? <MarkdownMessage content={message.content || (message.streaming ? uiText('generating') : '')}/> : <p className="chat-user-text">{message.content}</p>}{message.role === 'assistant' && message.context && <div className="chat-message-sources"><span>{uiText('contextSources')}</span><small>{message.context.items.length} {uiText('items')} · {message.context.totalTokens}/{message.context.budgetTokens} {uiText('tokens')}</small><div>{message.context.items.slice(0, 6).map((item) => <em key={item.id}>{item.source}</em>)}</div></div>}{message.role === 'assistant' && message.rejected && <p className="chat-message-rejected">{uiText('rejectedDraft')}</p>}{message.role === 'assistant' && !message.streaming && !message.rejected && <div className="chat-message-actions">{chatMessageActionIds(message.kind ?? 'explanation').map((actionId) => <button type="button" key={actionId} onClick={() => action(actionId, message)}>{actionId === 'copy' ? <Copy size={12}/> : actionId === 'open-workflow' ? <MoreHorizontal size={12}/> : null}{actionLabel(actionId)}</button>)}</div>}</div></article>)}<div ref={messageEnd}/></div><div className="chat-composer"><div className="chat-composer-scope"><span className="chat-scope-chip-inline">{formatUiText('projectScope', { name: project?.manifest.title ?? uiText('noProject') })}</span><span className="chat-scope-chip-inline">{formatUiText('chapterScope', { name: activeChapter?.title ?? activeRelPath ?? uiText('noSelection') })}</span>{selectedScene && <span className="chat-scope-chip-inline">{formatUiText('sceneScope', { name: selectedScene.title })}</span>}{editorSelection && <button type="button" className={selectionScopeEnabled ? 'chat-scope-chip-inline chat-scope-chip-toggle active' : 'chat-scope-chip-inline chat-scope-chip-toggle'} aria-pressed={selectionScopeEnabled} onClick={() => setSelectionScopeEnabled((enabled) => !enabled)}>{formatUiText('selectionScope', { count: editorSelection.length })}{selectionScopeEnabled ? '' : ` ${uiText('selectionDisabled')}`}</button>}</div><div className="chat-composer-input"><textarea aria-label={uiText('chatInput')} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send() } }} placeholder={uiText('selectionPromptEmpty')}/><button type="button" aria-label={busy ? uiText('stopGeneration') : uiText('send')} onClick={busy ? stopGeneration : () => void send()}>{busy ? <Square size={15}/> : <Send size={15}/>}</button></div>{notice && <p className="chat-workspace-notice" role="status">{notice}</p>}</div></section>
      <aside className="chat-context-inspector"><b>{uiText('currentContext')}</b><div><span>{uiText('chapter')}</span><small>{activeRelPath ?? uiText('noSelection')}</small></div><div><span>{uiText('selection')}</span><small>{editorSelection ? `${editorSelection.slice(0, 80)}${editorSelection.length > 80 ? '…' : ''}` : uiText('wholeChapterSelection')}</small></div><p>{uiText('contextAfterSend')}</p></aside>
    </div>
  </main>
}
