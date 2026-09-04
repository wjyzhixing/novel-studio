import { AlertTriangle, Bot, Check, ChevronRight, CircleDot, ImagePlus, MessageSquareText, Play, SearchCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/app-store'
import type { AiSuggestion } from '../../../shared/ai-edit'
import type { ChatEvent } from '../../../shared/ai'
import type { ContextManifest, ContextReplayDifference, ContextSnapshotSummary } from '../../../shared/context'
import type { WorkflowRun } from '../../../shared/runtime'
import { classifyChatPrompt, type ChatMessageKind } from '../lib/chat'
import { applySuggestionRegion, buildSuggestionRegions, type SuggestionChangeRegion } from '../lib/diff-decorations'
import { activeChatSessionStorageKey, chatSessionsStorageKey, createChatSession, resolveActiveChatSession, type ChatSessionRecord } from '../lib/chat-sessions'
import { MarkdownMessage } from './MarkdownMessage'

type WorkflowAssetChoice = { assetId: string; prompt?: string }

function createAssetBlobUrl(bytes: Uint8Array, mimeType: string): string {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return URL.createObjectURL(new Blob([copy.buffer], { type: mimeType }))
}

function reviewableText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  for (const key of ['markdown', 'text', 'content', 'replacement', 'suggested', 'in']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return ''
}

export function RightPanel({ onOpenImages }: { onOpenImages: () => void }) {
  const [activeTab, setActiveTab] = useState<'Agent' | 'Workflow' | 'Outline'>('Agent')
  const [expandedContext, setExpandedContext] = useState<Set<string>>(new Set())
  const [prompt, setPrompt] = useState('')
  const [message, setMessage] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; kind?: ChatMessageKind; context?: ContextManifest; streaming?: boolean }>>([])
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)
  const chatStorageScopeRef = useRef<string | null>(null)
  const [chatBusy, setChatBusy] = useState(false)
  const [cancelChat, setCancelChat] = useState<(() => void) | null>(null)
  const [running, setRunning] = useState(false)
  const activeRelPath = useAppStore((state) => state.activeRelPath)
  const activeChapter = useAppStore((state) => state.activeChapter)
  const project = useAppStore((state) => state.project)
  const providerProfileId = project?.manifest.providerProfile ?? null
  const editorSelection = useAppStore((state) => state.editorSelection)
  const selectedSceneId = useAppStore((state) => state.selectedSceneId)
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [contextManifest, setContextManifest] = useState<ContextManifest | null>(null)
  const [contextSnapshots, setContextSnapshots] = useState<ContextSnapshotSummary[]>([])
  const [replayBusy, setReplayBusy] = useState(false)
  const [replayDifferences, setReplayDifferences] = useState<ContextReplayDifference[]>([])
  const [workflowRun, setWorkflowRun] = useState<WorkflowRun | null>(null)
  const [workflowRunId, setWorkflowRunId] = useState<string | null>(null)
  const [reviewDraft, setReviewDraft] = useState('')
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([])
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const workflowQueries = useRef(new Set<string>())
  const [requestId, setRequestId] = useState<string | null>(null)
  const [outline, setOutline] = useState('')
  const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

  const chatScope = activeRelPath ?? '__no-chapter__'
  const chatStorageScope = `${project?.rootPath ?? 'local'}:${chatScope}`

  useEffect(() => {
    chatStorageScopeRef.current = null
    try {
      const key = chatSessionsStorageKey(project?.rootPath, chatScope)
      const raw = localStorage.getItem(key)
      const stored = raw ? JSON.parse(raw) as ChatSessionRecord[] : []
      const sessions = Array.isArray(stored) ? stored.filter((session) => session && typeof session.id === 'string' && session.scope === chatScope && Array.isArray(session.messages)) : []
      const savedId = localStorage.getItem(activeChatSessionStorageKey(project?.rootPath, chatScope))
      const selected = resolveActiveChatSession(sessions, savedId) ?? createChatSession(chatScope, '当前章节对话')
      const nextSessions = sessions.length > 0 ? sessions : [selected]
      localStorage.setItem(key, JSON.stringify(nextSessions))
      localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, chatScope), selected.id)
      setChatSessionId(selected.id)
      setChatMessages(selected.messages.filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string' && !item.streaming).map((item) => ({ role: item.role, content: item.content, kind: item.kind, context: item.context })))
    } catch {
      const selected = createChatSession(chatScope, '当前章节对话')
      setChatSessionId(selected.id); setChatMessages([])
    }
    queueMicrotask(() => { chatStorageScopeRef.current = chatStorageScope })
  }, [chatStorageScope, chatScope, project?.rootPath])

  useEffect(() => {
    if (chatStorageScopeRef.current !== chatStorageScope || !chatSessionId) return
    try {
      const key = chatSessionsStorageKey(project?.rootPath, chatScope)
      const raw = localStorage.getItem(key)
      const sessions = raw ? JSON.parse(raw) as ChatSessionRecord[] : []
      const next = sessions.map((session) => session.id === chatSessionId ? { ...session, messages: chatMessages.filter((item) => !item.streaming), updatedAt: new Date().toISOString() } : session)
      localStorage.setItem(key, JSON.stringify(next))
    } catch { /* optional history */ }
  }, [chatMessages, chatScope, chatSessionId, chatStorageScope, project?.rootPath])

  useEffect(() => {
    if (activeTab !== 'Agent') return
    let current = true
    setSuggestion(null)
    if (activeRelPath) {
      void window.novelAPI.aiEdit.listPending(activeRelPath).then((result) => {
        if (current && result.ok) {
          const pending = result.data[0] ?? null
          setSuggestion(pending)
          useAppStore.getState().setPendingSuggestion(pending)
        }
      })
    }
    return () => { current = false }
  }, [activeRelPath, activeTab])

  useEffect(() => {
    if (activeTab !== 'Outline') return
    let current = true
    void window.novelAPI.project.readText('story/outline.md').then((result) => { if (current) setOutline(result.ok ? result.data : '') })
    return () => { current = false }
  }, [project?.rootPath, activeTab])

  useEffect(() => window.novelAPI.workflowRuntime.onEvent((event) => {
    if (!event.state) { setMessage(event.error ?? 'Workflow 执行失败'); setRunning(false); return }
    setWorkflowRuns((current) => [event.state!, ...current.filter((run) => run.id !== event.state!.id)])
    setWorkflowRunId(event.runId); setWorkflowRun(event.state)
    if (['succeeded', 'failed', 'cancelled', 'waiting_human'].includes(event.state.status)) setRunning(false)
  }), [])

  useEffect(() => {
    if (!activeRelPath || !project?.rootPath) return
    const queryKey = `${project.rootPath}:${activeRelPath}`
    if (workflowQueries.current.has(queryKey)) return
    workflowQueries.current.add(queryKey)
    let current = true
    setWorkflowLoading(true)
    // The Workflow tab is allowed to inspect history on demand, but its
    // first request must remain metadata-only so large Context/正文 payloads
    // cannot freeze the rest of the workbench.
    void window.novelAPI.workflowRuntime.listRuns(false, true).then((result) => {
      if (!current || !result.ok) return
      setWorkflowRuns(result.data)
    }).finally(() => { if (current) setWorkflowLoading(false) })
    return () => { current = false }
  }, [activeRelPath, project?.rootPath])

  // Selecting a chapter must not trigger another Main-process run recovery.
  // Pick the already-loaded run in memory and immediately discard the old
  // chapter's run while the new chapter is being selected.
  useEffect(() => {
    const matching = activeRelPath ? workflowRuns.find((run) => run.relPath === activeRelPath) : workflowRuns[0]
    const recovered = matching ?? workflowRuns.find((run) => run.relPathRecovery === 'unavailable' && run.status === 'waiting_human')
    setWorkflowRun(recovered ?? null)
    setWorkflowRunId(recovered?.id ?? null)
  }, [activeRelPath, workflowRuns])

  useEffect(() => {
    if (activeTab !== 'Agent') return
    let current = true
    setContextSnapshots([])
    if (activeRelPath) void window.novelAPI.context.listSnapshots(activeRelPath).then((result) => { if (current && result.ok) setContextSnapshots(result.data) })
    return () => { current = false }
  }, [activeRelPath, project?.rootPath, activeTab])

  const refreshContextSnapshots = async () => {
    if (!activeRelPath) return
    const result = await window.novelAPI.context.listSnapshots(activeRelPath)
    if (result.ok) setContextSnapshots(result.data)
  }

  const replayContextSnapshot = async (snapshot: ContextSnapshotSummary) => {
    setReplayBusy(true)
    try {
      const result = await window.novelAPI.context.replaySnapshot(snapshot.id)
      if (!result.ok) { setMessage(`Context 回放失败：${result.error.message}`); return }
      setContextManifest(result.data.current.manifest)
      setReplayDifferences(result.data.differences)
      const migrationNotice = result.data.compatibility.migrated ? `（${result.data.compatibility.notes.join('；') || '已兼容迁移旧检索版本'}）` : ''
      setMessage(result.data.changed ? `Context 已变化：${snapshot.id.slice(-8)}，当前 ${result.data.current.manifest.totalTokens} tokens${migrationNotice}` : `Context 未变化：${snapshot.id.slice(-8)}，可复现${migrationNotice}`)
    } catch (error) { setMessage(`Context 回放失败：${errorMessage(error)}`) }
    finally { setReplayBusy(false) }
  }

  const ask = async (requestedPrompt?: string) => {
    const promptValue = requestedPrompt ?? prompt
    if (!promptValue.trim()) return
    let effectiveProfileId = providerProfileId
    if (!effectiveProfileId) {
      // Main is authoritative for project configuration. A renderer reload
      // can leave this component with the previous null snapshot for one
      // render, so reconcile at the action boundary before rejecting Chat.
      const info = await window.novelAPI.project.getInfo()
      effectiveProfileId = info.ok ? info.data?.manifest.providerProfile ?? null : null
      if (info.ok && info.data) useAppStore.setState({ project: info.data })
    }
    if (!effectiveProfileId) { setMessage('尚未配置 Provider，请先打开顶部 Provider 设置'); return }
    const userPrompt = promptValue.trim()
    const kind = classifyChatPrompt(userPrompt)
    if (!requestedPrompt) setPrompt('')
    const assistantIndex = chatMessages.length + 1
    setChatMessages((current) => [...current, { role: 'user', content: userPrompt }, { role: 'assistant', content: '', kind, streaming: true }])
    setChatBusy(true)
    const messages = [
      ...chatMessages.filter((item) => item.content).map((item) => ({ role: item.role, content: item.content })),
      { role: 'user' as const, content: userPrompt }
    ]
    try {
      const cancel = await window.novelAPI.ai.stream(effectiveProfileId, { messages }, (event: ChatEvent) => {
        if (event.type === 'delta') setChatMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, content: item.content + event.text } : item))
        if (event.type === 'error') { setMessage(event.message); setChatBusy(false); setCancelChat(null); setChatMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, streaming: false } : item)) }
        if (event.type === 'done') { setChatBusy(false); setCancelChat(null); if (event.result.context) { setContextManifest(event.result.context); void refreshContextSnapshots() }; setChatMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, content: event.result.text, context: event.result.context, streaming: false } : item)) }
      }, { agentId: 'writer', contextRequest: activeRelPath ? { relPath: activeRelPath, sceneId: selectedSceneId ?? undefined, selection: editorSelection || null, query: userPrompt, recipe: { id: 'agent-chat', maxTokens: 5000, includeSelection: true, entityLimit: 30, semanticLimit: 8 } } : undefined })
      setCancelChat(() => cancel)
    } catch (error) {
      setMessage(`Chat 失败：${errorMessage(error)}`)
      setChatBusy(false)
      setCancelChat(null)
      setChatMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, streaming: false } : item))
    }
  }
  const suggest = async (instruction: string) => {
    if (!activeRelPath) { setMessage('请先打开一个章节'); return }
    if (!providerProfileId) { setMessage('尚未配置 Provider，请先打开顶部 Provider 设置'); return }
    if (instruction.includes('提取当前章节中的结构化设定')) {
      setEditBusy(true)
      try {
        const result = await window.novelAPI.memory.extractFromChapter(providerProfileId, activeRelPath)
        setMessage(result.ok ? `已生成 ${result.data.length} 条 Canon Proposal，请到 Canon Review 审核。` : result.error.message)
      } catch (error) { setMessage(`提取设定失败：${errorMessage(error)}`) }
      finally { setEditBusy(false) }
      return
    }
    setEditBusy(true)
    const currentRequestId = `job_${crypto.randomUUID()}`
    setRequestId(currentRequestId)
    try {
      const result = await window.novelAPI.aiEdit.run({ requestId: currentRequestId, profileId: providerProfileId, relPath: activeRelPath, prompt: instruction, selection: editorSelection || null })
      if (result.ok) { setSuggestion(result.data); useAppStore.getState().setPendingSuggestion(result.data) }
      else setMessage(result.error.message)
    } catch (error) { setMessage(`Suggestion 失败：${errorMessage(error)}`) }
    finally { setEditBusy(false); setRequestId(null) }
  }
  useEffect(() => {
    const toggleAgent = () => setActiveTab((tab) => tab === 'Agent' ? 'Workflow' : 'Agent')
    const askSelection = () => { if (editorSelection.trim()) void ask(); else setMessage('请先在正文中拖选一段文字') }
    const selectionAction = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; prompt?: string; mutatesDocument?: boolean; selection?: string }>).detail
      const action = detail?.action
      const selectedText = detail?.selection?.trim() || editorSelection.trim()
      if (!action || !selectedText) { setMessage('请先在正文中拖选一段文字'); return }
      if (action === '解释' || detail?.mutatesDocument === false) { setActiveTab('Agent'); void ask(`${detail.prompt || '解释下面选中的文字，只返回解释，不要改写正文。'}\n\n${selectedText}`); return }
      if (action === '更多') { setActiveTab('Agent'); setPrompt('针对选区输入自定义操作：'); return }
      void suggest(detail.prompt || `${action}选中的文字，保持原有事实、人物和叙事视角，只返回处理后的正文。`)
    }
    window.addEventListener('novel:toggle-agent', toggleAgent)
    window.addEventListener('novel:ask-selection', askSelection)
    window.addEventListener('novel:selection-action', selectionAction)
    return () => { window.removeEventListener('novel:toggle-agent', toggleAgent); window.removeEventListener('novel:ask-selection', askSelection); window.removeEventListener('novel:selection-action', selectionAction) }
  }, [ask, editorSelection, suggest])
  const acceptSuggestion = async () => {
    if (!suggestion) return
    setEditBusy(true)
    try {
      const accepted = await useAppStore.getState().acceptPendingSuggestion()
      if (accepted) { setSuggestion(null); setMessage('已确认 AI 修改') }
    } catch (error) { setMessage(`应用建议失败：${errorMessage(error)}`) }
    finally { setEditBusy(false) }
  }
  const rejectSuggestion = async () => {
    if (!suggestion) return
    setEditBusy(true)
    try {
      const result = await window.novelAPI.aiEdit.reject(suggestion.id)
      if (!result.ok) { setMessage(`拒绝建议失败：${result.error.message}`); return }
      useAppStore.getState().setPendingSuggestion(null); setSuggestion(null); setMessage('已拒绝建议')
    } catch (error) { setMessage(`拒绝建议失败：${errorMessage(error)}`) }
    finally { setEditBusy(false) }
  }
  const cancelSuggestion = async () => {
    if (!requestId) { setMessage('当前没有可取消的 Suggestion'); return }
    try {
      const result = await window.novelAPI.aiEdit.cancel(requestId)
      setMessage(result.ok ? '已取消 Suggestion 生成' : `取消 Suggestion 失败：${result.error.message}`)
    } catch (error) { setMessage(`取消 Suggestion 失败：${errorMessage(error)}`) }
  }
  const retrySuggestion = async () => {
    if (!suggestion) return
    setEditBusy(true); setMessage('正在重试 Suggestion…')
    try {
      const result = await window.novelAPI.aiEdit.retry(suggestion.id)
      if (!result.ok) { setMessage(`重试 Suggestion 失败：${result.error.message}`); return }
      setSuggestion(result.data); useAppStore.getState().setPendingSuggestion(result.data); setMessage('Suggestion 已重新生成，请确认后应用。')
    } catch (error) { setMessage(`重试 Suggestion 失败：${errorMessage(error)}`) }
    finally { setEditBusy(false) }
  }
  const createSingleRegionSuggestion = async (region: SuggestionChangeRegion) => {
    if (!suggestion || !providerProfileId || !activeRelPath) return
    setEditBusy(true)
    try {
      const chapter = await window.novelAPI.chapter.read(activeRelPath)
      if (!chapter.ok) { setMessage(`读取章节失败：${chapter.error.message}`); return }
      if (chapter.data.markdown !== suggestion.original) { setMessage('当前章节已变化，不能拆分旧 Diff；请重新生成 Suggestion'); return }
      const result = await window.novelAPI.aiEdit.createFromText({
        profileId: providerProfileId,
        relPath: activeRelPath,
        prompt: `${suggestion.prompt}（仅保留第 ${region.id.replace('region-', '')} 个修改区域）`,
        selection: suggestion.selection,
        suggested: applySuggestionRegion(suggestion.original, region)
      })
      if (!result.ok) { setMessage(`创建局部 Diff 失败：${result.error.message}`); return }
      const rejected = await window.novelAPI.aiEdit.reject(suggestion.id)
      if (!rejected.ok) { setMessage(`切换局部 Diff 失败：${rejected.error.message}`); return }
      setSuggestion(result.data)
      useAppStore.getState().setPendingSuggestion(result.data)
      setMessage(`已切换为 ${region.id}，请在 Diff 中确认；其余修改保持未应用`)
    } catch (error) { setMessage(`创建局部 Diff 失败：${errorMessage(error)}`) }
    finally { setEditBusy(false) }
  }
  const inspectContext = async () => {
    if (!activeRelPath) { setMessage('请先打开一个章节'); return }
    setMessage('正在检查本次实际注入的 Context…')
    try {
      const result = await window.novelAPI.context.build({ relPath: activeRelPath, sceneId: selectedSceneId ?? undefined, selection: editorSelection || null, query: '', recipe: { id: 'chapter-review', maxTokens: 1200, includeSelection: true, entityLimit: 20, semanticLimit: 5 } })
      if (result.ok) { setContextManifest(result.data.manifest); await refreshContextSnapshots(); setMessage(`Context 已生成：${result.data.manifest.totalTokens}/${result.data.manifest.budgetTokens} tokens`) } else setMessage(`Context 检查失败：${result.error.message}`)
    } catch (error) { setMessage(`Context 检查失败：${errorMessage(error)}`) }
  }
  const verifySelection = async () => {
    if (!activeRelPath) { setMessage('请先打开一个章节'); return }
    if (!editorSelection.trim()) { setMessage('请先在正文中拖选一个段落'); return }
    setMessage('正在验证选区是否进入 Context…')
    try {
      const result = await window.novelAPI.context.build({ relPath: activeRelPath, sceneId: selectedSceneId ?? undefined, selection: editorSelection, query: '', recipe: { id: 'selection-verification', maxTokens: 1200, includeSelection: true, entityLimit: 20, semanticLimit: 5 } })
      if (!result.ok) { setMessage(`选区验证失败：${result.error.message}`); return }
      const included = result.data.manifest.items.some((item) => item.source === 'selection')
      setContextManifest(result.data.manifest)
      setMessage(included ? `选区已注入 Context（${editorSelection.length} 字）` : '选区未进入 Context，请重新选择段落')
    } catch (error) { setMessage(`选区验证失败：${errorMessage(error)}`) }
  }
  const runWorkflow = async () => {
    if (!activeRelPath) { setMessage('请先打开一个章节'); return }
    if (!providerProfileId) { setMessage('尚未配置 Provider，请先打开顶部 Provider 设置'); return }
    setRunning(true)
    const workflowId = project?.manifest.defaultWorkflow ?? 'flow_builtin_novel'
    setMessage(`正在启动 Workflow：${workflowId}…`)
    try {
      const result = await window.novelAPI.workflowRuntime.start(workflowId, activeRelPath, selectedSceneId ?? undefined)
      if (result.ok) setWorkflowRunId(result.data); else { setMessage(result.error.message); setRunning(false) }
    } catch (error) { setMessage(`启动 Workflow 失败：${errorMessage(error)}`); setRunning(false) }
  }
  const cancelWorkflow = async () => {
    if (!workflowRunId) { setMessage('当前没有可取消的 Workflow'); return }
    setMessage('正在取消 Workflow…')
    try {
      const result = await window.novelAPI.workflowRuntime.cancel(workflowRunId)
      setMessage(result.ok ? 'Workflow 已发送取消请求' : `取消 Workflow 失败：${result.error.message}`)
    } catch (error) { setMessage(`取消 Workflow 失败：${errorMessage(error)}`) }
  }
  const retryWorkflow = async () => {
    if (!workflowRunId) return
    const targetRelPath = workflowRun?.relPath
    if (!targetRelPath) {
      setMessage('历史 Workflow Run 缺少章节路径，正在使用当前章节重新运行…')
      await runWorkflow()
      return
    }
    setRunning(true)
    setMessage('正在重试 Workflow 失败节点…')
    try {
      const result = await window.novelAPI.workflowRuntime.retry(workflowRunId, targetRelPath)
      if (!result.ok) { setMessage(result.error.message); setRunning(false) }
    } catch (error) { setMessage(`Retry Workflow 失败：${errorMessage(error)}`); setRunning(false) }
  }
  const resumeWorkflow = async (assetId?: string, reviewAction: 'approve' | 'reject' | 'edit' = 'approve') => {
    if (!workflowRun) { setMessage('当前没有可恢复的 Workflow'); return }
    if (workflowRun.relPathRecovery === 'unavailable') { setMessage('该旧 Workflow Run 无法自动恢复，请使用当前章节重新运行'); return }
    setRunning(true)
    const resumeInput = assetId ? { assetId } : reviewAction === 'edit' ? { action: 'edit', editedContent: reviewDraft } : { action: reviewAction }
    setMessage(assetId ? '已选择图片，正在恢复 Workflow 并插入正文…' : reviewAction === 'reject' ? '正在拒绝本次草稿…' : reviewAction === 'edit' ? '正在提交修改后的草稿…' : '正在提交审核通过…')
    try {
      const result = await window.novelAPI.workflowRuntime.resume(workflowRun.id, resumeInput)
      if (!result.ok) { setMessage(result.error.message); setRunning(false); return }
      setWorkflowRun(result.data)
      // Workflow write-back happens in Main. Refresh the currently visible
      // editor from disk immediately so approval does not require switching
      // chapters to trigger the renderer's normal load path.
      const targetRelPath = result.data.relPath ?? workflowRun.relPath
      if (result.data.status === 'succeeded' && targetRelPath && targetRelPath === useAppStore.getState().activeRelPath) {
        const chapter = await window.novelAPI.chapter.read(targetRelPath)
        if (chapter.ok) {
          useAppStore.getState().setEditorMarkdown(chapter.data.markdown)
          setMessage(assetId ? '图片已插入，正文已同步更新。' : '审核通过，正文已同步更新。')
        }
      }
    } catch (error) { setMessage(`Resume Workflow 失败：${errorMessage(error)}`); setRunning(false) }
  }
  const waitingNode = workflowRun ? Object.values(workflowRun.nodes).find((node) => node.status === 'waiting_human') : undefined
  const waitingText = reviewableText(waitingNode?.output)
  const canReviewWaitingNode = Boolean(waitingNode && (waitingText || waitingNode.nodeId === 'image-select'))
  useEffect(() => {
    if (workflowRun?.status === 'waiting_human' && waitingNode) setReviewDraft(waitingText)
  }, [workflowRun?.id, waitingNode?.nodeId])
  const humanReviewCard = workflowRun?.status === 'waiting_human' && waitingNode && canReviewWaitingNode ? <div className="human-review-card"><strong>人工审核暂停</strong><span>当前节点：{waitingNode.nodeId}</span><textarea aria-label="待审核正文" value={reviewDraft} onChange={(event) => setReviewDraft(event.target.value)} placeholder="审核节点没有可预览文本，请检查上游输出。" /><small>草稿仅在你确认后写回当前章节；说明、审核意见不会作为正文保存。</small></div> : workflowRun?.status === 'waiting_human' && waitingNode ? <div className="workflow-recovery-warning" role="status">运行摘要已加载；审核正文将在当前运行产生事件后显示。</div> : null
  const humanReviewActions = workflowRun?.status === 'waiting_human' && waitingNode && canReviewWaitingNode && waitingNode.nodeId !== 'image-select' ? <div className="human-review-actions"><button type="button" onClick={() => void resumeWorkflow(undefined, 'reject')} disabled={running}>拒绝</button><button type="button" onClick={() => void resumeWorkflow(undefined, 'edit')} className="secondary" disabled={running || !reviewDraft.trim()}>编辑后通过</button><button type="button" data-testid="workflow-resume-review" onClick={() => void resumeWorkflow(undefined, 'approve')} className="primary" disabled={running}>通过并写回</button></div> : null
  const waitingAssets = waitingNode?.nodeId === 'image-select' && Array.isArray(waitingNode.output)
    ? waitingNode.output as WorkflowAssetChoice[]
    : []
  const waitingAssetKey = waitingAssets.map((asset) => asset.assetId).join('|')
  const [waitingAssetUrls, setWaitingAssetUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let current = true
    const previousUrls = Object.values(waitingAssetUrls)
    setWaitingAssetUrls({})
    void Promise.all(waitingAssets.map(async (asset) => {
      try {
        const result = await window.novelAPI.image.readAsset(asset.assetId)
        return result.ok ? [asset.assetId, createAssetBlobUrl(result.data.bytes, result.data.mimeType)] as const : null
      } catch { return null }
    })).then((entries) => {
      if (!current) {
        entries.forEach((entry) => { if (entry) URL.revokeObjectURL(entry[1]) })
        return
      }
      setWaitingAssetUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))))
    })
    return () => {
      current = false
      previousUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [workflowRun?.id, waitingNode?.nodeId, waitingAssetKey])
  const summarize = async () => {
    if (!activeRelPath) { setMessage('请先打开一个章节'); return }
    if (!providerProfileId) { setMessage('尚未配置 Provider，请先打开顶部 Provider 设置'); return }
    setMessage('正在构建总结所需的 Context…')
    try {
      const contextResult = await window.novelAPI.context.build({ relPath: activeRelPath, sceneId: selectedSceneId ?? undefined, selection: editorSelection || null, query: 'summary', recipe: { id: 'chapter-summary', maxTokens: 3000, includeSelection: true, entityLimit: 20, semanticLimit: 5 } })
      if (!contextResult.ok) { setMessage(`总结所需 Context 构建失败：${contextResult.error.message}`); return }
      setContextManifest(contextResult.data.manifest)
      await refreshContextSnapshots()
      const result = await window.novelAPI.ai.chat(providerProfileId, { messages: [{ role: 'user', content: `总结以下 Context，只返回摘要，不要改写原文：\n\n${contextResult.data.text}` }] })
      setMessage(result.ok ? `章节摘要：${result.data.text}` : `总结失败：${result.error.message}`)
    } catch (error) { setMessage(`总结失败：${errorMessage(error)}`) }
  }
  const cancelCurrentChat = () => {
    cancelChat?.()
    setCancelChat(null)
    setChatBusy(false)
    setMessage('已取消 Chat 生成')
    setChatMessages((current) => current.map((item) => item.streaming ? { ...item, streaming: false } : item))
  }

  return (
    <aside className="right-panel panel-border-left" data-testid="right-panel">
      <div className="right-panel-content"><div className="right-tabs" role="tablist" aria-label="右侧工具面板">{(['Agent', 'Workflow', 'Outline'] as const).map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab} key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
      {activeTab === 'Agent' && <div className="right-scroll">
        <div className="right-heading">Context <button type="button" className="context-inspect" onClick={() => void inspectContext()}>检查注入内容</button>{contextManifest && contextManifest.items.length > 0 && <button type="button" className="context-expand" onClick={() => setExpandedContext(expandedContext.size === contextManifest.items.length ? new Set() : new Set(contextManifest.items.map((item) => item.id)))}>{expandedContext.size === contextManifest.items.length ? '全部收起' : '全部展开'}</button>}</div>
        <div className="context-list">
          {contextManifest?.items.map((item) => <button type="button" className={`context-card ${expandedContext.has(item.id) ? 'expanded' : ''}`} key={item.id} onClick={() => setExpandedContext((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })}><div className="context-icon">{item.layer.slice(0, 1).toUpperCase()}</div><div><b>{item.source}</b><small>{item.layer} · {item.estimatedTokens} tokens{item.truncated ? ' · 已截断' : ''}</small>{expandedContext.has(item.id) && <em>{item.text}</em>}</div><ChevronRight size={14}/></button>)}
          {!contextManifest && <div className="context-empty">发送问题或点击“检查注入内容”，这里会展示本次实际注入的上下文。</div>}
        </div>
        {contextManifest && <div className="context-manifest"><b>Context Inspector</b><small>{contextManifest.totalTokens}/{contextManifest.budgetTokens} tokens · {contextManifest.recipeId}{contextManifest.omittedSources.length ? ` · 省略 ${contextManifest.omittedSources.length} 项` : ''}</small><small>检索：{contextManifest.retrieval.query || '—'} · 选区{contextManifest.retrieval.selectionIncluded ? '已包含' : '未包含'} · 候选 P/S/M {contextManifest.retrieval.candidateCounts.pinned}/{contextManifest.retrieval.candidateCounts.structured}/{contextManifest.retrieval.candidateCounts.semantic}</small>{contextManifest.items.map((item) => <div key={item.id}><span>{item.layer}{item.truncated ? ' · 截断' : ''}</span>{item.source}<em>{item.estimatedTokens}</em></div>)}</div>}
        {contextSnapshots.length > 0 && <div className="context-snapshots"><div className="context-snapshot-head"><b>Context Snapshots</b><small>{contextSnapshots.length} 条可回放记录</small></div>{contextSnapshots.slice(0, 5).map((snapshot) => <button type="button" className="context-snapshot" key={snapshot.id} disabled={replayBusy} onClick={() => void replayContextSnapshot(snapshot)}><span>{new Date(snapshot.createdAt).toLocaleTimeString()}</span><em>{snapshot.recipeId} · {snapshot.totalTokens} tokens</em><small>回放</small></button>)}</div>}
        {replayDifferences.length > 0 && <div className="context-differences"><b>回放差异 · {replayDifferences.length} 项</b>{replayDifferences.map((difference) => <div key={`${difference.kind}-${difference.source}`}><span>{difference.kind === 'added' ? '新增' : difference.kind === 'removed' ? '移除' : '变化'}</span><em>{difference.source}</em><small>{difference.previousTokens ?? '—'} → {difference.currentTokens ?? '—'} tokens</small></div>)}</div>}
        <div className="divider"/>
        <div className="agent-title"><Sparkles size={16}/> Ask Agent <button type="button" className="open-chat-button" onClick={() => window.dispatchEvent(new Event('novel:open-chat'))}>打开独立 Chat</button>{editorSelection.trim() && <button type="button" className="selection-verify" onMouseDown={(event) => event.preventDefault()} onClick={() => void verifySelection()}>验证选区 · {editorSelection.length} 字</button>}</div>
        <div className="suggestions">
          <button type="button" className="suggestion-prompt-button" onMouseDown={(event) => event.preventDefault()} onClick={() => setPrompt('这一章是否有角色行为不一致？')}>这一章是否有角色行为不一致？</button>
          <button type="button" className="suggestion-prompt-button" onMouseDown={(event) => event.preventDefault()} onClick={() => setPrompt('帮我检查逻辑漏洞')}>帮我检查逻辑漏洞</button>
          <button type="button" className="suggestion-prompt-button" onMouseDown={(event) => event.preventDefault()} onClick={() => setPrompt('润色这一段，让语言更有画面感')}>润色这一段，让语言更有画面感</button>
          <button type="button" className="suggestion-prompt-button" onMouseDown={(event) => event.preventDefault()} onClick={() => setPrompt('为这一章生成标题备选')}>为这一章生成标题备选</button>
        </div>
        <div className="selection-hint">{editorSelection.trim() ? `已选中 ${editorSelection.length} 字，提问和 Agent 操作会优先使用选区` : '可在正文中拖选段落后，再询问 Agent'}</div>
        <div className="ask-box"><input aria-label="询问 Agent" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={editorSelection.trim() ? '针对选中段落提问…' : '询问任何关于这一章的问题…'} onKeyDown={e => e.key === 'Enter' && void ask()}/><button type="button" aria-label={chatBusy ? '取消生成' : '发送问题'} disabled={!chatBusy && !prompt.trim()} onMouseDown={(event) => event.preventDefault()} onClick={chatBusy ? cancelCurrentChat : () => void ask()}><Bot size={17}/></button></div>
        {chatMessages.length > 0 && <div className="agent-chat" aria-live="polite">{chatMessages.map((item, index) => <div className={`agent-chat-message ${item.role}`} key={`${item.role}-${index}`}><small>{item.role === 'user' ? '你' : `Agent · ${item.kind ?? 'explanation'}`}</small>{item.role === 'assistant' ? <MarkdownMessage content={item.content || (item.streaming ? '生成中…' : '')}/> : <p>{item.content}</p>}</div>)}</div>}
        {message && <div className="agent-response">{message}</div>}
        <div className="divider"/>
        <div className="agent-title"><CircleDot size={16}/> Quick Actions</div>
        <div className="quick-grid">
          <button type="button" data-testid="suggestion-generate" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => void suggest('续写当前章节，保持现有叙事视角和语气。')}><MessageSquareText size={14}/>续写</button><button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => void suggest('改写当前章节，使表达更准确紧凑。')}><Sparkles size={14}/>改写</button>
          <button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => void summarize()}><SearchCheck size={14}/>总结</button><button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => void suggest('提取当前章节中的结构化设定。')}><CircleDot size={14}/>提取设定</button>
          <button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => void suggest('检查当前章节的逻辑问题并给出修订文本。')}><AlertTriangle size={14}/>检查冲突</button><button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={onOpenImages}><ImagePlus size={14}/>生成插图</button>
        </div>
        {editBusy && <div className="suggestion-busy">正在生成 Suggestion… <button type="button" className="inline-action" onClick={() => void cancelSuggestion()}>取消</button></div>}
        {suggestion && <div className="suggestion-card"><div className="diff-title">AI Suggestion · 待确认</div><p className="suggestion-prompt">{suggestion.prompt}</p><div className="suggestion-diff"><del>{suggestion.original}</del><ins>{suggestion.suggested}</ins></div>{buildSuggestionRegions(suggestion.original, suggestion.suggested).length > 1 && <div className="suggestion-regions"><span>多个修改区域 · 可单独审核</span>{buildSuggestionRegions(suggestion.original, suggestion.suggested).map((region) => <button type="button" key={region.id} onClick={() => void createSingleRegionSuggestion(region)} disabled={editBusy}>仅保留 {region.id.replace('region-', '')}（{region.original || '新增'} → {region.replacement || '删除'}）</button>)}</div>}<div className="suggestion-actions"><button data-testid="suggestion-accept" className="primary" onClick={() => void acceptSuggestion()} disabled={editBusy}>Accept</button><button data-testid="suggestion-reject" onClick={() => void rejectSuggestion()} disabled={editBusy}>Reject</button><button onClick={() => void retrySuggestion()} disabled={editBusy}>Retry</button></div></div>}
        <div className="divider"/>
        <div className="workflow-scope-card"><b>Workflow 运行上下文</b><span>输入章节：{activeChapter?.title ?? activeRelPath ?? '未选择章节'}</span><span>运行路径：{activeRelPath ?? '未选择章节'}</span><span>正文写回：当前输入章节（人工审核通过后）</span></div>
        <div className="workflow-head"><div><b>Workflow Status</b><small>{workflowRun ? `当前流程：${workflowRun.status}` : workflowLoading ? '正在读取当前章节运行记录…' : '尚未运行当前章节流程'}</small></div><strong>{workflowRun ? `${Math.round(Object.values(workflowRun.nodes).filter((node) => ['succeeded', 'skipped'].includes(node.status)).length / Math.max(1, Object.values(workflowRun.nodes).length) * 100)}%` : '—'}</strong></div>
        <div className="workflow-line">
          {workflowRun ? Object.values(workflowRun.nodes).map((node) => <div className={`wf-step ${node.status === 'succeeded' || node.status === 'skipped' ? 'done' : node.status === 'running' || node.status === 'waiting_human' ? 'now' : ''}`} key={node.nodeId}><span>{node.status === 'succeeded' || node.status === 'skipped' ? <Check size={13}/> : node.status === 'running' || node.status === 'waiting_human' ? <Play size={12}/> : ''}</span><small>{node.nodeId}</small></div>) : <div className="workflow-empty">运行后显示真实节点状态</div>}
        </div>
        <button type="button" data-testid="workflow-run" className="run-workflow" onClick={running ? () => void cancelWorkflow() : () => void runWorkflow()}>{running ? 'Cancel Workflow' : 'Run Chapter Review'}</button>
        {workflowRun && <div className="runtime-card"><div><b>Run {workflowRun.id.slice(-8)}</b><span className={`runtime-status ${workflowRun.status}`}>{workflowRun.status}</span></div><small className="runtime-scope">输入章节：{workflowRun.relPath ?? '未知'}{workflowRun.sceneId ? ` · 场景：${workflowRun.sceneId}` : ' · 整章'} · 写回目标：同一章节</small>{workflowRun.relPathRecovery === 'unavailable' && <div className="workflow-recovery-warning" role="alert">旧运行记录缺少唯一章节路径，不能自动 Resume。请确认当前章节后重新运行。</div>}{humanReviewCard}{humanReviewActions}{Object.values(workflowRun.nodes).map((node) => <div className="runtime-node" key={node.nodeId}><span>{node.nodeId}</span><em>{node.status}</em>{node.error && <small>{node.error}</small>}{node.log.map((line, index) => <small key={`${node.nodeId}-${index}`}>{line}</small>)}</div>)}{workflowRun.status === 'waiting_human' && workflowRun.relPathRecovery !== 'unavailable' && waitingAssets.length > 0 ? <div className="workflow-asset-choices"><small>请选择本次生成的图片，选择后将继续插入正文：</small>{waitingAssets.map((asset) => <button type="button" data-testid="workflow-asset-choice" key={asset.assetId} onClick={() => void resumeWorkflow(asset.assetId)}>{waitingAssetUrls[asset.assetId] ? <img src={waitingAssetUrls[asset.assetId]} alt={asset.prompt ?? asset.assetId} /> : <span>{asset.assetId}</span>}<em>{asset.assetId.slice(-8)}</em></button>)}</div> : null}{['failed', 'cancelled'].includes(workflowRun.status) && <button className="primary" onClick={() => void retryWorkflow()}>Retry failed nodes</button>}{workflowRun.status === 'waiting_human' && workflowRun.relPathRecovery === 'unavailable' && <button className="primary runtime-action" onClick={() => void retryWorkflow()}>用当前章节重新运行</button>}</div>}
      </div>}
      {activeTab === 'Workflow' && <div className="right-scroll right-tool-panel"><h3>Workflow</h3><p>运行当前章节的创作流程，Human Review 后可继续。</p>{message && <p className="workflow-message" role="status">{message}</p>}<button type="button" className="run-workflow" onClick={running ? () => void cancelWorkflow() : () => void runWorkflow()}>{running ? 'Cancel Workflow' : 'Run Chapter Review'}</button>{workflowLoading && <p className="workflow-empty" role="status">正在读取 Workflow 记录…</p>}{workflowRun && <div className="runtime-card"><b>最近一次运行</b><span className={`runtime-status ${workflowRun.status}`}>{workflowRun.status}</span><small className="runtime-scope">章节：{workflowRun.relPath ?? '未知'}{workflowRun.sceneId ? ` · 场景：${workflowRun.sceneId}` : ' · 整章'}</small>{workflowRun.relPathRecovery === 'unavailable' && <div className="workflow-recovery-warning" role="alert">旧运行记录缺少唯一章节路径，不能自动 Resume。</div>}{humanReviewCard}{humanReviewActions}{Object.values(workflowRun.nodes).map((node) => <div className="runtime-node" key={node.nodeId}><span>{node.nodeId}</span><em>{node.status}</em>{node.error && <small>{node.error}</small>}</div>)}{workflowRun.status === 'waiting_human' && workflowRun.relPathRecovery !== 'unavailable' && waitingAssets.length > 0 ? <div className="workflow-asset-choices">{waitingAssets.map((asset) => <button type="button" className="asset-choice" key={asset.assetId} onClick={() => void resumeWorkflow(asset.assetId)}>{waitingAssetUrls[asset.assetId] ? <img src={waitingAssetUrls[asset.assetId]} alt={asset.prompt ?? asset.assetId} /> : asset.assetId.slice(-8)}</button>)}</div> : null}{['failed', 'cancelled'].includes(workflowRun.status) && <button type="button" className="primary runtime-action" onClick={() => void retryWorkflow()}>Retry failed nodes</button>}{workflowRun.status === 'waiting_human' && workflowRun.relPathRecovery === 'unavailable' && <button type="button" className="primary runtime-action" onClick={() => void retryWorkflow()}>用当前章节重新运行</button>}</div>}</div>}
      {activeTab === 'Outline' && <div className="right-scroll right-tool-panel"><h3>Outline</h3><p>项目大纲 · story/outline.md</p>{outline.trim() ? <pre className="outline-document">{outline}</pre> : <div className="story-section-empty"><h3>暂无大纲内容</h3><p>请编辑项目中的 story/outline.md。</p></div>}</div>}
      </div>
    </aside>
  )
}
