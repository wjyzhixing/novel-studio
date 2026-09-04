import { describe, expect, it } from 'vitest'
import type { Workflow } from '../src/shared/workflow'
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
  it('retries a failed node up to the configured limit', async () => {
    let attempts = 0
    const result = await executeWorkflow(independentWorkflow, async ({ nodeId }) => { if (nodeId === 'input' && attempts++ === 0) throw new Error('transient'); return { status: 'succeeded' } }, { retry: 1 })
    expect(result.state.status).toBe('succeeded'); expect(result.state.nodes.input.attempts).toBe(2)
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
