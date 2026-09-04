import { useEffect, useState } from 'react'
import { AlertCircle, Check, RefreshCw, RotateCcw } from 'lucide-react'
import type { CanonProposal } from '../../../shared/canon'

export function CanonReview() {
  const [proposals, setProposals] = useState<CanonProposal[]>([])
  const [message, setMessage] = useState('')
  const reload = async () => { const result = await window.novelAPI.canon.listProposals(); if (result.ok) setProposals(result.data) }
  useEffect(() => { void reload() }, [])
  const apply = async (id: string) => { const result = await window.novelAPI.canon.applyProposal(id); setMessage(result.ok ? 'Canon 已应用' : result.error.message); await reload() }
  const revert = async (id: string) => { setMessage('正在撤回 Canon…'); try { const canonApi = window.novelAPI.canon as typeof window.novelAPI.canon & { revert?: typeof window.novelAPI.canon.revertProposal }; const invokeRevert = canonApi.revertProposal ?? canonApi.revert; if (!invokeRevert) throw new Error('preload 未提供 Canon Revert 方法'); const result = await invokeRevert(id); setMessage(result.ok ? 'Canon 已撤回' : result.error.message); await reload() } catch (error) { setMessage(`Canon 撤回失败：${error instanceof Error ? error.message : String(error)}`) } }
  const reject = async (id: string) => { const result = await window.novelAPI.canon.rejectProposal(id); setMessage(result.ok ? 'Proposal 已拒绝' : result.error.message); await reload() }
  return <div className="canon-review"><div className="canon-review-head"><b>Canon Proposals</b><span>{proposals.filter((proposal) => proposal.status === 'pending').length} 待审核</span><button data-testid="canon-refresh" type="button" onClick={() => void reload()}><RefreshCw size={12} /> 刷新</button>{message && <small role="status">{message}</small>}</div>{proposals.length === 0 && <p className="canon-empty">暂无提案。AI 提取的事实会先进入这里，人工 Apply 后才成为 Canon。</p>}{proposals.map((proposal) => <div className="canon-proposal" data-status={proposal.status} key={proposal.id}><div><AlertCircle size={14} /><b>{proposal.type}</b><small>{proposal.payload.subjectId} · {proposal.payload.predicate} = {JSON.stringify(proposal.payload.object)}</small><em>{proposal.payload.source.documentId}:{proposal.payload.source.range.join('-')}</em>{proposal.workflowRunId && <em>Workflow Run: {proposal.workflowRunId.slice(-8)}</em>}</div>{proposal.status === 'pending' && <div><button data-testid="canon-apply" className="primary" onClick={() => void apply(proposal.id)}><Check size={13} /> Apply</button><button data-testid="canon-reject" onClick={() => void reject(proposal.id)}>Reject</button></div>}{proposal.status === 'applied' && <button data-testid="canon-revert" onClick={() => void revert(proposal.id)}><RotateCcw size={13} /> Revert</button>}</div>)}</div>
}
