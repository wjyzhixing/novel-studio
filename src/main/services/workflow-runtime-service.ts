import { randomUUID } from 'node:crypto'
import type { DraftOutput, HumanReviewAction, WorkflowRun } from '../../shared/runtime'
import type { WorkflowService } from './workflow-service'
import { executeWorkflow } from './workflow-runtime'
import { WorkflowRunStore } from './workflow-run-store'
import { DomainError, redactSensitive } from './errors'
import type { AiService } from './ai-service'
import type { NodeExecutionResult, NodeInputEnvelope } from '../../shared/runtime'
import type { AgentService } from './agent-service'
import { agentIdSchema } from '../../shared/ai'
import type { ChapterService } from './chapter-service'
import type { ContextService } from './context-service'
import type { MemoryService } from './memory-service'
import type { ContextResult } from '../../shared/context'
import { EventEmitter } from 'node:events'
import type { WorkflowRuntimeEvent } from '../../shared/runtime'
import type { ImageService } from './image-service'
import type { ImageResult, SceneProposal } from '../../shared/image'
import { TaskQueue } from './task-queue'
import type { RevisionService } from './revision-service'
import type { ExtensionRegistry } from './extension-registry'
import { BUILTIN_WORKFLOW_NODE_TYPES } from './workflow-validation'
import type { Revision } from '../../shared/revision'
import type { AuthoringProgressService } from './authoring-progress-service'

