import type { NodeRun } from '../../../shared/runtime'

export interface NodeTraceEntry {
  nodeId: string
  status: NodeRun['status']
  attempts: number
  startedAt?: string
  finishedAt?: string
  durationMs: number | null
  hasTiming: boolean
}

export function filterTraceLogs(log: string[], query: string): string[] {
  const normalized = query.trim().toLocaleLowerCase()
  return normalized ? log.filter((entry) => entry.toLocaleLowerCase().includes(normalized)) : [...log]
}

export function buildNodeTrace(nodes: NodeRun[]): NodeTraceEntry[] {
  return nodes.map((node, index) => {
    const start = node.startedAt ? new Date(node.startedAt).getTime() : Number.NaN
    const finish = node.finishedAt ? new Date(node.finishedAt).getTime() : Number.NaN
    const hasTiming = Number.isFinite(start) && Number.isFinite(finish)
    return { nodeId: node.nodeId, status: node.status, attempts: node.attempts, startedAt: node.startedAt, finishedAt: node.finishedAt, durationMs: hasTiming ? Math.max(0, finish - start) : null, hasTiming, index }
  }).sort((a, b) => {
    const aTime = a.startedAt ? new Date(a.startedAt).getTime() : Number.POSITIVE_INFINITY
    const bTime = b.startedAt ? new Date(b.startedAt).getTime() : Number.POSITIVE_INFINITY
    return (Number.isFinite(aTime) ? aTime : Number.POSITIVE_INFINITY) - (Number.isFinite(bTime) ? bTime : Number.POSITIVE_INFINITY) || a.index - b.index
  }).map(({ index: _index, ...entry }) => entry)
}
