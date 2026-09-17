import { describe, expect, it } from 'vitest'
import type { Workflow } from '../src/shared/workflow'
import type { WorkflowRun } from '../src/shared/runtime'
import { executeWorkflow } from '../src/main/services/workflow-runtime'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { WorkflowRunStore } from '../src/main/services/workflow-run-store'
import { makeTempRoot } from './helpers'
import { join } from 'node:path'

const workflow: Workflow = { schemaVersion: 1, id: 'flow_runtime', name: 'Runtime', cyclePolicy: 'reject', nodes: [
  { id: 'input', type: 'input.chapter', label: 'Input', position: { x: 0, y: 0 }, inputs: [], outputs: [{ id: 'out', type: 'text', required: false }], config: {} },
  { id: 'a', type: 'utility.transform', label: 'A', position: { x: 0, y: 0 }, inputs: [{ id: 'in', type: 'text', required: true }], outputs: [{ id: 'out', type: 'text', required: false }], config: {} },
  { id: 'b', type: 'utility.transform', label: 'B', position: { x: 0, y: 0 }, inputs: [{ id: 'in', type: 'text', required: true }], outputs: [{ id: 'out', type: 'text', required: false }], config: {} }
], edges: [{ id: 'i-a', source: 'input', sourcePort: 'out', target: 'a', targetPort: 'in' }, { id: 'i-b', source: 'input', sourcePort: 'out', target: 'b', targetPort: 'in' }], variables: [] }

const independentWorkflow: Workflow = { ...workflow, nodes: workflow.nodes.map((node) => node.id === 'input' ? node : { ...node, inputs: [] }), edges: [] }

