import { describe, expect, it } from 'vitest'
import {
  approvedDraftFromInput,
  humanReviewOutput,
  isDraftOutput,
  markdownForChapterWrite,
  workflowCompletionFromState,
  imagePromptFromInput,
  WorkflowRuntimeService
} from '../src/main/services/workflow-runtime-service'
import type { Workflow } from '../src/shared/workflow'
import type { WorkflowRun } from '../src/shared/runtime'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { ChapterService } from '../src/main/services/chapter-service'
import { WorkflowRunStore } from '../src/main/services/workflow-run-store'
import { ImageService } from '../src/main/services/image-service'
import { makeTempRoot } from './helpers'
import { join } from 'node:path'
import type { WorkflowService } from '../src/main/services/workflow-service'
import { ExtensionRegistry } from '../src/main/services/extension-registry'

describe('image prompt workflow stage', () => {
  it('normalizes a scene proposal for the image generation boundary', () => {
    expect(imagePromptFromInput({
      id: 'scene_1', chapterRelPath: 'chapters/001.md', title: '雨夜', description: '街灯下',
      suggestedPrompt: '  Scene: 雨夜  ', negativePrompt: '  blur  ', visualContext: []
    })).toMatchObject({ suggestedPrompt: 'Scene: 雨夜', negativePrompt: 'blur' })
    expect(imagePromptFromInput({ suggestedPrompt: '' })).toBeUndefined()
  })
})

async function waitForRun(runtime: WorkflowRuntimeService, runId: string, status: WorkflowRun['status']): Promise<WorkflowRun> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = (await runtime.listRuns()).find((item) => item.id === runId)
    if (run?.status === status) return run
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`Workflow Run 未在预期时间内进入状态: ${runId} → ${status}`)
}

async function waitForJob(runtime: WorkflowRuntimeService, runId: string, status: 'queued' | 'running' | 'waiting_human' | 'succeeded' | 'failed' | 'cancelled'): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = (await runtime.listJobs(false)).find((item) => item.refId === runId)
    if (job?.status === status) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`Workflow Job 未在预期时间内进入状态: ${runId} → ${status}`)
}

describe('workflow runtime service helpers', () => {
  it('normalizes generated chapter content while preserving a supplied heading', () => {
    expect(markdownForChapterWrite('# 原标题\n\n旧内容', '章节', '新内容')).toBe('# 原标题\n\n新内容\n')
    expect(markdownForChapterWrite('# 原标题\n\n旧内容', '章节', '# 新标题\n\n正文')).toBe('# 新标题\n\n正文\n')
  })

  it('accepts only substantive draft content and approved review actions', () => {
    const draft = { kind: 'draft' as const, content: '这是可以写回的正文。', mode: 'rewrite' as const, target: 'chapter' as const, sourceNode: 'writer' }
    expect(isDraftOutput(draft)).toBe(true)
    expect(isDraftOutput({ ...draft, content: '下面是改写后的正文：' })).toBe(false)
    expect(isDraftOutput({ ...draft, content: '```markdown\n正文\n```' })).toBe(false)
    expect(approvedDraftFromInput(draft)).toBeUndefined()
    expect(approvedDraftFromInput({ action: 'approve', draft })).toEqual(draft)
    expect(approvedDraftFromInput({ action: 'reject', draft })).toBeUndefined()
    expect(humanReviewOutput({ in: draft })).toEqual(draft)
    expect(humanReviewOutput('plain text')).toBe('plain text')
  })

  it('rejects malformed draft shapes and normalizes review edits', () => {
    const valid = { kind: 'draft' as const, content: '可写回正文', mode: 'rewrite' as const, target: 'chapter' as const, sourceNode: 'writer' }
    expect(isDraftOutput(null)).toBe(false)
    expect(isDraftOutput({ ...valid, mode: 'invalid' })).toBe(false)
    expect(isDraftOutput({ ...valid, target: 'other' })).toBe(false)
    expect(isDraftOutput({ ...valid, sourceNode: '   ' })).toBe(false)
    expect(isDraftOutput({ ...valid, content: '下面是改写后的正文：\n正文' })).toBe(false)
    expect(approvedDraftFromInput({ action: 'edit', draft: valid, editedContent: 'ignored' })).toEqual(valid)
    expect(approvedDraftFromInput({ action: 'reject', draft: valid })).toBeUndefined()
    expect(approvedDraftFromInput({ action: 'approve', draft: { ...valid, content: '说明：没有正文' } })).toBeUndefined()
    expect(humanReviewOutput({ chapter: valid })).toEqual(valid)
  })

  it('extracts the chapter completion only from successful write output', () => {
    const state: WorkflowRun = {
      id: 'run_complete', workflowId: 'flow_complete', status: 'succeeded', relPath: 'chapters/001-test.md',
      nodes: { write: { nodeId: 'write', status: 'succeeded', input: undefined, output: { relPath: 'chapters/001-test.md', markdown: '# test', revisionId: 'rev_1' }, attempts: 1, log: [] } },
      outputs: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:01.000Z'
    }
    expect(workflowCompletionFromState(state)).toEqual({ targetRelPath: 'chapters/001-test.md', revisionId: 'rev_1' })
    expect(workflowCompletionFromState({ ...state, status: 'failed' })).toBeUndefined()
    expect(workflowCompletionFromState({ ...state, nodes: {} })).toBeUndefined()
    expect(workflowCompletionFromState({ ...state, relPath: undefined })).toBeUndefined()
    expect(workflowCompletionFromState({ ...state, nodes: { write: { ...state.nodes.write, output: { relPath: 'chapters/001-test.md' } } } })).toBeUndefined()
  })
})

