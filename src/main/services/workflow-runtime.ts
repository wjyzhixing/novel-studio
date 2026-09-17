import { randomUUID } from 'node:crypto'
import type { Workflow } from '../../shared/workflow'
import { validateWorkflow } from './workflow-validation'
import type { NodeExecutionResult, NodeExecutor, NodeRun, RuntimeOptions, RuntimeResult, WorkflowRun, NodeInputEnvelope, WorkflowSideEffect, WorkflowSideEffectClaim } from '../../shared/runtime'
import { redactSensitive } from './errors'

export async function executeWorkflow(workflow: Workflow, executor: NodeExecutor, options: RuntimeOptions = {}): Promise<RuntimeResult> {
  const issues = validateWorkflow(workflow, options.allowedNodeTypes)
  if (issues.length) throw new Error(`Workflow 无法执行: ${issues.map((issue) => issue.message).join('；')}`)
  const variables = resolveWorkflowVariables(workflow, options.variables ?? {})
  const state = options.initialState ? cloneState(options.initialState) : createState(workflow, options.runId, options.relPath, options.sceneId)
  if (state.status === 'waiting_human') {
    for (const node of Object.values(state.nodes)) if (node.status === 'waiting_human') {
      if (options.resumeInput !== undefined) { node.output = options.resumeInput; state.outputs[node.nodeId] = options.resumeInput }
      node.status = 'succeeded'
    }
    state.status = 'running'
  }
  await persist(options, state)
  const incoming = new Map(workflow.nodes.map((node) => [node.id, workflow.edges.filter((edge) => edge.target === node.id)]))
  const nodeMap = new Map(workflow.nodes.map((node) => [node.id, node]))

  while (true) {
    if (options.signal?.aborted) return finish(state, 'cancelled', options)
    const pending = workflow.nodes.filter((node) => state.nodes[node.id].status === 'pending')
    if (!pending.length) return finish(state, 'succeeded', options)
    const ready = pending.filter((node) => (incoming.get(node.id) ?? []).every((edge) => ['succeeded', 'skipped'].includes(state.nodes[edge.source]?.status ?? '')))
    if (!ready.length) return finish(state, 'failed', options, '节点依赖无法满足')
    const results = await Promise.all(ready.map(async (node) => runNode(node, incoming.get(node.id) ?? [], nodeMap, state, executor, options, variables)))
    for (const result of results) {
      if (result.status === 'waiting_human') return finish(state, 'waiting_human', options, undefined, result.nodeId)
      if (result.status === 'failed' || result.status === 'cancelled') return finish(state, result.status, options)
    }
    state.updatedAt = new Date().toISOString(); await persist(options, state)
  }
}

