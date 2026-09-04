import { useEffect, useMemo, useState } from 'react'
import { Bug, Download, RefreshCw } from 'lucide-react'
import type { NodeRun, WorkflowRun } from '../../../shared/runtime'
import type { JobRecord } from '../../../shared/jobs'

function preview(value: unknown): string {
  if (typeof value === 'string') return `${value.length} 字符：${value.slice(0, 240)}${value.length > 240 ? '…' : ''}`
  if (Array.isArray(value)) return `数组 ${value.length} 项${value[0] === undefined ? '' : ` · 首项 ${preview(value[0])}`}`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.manifest && typeof record.manifest === 'object') {
      const manifest = record.manifest as { recipeId?: unknown; budgetTokens?: unknown; totalTokens?: unknown; items?: unknown }
      return `Context · recipe=${String(manifest.recipeId ?? '')} · ${String(manifest.totalTokens ?? 0)}/${String(manifest.budgetTokens ?? '?')} tokens · ${Array.isArray(manifest.items) ? manifest.items.length : 0} items`
    }
    return `对象：${Object.keys(record).slice(0, 12).join(', ')}${Object.keys(record).length > 12 ? '…' : ''}`
  }
  return String(value ?? 'undefined')
}

function duration(node: NodeRun): string {
  if (!node.startedAt || !node.finishedAt) return '—'
  const ms = new Date(node.finishedAt).getTime() - new Date(node.startedAt).getTime()
  return `${Math.max(0, ms)} ms`
}

