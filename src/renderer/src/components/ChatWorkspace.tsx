import { ArrowLeft, Bot, Copy, MessageSquarePlus, MoreHorizontal, Send, Square, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChatEvent } from '../../../shared/ai'
import type { ContextManifest } from '../../../shared/context'
import { chatDraftTarget, chatMessageActions, classifyChatPrompt, parseStructuredCanonProposal, type ChatMessageKind } from '../lib/chat'
import { activeChatSessionStorageKey, archiveChatSession, chatSessionsStorageKey, createChatSession, renameChatSession, resolveActiveChatSession, upsertChatSession, type ChatSessionRecord } from '../lib/chat-sessions'
import { MarkdownMessage } from './MarkdownMessage'
import { useAppStore } from '../store/app-store'

type ChatRow = { id: string; role: 'user' | 'assistant'; content: string; kind?: ChatMessageKind; context?: ContextManifest; streaming?: boolean; rejected?: boolean }

export function ChatWorkspace({ onClose }: { onClose: () => void }) {
  const activeRelPath = useAppStore((state) => state.activeRelPath)
  const editorSelection = useAppStore((state) => state.editorSelection)
  const activeChapter = useAppStore((state) => state.activeChapter)
  const selectedSceneId = useAppStore((state) => state.selectedSceneId)
  const scenes = useAppStore((state) => state.scenes)
  const project = useAppStore((state) => state.project)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<ChatRow[]>([])
  const [sessions, setSessions] = useState<ChatSessionRecord[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [cancel, setCancel] = useState<(() => void) | null>(null)
  const [selectionScopeEnabled, setSelectionScopeEnabled] = useState(true)
  const messageEnd = useRef<HTMLDivElement>(null)
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
      const fallback = resolveActiveChatSession(valid, savedId) ?? createChatSession(scope, '当前章节对话')
      const next = valid.length > 0 ? valid : [fallback]
      setSessions(next)
      setActiveSessionId(fallback.id)
      localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, scope), fallback.id)
      setMessages(fallback.messages.filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').slice(-100))
    } catch {
      const fallback = createChatSession(scope, '当前章节对话')
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
    setMessages(session.messages.filter((item) => !item.streaming).slice(-100))
    setNotice('')
  }

  const newSession = () => {
    const session = createChatSession(scope, '新对话')
    setSessions((current) => upsertChatSession(current, session))
    setActiveSessionId(session.id)
    localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, scope), session.id)
    setMessages([])
    setNotice('已新建对话')
  }

  const renameActiveSession = () => {
    if (!activeSessionId) return
    const current = sessions.find((session) => session.id === activeSessionId)
    const title = window.prompt('重命名对话', current?.title ?? '')
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
      setMessages(replacement.messages.filter((item) => !item.streaming).slice(-100))
    } else {
      const created = createChatSession(scope, '当前章节对话')
      setSessions([...next, created]); setActiveSessionId(created.id); localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, scope), created.id); setMessages([])
    }
    setNotice('对话已归档')
  }

  const send = async (requestedText?: string) => {
    const text = (requestedText ?? prompt).trim()
    if (!text || busy) return
    if (!profileId) { setNotice('尚未配置 Provider，请先完成 Provider 设置'); return }
    if (!activeRelPath) { setNotice('请先打开一个章节'); return }
    const assistantId = `chat_${Date.now()}`
    const kind = classifyChatPrompt(text)
    if (!requestedText) setPrompt('')
    setNotice(''); setBusy(true)
    setMessages((current) => [...current, { id: `${assistantId}_user`, role: 'user', content: text }, { id: assistantId, role: 'assistant', content: '', kind, streaming: true }])
    try {
      const history = messages.filter((item) => item.content && !item.streaming).map((item) => ({ role: item.role, content: item.content }))
      const stop = await window.novelAPI.ai.stream(profileId, { messages: [...history, { role: 'user', content: text }] }, (event: ChatEvent) => {
        if (event.type === 'delta') setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + event.text } : message))
        if (event.type === 'error') { setNotice(event.message); setBusy(false); setCancel(null); setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, streaming: false } : message)) }
        if (event.type === 'done') { setBusy(false); setCancel(null); setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: event.result.text, context: event.result.context, streaming: false } : message)) }
      }, { agentId: 'writer', contextRequest: { relPath: activeRelPath, sceneId: selectedSceneId ?? undefined, selection: requestSelection, query: text, recipe: { id: 'chat-workspace', maxTokens: 6000, includeSelection: Boolean(requestSelection), entityLimit: 40, semanticLimit: 10 } } })
      setCancel(() => stop)
    } catch (error) { setNotice(`Chat 失败：${error instanceof Error ? error.message : String(error)}`); setBusy(false); setCancel(null) }
  }

  const action = async (label: string, message: ChatRow) => {
    if (label === '复制') { void navigator.clipboard?.writeText(message.content); setNotice('已复制回答') }
    else if (label === '引用') {
      const quote = message.content.split('\n').map((line) => `> ${line}`).join('\n')
      setPrompt((current) => `${current ? `${current}\n\n` : ''}${quote}\n\n`)
      setNotice('已引用回答到输入框，可继续追问')
    }
    else if (label === '追问') { setPrompt('基于刚才的回答继续说明：'); setNotice('已准备追问') }
    else if (label === '继续生成') { void send('请继续上一个回答，补充尚未完成的内容；不要重复已经说过的部分。') }
    else if (label === '重新生成') {
      const index = messages.findIndex((item) => item.id === message.id)
      const previous = index > 0 ? [...messages.slice(0, index)].reverse().find((item) => item.role === 'user') : undefined
      if (previous) void send(previous.content)
      else setNotice('找不到可重新生成的原始问题')
    }
    else if (label === '保存为 Note') {
      try {
        if (!activeRelPath) { setNotice('请先打开章节'); return }
        const current = await window.novelAPI.chapter.readNote(activeRelPath)
        if (!current.ok) { setNotice(`读取 Note 失败：${current.error.message}`); return }
        const next = `${current.data.trimEnd()}${current.data.trim() ? '\n\n' : ''}## Agent Note · ${new Date().toLocaleString()}\n\n${message.content.trim()}\n`
        const result = await window.novelAPI.chapter.saveNote(activeRelPath, next)
        setNotice(result.ok ? '已保存到本章 Note，不会写入正文' : `保存 Note 失败：${result.error.message}`)
      } catch (error) { setNotice(`保存 Note 失败：${error instanceof Error ? error.message : String(error)}`) }
    }
    else if (label === '打开 Canon Review') { window.dispatchEvent(new Event('novel:open-canon-review')); setNotice('已打开 Canon Review') }
    else if (label === '提交 Canon 提案') {
      if (!activeRelPath) { setNotice('请先打开一个章节'); return }
      const proposal = parseStructuredCanonProposal(message.content, activeRelPath)
      if (!proposal) { setNotice('未找到有效的结构化 Canon 提案；请让 Agent 返回 JSON（subjectId、predicate、object）'); return }
      try {
        const result = await window.novelAPI.canon.proposeFact(proposal)
        if (!result.ok) { setNotice(`提交 Canon 提案失败：${result.error.message}`); return }
        setNotice('Canon 提案已提交，请在 Canon Review 中人工审核')
        window.dispatchEvent(new Event('novel:open-canon-review'))
      } catch (error) { setNotice(`提交 Canon 提案失败：${error instanceof Error ? error.message : String(error)}`) }
    }
    else if (label === '打开插图工作室') { window.dispatchEvent(new Event('novel:open-images')); setNotice('已打开 Illustration Studio') }
    else if (label === '打开 Workflow 详情') { window.dispatchEvent(new Event('novel:open-workflow')); setNotice('已打开 Workflow 详情') }
    else if (label === '重试失败节点') { window.dispatchEvent(new Event('novel:open-workflow')); setNotice('已打开 Workflow，请在运行详情中重试失败节点') }
    else if (label === '重试') {
      const index = messages.findIndex((item) => item.id === message.id)
      const previous = index > 0 ? [...messages.slice(0, index)].reverse().find((item) => item.role === 'user') : undefined
      if (previous) void send(previous.content)
      else setNotice('找不到可重试的原始问题')
    }
    else if (label === '拒绝') {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, rejected: true } : item))
      setNotice('已拒绝该草稿，正文未修改')
    }
    else if (label === '预览 Diff' || label === '应用到选区' || label === '追加到章节' || label === '替换章节') {
      try {
        if (!profileId || !activeRelPath) { setNotice('请先配置 Provider 并打开章节'); return }
        const targetKind = chatDraftTarget(label, editorSelection)
        if (targetKind === 'missing-selection') { setNotice('当前没有选区，不能应用到选区；请先返回编辑器拖选正文') ; return }
        const chapter = await window.novelAPI.chapter.read(activeRelPath)
        if (!chapter.ok) { setNotice(`读取章节失败：${chapter.error.message}`); return }
        const target = targetKind === 'chapter' ? null : editorSelection || null
        if (target && !chapter.data.markdown.includes(target)) { setNotice('当前选区已变化，请重新选择后再应用'); return }
        const suggested = label === '替换章节' ? message.content.trim() : target ? chapter.data.markdown.replace(target, message.content) : `${chapter.data.markdown.trimEnd()}\n\n${message.content.trim()}`
        const result = await window.novelAPI.aiEdit.createFromText({ profileId, relPath: activeRelPath, prompt: label, selection: target, suggested })
        if (result.ok) { useAppStore.getState().setPendingSuggestion(result.data); setNotice(`${label}已生成待确认 Diff，请返回编辑器审核`) } else setNotice(`生成 Diff 失败：${result.error.message}`)
      } catch (error) { setNotice(`生成 Diff 失败：${error instanceof Error ? error.message : String(error)}`) }
    }
    else setNotice(`${label}：后续动作已记录，未直接修改正文`)
  }

  return <main className="chat-workspace" data-testid="chat-workspace">
    <header className="chat-workspace-header"><button type="button" onClick={onClose} aria-label="返回编辑器"><ArrowLeft size={16}/></button><div><b>Agent Chat</b><small>独立对话工作区 · {activeRelPath ?? '未选择章节'}</small></div><span className="chat-scope-chip">{editorSelection ? `选区 ${editorSelection.length} 字` : '整章上下文'}</span></header>
    <div className="chat-workspace-body"><aside className="chat-session-list"><button type="button" className="chat-new-session" onClick={newSession}><MessageSquarePlus size={14}/>新建对话</button>{sessions.filter((session) => !session.archived).map((session) => <div className={`chat-session${session.id === activeSessionId ? ' active' : ''}`} key={session.id}><button type="button" className="chat-session-select" onClick={() => switchSession(session)}><Bot size={14}/><span>{session.title}</span></button>{session.id === activeSessionId && <div className="chat-session-actions"><button type="button" title="重命名对话" onClick={renameActiveSession}>改</button><button type="button" title="归档对话" onClick={archiveActiveSession}>归</button></div>}</div>)}<div className="chat-session-muted">按章节保存最近 100 条消息</div></aside>
      <section className="chat-conversation"><div className="chat-message-list">{messages.length === 0 && <div className="chat-empty"><Bot size={28}/><h2>开始一场写作对话</h2><p>解释设定、检查逻辑或生成修改建议。回答不会自动写入正文。</p></div>}{messages.map((message) => <article className={`chat-workspace-message ${message.role}`} key={message.id}><div className="chat-message-avatar">{message.role === 'user' ? <User size={14}/> : <Bot size={14}/>}</div><div className="chat-message-main"><small>{message.role === 'user' ? '你' : `Agent · ${message.kind ?? 'explanation'}`}</small>{message.role === 'assistant' ? <MarkdownMessage content={message.content || (message.streaming ? '生成中…' : '')}/> : <p className="chat-user-text">{message.content}</p>}{message.role === 'assistant' && message.context && <div className="chat-message-sources"><span>Context 来源</span><small>{message.context.items.length} 项 · {message.context.totalTokens}/{message.context.budgetTokens} tokens</small><div>{message.context.items.slice(0, 6).map((item) => <em key={item.id}>{item.source}</em>)}</div></div>}{message.role === 'assistant' && message.rejected && <p className="chat-message-rejected">已拒绝 · 正文未修改</p>}{message.role === 'assistant' && !message.streaming && !message.rejected && <div className="chat-message-actions">{chatMessageActions(message.kind ?? 'explanation').map((label) => <button type="button" key={label} onClick={() => action(label, message)}>{label === '复制' ? <Copy size={12}/> : label === '更多' ? <MoreHorizontal size={12}/> : null}{label}</button>)}</div>}</div></article>)}<div ref={messageEnd}/></div><div className="chat-composer"><div className="chat-composer-scope"><span className="chat-scope-chip-inline">项目 · {project?.manifest.title ?? '未打开项目'}</span><span className="chat-scope-chip-inline">章节 · {activeChapter?.title ?? activeRelPath ?? '未选择'}</span>{selectedScene && <span className="chat-scope-chip-inline">场景 · {selectedScene.title}</span>}{editorSelection && <button type="button" className={selectionScopeEnabled ? 'chat-scope-chip-inline chat-scope-chip-toggle active' : 'chat-scope-chip-inline chat-scope-chip-toggle'} aria-pressed={selectionScopeEnabled} onClick={() => setSelectionScopeEnabled((enabled) => !enabled)}>选区 · {editorSelection.length} 字{selectionScopeEnabled ? '' : '（已关闭）'}</button>}</div><div className="chat-composer-input"><textarea aria-label="Chat 输入" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send() } }} placeholder="向 Agent 提问，⌘/Ctrl + Enter 发送…"/><button type="button" aria-label={busy ? '停止生成' : '发送'} onClick={busy ? () => { cancel?.(); setBusy(false); setCancel(null) } : () => void send()}>{busy ? <Square size={15}/> : <Send size={15}/>}</button></div>{notice && <p className="chat-workspace-notice" role="status">{notice}</p>}</div></section>
      <aside className="chat-context-inspector"><b>当前上下文</b><div><span>章节</span><small>{activeRelPath ?? '未选择'}</small></div><div><span>选区</span><small>{editorSelection ? `${editorSelection.slice(0, 80)}${editorSelection.length > 80 ? '…' : ''}` : '未选择，使用整章'}</small></div><p>发送后将在此显示实际注入的 Context 来源。</p></aside>
    </div>
  </main>
}