describe('WorkflowRuntimeService basic execution', () => {
  it('passes an ai node prompt to the provider instead of discarding workflow instructions', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Prompt forwarding')
    const chapters = new ChapterService(project); const chapter = await chapters.create('第一章')
    let requestContent = ''
    const workflow: Workflow = {
      schemaVersion: 1, id: 'flow_prompt_forwarding', name: 'Prompt forwarding', cyclePolicy: 'reject', variables: [],
      nodes: [
        { id: 'input', type: 'input.chapter', label: 'Input', position: { x: 0, y: 0 }, inputs: [], outputs: [{ id: 'out', type: 'chapter', required: false }], config: {} },
        { id: 'writer', type: 'ai.prompt', label: 'Writer', position: { x: 100, y: 0 }, inputs: [{ id: 'in', type: 'chapter', required: true }], outputs: [{ id: 'out', type: 'draft', required: false }], config: { agent: 'writer', prompt: '只输出本章正文，不解决主谜团。' } }
      ],
      edges: [{ id: 'input-writer', source: 'input', sourcePort: 'out', target: 'writer', targetPort: 'in' }]
    }
    const workflows = { list: async () => [{ id: workflow.id, name: workflow.name, relPath: 'workflows/prompt.json' }], read: async () => workflow }
    const ai = {
      defaultProfileId: () => 'profile_prompt',
      chat: async (_profileId: string, request: { messages: Array<{ content: string }> }) => { requestContent = request.messages.at(-1)?.content ?? ''; return { text: '这是可审核的正文。', model: 'prompt-model' } }
    }
    const runtime = new WorkflowRuntimeService(workflows as unknown as WorkflowService, new WorkflowRunStore(project), ai as never, chapters, {} as never, {} as never, new ImageService(project, chapters))

    await runtime.run(workflow.id, chapter.relPath)
    expect(requestContent).toContain('只输出本章正文，不解决主谜团。')
    expect(requestContent).toContain('"relPath"')
  })

  it('runs a workflow through the service, persists state, and emits progress', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Runtime service')
    const chapters = new ChapterService(project)
    const chapter = await chapters.create('第一章')
    await chapters.save(chapter.relPath, '# 第一章\n\n正文内容。')
    const workflow: Workflow = {
      schemaVersion: 1, id: 'flow_service', name: 'Service flow', cyclePolicy: 'reject', variables: [],
      nodes: [
        { id: 'input', type: 'input.chapter', label: 'Input', position: { x: 0, y: 0 }, inputs: [], outputs: [{ id: 'out', type: 'text', required: false }], config: {} },
        { id: 'pass', type: 'utility.transform', label: 'Pass', position: { x: 100, y: 0 }, inputs: [{ id: 'in', type: 'text', required: true }], outputs: [{ id: 'out', type: 'text', required: false }], config: {} }
      ],
      edges: [{ id: 'input-pass', source: 'input', sourcePort: 'out', target: 'pass', targetPort: 'in' }]
    }
    const workflows = { list: async () => [{ id: workflow.id, name: workflow.name, relPath: 'workflows/service.yaml' }], read: async () => workflow }
    const runtime = new WorkflowRuntimeService(
      workflows as unknown as WorkflowService,
      new WorkflowRunStore(project),
      {} as never, chapters, {} as never, {} as never,
      new ImageService(project, chapters)
    )
    const events: string[] = []
    const unsubscribe = runtime.onEvent((event) => { if (event.state) events.push(event.state.status) })
    const result = await runtime.run(workflow.id, chapter.relPath)
    unsubscribe()
    expect(result.status).toBe('succeeded')
    expect(result.nodes.input.output).toMatchObject({ relPath: chapter.relPath, title: '第一章' })
    expect(result.nodes.pass.output).toEqual({ in: { relPath: chapter.relPath, title: '第一章', markdown: '# 第一章\n\n正文内容。' } })
    expect(events).toContain('succeeded')
    expect(await runtime.listRuns(false)).toHaveLength(1)
  })

  it('executes a registered Main-owned workflow node instead of using pass-through fallback', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Extension runtime')
    const workflow: Workflow = {
      schemaVersion: 1, id: 'flow_extension_runtime', name: 'Extension runtime', cyclePolicy: 'reject', variables: [],
      nodes: [{ id: 'custom', type: 'demo.node', label: 'Demo', position: { x: 0, y: 0 }, inputs: [], outputs: [{ id: 'out', type: 'text', required: false }], config: {} }], edges: []
    }
    const registry = new ExtensionRegistry()
    let executions = 0
    registry.registerWorkflowNode({ type: 'demo.node', label: 'Demo', inputTypes: [], outputTypes: ['text'], run: async () => { executions += 1; return 'handled by extension' } })
    const workflows = { list: async () => [{ id: workflow.id, name: workflow.name, relPath: 'workflows/extension.yaml' }], read: async () => workflow }
    const runtime = new WorkflowRuntimeService(workflows as unknown as WorkflowService, new WorkflowRunStore(project), {} as never, new ChapterService(project), {} as never, {} as never, new ImageService(project, new ChapterService(project)), undefined, undefined, registry)

    const result = await runtime.run(workflow.id, 'chapters/001-missing.md')
    expect(result.status).toBe('succeeded')
    expect(result.nodes.custom.output).toBe('handled by extension')
    expect(result.nodes.custom.log).toContain('扩展节点 demo.node 已执行')
    expect(executions).toBe(1)
  })

  it('blocks a permissioned extension node until its Main-owned grant is present', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Permissioned runtime')
    const workflow: Workflow = {
      schemaVersion: 1, id: 'flow_permission_runtime', name: 'Permissioned runtime', cyclePolicy: 'reject', variables: [],
      nodes: [{ id: 'custom', type: 'permissioned.node', label: 'Permissioned', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} }], edges: []
    }
    const registry = new ExtensionRegistry()
    registry.registerManifest({ id: 'ext_permissioned', name: 'Permissioned', version: '1.0.0', permissions: [{ permission: 'project.read', reason: '读取项目' }] })
    let executions = 0
    registry.registerWorkflowNode({ type: 'permissioned.node', label: 'Permissioned', extensionId: 'ext_permissioned', permissions: ['project.read'], inputTypes: [], outputTypes: [], run: async () => { executions += 1; return 'allowed' } })
    const workflows = { list: async () => [{ id: workflow.id, name: workflow.name, relPath: 'workflows/permission.yaml' }], read: async () => workflow }
    const runtime = new WorkflowRuntimeService(workflows as unknown as WorkflowService, new WorkflowRunStore(project), {} as never, new ChapterService(project), {} as never, {} as never, new ImageService(project, new ChapterService(project)), undefined, undefined, registry)

    await expect(runtime.run(workflow.id, 'chapters/001-missing.md')).resolves.toMatchObject({ status: 'failed' })
    expect(executions).toBe(0)
    registry.grantPermissions('ext_permissioned', ['project.read'])
    await expect(runtime.run(workflow.id, 'chapters/001-missing.md')).resolves.toMatchObject({ status: 'succeeded' })
    expect(executions).toBe(1)
  })

  it('rejects unknown workflows and cancelling an already finished run', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Runtime errors')
    const empty = { list: async () => [], read: async () => { throw new Error('unreachable') } }
    const runtime = new WorkflowRuntimeService(empty as unknown as WorkflowService, new WorkflowRunStore(project), {} as never, new ChapterService(project), {} as never, {} as never, new ImageService(project, new ChapterService(project)))
    await expect(runtime.run('flow_missing', 'chapters/001-missing.md')).rejects.toThrow('Workflow 不存在')
    await expect(runtime.cancel('run_missing')).rejects.toThrow('不存在或已结束')
  })

  it('starts a background workflow and exposes its completed job', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Background runtime')
    const workflow: Workflow = {
      schemaVersion: 1, id: 'flow_background', name: 'Background', cyclePolicy: 'reject', variables: [],
      nodes: [{ id: 'pass', type: 'utility.transform', label: 'Pass', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} }], edges: []
    }
    const workflows = { list: async () => [{ id: workflow.id, name: workflow.name, relPath: 'workflows/background.yaml' }], read: async () => workflow }
    const runtime = new WorkflowRuntimeService(workflows as unknown as WorkflowService, new WorkflowRunStore(project), {} as never, new ChapterService(project), {} as never, {} as never, new ImageService(project, new ChapterService(project)))

    const runId = await runtime.start(workflow.id, 'chapters/001-missing.md')
    await expect(waitForRun(runtime, runId, 'succeeded')).resolves.toMatchObject({ id: runId, status: 'succeeded' })
    await expect(runtime.listJobs()).resolves.toContainEqual(expect.objectContaining({ refId: runId, status: 'succeeded' }))
  })

  it('persists a failed job when background execution rejects before creating run state', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Invalid background runtime')
    const workflow: Workflow = {
      schemaVersion: 1, id: 'flow_invalid_background', name: 'Invalid background', cyclePolicy: 'reject', variables: [],
      nodes: [{ id: 'script', type: 'utility.script', label: 'Script', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} }], edges: []
    }
    const workflows = { list: async () => [{ id: workflow.id, name: workflow.name, relPath: 'workflows/invalid.yaml' }], read: async () => workflow }
    const runtime = new WorkflowRuntimeService(workflows as unknown as WorkflowService, new WorkflowRunStore(project), {} as never, new ChapterService(project), {} as never, {} as never, new ImageService(project, new ChapterService(project)))

    const runId = await runtime.start(workflow.id, 'chapters/001-missing.md')
    await waitForJob(runtime, runId, 'failed')
    await expect(runtime.listJobs(false)).resolves.toContainEqual(expect.objectContaining({ refId: runId, status: 'failed', error: expect.stringContaining('Workflow 无法执行') }))
  })

  it('retries a failed chapter workflow with a valid target path', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Retry runtime')
    const chapters = new ChapterService(project); const chapter = await chapters.create('第一章')
    const workflow: Workflow = { schemaVersion: 1, id: 'flow_retry_service', name: 'Retry', cyclePolicy: 'reject', variables: [], nodes: [{ id: 'input', type: 'input.chapter', label: 'Input', position: { x: 0, y: 0 }, inputs: [], outputs: [{ id: 'out', type: 'chapter', required: false }], config: {} }], edges: [] }
    const workflows = { list: async () => [{ id: workflow.id, name: workflow.name, relPath: 'workflows/retry.yaml' }], read: async () => workflow }
    const runtime = new WorkflowRuntimeService(workflows as unknown as WorkflowService, new WorkflowRunStore(project), {} as never, chapters, {} as never, {} as never, new ImageService(project, chapters))

    const failed = await runtime.run(workflow.id, 'chapters/missing.md')
    expect(failed.status).toBe('failed')
    await expect(runtime.retry(failed.id, chapter.relPath)).resolves.toBe(failed.id)
    await expect(waitForRun(runtime, failed.id, 'succeeded')).resolves.toMatchObject({ id: failed.id, status: 'succeeded', relPath: chapter.relPath })
  })

  it('rejects resume for legacy runs without a chapter path or without a human node', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Resume runtime')
    const workflow: Workflow = { schemaVersion: 1, id: 'flow_resume_legacy', name: 'Resume', cyclePolicy: 'reject', variables: [], nodes: [{ id: 'pass', type: 'utility.transform', label: 'Pass', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} }], edges: [] }
    const workflows = { list: async () => [{ id: workflow.id, name: workflow.name, relPath: 'workflows/resume.yaml' }], read: async () => workflow }
    const runs = new WorkflowRunStore(project)
    await runs.save({ id: 'run_legacy_resume', workflowId: workflow.id, status: 'waiting_human', nodes: {}, outputs: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    const runtime = new WorkflowRuntimeService(workflows as unknown as WorkflowService, runs, {} as never, new ChapterService(project), {} as never, {} as never, new ImageService(project, new ChapterService(project)))

    await expect(runtime.resume('run_legacy_resume')).rejects.toThrow('缺少章节路径')
  })

  it('reports node input errors without invoking external services', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Node validation runtime')
    const workflow: Workflow = { schemaVersion: 1, id: 'flow_node_validation', name: 'Validation', cyclePolicy: 'reject', variables: [], nodes: [{ id: 'context', type: 'context.load', label: 'Context', position: { x: 0, y: 0 }, inputs: [], outputs: [{ id: 'out', type: 'context', required: false }], config: {} }], edges: [] }
    const workflows = { list: async () => [{ id: workflow.id, name: workflow.name, relPath: 'workflows/context.yaml' }], read: async () => workflow }
    const runtime = new WorkflowRuntimeService(workflows as unknown as WorkflowService, new WorkflowRunStore(project), {} as never, new ChapterService(project), {} as never, {} as never, new ImageService(project, new ChapterService(project)))

    const result = await runtime.run(workflow.id, 'chapters/001-missing.md')
    expect(result.status).toBe('failed')
    expect(result.nodes.context.error).toContain('缺少章节输入')
    expect(result.nodes.context.diagnostics?.errorCategory).toBe('validation')
  })

  it('pauses for human review, then writes the approved AI draft into the chapter', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Human review runtime')
    const chapters = new ChapterService(project)
    const chapter = await chapters.create('第一章')
    await chapters.save(chapter.relPath, '# 第一章\n\n原始正文。')
    const workflow: Workflow = {
      schemaVersion: 1, id: 'flow_review_service', name: 'Review flow', cyclePolicy: 'reject', variables: [],
      nodes: [
        { id: 'input', type: 'input.chapter', label: 'Input', position: { x: 0, y: 0 }, inputs: [], outputs: [{ id: 'out', type: 'text', required: false }], config: {} },
        { id: 'writer', type: 'ai.generate', label: 'Writer', position: { x: 100, y: 0 }, inputs: [{ id: 'in', type: 'text', required: true }], outputs: [{ id: 'out', type: 'text', required: false }], config: { agent: 'writer' } },
        { id: 'review', type: 'human.review', label: 'Review', position: { x: 200, y: 0 }, inputs: [{ id: 'in', type: 'text', required: true }], outputs: [{ id: 'out', type: 'text', required: false }], config: {} },
        { id: 'write', type: 'chapter.write', label: 'Write', position: { x: 300, y: 0 }, inputs: [{ id: 'in', type: 'text', required: true }], outputs: [{ id: 'out', type: 'text', required: false }], config: {} }
      ],
      edges: [
        { id: 'input-writer', source: 'input', sourcePort: 'out', target: 'writer', targetPort: 'in' },
        { id: 'writer-review', source: 'writer', sourcePort: 'out', target: 'review', targetPort: 'in' },
        { id: 'review-write', source: 'review', sourcePort: 'out', target: 'write', targetPort: 'in' }
      ]
    }
    const workflows = { list: async () => [{ id: workflow.id, name: workflow.name, relPath: 'workflows/review.yaml' }], read: async () => workflow }
    const ai = {
      defaultProfileId: () => 'profile_mock_review',
      listProfiles: async () => [{ id: 'profile_mock_review', name: 'Review', kind: 'mock' as const, model: 'review-model', temperature: 0, maxOutputTokens: 100 }],
      chat: async () => ({ text: '审核后的正文。', model: 'review-model', requestId: 'review-request' })
    }
    const runtime = new WorkflowRuntimeService(workflows as unknown as WorkflowService, new WorkflowRunStore(project), ai as never, chapters, {} as never, {} as never, new ImageService(project, chapters))
    const paused = await runtime.run(workflow.id, chapter.relPath)
    expect(paused.status).toBe('waiting_human')
    expect(paused.nodes.review.output).toMatchObject({ kind: 'draft', content: '审核后的正文。' })
    await expect(runtime.resume(paused.id, { action: 'approve' })).resolves.toMatchObject({ status: 'succeeded' })
    const updated = await chapters.read(chapter.relPath)
    expect(updated.markdown).toContain('审核后的正文。')
    expect(updated.markdown).not.toContain('原始正文。')
  })
})