describe('workflow runtime', () => {
  it('runs independent branches in parallel and persists node logs', async () => {
    const started: string[] = []; const persisted: string[] = []
    const result = await executeWorkflow(workflow, async ({ nodeId }) => { started.push(nodeId); await new Promise((resolve) => setTimeout(resolve, nodeId === 'input' ? 1 : 10)); return { status: 'succeeded', output: nodeId, log: [`done ${nodeId}`] } }, { persist: (state) => { persisted.push(state.status) } })
    expect(result.state.status).toBe('succeeded'); expect(started).toEqual(expect.arrayContaining(['input', 'a', 'b'])); expect(result.state.nodes.a.log).toEqual(['done a']); expect(persisted.length).toBeGreaterThan(1)
  })
  it('passes every node a stable input envelope with value, context, and prior outputs', async () => {
    const seen: unknown[] = []
    const result = await executeWorkflow(independentWorkflow, async (context) => {
      seen.push(context.inputEnvelope)
      return { status: 'succeeded', output: context.nodeId }
    })
    expect(result.state.status).toBe('succeeded')
    expect(seen).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: expect.any(Object), outputs: expect.any(Object) })
    ]))
  })

  it('marks the blocked pending node as failed when its dependency cannot be satisfied', async () => {
    const initialState = {
      id: 'run_blocked_dependency', workflowId: workflow.id, status: 'running' as const,
      nodes: {
        input: { nodeId: 'input', status: 'failed' as const, input: {}, attempts: 1, log: ['upstream failed'] },
        a: { nodeId: 'a', status: 'pending' as const, input: {}, attempts: 0, log: [] },
        b: { nodeId: 'b', status: 'pending' as const, input: {}, attempts: 0, log: [] }
      },
      outputs: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    } satisfies WorkflowRun

    const result = await executeWorkflow(workflow, async () => ({ status: 'succeeded' }), { initialState })

    expect(result.state.status).toBe('failed')
    expect(result.state.nodes.a.status).toBe('failed')
    expect(result.state.nodes.a.error).toBe('节点依赖无法满足')
    expect(result.state.nodes.input.status).toBe('failed')
    expect(result.state.nodes.input.error).toBeUndefined()
  })

  it('reuses a persisted successful side effect instead of executing the node again', async () => {
    let executions = 0
    const initialState = {
      id: 'run_reuse', workflowId: 'flow_independent', status: 'running' as const,
      nodes: { input: { nodeId: 'input', status: 'pending' as const, input: {}, attempts: 0, idempotencyKey: 'run_reuse:input', log: [] } },
      outputs: {}, sideEffects: { 'run_reuse:input': { status: 'succeeded' as const, output: 'persisted result' } },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    } satisfies WorkflowRun
    const result = await executeWorkflow({ ...independentWorkflow, nodes: [independentWorkflow.nodes[0]] }, async () => { executions += 1; return { status: 'succeeded', output: 'fresh result' } }, { initialState })
    expect(result.state.outputs.input).toBe('persisted result')
    expect(result.state.nodes.input.status).toBe('succeeded')
    expect(executions).toBe(0)
  })

  it('reuses a successful side effect returned by the external ledger', async () => {
    let executions = 0
    const result = await executeWorkflow({ ...independentWorkflow, nodes: [independentWorkflow.nodes[0]] }, async () => { executions += 1; return { status: 'succeeded', output: 'fresh result' } }, {
      runId: 'run_external_ledger',
      sideEffectStore: {
        claimSideEffect: async () => ({ kind: 'succeeded', effect: { status: 'succeeded', output: [] } }),
        getSideEffect: async () => ({ status: 'succeeded', output: [] }),
        completeSideEffect: async () => undefined,
        releaseSideEffect: async () => undefined
      }
    })
    expect(result.state.outputs.input).toEqual([])
    expect(executions).toBe(0)
  })

  it('persists a failed node when an in-progress side effect never completes', async () => {
    const persisted: WorkflowRun[] = []
    const result = await executeWorkflow({ ...independentWorkflow, nodes: [independentWorkflow.nodes[0]] }, async () => ({ status: 'succeeded', output: 'should not run' }), {
      runId: 'run_side_effect_timeout',
      sideEffectWaitMs: 250,
      persist: (state) => { persisted.push(JSON.parse(JSON.stringify(state)) as WorkflowRun) },
      sideEffectStore: {
        claimSideEffect: async () => ({ kind: 'in_progress' }),
        getSideEffect: async () => undefined,
        completeSideEffect: async () => undefined,
        releaseSideEffect: async () => undefined
      }
    })

    expect(result.state.status).toBe('failed')
    expect(result.state.nodes.input.status).toBe('failed')
    expect(result.state.nodes.input.error).toContain('正在其他进程执行且未完成')
    expect(persisted.at(-1)?.status).toBe('failed')
  })

  it('does not retry an external side effect when ledger completion fails after execution', async () => {
    let executions = 0
    let releases = 0
    const persisted: WorkflowRun[] = []
    const result = await executeWorkflow({ ...independentWorkflow, nodes: [independentWorkflow.nodes[0]] }, async () => {
      executions += 1
      return { status: 'succeeded', output: 'already-created' }
    }, {
      runId: 'run_completion-window',
      retry: 2,
      persist: (state) => { persisted.push(JSON.parse(JSON.stringify(state)) as WorkflowRun) },
      sideEffectStore: {
        claimSideEffect: async () => ({ kind: 'execute', claimId: 'claim-window' }),
        getSideEffect: async () => undefined,
        completeSideEffect: async () => { throw new Error('ledger unavailable') },
        releaseSideEffect: async () => { releases += 1 }
      }
    })
    expect(result.state.status).toBe('failed')
    expect(result.state.nodes.input.error).toContain('ledger unavailable')
    expect(executions).toBe(1)
    expect(releases).toBe(0)
    expect(persisted.some((state) => state.sideEffects?.['run_completion-window:input']?.output === 'already-created')).toBe(true)
  })
  it('retries a failed node up to the configured limit', async () => {
    let attempts = 0
    const result = await executeWorkflow(independentWorkflow, async ({ nodeId }) => { if (nodeId === 'input' && attempts++ === 0) throw new Error('transient'); return { status: 'succeeded' } }, { retry: 1 })
    expect(result.state.status).toBe('succeeded'); expect(result.state.nodes.input.attempts).toBe(2)
  })
  it('redacts credentials from persisted node errors and logs', async () => {
    const result = await executeWorkflow(independentWorkflow, async () => {
      return { status: 'succeeded', log: ['provider error: Bearer sk_test_secret_123456789 data:image/png;base64,QUJDREVGRw=='] }
    })
    expect(result.state.nodes.input.log[0]).toContain('Bearer [redacted]')
    expect(result.state.nodes.input.log[0]).not.toContain('sk_test_secret_123456789')
    expect(result.state.nodes.input.log[0]).toContain('[redacted-data-url]')
    expect(result.state.nodes.input.log[0]).not.toContain('QUJDREVGRw==')
  })
  it('pauses at a human node and resumes from persisted state', async () => {
    const human = { ...workflow, nodes: [workflow.nodes[0], { ...workflow.nodes[1], id: 'review', type: 'human.review' }], edges: [{ id: 'i-r', source: 'input', sourcePort: 'out', target: 'review', targetPort: 'in' }] }
    const paused = await executeWorkflow(human, async ({ nodeId }) => nodeId === 'review' ? { status: 'waiting_human' } : { status: 'succeeded' })
    expect(paused.state.status).toBe('waiting_human'); expect(paused.waitingNodeId).toBe('review')
    const resumed = await executeWorkflow(human, async () => ({ status: 'succeeded' }), { initialState: paused.state })
    expect(resumed.state.status).toBe('succeeded')
  })

  it('passes the human node output to downstream nodes after resume', async () => {
    const human = { ...workflow, nodes: [...workflow.nodes.slice(0, 1), { ...workflow.nodes[1], id: 'review', type: 'human.review' }, workflow.nodes[2]], edges: [{ id: 'i-r', source: 'input', sourcePort: 'out', target: 'review', targetPort: 'in' }, { id: 'r-b', source: 'review', sourcePort: 'out', target: 'b', targetPort: 'in' }] }
    const paused = await executeWorkflow(human, async ({ nodeId, input }) => nodeId === 'review' ? { status: 'waiting_human', output: { approved: true, input } } : { status: 'succeeded', output: nodeId })
    const resumed = await executeWorkflow(human, async ({ nodeId, input }) => ({ status: 'succeeded', output: nodeId === 'b' ? input : nodeId }), { initialState: paused.state })
    expect(resumed.state.outputs.b).toEqual({ in: { approved: true, input: { in: 'input' } } })
  })
  it('persists and reloads workflow and node run state', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Run store'); const store = new WorkflowRunStore(project)
    const result = await executeWorkflow(workflow, async () => ({ status: 'succeeded' }), { persist: (state) => store.save(state) })
    const restored = await store.get(result.state.id)
    expect(restored?.status).toBe('succeeded'); expect(restored?.nodes.input.status).toBe('succeeded')
  })
  it('fails and records a node timeout', async () => {
    const result = await executeWorkflow(independentWorkflow, async () => { await new Promise((resolve) => setTimeout(resolve, 20)); return { status: 'succeeded' } }, { timeoutMs: 2 })
    expect(result.state.status).toBe('failed'); expect(result.state.nodes.input.error).toContain('超时')
  })
  it('cancels a running workflow through AbortSignal', async () => {
    const controller = new AbortController()
    const promise = executeWorkflow(independentWorkflow, async ({ signal }) => { await new Promise((resolve) => setTimeout(resolve, 15)); if (signal.aborted) throw new Error('cancelled'); return { status: 'succeeded' } }, { signal: controller.signal })
    controller.abort()
    const result = await promise
    expect(result.state.status).toBe('cancelled')
  })
  it('skips a false condition and continues downstream nodes', async () => {
    const conditional = { ...workflow, nodes: [workflow.nodes[0], { ...workflow.nodes[1], id: 'condition', type: 'logic.condition', config: { condition: false } }, workflow.nodes[2]], edges: [{ id: 'i-c', source: 'input', sourcePort: 'out', target: 'condition', targetPort: 'in' }, { id: 'c-b', source: 'condition', sourcePort: 'out', target: 'b', targetPort: 'in' }] }
    const result = await executeWorkflow(conditional, async ({ nodeId }) => ({ status: 'succeeded', output: nodeId }))
    expect(result.state.nodes.condition.status).toBe('skipped'); expect(result.state.nodes.b.status).toBe('succeeded'); expect(result.state.status).toBe('succeeded')
  })
})