async function runNode(node: Workflow['nodes'][number], incoming: Workflow['edges'], _nodeMap: Map<string, Workflow['nodes'][number]>, state: WorkflowRun, executor: NodeExecutor, options: RuntimeOptions, variables: Record<string, unknown>): Promise<{ nodeId: string; status: NodeRun['status'] }> {
  const nodeState = state.nodes[node.id]
  const input = Object.fromEntries(incoming.map((edge) => [edge.targetPort, state.outputs[edge.source]]))
  const config = resolveWorkflowValue(node.config, variables) as Record<string, unknown>
  const idempotencyKey = nodeState.idempotencyKey ?? `${state.id}:${node.id}`
  const priorOutputs = { ...state.outputs }
  const inheritedContext = options.resolveContext?.(priorOutputs)
  const inputEnvelope: NodeInputEnvelope = { value: input, ...(inheritedContext === undefined ? {} : { context: inheritedContext }), outputs: priorOutputs }
  nodeState.idempotencyKey = idempotencyKey
  const persistedEffect = state.sideEffects?.[idempotencyKey]
  if (persistedEffect?.status === 'succeeded') {
    nodeState.input = input
    nodeState.inputSummary = summarizeNodeValue(input)
    nodeState.output = persistedEffect.output
    nodeState.outputSummary = summarizeNodeValue(persistedEffect.output)
    nodeState.status = 'succeeded'
    nodeState.finishedAt = new Date().toISOString()
    nodeState.log = ['复用已持久化的节点副作用']
    state.outputs[node.id] = persistedEffect.output
    await persist(options, state)
    return { nodeId: node.id, status: 'succeeded' }
  }
  if (node.type === 'logic.condition' && config['condition'] === false) {
    nodeState.input = input; nodeState.status = 'skipped'; nodeState.log = ['condition=false']; nodeState.finishedAt = new Date().toISOString(); await persist(options, state)
    return { nodeId: node.id, status: 'skipped' }
  }
  let sideEffectClaim: Extract<WorkflowSideEffectClaim, { kind: 'execute' }> | undefined
  if (options.sideEffectStore) {
    const claim = await options.sideEffectStore.claimSideEffect(idempotencyKey, state.id, node.id)
    if (claim.kind === 'succeeded') return applyPersistedSideEffect(node, nodeState, input, state, options, claim.effect)
    if (claim.kind === 'in_progress') {
      const effect = await waitForSideEffect(options.sideEffectStore, idempotencyKey, options.sideEffectWaitMs)
      if (!effect) {
        const error = `Workflow side-effect 正在其他进程执行且未完成: ${idempotencyKey}`
        nodeState.input = input
        nodeState.inputSummary = summarizeNodeValue(input)
        nodeState.status = 'failed'
        nodeState.error = error
        nodeState.diagnostics = { errorCategory: 'io' }
        nodeState.finishedAt = new Date().toISOString()
        nodeState.log = [error]
        await persist(options, state)
        return { nodeId: node.id, status: 'failed' }
      }
      return applyPersistedSideEffect(node, nodeState, input, state, options, effect)
    }
    sideEffectClaim = claim
  }
  const leaseTimer = sideEffectClaim && options.sideEffectStore?.renewSideEffect
    ? setInterval(() => { void options.sideEffectStore?.renewSideEffect?.(sideEffectClaim!.claimId, idempotencyKey).catch(() => undefined) }, 20_000)
    : undefined
  const stopLease = () => { if (leaseTimer) clearInterval(leaseTimer) }
  nodeState.input = input; nodeState.inputSummary = summarizeNodeValue(input); nodeState.status = 'running'; nodeState.startedAt = new Date().toISOString(); nodeState.log = []; nodeState.error = undefined
  await persist(options, state)
  const configuredRetry = config['retry']
  const policyRetry = options.retryForNode?.(node)
  const nodeRetry = typeof configuredRetry === 'number' && Number.isFinite(configuredRetry) ? Math.min(5, Math.max(0, Math.trunc(configuredRetry))) : typeof policyRetry === 'number' && Number.isFinite(policyRetry) ? Math.min(5, Math.max(0, Math.trunc(policyRetry))) : 0
  const maxAttempts = Math.max(1, nodeRetry + (options.retry ?? 0) + 1)
  let externalEffectProduced = false
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    nodeState.attempts = attempt
    const nodeController = new AbortController()
    const abortParent = () => nodeController.abort()
    options.signal?.addEventListener('abort', abortParent, { once: true })
    try {
      const result = await withTimeout(executor({ nodeId: node.id, input, inputEnvelope, outputs: priorOutputs, config, idempotencyKey, inheritedContext, signal: nodeController.signal }), nodeTimeout({ ...node, config }, options.timeoutMs), options.signal, () => nodeController.abort())
      nodeState.log.push(...(result.log ?? []).map((entry) => redactSensitive(String(entry)))); nodeState.finishedAt = new Date().toISOString(); nodeState.diagnostics = { ...result.diagnostics, durationMs: new Date(nodeState.finishedAt).getTime() - new Date(nodeState.startedAt ?? nodeState.finishedAt).getTime() }
      nodeState.output = result.output; nodeState.outputSummary = summarizeNodeValue(result.output); state.outputs[node.id] = result.output
      if (result.status === 'waiting_human') { if (sideEffectClaim) await options.sideEffectStore?.releaseSideEffect(sideEffectClaim.claimId, idempotencyKey); stopLease(); nodeState.status = 'waiting_human'; return { nodeId: node.id, status: nodeState.status } }
      nodeState.status = 'succeeded'
      state.sideEffects = { ...state.sideEffects, [idempotencyKey]: { status: 'succeeded', output: result.output } }
      // Persist the result before closing the external ledger claim. If the
      // process dies between the provider side effect and ledger completion,
      // the same Run can recover from its durable output without executing the
      // provider again. The ledger remains leased until completion succeeds,
      // so an uncertain claim is never released as if no effect happened.
      externalEffectProduced = true
      await persist(options, state)
      if (sideEffectClaim) await options.sideEffectStore?.completeSideEffect(sideEffectClaim.claimId, idempotencyKey, result.output)
      stopLease(); await persist(options, state)
      return { nodeId: node.id, status: nodeState.status }
    } catch (error) {
      nodeState.error = redactSensitive(error instanceof Error ? error.message : String(error)); const errorCode = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : undefined; nodeState.diagnostics = { ...nodeState.diagnostics, errorCode, errorCategory: classifyNodeError(error, options.signal?.aborted) }; nodeState.log.push(nodeState.error)
      if (options.signal?.aborted) { if (sideEffectClaim) await options.sideEffectStore?.releaseSideEffect(sideEffectClaim.claimId, idempotencyKey); stopLease(); nodeState.status = 'cancelled'; nodeState.finishedAt = new Date().toISOString(); return { nodeId: node.id, status: nodeState.status } }
      if (externalEffectProduced) { stopLease(); nodeState.status = 'failed'; nodeState.finishedAt = new Date().toISOString(); return { nodeId: node.id, status: nodeState.status } }
      if (attempt === maxAttempts) { if (sideEffectClaim) await options.sideEffectStore?.releaseSideEffect(sideEffectClaim.claimId, idempotencyKey); stopLease(); nodeState.status = 'failed'; nodeState.finishedAt = new Date().toISOString(); return { nodeId: node.id, status: nodeState.status } }
    } finally { options.signal?.removeEventListener('abort', abortParent) }
  }
  stopLease()
  return { nodeId: node.id, status: 'failed' }
}

