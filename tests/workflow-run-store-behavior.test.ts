import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { WorkflowRunStore, normalizeLegacyRun } from '../src/main/services/workflow-run-store'
import type { WorkflowRun } from '../src/shared/runtime'
import { makeTempRoot } from './helpers'

async function makeStore() {
  const root = await makeTempRoot()
  const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
  await project.create(join(root, 'novel'), 'Workflow store')
  return { project, store: new WorkflowRunStore(project) }
}

function run(id: string, status: WorkflowRun['status'] = 'succeeded'): WorkflowRun {
  return {
    id, workflowId: 'flow_store', relPath: 'chapters/001-test.md', status,
    nodes: { first: { nodeId: 'first', status: status === 'running' ? 'running' : 'succeeded', input: { secret: 'hidden' }, output: { value: 'ok' }, attempts: 2, log: ['step'] } },
    outputs: { first: { value: 'ok' } }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:01.000Z'
  }
}

describe('WorkflowRunStore persistence behavior', () => {
  it('claims a side effect once and preserves empty outputs across store reads', async () => {
    const { store } = await makeStore()
    const first = await store.claimSideEffect('run-ledger:node', 'run-ledger', 'node')
    const second = await store.claimSideEffect('run-ledger:node', 'run-other', 'node')
    expect(first.kind).toBe('execute')
    expect(second.kind).toBe('in_progress')
    await store.completeSideEffect(first.kind === 'execute' ? first.claimId : '', 'run-ledger:node', undefined)
    await expect(store.getSideEffect('run-ledger:node')).resolves.toEqual({ status: 'succeeded' })
    await expect(store.claimSideEffect('run-ledger:node', 'run-other', 'node')).resolves.toEqual({ kind: 'succeeded', effect: { status: 'succeeded' } })
  })

  it('rolls back workflow and node rows when the job write fails', async () => {
    const { project, store } = await makeStore()
    project.database.raw.exec(`CREATE TRIGGER fail_workflow_job BEFORE INSERT ON jobs WHEN NEW.ref_id = 'run_atomic' BEGIN SELECT RAISE(ABORT, 'forced job failure'); END`)
    await expect(store.save(run('run_atomic'))).rejects.toThrow('forced job failure')
    expect(project.database.raw.prepare('SELECT COUNT(*) AS count FROM workflow_runs WHERE id = ?').get('run_atomic')).toEqual({ count: 0 })
    expect(project.database.raw.prepare('SELECT COUNT(*) AS count FROM node_runs WHERE run_id = ?').get('run_atomic')).toEqual({ count: 0 })
  })

  it('clamps list limits, exposes jobs and metadata-only summaries', async () => {
    const { store } = await makeStore()
    await store.save(run('run_store'))
    await store.ensureJob('run_queued', 'flow_store')
    await store.ensureJob('run_queued', 'flow_store')
    expect(await store.get('missing')).toBeNull()
    expect((await store.list(0)).length).toBe(1)
    expect((await store.listSummaries(200))[0]).toEqual(expect.objectContaining({ id: 'run_store', relPath: 'chapters/001-test.md', nodes: { first: expect.objectContaining({ nodeId: 'first', status: 'succeeded', input: undefined, attempts: 0 }) }, outputs: {} }))
    expect(await store.listJobs(0)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'job_run_queued', refId: 'run_queued', status: 'queued' })]))
  })

  it('recovers interrupted running nodes and skips corrupt historical rows', async () => {
    const { project, store } = await makeStore()
    await store.save(run('run_running', 'running'))
    const claim = await store.claimSideEffect('run_running:first', 'run_running', 'first')
    expect(claim.kind).toBe('execute')
    project.database.raw.prepare('INSERT INTO workflow_runs(id, workflow_id, status, state_json, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)').run('run_corrupt', 'flow_store', 'failed', '{bad', '2026-01-01', '2026-01-01')
    expect(await store.recoverInterrupted()).toBe(1)
    const recovered = await store.get('run_running')
    expect(recovered?.status).toBe('failed')
    expect(recovered?.nodes.first.error).toContain('应用重启')
    expect(await store.claimSideEffect('run_running:first', 'run_running', 'first')).toEqual({ kind: 'execute', claimId: expect.any(String) })
    expect(await store.list()).toHaveLength(1)
  })

  it('does not recover a run still owned by an active runtime controller', async () => {
    const { store } = await makeStore()
    await store.save(run('run_active', 'running'))
    const claim = await store.claimSideEffect('run_active:first', 'run_active', 'first')
    expect(claim.kind).toBe('execute')
    expect(await store.recoverInterrupted(['run_active'])).toBe(0)
    expect((await store.get('run_active'))?.status).toBe('running')
  })

  it('returns the most recently inserted job when timestamps are equal', async () => {
    const { project, store } = await makeStore()
    await store.ensureJob('run_first', 'flow_store', '2026-01-01T00:00:00.000Z')
    await store.ensureJob('run_second', 'flow_store', '2026-01-01T00:00:00.000Z')
    const jobs = await store.listJobs(1)
    expect(jobs[0]?.refId).toBe('run_second')
    await project.close()
  })

  it('normalizes legacy paths and marks ambiguous human runs unavailable', () => {
    const recovered = normalizeLegacyRun({
      id: 'run_legacy', workflowId: 'flow_store', status: 'waiting_human', nodes: { node: { input: { chapterRelPath: 'chapters/002-第二章.md' } } }, outputs: {}, createdAt: '', updatedAt: ''
    } as unknown as WorkflowRun)
    expect(recovered.relPath).toBe('chapters/002-第二章.md')
    expect(recovered.relPathSource).toBe('legacy-node-output')
    const ambiguous = normalizeLegacyRun({
      id: 'run_ambiguous', workflowId: 'flow_store', status: 'waiting_human', nodes: { node: { input: { relPath: 'chapters/001-a.md', chapterRelPath: 'chapters/002-b.md' } } }, outputs: {}, createdAt: '', updatedAt: ''
    } as unknown as WorkflowRun)
    expect(ambiguous.relPathRecovery).toBe('unavailable')
  })
})
