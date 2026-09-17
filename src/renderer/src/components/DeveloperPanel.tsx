import { useEffect, useMemo, useState } from 'react'
import { Bug, Download, FileArchive, PackagePlus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { NodeRun, WorkflowRun } from '../../../shared/runtime'
import type { JobRecord } from '../../../shared/jobs'
import type { ExtensionPermissionPreview, ExtensionRegistrySnapshot, ExtensionTrustStatus } from '../../../shared/extensions'
import type { TelemetryStatus } from '../../../shared/ipc'
import { useUiText } from '../lib/i18n'
import { useGlobalMessage } from '../lib/global-notification'
import { buildNodeTrace, filterTraceLogs } from '../lib/developer-trace'

type PreviewLabels = {
  characters: (count: number, value: string) => string
  array: (count: number) => string
  firstItem: (value: string) => string
  context: (recipe: string, total: string, budget: string, items: number) => string
  object: (keys: string) => string
  undefined: string
}

function preview(value: unknown, labels: PreviewLabels): string {
  if (typeof value === 'string') return labels.characters(value.length, `${value.slice(0, 240)}${value.length > 240 ? '…' : ''}`)
  if (Array.isArray(value)) return `${labels.array(value.length)}${value[0] === undefined ? '' : ` · ${labels.firstItem(preview(value[0], labels))}`}`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.manifest && typeof record.manifest === 'object') {
      const manifest = record.manifest as { recipeId?: unknown; budgetTokens?: unknown; totalTokens?: unknown; items?: unknown }
      return labels.context(String(manifest.recipeId ?? ''), String(manifest.totalTokens ?? 0), String(manifest.budgetTokens ?? '?'), Array.isArray(manifest.items) ? manifest.items.length : 0)
    }
    return labels.object(`${Object.keys(record).slice(0, 12).join(', ')}${Object.keys(record).length > 12 ? '…' : ''}`)
  }
  return value === undefined || value === null ? labels.undefined : String(value)
}

function duration(node: NodeRun): string {
  if (!node.startedAt || !node.finishedAt) return '—'
  const ms = new Date(node.finishedAt).getTime() - new Date(node.startedAt).getTime()
  return `${Math.max(0, ms)} ms`
}