export function DeveloperPanel() {
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const exportDiagnostics = async () => {
    const picked = await window.novelAPI.project.pickDiagnosticsSave()
    if (!picked.ok || !picked.data) { if (!picked.ok) setMessage(`选择诊断包位置失败：${picked.error.message}`); return }
    const result = await window.novelAPI.diagnostics.export(picked.data)
    setMessage(result.ok ? `诊断包已导出：${result.data.runCount} 个 Run，${result.data.invocationCount} 次 AI 调用` : `导出诊断包失败：${result.error.message}`)
  }

  const reload = async () => {
    setLoading(true)
    try {
      // Developer is an inspector; opening it must remain read-only and fast.
      // Recovery writes are handled by the normal runtime lifecycle, not by
      // an inspector refresh.
      const [result, jobResult] = await Promise.all([window.novelAPI.workflowRuntime.listRuns(false, true), window.novelAPI.jobs.list(false)])
      if (!result.ok) { setMessage(`读取运行记录失败：${result.error.message}`); return }
      if (!jobResult.ok) { setMessage(`读取后台任务失败：${jobResult.error.message}`); return }
      setRuns(result.data); setJobs(jobResult.data)
      setSelectedId((current) => current && result.data.some((run) => run.id === current) ? current : result.data[0]?.id ?? null)
    } finally { setLoading(false) }
  }

  const cancelJob = async (job: JobRecord) => {
    const result = await window.novelAPI.workflowRuntime.cancel(job.refId)
    setMessage(result.ok ? `任务已请求取消：${job.refId.slice(-8)}` : `取消任务失败：${result.error.message}`)
    await reload()
  }

  const retryJob = async (job: JobRecord) => {
    const run = runs.find((item) => item.id === job.refId)
    if (!run?.relPath) { setMessage('该任务缺少章节路径，无法 Retry'); return }
    const result = await window.novelAPI.workflowRuntime.retry(job.refId, run.relPath)
    setMessage(result.ok ? `任务已重新排队：${job.refId.slice(-8)}` : `Retry 任务失败：${result.error.message}`)
    await reload()
  }

  useEffect(() => {
    void reload()
    return window.novelAPI.workflowRuntime.onEvent((event) => {
      if (event.state) {
        setRuns((current) => [event.state!, ...current.filter((run) => run.id !== event.state!.id)].slice(0, 30))
        setSelectedId(event.state.id)
      }
    })
  }, [])

  const selectedRun = useMemo(() => runs.find((run) => run.id === selectedId) ?? null, [runs, selectedId])
  const selectedNode = selectedRun && selectedNodeId ? selectedRun.nodes[selectedNodeId] : undefined

  return <div className="developer-panel">
    <div className="developer-toolbar"><div><b><Bug size={13} /> Developer / Workflow Inspector</b><small>仅显示运行元数据和截断摘要，不展示 API Key 或完整正文</small></div><div><button onClick={() => void exportDiagnostics()}><Download size={13} /> 导出诊断包</button><button disabled={loading} onClick={() => void reload()}><RefreshCw size={13} /> {loading ? '读取中…' : '刷新'}</button></div></div>
    <div className="developer-jobs"><h3>Jobs</h3>{loading && jobs.length === 0 && <p>正在读取后台任务…</p>}{!loading && jobs.length === 0 && <p>暂无后台任务</p>}{jobs.map((job) => <div className="developer-job" key={job.id}><div><b>{job.kind} · {job.refId.slice(-12)}</b><span className={`runtime-status ${job.status}`}>{job.status}</span><small>attempts {job.attempts} · {new Date(job.updatedAt).toLocaleString()}</small>{job.error && <em>{job.error}</em>}</div><div>{['queued', 'running'].includes(job.status) && <button type="button" onClick={() => void cancelJob(job)}>Cancel</button>}{['failed', 'cancelled'].includes(job.status) && <button type="button" onClick={() => void retryJob(job)}>Retry</button>}</div></div>)}</div>
    <div className="developer-layout">
      <section className="developer-runs"><h3>Runs</h3>{runs.length === 0 && <p>暂无 Workflow Run</p>}{runs.map((run) => <button key={run.id} className={run.id === selectedId ? 'active' : ''} onClick={() => { setSelectedId(run.id); setSelectedNodeId(null) }}><b>{run.id.slice(-12)}</b><span className={`runtime-status ${run.status}`}>{run.status}</span><small>{run.relPath ?? '无章节'} · {new Date(run.updatedAt).toLocaleString()}</small></button>)}</section>
      <section className="developer-detail">{selectedRun ? <><div className="developer-summary"><b>{selectedRun.workflowId}</b><span className={`runtime-status ${selectedRun.status}`}>{selectedRun.status}</span><small>{selectedRun.relPath ?? '无章节'} · 创建于 {new Date(selectedRun.createdAt).toLocaleString()}</small></div><div className="developer-nodes"><h3>Nodes</h3>{Object.values(selectedRun.nodes).map((node) => <button key={node.nodeId} className={node.nodeId === selectedNodeId ? 'active' : ''} onClick={() => setSelectedNodeId(node.nodeId)}><span>{node.nodeId}</span><em>{node.status}</em><small>{duration(node)} · attempts {node.attempts}</small></button>)}</div>{selectedNode && <div className="developer-node-detail"><h3>{selectedNode.nodeId}</h3>{selectedNode.error && <p className="developer-error">{selectedNode.error}</p>}{selectedNode.diagnostics && <div className="developer-diagnostics"><span>Profile {selectedNode.diagnostics.profileId ?? '—'}</span><span>Model {selectedNode.diagnostics.model ?? '—'}</span><span>Request {selectedNode.diagnostics.requestId ?? '—'}</span><span>Input tokens {selectedNode.diagnostics.usage?.inputTokens ?? '—'}</span><span>Output tokens {selectedNode.diagnostics.usage?.outputTokens ?? '—'}</span><span>Total tokens {selectedNode.diagnostics.usage?.totalTokens ?? '—'}</span><span>Cost {selectedNode.diagnostics.cost ? `$${selectedNode.diagnostics.cost.amount.toFixed(6)} USD (estimated)` : '—'}</span><span>Context {selectedNode.diagnostics.context ? `${selectedNode.diagnostics.context.totalTokens} tokens / ${selectedNode.diagnostics.context.itemCount} items` : '—'}</span><span>Error category {selectedNode.diagnostics.errorCategory ?? '—'}</span></div>}<label>Input<code>{selectedNode.inputSummary ?? preview(selectedNode.input)}</code></label><label>Output<code>{selectedNode.outputSummary ?? preview(selectedNode.output)}</code></label><label>Log<code>{selectedNode.log.join(' · ') || '—'}</code></label></div>}</> : <p>选择一个 Run 查看节点详情</p>}{message && <p className="developer-error">{message}</p>}</section>
    </div>
  </div>
}
