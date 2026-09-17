import { randomUUID } from 'node:crypto'
import type { WorkflowRun, WorkflowSideEffect, WorkflowSideEffectClaim, WorkflowSideEffectStore } from '../../shared/runtime'
import type { JobRecord } from '../../shared/jobs'
import type { ProjectService } from './project-service'

export class WorkflowRunStore implements WorkflowSideEffectStore {
  constructor(private readonly project: ProjectService) {}

  async claimSideEffect(idempotencyKey: string, runId: string, nodeId: string): Promise<WorkflowSideEffectClaim> {
    const db = this.project.database.raw
    const now = new Date().toISOString()
    const claimId = randomUUID()
    db.exec('BEGIN IMMEDIATE')
    try {
      const row = db.prepare('SELECT status, claim_id, output_json, has_output, updated_at FROM workflow_side_effects WHERE idempotency_key = ?').get(idempotencyKey) as { status: string; claim_id: string | null; output_json: string | null; has_output: number; updated_at: string } | undefined
      if (!row) {
        db.prepare('INSERT INTO workflow_side_effects(idempotency_key, run_id, node_id, status, claim_id, output_json, has_output, created_at, updated_at) VALUES(?, ?, ?, \'running\', ?, NULL, 0, ?, ?)').run(idempotencyKey, runId, nodeId, claimId, now, now)
        db.exec('COMMIT')
        return { kind: 'execute', claimId }
      }
      if (row.status === 'succeeded') {
        db.exec('COMMIT')
        return { kind: 'succeeded', effect: decodeSideEffect(row) }
      }
      const expired = Date.now() - Date.parse(row.updated_at) > 60_000
      if (row.status === 'running' && expired) {
        db.prepare('UPDATE workflow_side_effects SET run_id = ?, node_id = ?, claim_id = ?, updated_at = ? WHERE idempotency_key = ?').run(runId, nodeId, claimId, now, idempotencyKey)
        db.exec('COMMIT')
        return { kind: 'execute', claimId }
      }
      db.exec('COMMIT')
      return { kind: 'in_progress' }
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* Preserve the original database error. */ }
      throw error
    }
  }

  async getSideEffect(idempotencyKey: string): Promise<WorkflowSideEffect | undefined> {
    const row = this.project.database.raw.prepare('SELECT status, claim_id, output_json, has_output, updated_at FROM workflow_side_effects WHERE idempotency_key = ?').get(idempotencyKey) as { status: string; claim_id: string | null; output_json: string | null; has_output: number; updated_at: string } | undefined
    return row?.status === 'succeeded' ? decodeSideEffect(row) : undefined
  }

  async renewSideEffect(claimId: string, idempotencyKey: string): Promise<void> {
    const result = this.project.database.raw.prepare('UPDATE workflow_side_effects SET updated_at = ? WHERE idempotency_key = ? AND claim_id = ? AND status = \'running\'').run(new Date().toISOString(), idempotencyKey, claimId)
    if (result.changes !== 1) throw new Error(`Workflow side-effect claim 已失效: ${idempotencyKey}`)
  }

  async completeSideEffect(claimId: string, idempotencyKey: string, output: unknown): Promise<void> {
    const hasOutput = output !== undefined ? 1 : 0
    const outputJson = hasOutput ? JSON.stringify(output) : null
    const result = this.project.database.raw.prepare('UPDATE workflow_side_effects SET status = \'succeeded\', claim_id = NULL, output_json = ?, has_output = ?, updated_at = ? WHERE idempotency_key = ? AND claim_id = ? AND status = \'running\'').run(outputJson, hasOutput, new Date().toISOString(), idempotencyKey, claimId)
    if (result.changes !== 1) throw new Error(`Workflow side-effect claim 已失效: ${idempotencyKey}`)
  }

  async releaseSideEffect(claimId: string, idempotencyKey: string): Promise<void> {
    this.project.database.raw.prepare('DELETE FROM workflow_side_effects WHERE idempotency_key = ? AND claim_id = ? AND status = \'running\'').run(idempotencyKey, claimId)
  }

  async releaseInterruptedSideEffects(runId: string): Promise<void> {
    this.project.database.raw.prepare('DELETE FROM workflow_side_effects WHERE run_id = ? AND status = \'running\'').run(runId)
  }
  async save(state: WorkflowRun): Promise<void> {
    const db = this.project.database.raw
    const stateJson = JSON.stringify(state)
    const nodeEntries = Object.values(state.nodes).map((node) => ({ node, stateJson: JSON.stringify(node) }))
    const now = new Date().toISOString()
    const attempts = Math.max(0, ...nodeEntries.map(({ node }) => node.attempts))
    const error = nodeEntries.find(({ node }) => node.error)?.node.error ?? null
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`INSERT INTO workflow_runs(id, workflow_id, status, state_json, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, state_json=excluded.state_json, updated_at=excluded.updated_at`).run(state.id, state.workflowId, state.status, stateJson, state.createdAt, now)
      const statement = db.prepare(`INSERT INTO node_runs(id, run_id, node_id, status, state_json, updated_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, state_json=excluded.state_json, updated_at=excluded.updated_at`)
      for (const { node, stateJson: nodeJson } of nodeEntries) statement.run(`${state.id}:${node.nodeId}`, state.id, node.nodeId, node.status, nodeJson, now)
      db.prepare(`INSERT INTO jobs(id, kind, ref_id, status, attempts, error, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, attempts=excluded.attempts, error=excluded.error, updated_at=excluded.updated_at`).run(`job_${state.id}`, 'workflow', state.id, state.status, attempts, error, state.createdAt, now)
      db.exec('COMMIT')
    } catch (error) {
      try { db.exec('ROLLBACK') } catch { /* Preserve the original database error. */ }
      throw error
    }
  }
  async get(runId: string): Promise<WorkflowRun | null> {
    const row = this.project.database.raw.prepare('SELECT state_json FROM workflow_runs WHERE id = ?').get(runId) as { state_json: string } | undefined
    if (!row) return null
    const state = normalizeLegacyRun(JSON.parse(row.state_json) as WorkflowRun)
    if (state.relPathSource === 'legacy-node-output') await this.save(state)
    return state
  }
  async ensureJob(runId: string, workflowId: string, createdAt = new Date().toISOString()): Promise<void> {
    const db = this.project.database.raw
    db.prepare(`INSERT INTO jobs(id, kind, ref_id, status, attempts, error, created_at, updated_at) VALUES(?, 'workflow', ?, 'queued', 0, NULL, ?, ?) ON CONFLICT(ref_id) DO NOTHING`).run(`job_${runId}`, runId, createdAt, createdAt)
  }
  async listJobs(limit = 50): Promise<JobRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
    const rows = this.project.database.raw.prepare('SELECT id, kind, ref_id, status, attempts, error, created_at, updated_at FROM jobs ORDER BY updated_at DESC, rowid DESC LIMIT ?').all(safeLimit) as unknown as Array<{ id: string; kind: 'workflow'; ref_id: string; status: JobRecord['status']; attempts: number; error: string | null; created_at: string; updated_at: string }>
    return rows.map((row) => ({ id: row.id, kind: row.kind, refId: row.ref_id, status: row.status, attempts: row.attempts, error: row.error, createdAt: row.created_at, updatedAt: row.updated_at }))
  }
  async recoverInterrupted(activeRunIds: Iterable<string> = []): Promise<number> {
    const active = new Set(activeRunIds)
    const rows = this.project.database.raw.prepare("SELECT state_json FROM workflow_runs WHERE status = 'running'").all() as unknown as Array<{ state_json: string }>
    let recovered = 0
    for (const row of rows) {
      let state: WorkflowRun
      try { state = normalizeLegacyRun(JSON.parse(row.state_json) as WorkflowRun) } catch { continue }
      if (active.has(state.id)) continue
      const nodes = Object.fromEntries(Object.entries(state.nodes).map(([id, node]) => node.status === 'running' ? [id, { ...node, status: 'failed' as const, error: '应用重启，节点运行被中断，可 Retry', finishedAt: new Date().toISOString(), log: [...node.log, '应用重启，运行被中断'] }] : [id, node]))
      const next: WorkflowRun = { ...state, status: 'failed', nodes, updatedAt: new Date().toISOString() }
      await this.releaseInterruptedSideEffects(state.id)
      await this.save(next)
      recovered += 1
    }
    return recovered
  }
  async list(limit = 30): Promise<WorkflowRun[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
    const rows = this.project.database.raw.prepare('SELECT state_json FROM workflow_runs ORDER BY updated_at DESC LIMIT ?').all(safeLimit) as unknown as Array<{ state_json: string }>
    const runs: WorkflowRun[] = []
    for (const row of rows) {
      try {
        const state = normalizeLegacyRun(JSON.parse(row.state_json) as WorkflowRun)
        if (state.relPathSource === 'legacy-node-output') await this.save(state)
        runs.push(state)
      } catch { /* Ignore corrupt historical rows; integrity tooling reports them separately. */ }
    }
    return runs
  }
  async listSummaries(limit = 30): Promise<WorkflowRun[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
    const db = this.project.database.raw
    const rows = db.prepare(`SELECT id, workflow_id, status, created_at, updated_at,
      json_extract(state_json, '$.relPath') AS rel_path,
      json_extract(state_json, '$.sceneId') AS scene_id
      FROM workflow_runs ORDER BY updated_at DESC LIMIT ?`).all(safeLimit) as unknown as Array<{ id: string; workflow_id: string; status: WorkflowRun['status']; created_at: string; updated_at: string; rel_path: string | null; scene_id: string | null }>
    const ids = rows.map((row) => row.id)
    const nodesByRun = new Map<string, Record<string, WorkflowRun['nodes'][string]>>()
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      const nodeRows = db.prepare(`SELECT run_id, node_id, status FROM node_runs WHERE run_id IN (${placeholders}) ORDER BY updated_at`).all(...ids) as unknown as Array<{ run_id: string; node_id: string; status: WorkflowRun['nodes'][string]['status'] }>
      for (const node of nodeRows) {
        const nodes = nodesByRun.get(node.run_id) ?? {}
        nodes[node.node_id] = { nodeId: node.node_id, status: node.status, input: undefined, attempts: 0, log: [] }
        nodesByRun.set(node.run_id, nodes)
      }
    }
    return rows.map((row) => ({
      id: row.id, workflowId: row.workflow_id, status: row.status,
      relPath: row.rel_path ?? undefined, sceneId: row.scene_id ?? undefined,
      nodes: nodesByRun.get(row.id) ?? {}, outputs: {},
      createdAt: row.created_at, updatedAt: row.updated_at
    }))
  }
}