export function DeveloperPanel() {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  const previewLabels: PreviewLabels = {
    characters: (count, value) => formatUiText('previewCharacters', { count, value }),
    array: (count) => formatUiText('previewArray', { count }),
    firstItem: (value) => formatUiText('previewFirstItem', { value }),
    context: (recipe, total, budget, items) => formatUiText('previewContext', { recipe, total, budget, items }),
    object: (keys) => formatUiText('previewObject', { keys }),
    undefined: uiText('previewUndefined')
  }
  const statusLabels: Record<string, Parameters<typeof uiText>[0]> = { queued: 'statusPending', running: 'statusRunning', waiting_human: 'statusWaitingHuman', succeeded: 'statusSucceeded', failed: 'statusFailed', cancelled: 'statusCancelled', pending: 'statusPending', skipped: 'statusSkipped' }
  const statusLabel = (status: string) => uiText(statusLabels[status] ?? 'statusPending')
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [extensions, setExtensions] = useState<ExtensionRegistrySnapshot | null>(null)
  const [permissionPreview, setPermissionPreview] = useState<ExtensionPermissionPreview | null>(null)
  const [trustStatus, setTrustStatus] = useState<ExtensionTrustStatus | null>(null)
  const [telemetryStatus, setTelemetryStatus] = useState<TelemetryStatus | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [message, setMessage] = useGlobalMessage()
  const [loading, setLoading] = useState(false)
  const [runFilter, setRunFilter] = useState<'all' | WorkflowRun['status']>('all')
  const [jobFilter, setJobFilter] = useState<'all' | JobRecord['status']>('all')
  const [logQuery, setLogQuery] = useState('')

  const exportDiagnostics = async () => {
    const picked = await window.novelAPI.project.pickDiagnosticsSave()
     if (!picked.ok || !picked.data) { if (!picked.ok) setMessage(formatUiText('diagnosticPickFailed', { error: picked.error.message })); return }
    const result = await window.novelAPI.diagnostics.export(picked.data)
     setMessage(result.ok ? formatUiText('diagnosticsExported', { runs: result.data.runCount, invocations: result.data.invocationCount }) : formatUiText('diagnosticsExportFailed', { error: result.error.message }))
  }

  const exportCompressedDiagnostics = async () => {
    const picked = await window.novelAPI.project.pickDiagnosticsSave()
    if (!picked.ok || !picked.data) { if (!picked.ok) setMessage(formatUiText('diagnosticPickFailed', { error: picked.error.message })); return }
    const destination = picked.data.endsWith('.gz') ? picked.data : `${picked.data}.gz`
    const result = await window.novelAPI.diagnostics.exportCompressed(destination)
    setMessage(result.ok ? formatUiText('diagnosticsCompressedExported', { runs: result.data.runCount, invocations: result.data.invocationCount }) : formatUiText('diagnosticsExportFailed', { error: result.error.message }))
  }

  const reload = async () => {
    setLoading(true)
    try {
      // Developer is an inspector; opening it must remain read-only and fast.
      // Recovery writes are handled by the normal runtime lifecycle, not by
      // an inspector refresh.
      const [result, jobResult, extensionResult, trustResult, telemetryResult] = await Promise.all([window.novelAPI.workflowRuntime.listRuns(false, true), window.novelAPI.jobs.list(false), window.novelAPI.extensions.list(), window.novelAPI.extensions.trustStatus(), window.novelAPI.telemetry.getStatus()])
       if (!result.ok) { setMessage(formatUiText('jobsLoadFailed', { error: result.error.message })); return }
       if (!jobResult.ok) { setMessage(formatUiText('backgroundJobsLoadFailed', { error: jobResult.error.message })); return }
       if (!extensionResult.ok) { setMessage(formatUiText('extensionListLoadFailed', { error: extensionResult.error.message })); return }
       if (!trustResult.ok) { setMessage(formatUiText('extensionTrustLoadFailed', { error: trustResult.error.message })); return }
       if (!telemetryResult.ok) { setMessage(formatUiText('telemetryLoadFailed', { error: telemetryResult.error.message })); return }
      setRuns(result.data); setJobs(jobResult.data)
      setExtensions(extensionResult.data)
      setTrustStatus(trustResult.data)
      setTelemetryStatus(telemetryResult.data)
      setSelectedId((current) => current && result.data.some((run) => run.id === current) ? current : result.data[0]?.id ?? null)
    } finally { setLoading(false) }
  }

  const cancelJob = async (job: JobRecord) => {
    const result = await window.novelAPI.jobs.cancel(job.id)
    setMessage(result.ok ? formatUiText('jobCancelRequested', { id: job.refId.slice(-8) }) : formatUiText('jobCancelFailed', { error: result.error.message }))
    await reload()
  }

  const retryJob = async (job: JobRecord) => {
    const result = await window.novelAPI.jobs.retry(job.id)
    setMessage(result.ok ? formatUiText('jobRetryQueued', { id: job.refId.slice(-8) }) : formatUiText('jobRetryFailed', { error: result.error.message }))
    await reload()
  }

  const setTelemetryConsent = async (enabled: boolean) => {
    const result = await window.novelAPI.telemetry.setConsent(enabled)
    if (result.ok) setTelemetryStatus(result.data)
    setMessage(result.ok ? (enabled ? uiText('telemetryEnabled') : uiText('telemetryDisabled')) : formatUiText('telemetryUpdateFailed', { error: result.error.message }))
  }

  const previewPermissions = async (id: string) => {
    const result = await window.novelAPI.extensions.permissionPreview(id)
    if (!result.ok) { setMessage(formatUiText('extensionPermissionsFailed', { error: result.error.message })); return }
    setPermissionPreview(result.data)
  }

  const installExtension = async () => {
    if (!trustStatus?.installEnabled) { setMessage(uiText('trustedPublisherMissing')); return }
    const picked = await window.novelAPI.project.pickExtensionPackage()
    if (!picked.ok || !picked.data) { if (!picked.ok) setMessage(formatUiText('extensionPickFailed', { error: picked.error.message })); return }
    const preview = await window.novelAPI.extensions.preview(picked.data)
    if (!preview.ok) { setMessage(formatUiText('extensionInstallFailed', { error: preview.error.message })); return }
    const confirmed = window.confirm(formatUiText('extensionInstallConfirm', { name: preview.data.name, version: preview.data.version, permissions: preview.data.permissions.join('、') || uiText('noExtraPermissions') }))
    if (!confirmed) return
    const result = await window.novelAPI.extensions.install(picked.data, preview.data.permissions)
    setMessage(result.ok ? formatUiText('extensionInstalled', { id: result.data.id, version: result.data.version }) : formatUiText('extensionInstallFailed', { error: result.error.message }))
    if (result.ok) await reload()
  }

  const uninstallExtension = async (id: string, name: string) => {
    if (!window.confirm(formatUiText('extensionUninstallConfirm', { name }))) return
    const result = await window.novelAPI.extensions.uninstall(id)
    setMessage(result.ok ? formatUiText('extensionUninstalled', { name }) : formatUiText('extensionUninstallFailed', { error: result.error.message }))
    if (result.ok) { setPermissionPreview(null); await reload() }
  }

  const rollbackExtension = async (id: string, name: string) => {
    if (!window.confirm(formatUiText('extensionRollbackConfirm', { name }))) return
    const result = await window.novelAPI.extensions.rollback(id)
    setMessage(result.ok ? formatUiText('extensionRolledBack', { name, version: result.data.version }) : formatUiText('extensionRollbackFailed', { error: result.error.message }))
    if (result.ok) { setPermissionPreview(null); await reload() }
  }

  useEffect(() => {
    void reload()
    return window.novelAPI.jobs.onEvent((event) => {
      if (event.state) {
        setRuns((current) => [event.state!, ...current.filter((run) => run.id !== event.state!.id)].slice(0, 30))
        setJobs((current) => current.map((job) => job.refId === event.state!.id ? { ...job, status: event.state!.status, updatedAt: event.state!.updatedAt, error: Object.values(event.state!.nodes).find((node) => node.error)?.error ?? null } : job))
        setSelectedId(event.state.id)
      }
    })
  }, [])

  const selectedRun = useMemo(() => runs.find((run) => run.id === selectedId) ?? null, [runs, selectedId])
  const selectedNode = selectedRun && selectedNodeId ? selectedRun.nodes[selectedNodeId] : undefined
  const filteredRuns = useMemo(() => runFilter === 'all' ? runs : runs.filter((run) => run.status === runFilter), [runFilter, runs])
  const filteredJobs = useMemo(() => jobFilter === 'all' ? jobs : jobs.filter((job) => job.status === jobFilter), [jobFilter, jobs])

  return <div className="developer-panel">
    <div className="developer-toolbar"><div><b><Bug size={13} /> {uiText('developerInspector')}</b><small>{uiText('developerInspectorHint')}</small></div><div><button onClick={() => void exportDiagnostics()}><Download size={13} /> {uiText('exportDiagnostics')}</button><button onClick={() => void exportCompressedDiagnostics()}><FileArchive size={13} /> {uiText('exportCompressedDiagnostics')}</button><button disabled={loading} onClick={() => void reload()}><RefreshCw size={13} /> {loading ? uiText('loading') : uiText('refresh')}</button></div></div>
     <section className="developer-telemetry"><div><h3>{uiText('telemetryTitle')}</h3><p>{uiText('telemetryHint')}</p></div><div className="developer-telemetry-actions">{telemetryStatus?.enabled ? <><span className="developer-telemetry-state enabled">{uiText('telemetryEnabledLabel')}</span><button type="button" onClick={() => void setTelemetryConsent(false)}>{uiText('telemetryRevoke')}</button></> : <><span className="developer-telemetry-state">{telemetryStatus?.consent === 'revoked' ? uiText('telemetryDisabledLabel') : uiText('telemetryDefault')}</span><button type="button" onClick={() => void setTelemetryConsent(true)}>{uiText('telemetryEnable')}</button></>}</div></section>
    <section className="developer-extensions"><div className="developer-section-heading"><div><h3>{uiText('extensionsPermissions')}</h3><small>{uiText('extensionsHint')}</small></div><button type="button" className="developer-extension-install" onClick={() => void installExtension()} disabled={!trustStatus?.installEnabled}><PackagePlus size={13} />{uiText('install')}</button></div>{trustStatus && <p className={trustStatus.installEnabled ? 'developer-trust-status enabled' : 'developer-trust-status'}>{trustStatus.installEnabled ? formatUiText('trustConfigured', { count: trustStatus.trustedPublisherCount }) : uiText('trustMissing')}</p>}{!extensions || extensions.manifests.length === 0 ? <p>{uiText('noExtensions')}</p> : <>{extensions.manifests.map((manifest) => <div className="developer-extension" key={manifest.id}><div><b>{manifest.name}</b><small>{manifest.id} · v{manifest.version}</small></div><div className="developer-extension-actions"><button type="button" onClick={() => void previewPermissions(manifest.id)}>{uiText('viewPermissions')}</button><button type="button" onClick={() => void rollbackExtension(manifest.id, manifest.name)}>{uiText('rollback')}</button><button type="button" className="danger" onClick={() => void uninstallExtension(manifest.id, manifest.name)}><Trash2 size={12} />{uiText('uninstall')}</button></div></div>)}{permissionPreview && <div className="developer-permission-preview"><b>{permissionPreview.name} · {uiText('viewPermissions')}</b><span>{permissionPreview.permissions.length ? permissionPreview.permissions.join('、') : uiText('noExtraPermissions')}</span></div>}</>}</section>
    <div className="developer-jobs"><div className="developer-list-heading"><h3>{uiText('jobs')}</h3><select data-testid="developer-job-filter" aria-label={uiText('filterJobs')} value={jobFilter} onChange={(event) => setJobFilter(event.target.value as typeof jobFilter)}><option value="all">{uiText('allStatuses')}</option><option value="queued">{statusLabel('queued')}</option><option value="running">{statusLabel('running')}</option><option value="waiting_human">{statusLabel('waiting_human')}</option><option value="succeeded">{statusLabel('succeeded')}</option><option value="failed">{statusLabel('failed')}</option><option value="cancelled">{statusLabel('cancelled')}</option></select></div>{loading && jobs.length === 0 && <p>{uiText('jobsLoading')}</p>}{!loading && filteredJobs.length === 0 && <p>{uiText('noMatchingJobs')}</p>}{filteredJobs.map((job) => <div className="developer-job" key={job.id}><div><b>{job.kind} · {job.refId.slice(-12)}</b><span className={`runtime-status ${job.status}`}>{statusLabel(job.status)}</span><small>{uiText('attempts')} {job.attempts} · {new Date(job.updatedAt).toLocaleString()}</small>{job.error && <em>{job.error}</em>}</div><div>{['queued', 'running'].includes(job.status) && <button type="button" onClick={() => void cancelJob(job)}>{uiText('cancel')}</button>}{['failed', 'cancelled'].includes(job.status) && <button type="button" onClick={() => void retryJob(job)}>{uiText('retry')}</button>}</div></div>)}</div>
    <div className="developer-layout">
      <section className="developer-runs"><div className="developer-list-heading"><h3>{uiText('runs')}</h3><select data-testid="developer-run-filter" aria-label={uiText('filterRuns')} value={runFilter} onChange={(event) => setRunFilter(event.target.value as typeof runFilter)}><option value="all">{uiText('allStatuses')}</option><option value="queued">{statusLabel('queued')}</option><option value="running">{statusLabel('running')}</option><option value="waiting_human">{statusLabel('waiting_human')}</option><option value="succeeded">{statusLabel('succeeded')}</option><option value="failed">{statusLabel('failed')}</option><option value="cancelled">{statusLabel('cancelled')}</option></select></div>{runs.length === 0 && <p>{uiText('noRuns')}</p>}{runs.length > 0 && filteredRuns.length === 0 && <p>{uiText('noMatchingRuns')}</p>}{filteredRuns.map((run) => <button key={run.id} className={run.id === selectedId ? 'active' : ''} onClick={() => { setSelectedId(run.id); setSelectedNodeId(null) }}><b>{run.id.slice(-12)}</b><span className={`runtime-status ${run.status}`}>{statusLabel(run.status)}</span><small>{run.relPath ?? uiText('noChapter')} · {new Date(run.updatedAt).toLocaleString()}</small></button>)}</section>
      <section className="developer-detail">{selectedRun ? <><div className="developer-summary"><b>{selectedRun.workflowId}</b><span className={`runtime-status ${selectedRun.status}`}>{statusLabel(selectedRun.status)}</span><small>{selectedRun.relPath ?? uiText('noChapter')} · {uiText('createdAt')} {new Date(selectedRun.createdAt).toLocaleString()}</small></div><div data-testid="developer-trace-timeline" className="developer-trace-timeline"><h3>{uiText('traceTimeline')}</h3>{buildNodeTrace(Object.values(selectedRun.nodes)).map((entry) => <button type="button" key={entry.nodeId} onClick={() => setSelectedNodeId(entry.nodeId)}><span>{entry.nodeId}</span><em>{statusLabel(entry.status)}</em><small>{entry.durationMs === null ? uiText('traceNoTiming') : `${entry.durationMs} ms`} · {uiText('attempts')} {entry.attempts}</small></button>)}</div><div className="developer-nodes"><h3>{uiText('nodes')}</h3>{Object.values(selectedRun.nodes).map((node) => <button key={node.nodeId} className={node.nodeId === selectedNodeId ? 'active' : ''} onClick={() => setSelectedNodeId(node.nodeId)}><span>{node.nodeId}</span><em>{statusLabel(node.status)}</em><small>{duration(node)} · {uiText('attempts')} {node.attempts}</small></button>)}</div>{selectedNode && <div data-testid="developer-trace" className="developer-node-detail"><h3>{selectedNode.nodeId} · {uiText('metadataTrace')}</h3><small>{uiText('traceHint')}</small>{selectedNode.error && <p className="developer-error">{selectedNode.error}</p>}{<div className="developer-diagnostics"><span>{uiText('diagnosticProfile')} {selectedNode.diagnostics?.profileId ?? '—'}</span><span>{uiText('diagnosticModel')} {selectedNode.diagnostics?.model ?? '—'}</span><span>{uiText('diagnosticRequest')} {selectedNode.diagnostics?.requestId ?? '—'}</span><span>{uiText('diagnosticInputTokens')} {selectedNode.diagnostics?.usage?.inputTokens ?? '—'}</span><span>{uiText('diagnosticOutputTokens')} {selectedNode.diagnostics?.usage?.outputTokens ?? '—'}</span><span>{uiText('diagnosticTotalTokens')} {selectedNode.diagnostics?.usage?.totalTokens ?? '—'}</span><span>{uiText('diagnosticCost')} {selectedNode.diagnostics?.cost ? `$${selectedNode.diagnostics?.cost.amount.toFixed(6)} USD (${uiText('diagnosticEstimated')})` : '—'}</span><span>{uiText('diagnosticContext')} {selectedNode.diagnostics?.context ? `${selectedNode.diagnostics?.context.totalTokens} ${uiText('tokens')} / ${selectedNode.diagnostics?.context.itemCount} ${uiText('items')}` : '—'}</span><span>{uiText('diagnosticErrorCategory')} {selectedNode.diagnostics?.errorCategory ?? '—'}</span></div>}<label>{uiText('input')}<code>{selectedNode.inputSummary ?? preview(selectedNode.input, previewLabels)}</code></label><label>{uiText('output')}<code>{selectedNode.outputSummary ?? preview(selectedNode.output, previewLabels)}</code></label><label className="developer-log-label"><span><Search size={12} />{uiText('log')}</span><input data-testid="developer-log-filter" aria-label={uiText('filterLogs')} value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder={uiText('filterLogs')} /><code data-testid="developer-filtered-logs">{filterTraceLogs(selectedNode.log, logQuery).join(' · ') || '—'}</code></label></div>}</> : <p>{uiText('noSelectedRun')}</p>}{message && <p className="developer-error">{message}</p>}</section>
    </div>
  </div>
}
