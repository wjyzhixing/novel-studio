import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, CircleAlert, FileText, Play, RefreshCw, ShieldCheck } from 'lucide-react'
import { authoringWorkflowBlockReason, canExportAuthoring, type AuthoringProgress, type AuthoringReviewReport, type AuthoringStage, type FullRevisionReport } from '../../../shared/authoring'
import type { StorySection } from './Sidebar'
import { useUiText, type UiTextKey } from '../lib/i18n'
import { useAppStore } from '../store/app-store'

type StageIcon = typeof BookOpen
type Stage = { id: AuthoringStage; labelKey: UiTextKey; icon: StageIcon }

const stages: Stage[] = [
  { id: 'premise', labelKey: 'authoringStagePremise', icon: FileText },
  { id: 'bible', labelKey: 'authoringStageBible', icon: BookOpen },
  { id: 'outline', labelKey: 'authoringStageOutline', icon: FileText },
  { id: 'chapter_plan', labelKey: 'authoringStageChapterPlan', icon: FileText },
  { id: 'chapter_writing', labelKey: 'authoringStageWriting', icon: Play },
  { id: 'canon_review', labelKey: 'authoringStageCanon', icon: ShieldCheck },
  { id: 'full_revision', labelKey: 'authoringStageRevision', icon: CircleAlert },
  { id: 'export', labelKey: 'authoringStageExport', icon: Check }
]

function formatCount(value: number): string {
  return value.toLocaleString()
}

function stageComplete(progress: AuthoringProgress, id: AuthoringStage): boolean {
  if (id === 'premise') return progress.premise.completed
  if (id === 'bible') return progress.bible.completed
  if (id === 'outline') return progress.outline.completed
  if (id === 'chapter_plan') return progress.chapters.length > 0 && progress.chapters.every((chapter) => Boolean(chapter.plan?.trim()))
  if (id === 'chapter_writing') return progress.chapters.length > 0 && progress.chapters.every((chapter) => ['approved', 'revised'].includes(chapter.status))
  if (id === 'canon_review') return progress.canon.pendingProposals === 0 && progress.chapters.some((chapter) => ['approved', 'revised'].includes(chapter.status))
  if (id === 'full_revision') return progress.revision.completed
  return progress.export.completed
}