async function applyPersistedSideEffect(node: Workflow['nodes'][number], nodeState: NodeRun, input: unknown, state: WorkflowRun, options: RuntimeOptions, effect: WorkflowSideEffect): Promise<{ nodeId: string; status: 'succeeded' }> {
  nodeState.input = input
  nodeState.inputSummary = summarizeNodeValue(input)
  nodeState.output = effect.output
  nodeState.outputSummary = summarizeNodeValue(effect.output)
  nodeState.status = 'succeeded'
  nodeState.finishedAt = new Date().toISOString()
  nodeState.log = ['复用已持久化的节点副作用']
  state.outputs[node.id] = effect.output
  state.sideEffects = { ...state.sideEffects, [nodeState.idempotencyKey ?? `${state.id}:${node.id}`]: effect }
  await persist(options, state)
  return { nodeId: node.id, status: 'succeeded' }
}

async function waitForSideEffect(store: NonNullable<RuntimeOptions['sideEffectStore']>, idempotencyKey: string, waitMs = 30_000): Promise<WorkflowSideEffect | undefined> {
  const deadline = Date.now() + Math.max(250, Math.min(waitMs, 120_000))
  while (Date.now() < deadline) {
    const effect = await store.getSideEffect(idempotencyKey)
    if (effect) return effect
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return store.getSideEffect(idempotencyKey)
}

const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/
const FULL_VARIABLE = /^\{\{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*\}\}$/
const ANY_VARIABLE = /\{\{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*\}\}/g

function resolveWorkflowVariables(workflow: Workflow, overrides: Record<string, unknown>): Record<string, unknown> {
  const defaults = Object.fromEntries(workflow.variables.map((variable) => [variable.name, variable.defaultValue]))
  for (const name of Object.keys(defaults)) if (!VARIABLE_NAME.test(name)) throw new Error(`Workflow 变量名无效: ${name}`)
  for (const name of Object.keys(overrides)) if (!VARIABLE_NAME.test(name)) throw new Error(`Workflow 变量名无效: ${name}`)
  return { ...defaults, ...overrides }
}

function resolveWorkflowValue(value: unknown, variables: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const full = value.match(FULL_VARIABLE)
    if (full) return variableValue(full[1], variables)
    return value.replace(ANY_VARIABLE, (_match, name: string) => stringifyVariable(variableValue(name, variables)))
  }
  if (Array.isArray(value)) return value.map((item) => resolveWorkflowValue(item, variables))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveWorkflowValue(item, variables)]))
  return value
}

