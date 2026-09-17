import { useEffect, useState } from 'react'
import { AlertCircle, Check, RefreshCw, RotateCcw } from 'lucide-react'
import type { CanonProposal, CanonRelationUpdatePayload, CanonFactUpdatePayload, CanonTimelineAddPayload, CanonForeshadowingAddPayload } from '../../../shared/canon'
import { useUiText } from '../lib/i18n'
import { useGlobalMessage } from '../lib/global-notification'

export function CanonReview() {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  const [proposals, setProposals] = useState<CanonProposal[]>([])
  const [message, setMessage] = useGlobalMessage()
  const reload = async () => { const result = await window.novelAPI.canon.listProposals(); if (result.ok) setProposals(result.data) }
  useEffect(() => { void reload() }, [])
  const apply = async (id: string) => { const result = await window.novelAPI.canon.applyProposal(id); setMessage(result.ok ? uiText('canonApplied') : result.error.message); await reload() }
  const revert = async (id: string) => { setMessage(uiText('canonReverting')); try { const canonApi = window.novelAPI.canon as typeof window.novelAPI.canon & { revert?: typeof window.novelAPI.canon.revertProposal }; const invokeRevert = canonApi.revertProposal ?? canonApi.revert; if (!invokeRevert) throw new Error(uiText('canonRevertUnavailable')); const result = await invokeRevert(id); setMessage(result.ok ? uiText('canonReverted') : result.error.message); await reload() } catch (error) { setMessage(formatUiText('canonRevertFailed', { error: error instanceof Error ? error.message : String(error) })) } }
  const reject = async (id: string) => { const result = await window.novelAPI.canon.rejectProposal(id); setMessage(result.ok ? uiText('proposalRejected') : result.error.message); await reload() }
  return <div className="canon-review"><div className="canon-review-head"><b>{uiText('canonProposals')}</b><span>{formatUiText('canonPendingCount', { count: proposals.filter((proposal) => proposal.status === 'pending').length })}</span><button data-testid="canon-refresh" type="button" onClick={() => void reload()}><RefreshCw size={12} /> {uiText('canonRefresh')}</button>{message && <small role="status">{message}</small>}</div>{proposals.length === 0 && <p className="canon-empty">{uiText('canonEmpty')}</p>}{proposals.map((proposal) => <div className="canon-proposal" data-status={proposal.status} key={proposal.id}><div><AlertCircle size={14} /><b>{proposal.type}</b><ProposalSummary proposal={proposal} />{proposal.workflowRunId && <em>Workflow Run: {proposal.workflowRunId.slice(-8)}</em>}</div>{proposal.status === 'pending' && <div><button data-testid="canon-apply" className="primary" onClick={() => void apply(proposal.id)}><Check size={13} /> {uiText('canonApply')}</button><button data-testid="canon-reject" onClick={() => void reject(proposal.id)}>{uiText('canonReject')}</button></div>}{proposal.status === 'applied' && <button data-testid="canon-revert" onClick={() => void revert(proposal.id)}><RotateCcw size={13} /> {uiText('canonRevert')}</button>}</div>)}</div>
}

function ProposalSummary({ proposal }: { proposal: CanonProposal }) {
  if (proposal.type === 'relation.update') {
    const payload = proposal.payload as CanonRelationUpdatePayload
    return <><small>{payload.after.fromId} · {payload.after.relationType} → {payload.after.toId}</small><em>Relation metadata: {JSON.stringify(payload.after.metadata)}</em></>
  }
  if (proposal.type === 'fact.update' || proposal.type === 'knowledge.update') {
    const payload = proposal.payload as CanonFactUpdatePayload
    return <><small>{payload.before.subjectId} · {payload.before.predicate}: {JSON.stringify(payload.before.object)} → {JSON.stringify(payload.after.object)}</small><em>{payload.after.source.documentId}:{payload.after.source.range.join('-')}</em></>
  }
  if (proposal.type === 'timeline.add') {
    const payload = proposal.payload as CanonTimelineAddPayload
    return <><small>{payload.event.at ?? 'unknown'} · {payload.event.title}</small><em>{payload.event.chapterRelPath ?? 'Timeline event'}</em></>
  }
  if (proposal.type === 'foreshadowing.add') {
    const payload = proposal.payload as CanonForeshadowingAddPayload
    return <><small>{payload.artifact.title} · {String(payload.artifact.fields?.status ?? 'planned')}</small><em>Foreshadowing artifact</em></>
  }
  const payload = proposal.payload
  if (!('subjectId' in payload)) return null
  return <><small>{payload.subjectId} · {payload.predicate} = {JSON.stringify(payload.object)}</small><em>{payload.source.documentId}:{payload.source.range.join('-')}</em></>
}