export function AuthoringFlow({ onOpenStory, onOpenWorkflow, onOpenChapter }: { onOpenStory: (section: StorySection) => void; onOpenWorkflow: () => void; onOpenChapter: (relPath: string) => void }) {
  const uiText = useUiText()
  const project = useAppStore((state) => state.project)
  const [progress, setProgress] = useState<AuthoringProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [reviewReport, setReviewReport] = useState<AuthoringReviewReport | null>(null)
  const [fullRevisionReport, setFullRevisionReport] = useState<FullRevisionReport | null>(null)
  const [premiseMarkdown, setPremiseMarkdown] = useState('')
  const [outlineMarkdown, setOutlineMarkdown] = useState('')
  const [foundationLoading, setFoundationLoading] = useState(true)
  const format = (key: UiTextKey, values: Record<string, string | number>) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))

  const load = async (refresh = false) => {
    setLoading(true)
    try {
      const result = refresh ? await window.novelAPI.authoring.refresh() : await window.novelAPI.authoring.get()
      if (result.ok) { setProgress(result.data); setNotice(null) }
      else setNotice(format(refresh ? 'authoringRefreshFailed' : 'authoringLoadFailed', { error: result.error.message }))
    } catch (error) {
      setNotice(format(refresh ? 'authoringRefreshFailed' : 'authoringLoadFailed', { error: error instanceof Error ? error.message : String(error) }))
    } finally { setLoading(false) }
  }

  const loadFoundation = async () => {
    setFoundationLoading(true)
    try {
      const [premise, outline] = await Promise.all([window.novelAPI.project.readText('story/premise.md'), window.novelAPI.project.readText('story/outline.md')])
      if (!premise.ok) throw new Error(premise.error.message)
      if (!outline.ok) throw new Error(outline.error.message)
      setPremiseMarkdown(premise.data)
      setOutlineMarkdown(outline.data)
    } catch (error) {
      setNotice(format('authoringFoundationLoadFailed', { error: error instanceof Error ? error.message : String(error) }))
    } finally { setFoundationLoading(false) }
  }

  useEffect(() => { void load(); void loadFoundation() }, [project?.rootPath])

  useEffect(() => {
    if (!project?.rootPath) return
    return window.novelAPI.workflowRuntime.onEvent((event) => {
      const completion = event.completion
      if (!completion || !completion.targetRelPath) return
      void load(true)
    })
  }, [project?.rootPath])

  const activeChapter = useMemo(() => progress?.chapters.find((chapter) => ['planned', 'draft', 'review'].includes(chapter.status)), [progress])

  const runChapter = async () => {
    if (!activeChapter) { setNotice(uiText('authoringNoChapters')); return }
    const blockReason = progress ? authoringWorkflowBlockReason(progress) : null
    if (blockReason === 'canon') { setNotice(format('authoringPendingCanon', { count: progress?.canon.pendingProposals ?? 0 })); return }
    if (blockReason) { setNotice(uiText('authoringSetupIncomplete')); return }
    if (!project?.manifest.defaultWorkflow) { setNotice(uiText('workflowMissing')); return }
    setBusy(true)
    try {
      const result = await window.novelAPI.workflowRuntime.start(project.manifest.defaultWorkflow, activeChapter.relPath)
      if (result.ok) {
        setNotice(format('authoringWorkflowStarted', { chapter: activeChapter.title }))
        onOpenChapter(activeChapter.relPath)
        onOpenWorkflow()
        window.requestAnimationFrame(() => window.dispatchEvent(new Event('novel:open-workflow-tab')))
      }
      else setNotice(format('authoringWorkflowFailed', { error: result.error.message }))
    } catch (error) { setNotice(format('authoringWorkflowFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }

  const reviewBook = async () => {
    setBusy(true)
    try {
      const result = await window.novelAPI.authoring.review()
      if (result.ok) { setReviewReport(result.data); setNotice(result.data.passed ? uiText('authoringReviewPassed') : format('authoringReviewFailed', { count: result.data.issues.length })) }
      else setNotice(format('authoringRefreshFailed', { error: result.error.message }))
    } catch (error) { setNotice(format('authoringRefreshFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }

  const saveFoundation = async () => {
    setBusy(true)
    try {
      const result = await window.novelAPI.authoring.saveFoundation({ premise: premiseMarkdown, outline: outlineMarkdown })
      if (result.ok) { setProgress(result.data); setNotice(uiText('authoringFoundationSaved')) }
      else setNotice(format('authoringFoundationSaveFailed', { error: result.error.message }))
    } catch (error) { setNotice(format('authoringFoundationSaveFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }

  const prepareFullRevision = async () => {
    setBusy(true)
    try {
      const result = await window.novelAPI.fullRevision.prepare()
      if (result.ok) { setFullRevisionReport(result.data); setNotice(uiText('authoringRevisionPrepared')) }
      else setNotice(format('authoringRevisionFailed', { error: result.error.message }))
    } finally { setBusy(false) }
  }

  const approveFullRevision = async () => {
    if (!fullRevisionReport) return
    setBusy(true)
    try {
      const result = await window.novelAPI.fullRevision.approve(fullRevisionReport.reportId)
      if (result.ok) {
        setProgress(result.data)
        setNotice(uiText('authoringRevisionApproved'))
        const reviewed = await window.novelAPI.authoring.review()
        if (reviewed.ok) setReviewReport(reviewed.data)
      } else setNotice(format('authoringRevisionFailed', { error: result.error.message }))
    } finally { setBusy(false) }
  }

  const exportFinal = async () => {
    if (!reviewReport || !canExportAuthoring(reviewReport)) { setNotice(uiText('authoringExportBlocked')); return }
    const picked = await window.novelAPI.project.pickExportSave('markdown')
    if (!picked.ok || !picked.data) return
    setBusy(true)
    try {
      const result = await window.novelAPI.chapter.exportAll('markdown', picked.data)
      if (!result.ok) { setNotice(format('authoringWorkflowFailed', { error: result.error.message })); return }
      if (progress) { const saved = await window.novelAPI.authoring.markExported(picked.data); if (saved.ok) setProgress(saved.data) }
      setNotice(format('authoringExported', { path: picked.data }))
    } finally { setBusy(false) }
  }

  const openStage = (id: AuthoringStage) => {
    if (id === 'bible') onOpenStory('character')
    else if (id === 'outline') onOpenStory('plots')
    else if (id === 'canon_review') onOpenStory('foreshadowing')
    else if (id === 'chapter_writing' || id === 'chapter_plan') onOpenChapter(activeChapter?.relPath ?? progress?.chapters[0]?.relPath ?? '')
  }

  if (loading) return <main className="authoring-shell"><div className="authoring-loading">{uiText('loadingProjectContent')}</div></main>
  if (!progress) return <main className="authoring-shell"><div className="authoring-empty"><h2>{uiText('authoringFlow')}</h2><p>{notice ?? uiText('authoringNoChapters')}</p></div></main>

  const done = progress.chapters.filter((chapter) => ['approved', 'revised'].includes(chapter.status)).length
  const words = progress.chapters.reduce((total, chapter) => total + chapter.wordCount, 0)
  return <main className="authoring-shell" data-testid="authoring-flow">
    <header className="authoring-header"><div><h1>{uiText('authoringFlow')}</h1><p>{uiText('authoringFlowSubtitle')}</p></div><div className="authoring-header-actions"><button type="button" onClick={() => void load(true)} disabled={busy}><RefreshCw size={14} /> {uiText('authoringRefresh')}</button><button type="button" onClick={() => void reviewBook()} disabled={busy}><ShieldCheck size={14} /> {uiText('authoringReviewBook')}</button><button type="button" onClick={() => void (fullRevisionReport ? approveFullRevision() : prepareFullRevision())} disabled={busy}><ShieldCheck size={14} /> {fullRevisionReport ? uiText('authoringApproveRevision') : uiText('authoringPrepareRevision')}</button><button type="button" className="primary" onClick={() => void exportFinal()} disabled={busy || !reviewReport || !canExportAuthoring(reviewReport)}><Check size={14} /> {uiText('authoringExport')}</button></div></header>
    {notice && <div className="authoring-notice" role="status">{notice}</div>}
    <section className="authoring-foundation" data-testid="authoring-foundation">
      <div className="authoring-section-heading"><div><h2>{uiText('authoringFoundation')}</h2><small>{uiText('authoringFoundationHint')}</small></div><button type="button" className="primary" onClick={() => void saveFoundation()} disabled={busy || foundationLoading || !premiseMarkdown.trim() || !outlineMarkdown.trim()}>{uiText('authoringFoundationSave')}</button></div>
      {foundationLoading ? <p className="authoring-foundation-loading">{uiText('loadingProjectContent')}</p> : <div className="authoring-foundation-grid"><label>{uiText('authoringStagePremise')}<textarea data-testid="authoring-premise-editor" value={premiseMarkdown} onChange={(event) => setPremiseMarkdown(event.target.value)} /></label><label>{uiText('authoringStageOutline')}<textarea data-testid="authoring-outline-editor" value={outlineMarkdown} onChange={(event) => setOutlineMarkdown(event.target.value)} /></label></div>}
    </section>
    <section className="authoring-overview"><div><b>{project?.manifest.title}</b><span>{format('authoringChapters', { done, total: progress.chapters.length })}</span></div><div><b>{formatCount(words)}</b><span>{format('authoringWordCount', { current: formatCount(words), target: formatCount(progress.premise.targetWordCount) })}</span></div><div><b>{progress.canon.pendingProposals}</b><span>{format('authoringPendingCanon', { count: progress.canon.pendingProposals })}</span></div></section>
    <section className="authoring-stage-list" aria-label={uiText('authoringFlow')}>
      {stages.map((stage) => {
        const Icon = stage.icon
        const complete = stageComplete(progress, stage.id)
        const current = progress.phase === stage.id
        return <button type="button" className={`authoring-stage${current ? ' current' : ''}${complete ? ' complete' : ''}`} key={stage.id} onClick={() => openStage(stage.id)}>
          <span className="authoring-stage-icon"><Icon size={15} /></span><span className="authoring-stage-copy"><b>{uiText(stage.labelKey)}</b><small>{complete ? uiText('authoringCompleted') : current ? uiText('authoringInProgress') : uiText('authoringNeedsWork')}</small></span>{complete && <Check size={15} />}
        </button>
      })}
    </section>
    <section className="authoring-chapters"><div className="authoring-section-heading"><h2>{uiText('authoringStageWriting')}</h2><button type="button" className="primary" onClick={() => void runChapter()} disabled={busy || !activeChapter}><Play size={14} /> {uiText('authoringRunChapter')}</button></div>{progress.chapters.length === 0 ? <p>{uiText('authoringNoChapters')}</p> : <div className="authoring-chapter-grid">{progress.chapters.map((chapter) => <article className={`authoring-chapter-card status-${chapter.status}`} key={chapter.relPath}><div><span>第 {chapter.number} 章</span><b>{chapter.title}</b></div><small>{chapter.status} · {formatCount(chapter.wordCount)} {uiText('words')}</small>{chapter.plan && <p>{chapter.plan}</p>}<button type="button" onClick={() => onOpenChapter(chapter.relPath)}><FileText size={13} /> {uiText('authoringOpenChapter')}</button></article>)}</div>}</section>
    {reviewReport && <section className={`authoring-review-report${reviewReport.passed ? ' passed' : ' failed'}`}><div className="authoring-section-heading"><h2>{uiText('authoringReviewBook')}</h2><span>{reviewReport.passed ? uiText('authoringReviewPassed') : format('authoringReviewFailed', { count: reviewReport.issues.length })}</span></div>{reviewReport.issues.length > 0 && <ul>{reviewReport.issues.map((issue) => <li key={`${issue.code}-${issue.message}`}><b>{issue.severity}</b> {issue.message}</li>)}</ul>}</section>}
    {fullRevisionReport && <section className={`authoring-review-report${fullRevisionReport.passed ? ' passed' : ' failed'}`}><div className="authoring-section-heading"><h2>{uiText('authoringStageRevision')}</h2><span>{fullRevisionReport.passed ? uiText('authoringRevisionPrepared') : format('authoringReviewFailed', { count: fullRevisionReport.findings.length })}</span></div><ul>{fullRevisionReport.findings.map((finding) => <li key={finding.id}><b>{finding.severity}</b> {finding.message}</li>)}</ul>{fullRevisionReport.passed && !progress.revision.completed && <button type="button" onClick={() => void approveFullRevision()} disabled={busy}><Check size={13} /> {uiText('authoringApproveRevision')}</button>}</section>}
    <p className="authoring-boundary" data-review-gate="human.review"><ShieldCheck size={14} /> {uiText('workflowReviewHint')}</p>
  </main>
}