/**
 * Older runs did not persist relPath at the run root. Recover it only when
 * exactly one chapter path is explicitly present in node input/output data.
 * Never infer a path from the currently selected chapter.
 */
export function normalizeLegacyRun(state: WorkflowRun): WorkflowRun {
  if (isChapterPath(state.relPath)) {
    // A previously normalized legacy row may retain the old warning flag.
    // Clear it once the persisted root path is proven valid so the UI can
    // safely expose Resume for this run.
    if (state.relPathRecovery === 'unavailable') {
      const { relPathRecovery: _relPathRecovery, ...normalized } = state
      return normalized
    }
    return state
  }
  const candidates = new Set<string>()
  collectExplicitChapterPaths(state.nodes, candidates)
  collectExplicitChapterPaths(state.outputs, candidates)
  if (candidates.size !== 1) return state.status === 'waiting_human' ? { ...state, relPathRecovery: 'unavailable' } : state
  return { ...state, relPath: [...candidates][0], relPathSource: 'legacy-node-output' }
}

function collectExplicitChapterPaths(value: unknown, candidates: Set<string>): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { for (const item of value) collectExplicitChapterPaths(item, candidates); return }
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'relPath' || key === 'chapterRelPath') && typeof item === 'string' && isChapterPath(item)) candidates.add(item)
    collectExplicitChapterPaths(item, candidates)
  }
}

function isChapterPath(value: unknown): value is string {
  // Chapter filenames may contain Chinese and other Unicode characters. Keep
  // the boundary strict (one filename directly under chapters/, no traversal)
  // while avoiding an ASCII-only false negative that hides Resume controls.
  return typeof value === 'string' && /^chapters\/[^/\\]+\.md$/u.test(value) && !value.includes('..')
}

function decodeSideEffect(row: { output_json: string | null; has_output: number }): WorkflowSideEffect {
  if (!row.has_output) return { status: 'succeeded' }
  return { status: 'succeeded', output: row.output_json === null ? null : JSON.parse(row.output_json) }
}
