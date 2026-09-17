import { AlertTriangle, Bot, Check, ChevronRight, CircleDot, ImagePlus, MessageSquareText, Play, SearchCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAppStore } from '../store/app-store'
import type { AiSuggestion } from '../../../shared/ai-edit'
import type { ChatEvent } from '../../../shared/ai'
import type { ContextManifest, ContextReplayDifference, ContextReplayResult, ContextSnapshotSummary } from '../../../shared/context'
import type { WorkflowRun } from '../../../shared/runtime'
import { classifyChatPrompt, type ChatMessageKind } from '../lib/chat'
import { applySuggestionRegion, buildSuggestionRegions, type SuggestionChangeRegion } from '../lib/diff-decorations'
import { activeChatSessionStorageKey, chatSessionsStorageKey, createChatSession, resolveActiveChatSession, type ChatSessionRecord } from '../lib/chat-sessions'
import { selectWorkflowRunForPanel } from '../lib/workflow-run-selection'
import { MarkdownMessage } from './MarkdownMessage'
import { useUiText } from '../lib/i18n'
import { summarizeContextDifferences } from '../lib/context-replay-summary'
import { useGlobalMessage } from '../lib/global-notification'
import '../styles/context-replay.css'

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
  const uiText = useUiText()
  const rightTabs = ['Agent', 'Workflow', 'Outline'] as const
  const [activeTab, setActiveTab] = useState<'Agent' | 'Workflow' | 'Outline'>('Agent')
  const [expandedContext, setExpandedContext] = useState<Set<string>>(new Set())
  const [prompt, setPrompt] = useState('')
  const [message, setMessage] = useGlobalMessage()
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
  const rawEditorSelection = useAppStore((state) => state.editorSelection)
  const editorSelectionConfirmed = useAppStore((state) => state.editorSelectionConfirmed)
  const editorSelectionSnapshot = useAppStore((state) => state.editorSelectionSnapshot)
  const editorSelection = editorSelectionConfirmed && editorSelectionSnapshot?.relPath === activeRelPath ? rawEditorSelection : ''
  const selectedSceneId = useAppStore((state) => state.selectedSceneId)
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [contextManifest, setContextManifest] = useState<ContextManifest | null>(null)
  const [contextSnapshots, setContextSnapshots] = useState<ContextSnapshotSummary[]>([])
  const [replayBusy, setReplayBusy] = useState(false)
  const [replayDifferences, setReplayDifferences] = useState<ContextReplayDifference[]>([])
  const replaySummary = summarizeContextDifferences(replayDifferences)
  const [replayCompatibility, setReplayCompatibility] = useState<ContextReplayResult['compatibility'] | null>(null)
  const [workflowRun, setWorkflowRun] = useState<WorkflowRun | null>(null)
  const [workflowRunId, setWorkflowRunId] = useState<string | null>(null)
  const [reviewDraft, setReviewDraft] = useState('')
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([])
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const workflowQueries = useRef(new Set<string>())
  const [requestId, setRequestId] = useState<string | null>(null)
  const [outline, setOutline] = useState('')
  const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)
  const statusLabel = (status: string): string => ({ running: uiText('statusRunning'), waiting_human: uiText('statusWaitingHuman'), succeeded: uiText('statusSucceeded'), failed: uiText('statusFailed'), cancelled: uiText('statusCancelled'), pending: uiText('statusPending'), skipped: uiText('statusSkipped') }[status] ?? status)
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => {
    const normalizedValues = key === 'candidates' ? { ...values, recency: values.recency ?? 0 } : values
    return Object.entries(normalizedValues).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  }
  const chatKindKeys: Record<ChatMessageKind, Parameters<typeof uiText>[0]> = { explanation: 'chatKindExplanation', analysis: 'chatKindAnalysis', review: 'chatKindReview', draft: 'chatKindDraft', 'canon-proposal': 'chatKindCanonProposal', 'image-proposal': 'chatKindImageProposal', workflow: 'chatKindWorkflow' }
  const messageAuthor = (kind?: ChatMessageKind) => formatUiText('chatMessageAuthor', { kind: uiText(chatKindKeys[kind ?? 'explanation']) })

  const onRightTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % rightTabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + rightTabs.length) % rightTabs.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? rightTabs.length - 1
            : -1
    if (nextIndex < 0) return
    event.preventDefault()
    const nextTab = rightTabs[nextIndex]
    setActiveTab(nextTab)
    const tabList = event.currentTarget.parentElement
    window.requestAnimationFrame(() => {
      ;(tabList?.querySelectorAll('button')[nextIndex] as HTMLElement | undefined)?.focus()
    })
  }

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
      const selected = resolveActiveChatSession(sessions, savedId) ?? createChatSession(chatScope, uiText('currentChapterConversation'))
      const nextSessions = sessions.length > 0 ? sessions : [selected]
      localStorage.setItem(key, JSON.stringify(nextSessions))
      localStorage.setItem(activeChatSessionStorageKey(project?.rootPath, chatScope), selected.id)
      setChatSessionId(selected.id)
      setChatMessages(selected.messages.filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string' && !item.streaming).map((item) => ({ role: item.role, content: item.content, kind: item.kind, context: item.context })))
    } catch {
      const selected = createChatSession(chatScope, uiText('currentChapterConversation'))
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
    if (!event.state) { setMessage(formatUiText('workflowExecutionFailed', { error: event.error ?? uiText('statusFailed') })); setRunning(false); return }
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

  // Selecting a chapter must not replace an already selected run. Its
  // persisted relPath is the source of truth for Retry/Resume, even when the
  // editor is currently showing another chapter.
  useEffect(() => {
    const selected = selectWorkflowRunForPanel(workflowRuns, activeRelPath, workflowRunId)
    setWorkflowRun(selected)
    if (selected?.id !== workflowRunId) setWorkflowRunId(selected?.id ?? null)
  }, [activeRelPath, workflowRunId, workflowRuns])

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
      if (!result.ok) { setMessage(formatUiText('contextReplayFailed', { error: result.error.message })); return }
      setContextManifest(result.data.current.manifest)
      setReplayDifferences(result.data.differences)
      setReplayCompatibility(result.data.compatibility)
      const migrationNotice = result.data.compatibility.migrated ? formatUiText('replayMigratedNotice', { notes: result.data.compatibility.notes.join('；') || uiText('migratedRecomputed') }) : ''
      setMessage(result.data.changed ? formatUiText('contextChanged', { id: snapshot.id.slice(-8), tokens: result.data.current.manifest.totalTokens, notice: migrationNotice }) : formatUiText('contextUnchanged', { id: snapshot.id.slice(-8), notice: migrationNotice }))
    } catch (error) { setMessage(formatUiText('contextReplayFailed', { error: errorMessage(error) })) }
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
    if (!effectiveProfileId) { setMessage(uiText('providerRequired')); return }
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
      setMessage(formatUiText('chatFailed', { error: errorMessage(error) }))
      setChatBusy(false)
      setCancelChat(null)
      setChatMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, streaming: false } : item))
    }
  }
  const suggest = async (instruction: string, selectionOverride?: string) => {
    if (!activeRelPath) { setMessage(uiText('openChapterFirst')); return }
    let effectiveProfileId = providerProfileId
    if (!effectiveProfileId) {
      const info = await window.novelAPI.project.getInfo()
      effectiveProfileId = info.ok ? info.data?.manifest.providerProfile ?? null : null
      if (info.ok && info.data) useAppStore.setState({ project: info.data })
    }
    if (!effectiveProfileId) { setMessage(uiText('providerRequired')); return }
    if (instruction === uiText('extractSettingsPrompt')) {
      setEditBusy(true)
      try {
        const result = await window.novelAPI.memory.extractFromChapter(effectiveProfileId, activeRelPath)
        setMessage(result.ok ? formatUiText('canonProposalGenerated', { count: result.data.length }) : result.error.message)
      } catch (error) { setMessage(formatUiText('suggestionRegionFailed', { error: errorMessage(error) })) }
      finally { setEditBusy(false) }
      return
    }
    setEditBusy(true)
    const currentRequestId = `job_${crypto.randomUUID()}`
    setRequestId(currentRequestId)
    try {
      const result = await window.novelAPI.aiEdit.run({ requestId: currentRequestId, profileId: effectiveProfileId, relPath: activeRelPath, prompt: instruction, selection: selectionOverride || editorSelection || null })
      if (result.ok) { setSuggestion(result.data); useAppStore.getState().setPendingSuggestion(result.data) }
      else setMessage(result.error.message)
    } catch (error) { setMessage(formatUiText('chatFailed', { error: errorMessage(error) })) }
    finally { setEditBusy(false); setRequestId(null) }
  }
  useEffect(() => {
    const openWorkflowTab = () => setActiveTab('Workflow')
    const toggleAgent = () => setActiveTab((tab) => tab === 'Agent' ? 'Workflow' : 'Agent')
    const askSelection = () => { if (editorSelection.trim()) void ask(); else setMessage(uiText('selectTextFirst')) }
    const selectionAction = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; actionId?: string; prompt?: string; mutatesDocument?: boolean; selection?: string }>).detail
      const actionId = detail?.actionId ?? detail?.action
      const selectedText = detail?.selection?.trim() || editorSelection.trim()
      if (!actionId || !selectedText) { setMessage(uiText('selectTextFirst')); return }
      if (actionId === 'select') { setActiveTab('Agent'); setPrompt(uiText('settingsPrompt')); return }
      if (actionId === 'explain' || detail?.mutatesDocument === false) { setActiveTab('Agent'); void ask(`${detail.prompt || uiText('selectionExplainPrompt')}\n\n${selectedText}`); return }
      void suggest(detail.prompt || uiText('selectionRewritePrompt'), selectedText)
    }
    window.addEventListener('novel:open-workflow-tab', openWorkflowTab)
    window.addEventListener('novel:toggle-agent', toggleAgent)
    window.addEventListener('novel:ask-selection', askSelection)
    window.addEventListener('novel:selection-action', selectionAction)
    return () => { window.removeEventListener('novel:open-workflow-tab', openWorkflowTab); window.removeEventListener('novel:toggle-agent', toggleAgent); window.removeEventListener('novel:ask-selection', askSelection); window.removeEventListener('novel:selection-action', selectionAction) }
  }, [ask, editorSelection, suggest])
  const acceptSuggestion = async () => {
    if (!suggestion) return
    setEditBusy(true)
    try {
      const accepted = await useAppStore.getState().acceptPendingSuggestion()
      if (accepted) { setSuggestion(null); setMessage(uiText('suggestionAccepted')) }
    } catch (error) { setMessage(formatUiText('suggestionApplyFailed', { error: errorMessage(error) })) }
    finally { setEditBusy(false) }
  }
  const rejectSuggestion = async () => {
    if (!suggestion) return
    setEditBusy(true)
    try {
      const result = await window.novelAPI.aiEdit.reject(suggestion.id)
      if (!result.ok) { setMessage(formatUiText('suggestionRejectFailed', { error: result.error.message })); return }
      useAppStore.getState().setPendingSuggestion(null); setSuggestion(null); setMessage(uiText('suggestionRejected'))
    } catch (error) { setMessage(formatUiText('suggestionRejectFailed', { error: errorMessage(error) })) }
    finally { setEditBusy(false) }
  }
  const cancelSuggestion = async () => {
    if (!requestId) { setMessage(uiText('suggestionCancelUnavailable')); return }
    try {
      const result = await window.novelAPI.aiEdit.cancel(requestId)
      setMessage(result.ok ? uiText('suggestionCancelled') : formatUiText('suggestionCancelFailed', { error: result.error.message }))
    } catch (error) { setMessage(formatUiText('suggestionCancelFailed', { error: errorMessage(error) })) }
  }
  const retrySuggestion = async () => {
    if (!suggestion) return
    setEditBusy(true); setMessage(uiText('retryingSuggestion'))
    try {
      const result = await window.novelAPI.aiEdit.retry(suggestion.id)
      if (!result.ok) { setMessage(formatUiText('suggestionRetryFailed', { error: result.error.message })); return }
      setSuggestion(result.data); useAppStore.getState().setPendingSuggestion(result.data); setMessage(uiText('suggestionRetried'))
    } catch (error) { setMessage(formatUiText('suggestionRetryFailed', { error: errorMessage(error) })) }
    finally { setEditBusy(false) }
  }
  const createSingleRegionSuggestion = async (region: SuggestionChangeRegion) => {
    if (!suggestion || !providerProfileId || !activeRelPath) return
    setEditBusy(true)
    try {
      const chapter = await window.novelAPI.chapter.read(activeRelPath)
      if (!chapter.ok) { setMessage(formatUiText('chapterReadFailed', { error: chapter.error.message })); return }
      if (chapter.data.markdown !== suggestion.original) { setMessage(uiText('suggestionDiffStale')); return }
      const result = await window.novelAPI.aiEdit.createFromText({
        profileId: providerProfileId,
        relPath: activeRelPath,
        prompt: formatUiText('suggestionRegionPrompt', { prompt: suggestion.prompt, region: region.id.replace('region-', '') }),
        selection: suggestion.selection,
        suggested: applySuggestionRegion(suggestion.original, region)
      })
      if (!result.ok) { setMessage(formatUiText('suggestionRegionFailed', { error: result.error.message })); return }
      const rejected = await window.novelAPI.aiEdit.reject(suggestion.id)
      if (!rejected.ok) { setMessage(formatUiText('suggestionRegionSwitchFailed', { error: rejected.error.message })); return }
      setSuggestion(result.data)
      useAppStore.getState().setPendingSuggestion(result.data)
      setMessage(formatUiText('suggestionRegionSwitched', { region: region.id }))
    } catch (error) { setMessage(formatUiText('suggestionRegionFailed', { error: errorMessage(error) })) }
    finally { setEditBusy(false) }
  }
  const inspectContext = async () => {
    if (!activeRelPath) { setMessage(uiText('openChapterFirst')); return }
    setMessage(uiText('contextBuild'))
    try {
      const result = await window.novelAPI.context.build({ relPath: activeRelPath, sceneId: selectedSceneId ?? undefined, selection: editorSelection || null, query: '', recipe: { id: 'chapter-review', maxTokens: 1200, includeSelection: true, entityLimit: 20, semanticLimit: 5 } })
      if (result.ok) { setContextManifest(result.data.manifest); await refreshContextSnapshots(); setMessage(formatUiText('contextChecked', { current: result.data.manifest.totalTokens, budget: result.data.manifest.budgetTokens })) } else setMessage(formatUiText('contextBuildFailed', { error: result.error.message }))
    } catch (error) { setMessage(formatUiText('contextBuildFailed', { error: errorMessage(error) })) }
  }
  const verifySelection = async () => {
    if (!activeRelPath) { setMessage(uiText('openChapterFirst')); return }
    if (!editorSelection.trim()) { setMessage(uiText('selectionParagraphFirst')); return }
    setMessage(uiText('selectionVerifying'))
    try {
      const result = await window.novelAPI.context.build({ relPath: activeRelPath, sceneId: selectedSceneId ?? undefined, selection: editorSelection, query: '', recipe: { id: 'selection-verification', maxTokens: 1200, includeSelection: true, entityLimit: 20, semanticLimit: 5 } })
      if (!result.ok) { setMessage(formatUiText('selectionVerificationFailed', { error: result.error.message })); return }
      const included = result.data.manifest.items.some((item) => item.source === 'selection')
      setContextManifest(result.data.manifest)
      setMessage(included ? formatUiText('selectionVerified', { count: editorSelection.length }) : uiText('selectionNotIncludedMessage'))
    } catch (error) { setMessage(formatUiText('selectionVerificationFailed', { error: errorMessage(error) })) }
  }
  const runWorkflow = async () => {
    if (!activeRelPath) { setMessage(uiText('openChapterFirst')); return }
    if (!providerProfileId) { setMessage(uiText('providerRequired')); return }
    setRunning(true)
    const workflowId = project?.manifest.defaultWorkflow ?? 'flow_builtin_novel'
    setMessage(formatUiText('workflowStarting', { id: workflowId }))
    try {
      const result = await window.novelAPI.workflowRuntime.start(workflowId, activeRelPath, selectedSceneId ?? undefined)
      if (result.ok) setWorkflowRunId(result.data); else { setMessage(result.error.message); setRunning(false) }
    } catch (error) { setMessage(formatUiText('workflowStartFailed', { error: errorMessage(error) })); setRunning(false) }
  }
  const cancelWorkflow = async () => {
    if (!workflowRunId) { setMessage(uiText('workflowNoCancellable')); return }
    setMessage(uiText('workflowCanceling'))
    try {
      const result = await window.novelAPI.workflowRuntime.cancel(workflowRunId)
      setMessage(result.ok ? uiText('workflowCancelRequested') : formatUiText('workflowCancelFailed', { error: result.error.message }))
    } catch (error) { setMessage(formatUiText('workflowCancelFailed', { error: errorMessage(error) })) }
  }
  const retryWorkflow = async () => {
    if (!workflowRunId) return
    const targetRelPath = workflowRun?.relPath
    if (!targetRelPath) {
      setMessage(uiText('workflowHistoryPathMissing'))
      await runWorkflow()
      return
    }
    setRunning(true)
    setMessage(uiText('workflowRetrying'))
    try {
      const result = await window.novelAPI.workflowRuntime.retry(workflowRunId, targetRelPath)
      if (!result.ok) { setMessage(result.error.message); setRunning(false) }
    } catch (error) { setMessage(formatUiText('workflowRetryFailed', { error: errorMessage(error) })); setRunning(false) }
  }
  const resumeWorkflow = async (assetId?: string, reviewAction: 'approve' | 'reject' | 'edit' = 'approve') => {
    if (!workflowRun) { setMessage(uiText('workflowNoResumable')); return }
    if (workflowRun.relPathRecovery === 'unavailable') { setMessage(uiText('workflowRecoveryUnavailableMessage')); return }
    setRunning(true)
    const resumeInput = assetId ? { assetId } : reviewAction === 'edit' ? { action: 'edit', editedContent: reviewDraft } : { action: reviewAction }
    setMessage(assetId ? uiText('workflowAssetResuming') : reviewAction === 'reject' ? uiText('workflowRejecting') : reviewAction === 'edit' ? uiText('workflowSubmittingEdit') : uiText('workflowApproving'))
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
          setMessage(assetId ? uiText('imageWritebackSynced') : uiText('workflowWritebackSynced'))
        }
      }
    } catch (error) { setMessage(formatUiText('workflowResumeFailed', { error: errorMessage(error) })); setRunning(false) }
  }
  const waitingNode = workflowRun ? Object.values(workflowRun.nodes).find((node) => node.status === 'waiting_human') : undefined
  const waitingText = reviewableText(waitingNode?.output)
  const canReviewWaitingNode = Boolean(waitingNode && (waitingText || waitingNode.nodeId === 'image-select'))
  useEffect(() => {
    if (workflowRun?.status === 'waiting_human' && waitingNode) setReviewDraft(waitingText)
  }, [workflowRun?.id, waitingNode?.nodeId])
  const humanReviewCard = workflowRun?.status === 'waiting_human' && waitingNode && canReviewWaitingNode ? <div className="human-review-card"><strong>{uiText('workflowReviewPaused')}</strong><span>{formatUiText('currentNode', { node: waitingNode.nodeId })}</span><textarea aria-label={uiText('workflowReviewPlaceholder')} value={reviewDraft} onChange={(event) => setReviewDraft(event.target.value)} placeholder={uiText('workflowReviewPlaceholder')} /><small>{uiText('workflowReviewHint')}</small></div> : workflowRun?.status === 'waiting_human' && waitingNode ? <div className="workflow-recovery-warning" role="status">{uiText('reviewRecoveryPending')}</div> : null
  const humanReviewActions = workflowRun?.status === 'waiting_human' && waitingNode && canReviewWaitingNode && waitingNode.nodeId !== 'image-select' ? <div className="human-review-actions"><button type="button" onClick={() => void resumeWorkflow(undefined, 'reject')} disabled={running}>{uiText('workflowReviewReject')}</button><button type="button" onClick={() => void resumeWorkflow(undefined, 'edit')} className="secondary" disabled={running || !reviewDraft.trim()}>{uiText('workflowReviewEditApprove')}</button><button type="button" data-testid="workflow-resume-review" onClick={() => void resumeWorkflow(undefined, 'approve')} className="primary" disabled={running}>{uiText('workflowReviewApprove')}</button></div> : null
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
    if (!activeRelPath) { setMessage(uiText('openChapterFirst')); return }
    if (!providerProfileId) { setMessage(uiText('providerRequired')); return }
    setMessage(uiText('summaryContextBuild'))
    try {
      const contextResult = await window.novelAPI.context.build({ relPath: activeRelPath, sceneId: selectedSceneId ?? undefined, selection: editorSelection || null, query: 'summary', recipe: { id: 'chapter-summary', maxTokens: 3000, includeSelection: true, entityLimit: 20, semanticLimit: 5 } })
      if (!contextResult.ok) { setMessage(formatUiText('summaryContextFailed', { error: contextResult.error.message })); return }
      setContextManifest(contextResult.data.manifest)
      await refreshContextSnapshots()
      const result = await window.novelAPI.ai.chat(providerProfileId, { messages: [{ role: 'user', content: `${uiText('summaryPrompt')}\n\n${contextResult.data.text}` }] })
      setMessage(result.ok ? formatUiText('chapterSummary', { text: result.data.text }) : formatUiText('summaryFailed', { error: result.error.message }))
    } catch (error) { setMessage(formatUiText('summaryFailed', { error: errorMessage(error) })) }
  }
  const cancelCurrentChat = () => {
    cancelChat?.()
    setCancelChat(null)
    setChatBusy(false)
    setMessage(uiText('chatCancelled'))
    setChatMessages((current) => current.map((item) => item.streaming ? { ...item, streaming: false } : item))
  }

  return (
    <aside className="right-panel panel-border-left" data-testid="right-panel">
      <div className="right-panel-content"><div className="right-tabs" role="tablist" aria-label={uiText('rightPanelAria')}>{rightTabs.map((tab, index) => <button type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`right-panel-${tab.toLowerCase()}`} tabIndex={activeTab === tab ? 0 : -1} key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)} onKeyDown={(event) => onRightTabKeyDown(event, index)}>{tab === 'Agent' ? uiText('agent') : tab === 'Workflow' ? uiText('workflow') : uiText('outline')}</button>)}</div>
      {activeTab === 'Agent' && <div id="right-panel-agent" className="right-scroll">
        <div className="right-heading">{uiText('context')} <button type="button" className="context-inspect" onClick={() => void inspectContext()}>{uiText('inspectContext')}</button>{contextManifest && contextManifest.items.length > 0 && <button type="button" className="context-expand" onClick={() => setExpandedContext(expandedContext.size === contextManifest.items.length ? new Set() : new Set(contextManifest.items.map((item) => item.id)))}>{expandedContext.size === contextManifest.items.length ? uiText('collapseAll') : uiText('expandAll')}</button>}</div>
        <div className="context-list">
          {contextManifest?.items.map((item) => <button type="button" className={`context-card ${expandedContext.has(item.id) ? 'expanded' : ''}`} key={item.id} onClick={() => setExpandedContext((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })}><div className="context-icon">{item.layer.slice(0, 1).toUpperCase()}</div><div><b>{item.source}</b><small>{item.layer} · {item.estimatedTokens} {uiText('tokens')}{item.truncated ? ` · ${uiText('truncated')}` : ''}</small>{expandedContext.has(item.id) && <em>{item.text}</em>}</div><ChevronRight size={14}/></button>)}
          {!contextManifest && <div className="context-empty">{uiText('contextEmpty')}</div>}
        </div>
        {contextManifest && <div className="context-manifest"><b>{uiText('contextInspector')}</b><small>{contextManifest.totalTokens}/{contextManifest.budgetTokens} {uiText('tokens')} · {contextManifest.recipeId}{contextManifest.omittedSources.length ? ` · ${formatUiText('omitted', { count: contextManifest.omittedSources.length })}` : ''}</small><small>{formatUiText('retrieval', { query: contextManifest.retrieval.query || '—' })} · {contextManifest.retrieval.selectionIncluded ? uiText('selectionIncluded') : uiText('selectionNotIncluded')} · {formatUiText('candidates', contextManifest.retrieval.candidateCounts)}</small>{contextManifest.items.map((item) => <div key={item.id}><span>{item.layer}{item.truncated ? ` · ${uiText('truncated')}` : ''}</span>{item.source}<em>{item.estimatedTokens}</em></div>)}</div>}
        {contextSnapshots.length > 0 && <div className="context-snapshots"><div className="context-snapshot-head"><b>{uiText('contextSnapshots')}</b><small>{contextSnapshots.length} {uiText('records')}</small></div>{contextSnapshots.slice(0, 5).map((snapshot) => <button type="button" data-snapshot-id={snapshot.id} className="context-snapshot" key={snapshot.id} disabled={replayBusy} onClick={() => void replayContextSnapshot(snapshot)}><span>{new Date(snapshot.createdAt).toLocaleTimeString()}</span><em>{snapshot.recipeId} · {snapshot.totalTokens} {uiText('tokens')}</em><small>{formatUiText('snapshotVersionSummary', { format: snapshot.formatVersion, retrieval: snapshot.retrievalVersion, project: snapshot.projectSchemaVersion })}</small><small>{uiText('replay')}</small></button>)}</div>}
        {replayCompatibility && <div data-testid="context-replay-compatibility" className="context-replay-compatibility"><b>{uiText('replayCompatibility')}</b><small>Format v{replayCompatibility.fromFormatVersion} · Retrieval v{replayCompatibility.fromRetrievalVersion} · Project schema v{replayCompatibility.fromProjectSchemaVersion}</small><span>{replayCompatibility.migrated ? uiText('migratedRecomputed') : uiText('versionMatches')}</span><small>{formatUiText('strategy', { strategy: replayCompatibility.resultStrategy === 'recompute' ? uiText('recomputeUsingCurrentIndexes') : replayCompatibility.resultStrategy })}</small>{replayCompatibility.notes.map((note) => <em key={note}>{note}</em>)}</div>}
        {replayDifferences.length > 0 && <div data-testid="context-differences" className="context-differences"><div data-testid="context-difference-summary" className="context-difference-summary"><b>{uiText('replayDifferenceSummary')}</b><span>{formatUiText('replayAddedCount', { count: replaySummary.added })}</span><span>{formatUiText('replayRemovedCount', { count: replaySummary.removed })}</span><span>{formatUiText('replayChangedCount', { count: replaySummary.changed })}</span><small>{formatUiText('replayTokenDelta', { count: replaySummary.tokenDelta >= 0 ? `+${replaySummary.tokenDelta}` : replaySummary.tokenDelta })}</small></div><b>{formatUiText('replayDifferences', { count: replayDifferences.length })}</b>{replayDifferences.map((difference) => <div data-testid="context-difference" key={`${difference.kind}-${difference.source}`}><span>{difference.kind === 'added' ? uiText('added') : difference.kind === 'removed' ? uiText('removed') : uiText('changed')}</span><em>{difference.source}</em><small>{difference.previousTokens ?? '—'} → {difference.currentTokens ?? '—'} {uiText('tokens')}</small></div>)}</div>}
        <div className="divider"/>
        <div className="agent-title"><Sparkles size={16}/> {uiText('askAgent')} <button type="button" className="open-chat-button" onClick={() => window.dispatchEvent(new Event('novel:open-chat'))}>{uiText('openStandaloneChat')}</button>{editorSelection.trim() && <><button type="button" className="selection-verify" onMouseDown={(event) => event.preventDefault()} onClick={() => void verifySelection()}>{uiText('verifySelection')} · {editorSelection.length} {uiText('characters')}</button><button type="button" className="selection-clear" onMouseDown={(event) => event.preventDefault()} onClick={() => window.dispatchEvent(new Event('novel:clear-selection'))}>{uiText('clearSelection')}</button></>}</div>
        <div className="suggestions">
          <button type="button" className="suggestion-prompt-button" onMouseDown={(event) => event.preventDefault()} onClick={() => setPrompt(uiText('chapterBehaviorPrompt'))}>{uiText('chapterBehaviorPrompt')}</button>
          <button type="button" className="suggestion-prompt-button" onMouseDown={(event) => event.preventDefault()} onClick={() => setPrompt(uiText('logicPrompt'))}>{uiText('logicPrompt')}</button>
          <button type="button" className="suggestion-prompt-button" onMouseDown={(event) => event.preventDefault()} onClick={() => setPrompt(uiText('polishPrompt'))}>{uiText('polishPrompt')}</button>
          <button type="button" className="suggestion-prompt-button" onMouseDown={(event) => event.preventDefault()} onClick={() => setPrompt(uiText('titlePrompt'))}>{uiText('titlePrompt')}</button>
        </div>
        <div className="selection-hint">{editorSelection.trim() ? formatUiText('selectionHintSelected', { count: editorSelection.length }) : uiText('selectionHintEmpty')}</div>
        <div className="ask-box"><input aria-label={uiText('questionPlaceholder')} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={editorSelection.trim() ? uiText('selectionPromptSelected') : uiText('selectionPromptEmpty')} onKeyDown={e => e.key === 'Enter' && void ask()}/><button type="button" aria-label={chatBusy ? uiText('cancelGeneration') : uiText('sendQuestion')} disabled={!chatBusy && !prompt.trim()} onMouseDown={(event) => event.preventDefault()} onClick={chatBusy ? cancelCurrentChat : () => void ask()}><Bot size={17}/></button></div>
         {chatMessages.length > 0 && <div className="agent-chat" aria-live="polite">{chatMessages.map((item, index) => <div className={`agent-chat-message ${item.role}`} key={`${item.role}-${index}`}><small>{item.role === 'user' ? uiText('you') : messageAuthor(item.kind)}</small>{item.role === 'assistant' ? <MarkdownMessage content={item.content || (item.streaming ? uiText('generating') : '')}/> : <p>{item.content}</p>}</div>)}</div>}
        {message && <div className="agent-response">{message}</div>}
        <div className="divider"/>
        <div className="agent-title"><CircleDot size={16}/> {uiText('quickActions')}</div>
        <div className="quick-grid">
          <button type="button" data-testid="suggestion-generate" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => void suggest(uiText('continueChapterPrompt'))}><MessageSquareText size={14}/>{uiText('continueChapter')}</button><button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => void suggest(uiText('rewriteChapterPrompt'))}><Sparkles size={14}/>{uiText('rewriteChapter')}</button>
          <button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => void summarize()}><SearchCheck size={14}/>{uiText('summarizeChapter')}</button><button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => void suggest(uiText('extractSettingsPrompt'))}><CircleDot size={14}/>{uiText('extractSettings')}</button>
          <button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => void suggest(uiText('checkConflictsPrompt'))}><AlertTriangle size={14}/>{uiText('checkConflicts')}</button><button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={onOpenImages}><ImagePlus size={14}/>{uiText('generateIllustration')}</button>
        </div>
        {editBusy && <div className="suggestion-busy">{uiText('suggestionGenerating')} <button type="button" className="inline-action" onClick={() => void cancelSuggestion()}>{uiText('cancel')}</button></div>}
        {suggestion && <div className="suggestion-card"><div className="diff-title">{uiText('suggestionPending')}</div><p className="suggestion-prompt">{suggestion.prompt}</p><div className="suggestion-diff"><del>{suggestion.original}</del><ins>{suggestion.suggested}</ins></div>{buildSuggestionRegions(suggestion.original, suggestion.suggested).length > 1 && <div className="suggestion-regions"><span>{uiText('multipleRegions')}</span>{buildSuggestionRegions(suggestion.original, suggestion.suggested).map((region) => <button type="button" key={region.id} onClick={() => void createSingleRegionSuggestion(region)} disabled={editBusy}>{formatUiText('keepRegion', { region: region.id.replace('region-', ''), original: region.original || uiText('added'), replacement: region.replacement || uiText('removed') })}</button>)}</div>}<div className="suggestion-actions"><button data-testid="suggestion-accept" className="primary" onClick={() => void acceptSuggestion()} disabled={editBusy}>{uiText('accept')}</button><button data-testid="suggestion-reject" onClick={() => void rejectSuggestion()} disabled={editBusy}>{uiText('reject')}</button><button onClick={() => void retrySuggestion()} disabled={editBusy}>{uiText('retry')}</button></div></div>}
        <div className="divider"/>
        <div className="workflow-scope-card"><b>{uiText('workflowScope')}</b><span>{formatUiText('inputChapter', { chapter: activeChapter?.title ?? activeRelPath ?? '—' })}</span><span>{formatUiText('runPath', { path: activeRelPath ?? '—' })}</span><span>{uiText('writeBackTarget')}</span></div>
        <div className="workflow-head"><div><b>{uiText('workflowStatus')}</b><small>{workflowRun ? formatUiText('currentFlow', { status: statusLabel(workflowRun.status) }) : workflowLoading ? uiText('loadingCurrentRun') : uiText('notRunCurrentChapter')}</small></div><strong>{workflowRun ? `${Math.round(Object.values(workflowRun.nodes).filter((node) => ['succeeded', 'skipped'].includes(node.status)).length / Math.max(1, Object.values(workflowRun.nodes).length) * 100)}%` : '—'}</strong></div>
        <div className="workflow-line">
          {workflowRun ? Object.values(workflowRun.nodes).map((node) => <div className={`wf-step ${node.status === 'succeeded' || node.status === 'skipped' ? 'done' : node.status === 'running' || node.status === 'waiting_human' ? 'now' : ''}`} key={node.nodeId}><span>{node.status === 'succeeded' || node.status === 'skipped' ? <Check size={13}/> : node.status === 'running' || node.status === 'waiting_human' ? <Play size={12}/> : ''}</span><small>{node.nodeId}</small></div>) : <div className="workflow-empty">{uiText('showNodesAfterRun')}</div>}
        </div>
        <button type="button" data-testid="workflow-run" data-running={running ? 'true' : 'false'} className="run-workflow" onClick={running ? () => void cancelWorkflow() : () => void runWorkflow()}>{running ? uiText('cancelWorkflow') : uiText('runWorkflow')}</button>
        {workflowRun && <div className="runtime-card"><div><b>{formatUiText('runtimeRun', { id: workflowRun.id.slice(-8) })}</b><span className={`runtime-status ${workflowRun.status}`}>{statusLabel(workflowRun.status)}</span></div><small className="runtime-scope">{formatUiText('runtimeInputChapter', { chapter: workflowRun.relPath ?? uiText('runtimeUnknown') })}{workflowRun.sceneId ? ` · ${formatUiText('runtimeScene', { id: workflowRun.sceneId })}` : ` · ${uiText('runtimeWholeChapter')}`} · {uiText('runtimeWriteBackTarget')}{uiText('runtimeSameChapter')}</small>{workflowRun.relPathRecovery === 'unavailable' && <div className="workflow-recovery-warning" role="alert">{uiText('workflowRecoveryUnavailable')}</div>}{humanReviewCard}{humanReviewActions}{Object.values(workflowRun.nodes).map((node) => <div className="runtime-node" key={node.nodeId}><span>{node.nodeId}</span><em>{statusLabel(node.status)}</em>{node.error && <small>{node.error}</small>}{node.log.map((line, index) => <small key={`${node.nodeId}-${index}`}>{line}</small>)}</div>)}{workflowRun.status === 'waiting_human' && workflowRun.relPathRecovery !== 'unavailable' && waitingAssets.length > 0 ? <div className="workflow-asset-choices"><small>{uiText('workflowImageHint')}</small>{waitingAssets.map((asset) => <button type="button" data-testid="workflow-asset-choice" key={asset.assetId} onClick={() => void resumeWorkflow(asset.assetId)}>{waitingAssetUrls[asset.assetId] ? <img src={waitingAssetUrls[asset.assetId]} alt={asset.prompt ?? asset.assetId} /> : <span>{asset.assetId}</span>}<em>{asset.assetId.slice(-8)}</em></button>)}</div> : null}{['failed', 'cancelled'].includes(workflowRun.status) && <button className="primary" onClick={() => void retryWorkflow()}>{uiText('retryFailedNodes')}</button>}{workflowRun.status === 'waiting_human' && workflowRun.relPathRecovery === 'unavailable' && <button className="primary runtime-action" onClick={() => void retryWorkflow()}>{uiText('rerunCurrentChapter')}</button>}</div>}
      </div>}
      {activeTab === 'Workflow' && <div id="right-panel-workflow" className="right-scroll right-tool-panel"><h3>{uiText('workflow')}</h3><p>{uiText('workflowDescription')}</p>{message && <p className="workflow-message" role="status">{message}</p>}<button type="button" className="run-workflow" onClick={running ? () => void cancelWorkflow() : () => void runWorkflow()}>{running ? uiText('cancelWorkflow') : uiText('runWorkflow')}</button>{workflowLoading && <p className="workflow-empty" role="status">{uiText('workflowLoading')}</p>}{workflowRun && <div className="runtime-card"><b>{uiText('workflowLatestRun')}</b><span className={`runtime-status ${workflowRun.status}`}>{statusLabel(workflowRun.status)}</span><small className="runtime-scope">{formatUiText('runtimeInputChapter', { chapter: workflowRun.relPath ?? '—' })}{workflowRun.sceneId ? ` · ${formatUiText('runtimeScene', { id: workflowRun.sceneId })}` : ` · ${uiText('runtimeWholeChapter')}`}</small>{workflowRun.relPathRecovery === 'unavailable' && <div className="workflow-recovery-warning" role="alert">{uiText('workflowRecoveryUnavailable')}</div>}{humanReviewCard}{humanReviewActions}{Object.values(workflowRun.nodes).map((node) => <div className="runtime-node" key={node.nodeId}><span>{node.nodeId}</span><em>{statusLabel(node.status)}</em>{node.error && <small>{node.error}</small>}</div>)}{workflowRun.status === 'waiting_human' && workflowRun.relPathRecovery !== 'unavailable' && waitingAssets.length > 0 ? <div className="workflow-asset-choices">{waitingAssets.map((asset) => <button type="button" className="asset-choice" key={asset.assetId} onClick={() => void resumeWorkflow(asset.assetId)}>{waitingAssetUrls[asset.assetId] ? <img src={waitingAssetUrls[asset.assetId]} alt={asset.prompt ?? asset.assetId} /> : asset.assetId.slice(-8)}</button>)}</div> : null}{['failed', 'cancelled'].includes(workflowRun.status) && <button type="button" className="primary runtime-action" onClick={() => void retryWorkflow()}>{uiText('retryFailedNodes')}</button>}{workflowRun.status === 'waiting_human' && workflowRun.relPathRecovery === 'unavailable' && <button type="button" className="primary runtime-action" onClick={() => void retryWorkflow()}>{uiText('rerunCurrentChapter')}</button>}</div>}</div>}
      {activeTab === 'Outline' && <div id="right-panel-outline" className="right-scroll right-tool-panel"><h3>{uiText('outline')}</h3><p>{uiText('outlineFile')}</p>{outline.trim() ? <pre className="outline-document">{outline}</pre> : <div className="story-section-empty"><h3>{uiText('emptyOutline')}</h3><p>{uiText('editOutlineHint')}</p></div>}</div>}
      </div>
    </aside>
  )
}
