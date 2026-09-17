import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ProjectIntegrity, ProjectRepairResult } from '../../../shared/ipc'
import { useUiText, type UiTextKey } from '../lib/i18n'
import { withTimeout } from '../lib/with-timeout'
import { useGlobalMessage } from '../lib/global-notification'

type HealthState = 'idle' | 'loading' | 'healthy' | 'warning' | 'error'
const HEALTH_OPERATION_TIMEOUT_MS = 15_000

function issueCount(report: ProjectIntegrity): number {
  return report.warnings.length + report.missingFiles.length + report.invalidSourceFiles.length + report.danglingRelations + report.danglingTimelineEntityRefs + report.danglingTimelineChapterRefs + report.staleEmbeddings + report.danglingEmbeddings + report.invalidStoryArtifacts
}

export function ProjectHealthPanel({ onClose }: { onClose: () => void }) {
  const uiText = useUiText()
  const dialogRef = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<HealthState>('idle')
  const [report, setReport] = useState<ProjectIntegrity | null>(null)
  const [repair, setRepair] = useState<ProjectRepairResult | null>(null)
  const [message, setMessage] = useGlobalMessage()
  const operationRef = useRef(0)
  const format = (key: UiTextKey, values: Record<string, string | number>) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))

  const check = async (announce = true) => {
    const operationId = operationRef.current + 1
    operationRef.current = operationId
    setState('loading')
    setMessage(announce ? uiText('checking') : '')
    setRepair(null)
    try {
      const result = await withTimeout(window.novelAPI.project.checkIntegrity(), HEALTH_OPERATION_TIMEOUT_MS, uiText('integrityTimeout'))
      if (operationRef.current !== operationId) return
      if (!result.ok) {
        setState('error')
        setMessage(`${uiText('checkFailed')}：${result.error.message}`)
        return
      }
      setReport(result.data)
      setState(issueCount(result.data) === 0 ? 'healthy' : 'warning')
      setMessage(issueCount(result.data) === 0 ? `${uiText('projectHealthy')}。` : format('issuesFound', { count: issueCount(result.data) }))
    } catch (error) {
      if (operationRef.current !== operationId) return
      setState('error')
      setMessage(`${uiText('checkFailed')}：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  useEffect(() => {
    void check(false)
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const getFocusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
    const focusFrame = window.requestAnimationFrame(() => getFocusable()[0]?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key === 'Tab') {
      const focusable = getFocusable()
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      operationRef.current += 1
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  const repairIndexes = async () => {
    const operationId = operationRef.current + 1
    operationRef.current = operationId
    setState('loading')
    setMessage(uiText('repairRunning'))
    try {
      const result = await withTimeout(window.novelAPI.project.repairIndexes(), HEALTH_OPERATION_TIMEOUT_MS, uiText('repairTimeout'))
      if (operationRef.current !== operationId) return
      if (!result.ok) {
        setState('error')
        setMessage(`${uiText('checkFailed')}：${result.error.message}`)
        return
      }
      await check(false)
      setRepair(result.data)
      setMessage(`${uiText('latestRepair')}：${format('rebuildSummary', { documents: result.data.documents, entities: result.data.entities, timeline: result.data.timeline, relations: result.data.relations, assets: result.data.assets })}${result.data.restoredSources.length ? `；${format('restoredSources', { files: result.data.restoredSources.length })}` : ''}。`)
    } catch (error) {
      if (operationRef.current !== operationId) return
      setState('error')
      setMessage(`${uiText('checkFailed')}：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const issues = report ? issueCount(report) : 0
  return <div className="health-overlay" role="dialog" aria-modal="true" aria-label={uiText('projectIntegrity')} onClick={onClose}>
    <section ref={dialogRef} className="health-panel" onClick={(event) => event.stopPropagation()}>
      <header><div className="health-heading"><span className="health-heading-icon"><ShieldCheck size={17} /></span><div><b>{uiText('projectIntegrity')}</b><small>{uiText('integritySubtitle')}</small></div></div><button className="health-close" type="button" onClick={onClose} aria-label={uiText('closeIntegrity')} title={uiText('closeIntegrity')}><X size={16} /></button></header>
      <div className="health-body">
        <div className={`health-summary ${state}`}>
          {state === 'loading' ? <Loader2 className="spin" size={18} /> : state === 'healthy' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div><b>{state === 'loading' ? uiText('checking') : state === 'healthy' ? uiText('projectHealthy') : state === 'warning' ? format('issuesFound', { count: issues }) : state === 'error' ? uiText('checkFailed') : uiText('checkNotRun')}</b><small>{message}</small></div>
        </div>
        {report && <>
          <div className="health-counts">
            <div><b>{report.chaptersIndexed}/{report.chaptersOnDisk}</b><small>{uiText('indexedChapters')}</small></div>
            <div><b>{report.entitiesIndexed}/{report.entitiesOnDisk}</b><small>{uiText('indexedEntities')}</small></div>
            <div><b>{report.relationsIndexed}</b><small>{uiText('relations')}</small></div>
            <div><b>{report.factsIndexed}</b><small>{uiText('canonFacts')}</small></div>
            <div><b>{report.assetsIndexed}/{report.assetsOnDisk}</b><small>{uiText('imageAssets')}</small></div>
            <div><b>{report.embeddingRows}</b><small>{uiText('embeddingIndex')}</small></div>
            <div><b>{report.invalidStoryArtifacts}</b><small>{uiText('invalidSettings')}</small></div>
          </div>
          <div className="health-migration"><b>{uiText('databaseSchema')}</b><span>v{report.migration.fromVersion} → v{report.migration.toVersion}</span><small>{report.migration.status === 'migrated' ? `${uiText('migrationApplied')} ${report.migration.applied.length}` : uiText('schemaLatest')}</small></div>
          {(report.missingFiles.length > 0 || report.invalidSourceFiles.length > 0 || report.warnings.length > 0) && <div className="health-issues"><b>{uiText('attention')}</b>{report.missingFiles.map((file) => <div key={`missing-${file}`}>{format('missingSourceFile', { file })}</div>)}{report.invalidSourceFiles.map((file) => <div key={`invalid-source-${file}`}>{format('invalidSourceSchema', { file })}</div>)}{report.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>}
          {(report.danglingRelations > 0 || report.danglingTimelineEntityRefs > 0 || report.danglingTimelineChapterRefs > 0) && <div className="health-issues"><b>{uiText('danglingReferences')}</b>{report.danglingRelations > 0 && <div>{format('relationCount', { count: report.danglingRelations })}</div>}{report.danglingTimelineEntityRefs > 0 && <div>{format('timelineEntityCount', { count: report.danglingTimelineEntityRefs })}</div>}{report.danglingTimelineChapterRefs > 0 && <div>{format('timelineChapterCount', { count: report.danglingTimelineChapterRefs })}</div>}</div>}
          {(report.staleEmbeddings > 0 || report.danglingEmbeddings > 0) && <div className="health-issues"><b>{uiText('embeddingIndex')}</b>{report.staleEmbeddings > 0 && <div>{format('staleVectors', { count: report.staleEmbeddings })}</div>}{report.danglingEmbeddings > 0 && <div>{format('danglingVectors', { count: report.danglingEmbeddings })}</div>}</div>}
          {report.invalidStoryArtifactDetails.length > 0 && <div className="health-issues invalid-artifact-details"><b>{uiText('invalidArtifactDetails')}</b>{report.invalidStoryArtifactDetails.map((artifact) => <div className="invalid-artifact-detail" key={`${artifact.kind}-${artifact.id}`}><strong>{artifact.title}</strong><small>{artifact.kind} · {artifact.id}</small>{artifact.issues.map((issue) => <span className="invalid-artifact-issue" key={issue}>{format('invalidArtifactIssue', { issue })}</span>)}</div>)}</div>}
          {repair && <div className="health-repair-result"><b>{uiText('latestRepair')}</b><small>{format('rebuildSummary', { documents: repair.documents, entities: repair.entities, timeline: repair.timeline, relations: repair.relations, assets: repair.assets })}</small>{repair.embeddingsRemoved > 0 && <small>{format('embeddingCleanup', { count: repair.embeddingsRemoved })}</small>}{repair.restoredSources.length > 0 && <small>{format('restoredSources', { files: repair.restoredSources.join('、') })}</small>}{repair.invalidStoryArtifacts > 0 && <small>{format('invalidArtifacts', { count: repair.invalidStoryArtifacts })}</small>}{repair.invalidSourceFiles.length > 0 && <small>{format('invalidSources', { files: repair.invalidSourceFiles.join('、') })}</small>}</div>}
          {report.invalidSourceDetails.length > 0 && <div className="health-issues invalid-source-details"><b>{uiText('invalidSourceDetails')}</b>{report.invalidSourceDetails.map((detail) => <div className="invalid-source-detail" key={detail.path}><strong>{detail.path}</strong>{detail.issues.map((issue) => <span key={issue}>{format('invalidSourceIssue', { path: detail.path, issue })}</span>)}</div>)}</div>}
          {repair && repair.invalidSourceDetails.length > 0 && <div className="health-repair-result invalid-source-details"><b>{uiText('invalidSourceDetails')}</b>{repair.invalidSourceDetails.map((detail) => <div className="invalid-source-detail" key={detail.path}><strong>{detail.path}</strong>{detail.issues.map((issue) => <span key={issue}>{format('invalidSourceIssue', { path: detail.path, issue })}</span>)}</div>)}</div>}
        </>}
      </div>
      <footer><div className="health-actions">{report && issues > 0 && <button type="button" className="health-primary" onClick={() => void repairIndexes()} disabled={state === 'loading'}><ShieldCheck size={14} /> {uiText('repairIndexes')}</button>}<button type="button" className="health-secondary" onClick={() => void check()} disabled={state === 'loading'}><RefreshCw size={14} className={state === 'loading' ? 'spin' : undefined} /> {uiText('recheck')}</button></div><small><ShieldCheck size={12} /> {uiText('integrityFooter')}</small></footer>
    </section>
  </div>
}