export function markdownForChapterWrite(chapterMarkdown: string, chapterTitle: string, generated: string): string {
  const text = generated.trim()
  if (/^#{1,6}\s+/.test(text)) return `${text}\n`
  return `${chapterMarkdown.match(/^#{1,6}\s+.+$/m)?.[0] ?? `# ${chapterTitle}`}\n\n${text}\n`
}

export function findAppliedWorkflowWriteback(revisions: Revision[], runId: string, relPath: string, markdown: string): Revision | undefined {
  const source = `workflow:${runId}`
  return revisions.find((revision) => revision.relPath === relPath && revision.source === source && revision.replacement === markdown)
}

export function humanReviewOutput(input: unknown): unknown {
  return readPort(input) ?? input
}

export function isDraftOutput(value: unknown): value is DraftOutput {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<DraftOutput>
  return draft.kind === 'draft' && typeof draft.content === 'string' && isLikelyDraftContent(draft.content) &&
    (draft.mode === 'replace' || draft.mode === 'append' || draft.mode === 'rewrite') &&
    (draft.target === 'chapter' || draft.target === 'selection') && typeof draft.sourceNode === 'string' && Boolean(draft.sourceNode.trim())
}

export function workflowCompletionFromState(state: WorkflowRun): { targetRelPath: string; revisionId?: string } | undefined {
  if (state.status !== 'succeeded' || !state.relPath) return undefined
  const writeOutput = Object.values(state.nodes).map((node) => node.output).find((output) => {
    if (!output || typeof output !== 'object') return false
    const value = output as Record<string, unknown>
    return typeof value.relPath === 'string' && typeof value.markdown === 'string'
  })
  if (!writeOutput || typeof writeOutput !== 'object') return undefined
  const value = writeOutput as { relPath?: unknown; revisionId?: unknown }
  return { targetRelPath: value.relPath as string, revisionId: typeof value.revisionId === 'string' ? value.revisionId : undefined }
}

/** Keeps prompt compilation as an explicit, inspectable workflow boundary. */
export function imagePromptFromInput(value: unknown): SceneProposal | undefined {
  const proposal = readPort<SceneProposal>(value) ?? (value && typeof value === 'object' ? value as SceneProposal : undefined)
  if (!proposal || typeof proposal.suggestedPrompt !== 'string' || !proposal.suggestedPrompt.trim()) return undefined
  return {
    ...proposal,
    suggestedPrompt: proposal.suggestedPrompt.trim(),
    negativePrompt: typeof proposal.negativePrompt === 'string' ? proposal.negativePrompt.trim() : '',
    visualContext: Array.isArray(proposal.visualContext) ? proposal.visualContext.filter((item): item is string => typeof item === 'string') : []
  }
}

function isLikelyDraftContent(content: string): boolean {
  const text = content.trim()
  if (!text || text.length > 200_000 || /^```/.test(text)) return false
  return !/^(?:写作习惯|写作风格|定位信息|角色定位|确认说明|审核意见|审核结果|分析过程|改写建议|定位|确认|说明|习惯|要求|规则|提示|注意)\s*[:：]|^(?:好的|当然|下面是|以下是(?:改写|续写|扩写|缩写)?(?:后的)?正文)[^\n]{0,80}[，,:：]/im.test(text)
}

export function approvedDraftFromInput(value: unknown): DraftOutput | undefined {
  if (!value || typeof value !== 'object') return undefined
  const action = value as HumanReviewAction
  if (action.action !== 'approve' && action.action !== 'edit') return undefined
  return isDraftOutput(action.draft) ? action.draft : undefined
}

function toDraft(value: unknown, sourceNode: string): DraftOutput | undefined {
  if (isDraftOutput(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  return isLikelyDraftContent(value) ? { kind: 'draft', content: value.trim(), mode: 'rewrite', target: 'chapter', sourceNode } : undefined
}

export class WorkflowRuntimeService {
  private readonly controllers = new Map<string, AbortController>()
  private readonly emitter = new EventEmitter()
  private readonly queue = new TaskQueue(2)
  constructor(private readonly workflows: WorkflowService, private readonly runs: WorkflowRunStore, private readonly ai: AiService, private readonly chapters: ChapterService, private readonly context: ContextService, private readonly memory: MemoryService, private readonly images: ImageService, private readonly agents?: AgentService, private readonly revisions?: RevisionService, private readonly extensions?: ExtensionRegistry, private readonly authoring?: Pick<AuthoringProgressService, 'markChapterStatus' | 'refresh' | 'saveChapterPlan'>) {}
  async run(workflowId: string, relPath: string, sceneId?: string): Promise<WorkflowRun> {
    const summary = (await this.workflows.list()).find((item) => item.id === workflowId || item.relPath === workflowId)
    if (!summary) throw new DomainError('PROJECT_NOT_FOUND', `Workflow 不存在: ${workflowId}`)
    const workflow = await this.workflows.read(summary.relPath)
    return this.enqueueRun(workflow, relPath, undefined, undefined, undefined, sceneId)
  }
  async start(workflowId: string, relPath: string, sceneId?: string): Promise<string> {
    const summary = (await this.workflows.list()).find((item) => item.id === workflowId || item.relPath === workflowId)
    if (!summary) throw new DomainError('PROJECT_NOT_FOUND', `Workflow 不存在: ${workflowId}`)
    const workflow = await this.workflows.read(summary.relPath); const runId = `run_${randomUUID()}`
    await this.runs.ensureJob(runId, workflow.id)
    void this.enqueueRun(workflow, relPath, runId, undefined, undefined, sceneId).catch((error) => {
      void this.persistBackgroundFailure(workflow, relPath, runId, sceneId, error)
    })
    return runId
  }
  async retry(runId: string, relPath: string): Promise<string> {
    const state = await this.runs.get(runId)
    if (!state) throw new DomainError('PROJECT_NOT_FOUND', `Workflow run 不存在: ${runId}`)
    if (!['failed', 'cancelled'].includes(state.status)) throw new DomainError('VALIDATION_FAILED', '只有失败或取消的 Workflow 才能 Retry')
    const summary = (await this.workflows.list()).find((item) => item.id === state.workflowId)
    if (!summary) throw new DomainError('PROJECT_NOT_FOUND', `Workflow 不存在: ${state.workflowId}`)
    const workflow = await this.workflows.read(summary.relPath)
    const retryState = JSON.parse(JSON.stringify(state)) as WorkflowRun
    retryState.status = 'running'; retryState.relPath = relPath; retryState.updatedAt = new Date().toISOString()
    for (const node of Object.values(retryState.nodes)) {
      if (node.status !== 'succeeded' && node.status !== 'skipped') { node.status = 'pending'; node.error = undefined; node.startedAt = undefined; node.finishedAt = undefined }
    }
    for (const nodeId of Object.keys(retryState.nodes)) if (retryState.nodes[nodeId].status !== 'succeeded' && retryState.nodes[nodeId].status !== 'skipped') delete retryState.outputs[nodeId]
    void this.enqueueRun(workflow, relPath, runId, retryState, undefined, retryState.sceneId).catch((error) => this.emit({ runId, error: error instanceof Error ? error.message : String(error) }))
    return runId
  }
  onEvent(listener: (event: WorkflowRuntimeEvent) => void): () => void { this.emitter.on('event', listener); return () => this.emitter.off('event', listener) }
  async listRuns(recover = true, summaries = false): Promise<WorkflowRun[]> { if (recover) await this.runs.recoverInterrupted(this.controllers.keys()); return summaries ? this.runs.listSummaries() : this.runs.list() }
  async listJobs(recover = true): Promise<import('../../shared/jobs').JobRecord[]> { if (recover) await this.runs.recoverInterrupted(this.controllers.keys()); return this.runs.listJobs() }
  async cancelJob(jobId: string): Promise<null> {
    const job = (await this.runs.listJobs(100)).find((item) => item.id === jobId)
    if (!job) throw new DomainError('PROJECT_NOT_FOUND', `Job 不存在: ${jobId}`)
    return this.cancel(job.refId)
  }
  async retryJob(jobId: string): Promise<string> {
    const job = (await this.runs.listJobs(100)).find((item) => item.id === jobId)
    if (!job) throw new DomainError('PROJECT_NOT_FOUND', `Job 不存在: ${jobId}`)
    const state = await this.runs.get(job.refId)
    if (!state?.relPath) throw new DomainError('VALIDATION_FAILED', 'Job 缺少章节路径，无法 Retry')
    return this.retry(job.refId, state.relPath)
  }
  async cancel(runId: string): Promise<null> {
    const controller = this.controllers.get(runId)
    if (!controller) throw new DomainError('PROJECT_NOT_FOUND', `Workflow run 不存在或已结束: ${runId}`)
    controller.abort()
    return null
  }
  async resume(runId: string, resumeInput?: unknown): Promise<WorkflowRun> {
    const state = await this.runs.get(runId); if (!state) throw new DomainError('PROJECT_NOT_FOUND', `Workflow run 不存在: ${runId}`)
    if (state.status !== 'waiting_human') throw new DomainError('VALIDATION_FAILED', `只有等待人工审核的 Workflow 才能 Resume，当前状态: ${state.status}`)
    const summary = (await this.workflows.list()).find((item) => item.id === state.workflowId); if (!summary) throw new DomainError('PROJECT_NOT_FOUND', `Workflow 不存在: ${state.workflowId}`)
    const workflow = await this.workflows.read(summary.relPath)
    if (!state.relPath) throw new DomainError('VALIDATION_FAILED', '旧 Workflow Run 缺少章节路径，无法恢复，请重新运行')
    this.validateResumeInput(workflow, state, resumeInput)
    const normalizedInput = this.normalizeResumeInput(workflow, state, resumeInput)
    return this.enqueueRun(workflow, state.relPath!, runId, state, normalizedInput, state.sceneId)
  }
  private validateResumeInput(workflow: Awaited<ReturnType<WorkflowService['read']>>, state: WorkflowRun, resumeInput: unknown): void {
    const waiting = Object.values(state.nodes).find((node) => node.status === 'waiting_human')
    if (!waiting) throw new DomainError('VALIDATION_FAILED', 'Workflow 等待状态缺少 Human 节点')
    const node = workflow.nodes.find((candidate) => candidate.id === waiting.nodeId)
    if (node?.type !== 'image.select') return
    if (!resumeInput || typeof resumeInput !== 'object' || typeof (resumeInput as { assetId?: unknown }).assetId !== 'string') {
      throw new DomainError('VALIDATION_FAILED', '请选择一个图片资产后再继续 Workflow')
    }
    const assetId = (resumeInput as { assetId: string }).assetId
    const output = waiting.output
    const assets = Array.isArray(output) ? output as ImageResult[] : readPort<ImageResult[]>(output)
    if (!assets?.some((asset) => asset.assetId === assetId)) throw new DomainError('PROJECT_NOT_FOUND', '所选图片不属于本次生成结果')
  }
  private normalizeResumeInput(workflow: Awaited<ReturnType<WorkflowService['read']>>, state: WorkflowRun, resumeInput: unknown): unknown {
    const waiting = Object.values(state.nodes).find((node) => node.status === 'waiting_human')
    const node = waiting ? workflow.nodes.find((candidate) => candidate.id === waiting.nodeId) : undefined
    if (node?.type !== 'human.review') return resumeInput
    const original = toDraft(waiting?.output, waiting?.nodeId ?? 'human.review')
    if (!original) throw new DomainError('VALIDATION_FAILED', 'Review 节点没有可审核的正文草稿')
    if (resumeInput && typeof resumeInput === 'object' && ['approve', 'reject', 'edit'].includes(String((resumeInput as Record<string, unknown>).action))) {
      const action = resumeInput as HumanReviewAction
      if (action.action === 'edit') {
        if (typeof action.editedContent !== 'string' || !action.editedContent.trim()) throw new DomainError('VALIDATION_FAILED', '修改后的正文不能为空')
        return { ...action, editedContent: action.editedContent.trim(), draft: { ...original, content: action.editedContent.trim(), mode: 'rewrite' } }
      }
      return { ...action, draft: original }
    }
    if (typeof resumeInput === 'string' && resumeInput.trim()) return { action: 'edit', editedContent: resumeInput.trim(), draft: { ...original, content: resumeInput.trim(), mode: 'rewrite' } } satisfies HumanReviewAction
    return { action: 'approve', draft: original } satisfies HumanReviewAction
  }
  private async executeNode(workflow: Awaited<ReturnType<WorkflowService['read']>>, nodeId: string, input: unknown, signal: AbortSignal, relPath?: string, runId?: string, sceneId?: string, inheritedContext?: ContextResult, config: Record<string, unknown> = {}, idempotencyKey?: string, inputEnvelope?: NodeInputEnvelope): Promise<NodeExecutionResult> {
    const node = workflow.nodes.find((candidate) => candidate.id === nodeId)
    if (node && this.extensions && !BUILTIN_WORKFLOW_NODE_TYPES.has(node.type)) {
      const extension = this.extensions.getWorkflowNode(node.type)
      this.extensions.assertPermissionsGranted(extension.extensionId ?? '', extension.permissions ?? [])
      const output = await extension.run(node, input, { runId: runId ?? '', signal })
      return { status: 'succeeded', output, log: [`扩展节点 ${node.type} 已执行`] }
    }
    if (node?.type === 'input.chapter') {
      if (!relPath) throw new DomainError('VALIDATION_FAILED', 'Workflow 需要当前章节作为输入')
      const chapter = await this.chapters.read(relPath)
      return { status: 'succeeded', output: { relPath, title: chapter.title, markdown: chapter.markdown }, log: [`读取章节 ${relPath}`] }
    }
    if (node?.type === 'context.load') {
      const chapter = readPort<{ relPath?: string }>(input)
      if (!chapter?.relPath) throw new DomainError('VALIDATION_FAILED', 'Context 节点缺少章节输入')
      const result = await this.context.build({ relPath: chapter.relPath, sceneId, selection: null, query: '', recipe: { id: String(config.contextRecipe ?? config.recipe ?? 'workflow'), maxTokens: await this.ai.contextBudget(this.ai.defaultProfileId(), 7000, this.agents?.policy('writer').maxOutputTokens ?? 4096), includeSelection: false, entityLimit: 100, semanticLimit: 10 } })
      return { status: 'succeeded', output: result, diagnostics: { context: { recipeId: result.manifest.recipeId, totalTokens: result.manifest.totalTokens, itemCount: result.manifest.items.length } }, log: [`Context 已构建：${result.manifest.totalTokens} tokens`] }
    }
    if (node?.type === 'memory.extract') {
      if (!relPath) throw new DomainError('VALIDATION_FAILED', 'Memory 节点缺少章节路径')
      const proposals = await this.memory.extractFromChapter(this.ai.defaultProfileId(), relPath, runId)
      await this.authoring?.refresh()
      return { status: 'succeeded', output: proposals, log: [`生成 ${proposals.length} 条 Canon Proposal`] }
    }
    if (node?.type === 'image.propose') {
      if (!relPath) throw new DomainError('VALIDATION_FAILED', 'Image Proposal 节点缺少章节路径')
      const proposal = await this.images.proposeScene(relPath, sceneId)
      return { status: 'succeeded', output: proposal, log: [`生成插图场景提案 ${proposal.id}`] }
    }
    if (node?.type === 'image.prompt') {
      const proposal = imagePromptFromInput(input)
      if (!proposal) throw new DomainError('VALIDATION_FAILED', 'Image Prompt 节点缺少有效的场景提案')
      return { status: 'succeeded', output: proposal, log: [`图片提示词已编译：${proposal.suggestedPrompt.length} 字符`] }
    }
    if (node?.type === 'chapter.write') {
      if (!relPath) throw new DomainError('VALIDATION_FAILED', 'Write Back 节点缺少章节路径')
      const chapter = await this.chapters.read(relPath)
      const value = readPort<unknown>(input)
      const action = value && typeof value === 'object' && (value as HumanReviewAction).action ? value as HumanReviewAction : undefined
      if (action?.action === 'reject') throw new DomainError('VALIDATION_FAILED', '人工审核已拒绝，正文未写回')
      const draft = approvedDraftFromInput(value)
      if (!draft) throw new DomainError('VALIDATION_FAILED', 'Write Back 节点只接受已审核的正文草稿')
      const markdown = markdownForChapterWrite(chapter.markdown, chapter.title, draft.content)
      const sourceRunId = runId ?? node.id
      const existingRevision = this.revisions
        ? findAppliedWorkflowWriteback(await this.revisions.list(relPath), sourceRunId, relPath, markdown)
        : undefined
      if (existingRevision) { await this.authoring?.markChapterStatus(relPath, 'approved', runId); return { status: 'succeeded', output: { relPath, markdown, revisionId: existingRevision.id }, log: ['正文写回已完成，复用已有 Revision'] } }
      const revision = this.revisions && markdown !== chapter.markdown
        ? await this.revisions.create({ relPath, actor: 'agent', source: `workflow:${sourceRunId}`, original: chapter.markdown, replacement: markdown })
        : undefined
      await this.chapters.save(relPath, markdown)
      await this.authoring?.markChapterStatus(relPath, 'approved', runId)
      return { status: 'succeeded', output: { relPath, markdown, revisionId: revision?.id }, log: [`正文已写回章节 ${relPath}`] }
    }
    if (node?.type === 'image.generate') {
      const proposal = readPort<SceneProposal>(input)
      const prompt = String(config.prompt ?? proposal?.suggestedPrompt ?? '')
      if (!prompt.trim()) throw new DomainError('VALIDATION_FAILED', 'Image Generate 节点缺少 Prompt')
      const assets = await this.images.generate({
        sceneId: proposal?.sceneId ?? sceneId,
        prompt,
        negativePrompt: String(config.negativePrompt ?? proposal?.negativePrompt ?? ''),
        variants: typeof config.variants === 'number' ? config.variants : 1,
        aspectRatio: String(config.aspectRatio ?? '16:9'),
        references: [],
        workflowRunId: runId,
        idempotencyKey
      })
      return { status: 'succeeded', output: assets, diagnostics: assets[0] ? { model: assets[0].model, requestId: assets[0].assetId } : undefined, log: [`生成 ${assets.length} 个图片资产`] }
    }
    if (node?.type === 'image.select') {
      const assets = readPort<ImageResult[]>(input)
      const selectedId = typeof config.assetId === 'string' ? config.assetId : undefined
      if (!selectedId) return { status: 'waiting_human', output: assets, log: ['等待人工选择图片资产'] }
      const selected = assets?.find((asset) => asset.assetId === selectedId)
      if (!selected) throw new DomainError('PROJECT_NOT_FOUND', `未找到要选择的图片资产: ${selectedId}`)
      return { status: 'succeeded', output: selected, log: [`已选择图片资产 ${selected.assetId}`] }
    }
    if (node?.type === 'image.insert') {
      if (!relPath) throw new DomainError('VALIDATION_FAILED', 'Image Insert 节点缺少章节路径')
      const selected = readPort<ImageResult>(input)
      const assetId = typeof config.assetId === 'string' ? config.assetId : selected?.assetId
      if (!assetId) throw new DomainError('VALIDATION_FAILED', 'Image Insert 节点缺少 Asset ID')
      const result = await this.images.insertIntoChapter(relPath, assetId, String(config.caption ?? 'Illustration'), idempotencyKey)
      return { status: 'succeeded', output: result, log: [`已将图片资产 ${assetId} 插入章节`] }
    }
    if (node?.type === 'human.review') {
      const draft = toDraft(humanReviewOutput(input), node.id)
      if (!draft) throw new DomainError('VALIDATION_FAILED', 'Review 节点上游没有可审核的正文草稿')
      await this.authoring?.markChapterStatus(relPath ?? '', 'review', runId)
      return { status: 'waiting_human', output: draft, log: ['等待人工 Review'] }
    }
    if (node?.type.startsWith('ai.')) {
      const parsed = agentIdSchema.safeParse(config.agent)
      const agentId = parsed.success ? parsed.data : 'writer'
      const context = inheritedContext ?? readPort<ContextResult>(input)
      const envelope = inputEnvelope ?? { value: input, ...(context === undefined ? {} : { context }), outputs: {} }
      const serializedEnvelope = JSON.stringify(envelope)
      const configuredPrompt = typeof config.prompt === 'string' ? config.prompt.trim() : ''
      const userPrompt = configuredPrompt ? `${configuredPrompt}\n\n本节点输入（JSON）：\n${serializedEnvelope}` : serializedEnvelope
      const messages = this.agents ? await this.agents.messages(agentId, userPrompt, context?.manifest ? context : undefined) : [{ role: 'user' as const, content: userPrompt }]
      const policy = this.agents?.policy(agentId)
      const result = await this.ai.chat(this.ai.defaultProfileId(), { messages, temperature: typeof config.temperature === 'number' ? config.temperature : policy?.temperature, maxOutputTokens: typeof config.maxOutputTokens === 'number' ? config.maxOutputTokens : policy?.maxOutputTokens }, signal)
      const profile = (await this.ai.listProfiles()).find((item) => item.id === this.ai.defaultProfileId())
      const cost = result.usage && profile ? calculateCost(result.usage, profile.inputTokenCostPerMillion, profile.outputTokenCostPerMillion) : undefined
      const output = agentId === 'writer' || agentId === 'rewrite' ? toDraft(result.text, node.id) : result.text
      if ((agentId === 'writer' || agentId === 'rewrite') && !output) throw new DomainError('VALIDATION_FAILED', 'Writer 输出包含说明性内容，未生成可写回的正文草稿')
      if (agentId === 'plot-planner' && relPath) await this.authoring?.saveChapterPlan(relPath, result.text, runId)
      return { status: 'succeeded', output, diagnostics: { profileId: this.ai.defaultProfileId(), model: result.model, requestId: result.requestId, usage: result.usage, cost, context: context?.manifest ? { recipeId: context.manifest.recipeId, totalTokens: context.manifest.totalTokens, itemCount: context.manifest.items.length } : undefined }, log: [`${node.type} · ${agentId} · ${result.model}${policy ? ` · policy=${policy.contextRecipeId}` : ''}`] }
    }
    return { status: 'succeeded', output: input, log: [`${node?.type ?? 'utility'} executed`] }
  }

  private enqueueRun(workflow: Awaited<ReturnType<WorkflowService['read']>>, relPath: string, runId = `run_${randomUUID()}`, initialState?: WorkflowRun, resumeInput?: unknown, sceneId?: string): Promise<WorkflowRun> {
    if (this.controllers.has(runId)) throw new DomainError('VALIDATION_FAILED', `Workflow Run 正在执行或排队中: ${runId}`)
    void this.runs.ensureJob(runId, workflow.id)
    const controller = new AbortController()
    this.controllers.set(runId, controller)
    return this.queue.enqueue(() => this.executeRun(workflow, relPath, runId, initialState, resumeInput, controller, sceneId)).finally(() => {
      if (this.controllers.get(runId) === controller) this.controllers.delete(runId)
    })
  }

  private async executeRun(workflow: Awaited<ReturnType<WorkflowService['read']>>, relPath: string, runId = `run_${randomUUID()}`, initialState?: WorkflowRun, resumeInput?: unknown, controller = new AbortController(), sceneId?: string): Promise<WorkflowRun> {
    try {
    const result = await executeWorkflow(workflow, (context) => this.executeNode(workflow, context.nodeId, context.input, context.signal, relPath, runId, sceneId, context.inheritedContext as ContextResult | undefined, context.config, context.idempotencyKey, context.inputEnvelope), { runId, relPath, sceneId, signal: controller.signal, initialState, resumeInput, allowedNodeTypes: this.extensions?.snapshot().workflowNodes.map(({ type }) => type), sideEffectStore: this.runs, resolveContext: findContextResult, retryForNode: (node) => { if (!node.type.startsWith('ai.')) return 0; const agent = agentIdSchema.safeParse(node.config.agent); return agent.success ? (this.agents?.policy(agent.data).maxRetries ?? 0) : 0 }, persist: async (state) => { await this.runs.save(state); this.emit({ runId, state }) } })
      if (result.state.status === 'succeeded') {
        const completion = workflowCompletionFromState(result.state)
        if (completion) this.emit({ runId, completion })
      }
      return result.state
    } finally { /* enqueueRun owns controller lifecycle, including queued jobs */ }
  }
  private async persistBackgroundFailure(workflow: Awaited<ReturnType<WorkflowService['read']>>, relPath: string, runId: string, sceneId: string | undefined, error: unknown): Promise<void> {
    const message = redactSensitive(error instanceof Error ? error.message : String(error))
    const existing = await this.runs.get(runId).catch(() => null)
    if (!existing) {
      const now = new Date().toISOString()
      const firstNode = workflow.nodes[0]
      const nodes = Object.fromEntries(workflow.nodes.map((node) => {
        const failed = node.id === firstNode?.id
        return [node.id, {
          nodeId: node.id,
          status: failed ? 'failed' as const : 'pending' as const,
          input: {},
          attempts: 0,
          log: failed ? [message] : [],
          ...(failed ? { error: message, finishedAt: now, diagnostics: { errorCategory: 'validation' as const } } : {})
        }]
      }))
      const failedState: WorkflowRun = {
        id: runId,
        workflowId: workflow.id,
        relPath,
        ...(sceneId ? { sceneId } : {}),
        status: 'failed',
        nodes,
        outputs: {},
        createdAt: now,
        updatedAt: now
      }
      // The Job must leave queued even if validation failed before the normal
      // runtime had a chance to create and persist its initial state.
      await this.runs.save(failedState).catch(() => undefined)
    }
    this.emit({ runId, error: message })
  }
  private emit(event: WorkflowRuntimeEvent): void { this.emitter.emit('event', event) }
}

function calculateCost(usage: { inputTokens: number; outputTokens: number }, inputRate?: number, outputRate?: number): { amount: number; currency: 'USD'; estimated: boolean } | undefined {
  if (inputRate === undefined || outputRate === undefined) return undefined
  return { amount: (usage.inputTokens * inputRate + usage.outputTokens * outputRate) / 1_000_000, currency: 'USD', estimated: true }
}

function findContextResult(outputs: Record<string, unknown>): ContextResult | undefined {
  return Object.values(outputs).find((value): value is ContextResult => {
    if (!value || typeof value !== 'object') return false
    const candidate = value as { manifest?: unknown }
    return Boolean(candidate.manifest && typeof candidate.manifest === 'object')
  })
}

function readPort<T>(input: unknown): T | undefined {
  if (!input || typeof input !== 'object') return undefined
  const value = (input as Record<string, unknown>).in ?? (input as Record<string, unknown>).chapter
  return value as T | undefined
}