function variableValue(name: string, variables: Record<string, unknown>): unknown {
  if (!Object.prototype.hasOwnProperty.call(variables, name) || variables[name] === undefined) throw new Error(`Workflow 变量未提供: ${name}`)
  return variables[name]
}

function stringifyVariable(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  return JSON.stringify(value)
}

function nodeTimeout(node: Workflow['nodes'][number], fallback?: number): number | undefined {
  const configured = node.config.timeoutMs
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) return Math.min(Math.trunc(configured), 10 * 60 * 1000)
  return fallback
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs?: number, signal?: AbortSignal, onTimeout?: () => void): Promise<T> {
  if (!timeoutMs && !signal) return promise
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const abort = () => { if (timer) clearTimeout(timer); reject(new Error('执行已取消')) }
    if (signal) { if (signal.aborted) { abort(); return }; signal.addEventListener('abort', abort, { once: true }) }
    if (timeoutMs) timer = setTimeout(() => { onTimeout?.(); signal?.removeEventListener('abort', abort); reject(new Error(`节点超时 (${timeoutMs}ms)`)) }, timeoutMs)
    promise.then((value) => { if (timer) clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value) }, (error) => { if (timer) clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(error) })
  })
}

function createState(workflow: Workflow, runId?: string, relPath?: string, sceneId?: string): WorkflowRun { const now = new Date().toISOString(); const id = runId ?? `run_${randomUUID()}`; return { id, workflowId: workflow.id, ...(relPath ? { relPath } : {}), ...(sceneId ? { sceneId } : {}), status: 'running', nodes: Object.fromEntries(workflow.nodes.map((node) => [node.id, { nodeId: node.id, status: 'pending', input: {}, attempts: 0, idempotencyKey: `${id}:${node.id}`, log: [] }])), outputs: {}, createdAt: now, updatedAt: now } }
function cloneState(state: WorkflowRun): WorkflowRun { return JSON.parse(JSON.stringify(state)) as WorkflowRun }
async function persist(options: RuntimeOptions, state: WorkflowRun) { state.updatedAt = new Date().toISOString(); await options.persist?.(state) }
async function finish(state: WorkflowRun, status: WorkflowRun['status'], options: RuntimeOptions, error?: string, waitingNodeId?: string): Promise<RuntimeResult> {
  state.status = status
  if (error) {
    const blockedNodeId = Object.keys(state.nodes).find((id) => state.nodes[id].status === 'pending')
      ?? Object.keys(state.nodes).find((id) => state.nodes[id].status === 'running')
    if (blockedNodeId) {
      const node = state.nodes[blockedNodeId]
      node.status = 'failed'
      node.error = error
      node.diagnostics = { ...node.diagnostics, errorCategory: 'validation' }
      node.finishedAt = new Date().toISOString()
      node.log = [...node.log, error]
    }
  }
  await persist(options, state)
  return { state, waitingNodeId }
}

function summarizeNodeValue(value: unknown, depth = 0): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return `string(${value.length} chars): ${value.slice(0, 160)}${value.length > 160 ? '…' : ''}`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `array(${value.length})${value.length && depth < 1 ? ` [${value.slice(0, 2).map((item) => summarizeNodeValue(item, depth + 1)).join(' | ')}]` : ''}`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.manifest && typeof record.manifest === 'object') {
      const manifest = record.manifest as Record<string, unknown>
      return `Context(recipe=${String(manifest.recipeId ?? '')}, tokens=${String(manifest.totalTokens ?? 0)}, items=${Array.isArray(manifest.items) ? manifest.items.length : 0})`
    }
    return `object{${Object.keys(record).slice(0, 16).join(', ')}${Object.keys(record).length > 16 ? ', …' : ''}}`
  }
  return typeof value
}

function classifyNodeError(error: unknown, cancelled = false): import('../../shared/runtime').NodeErrorCategory {
  if (cancelled) return 'cancelled'
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : ''
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'VALIDATION_FAILED' || code === 'PROJECT_NOT_FOUND' || code === 'PATH_DENIED') return 'validation'
  if (code === 'IO_ERROR' || code === 'DB_ERROR') return 'io'
  if (/超时|timeout/i.test(message)) return 'timeout'
  if (/provider|模型|图片|请求失败|API/i.test(message)) return 'provider'
  return 'unknown'
}
