import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workflowSchema } from '../src/shared/workflow'
import { validateWorkflow } from '../src/main/services/workflow-validation'
import { executeWorkflow } from '../src/main/services/workflow-runtime'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { WorkflowService } from '../src/main/services/workflow-service'
import { sceneSidecarSchema } from '../src/shared/scene'
import { parse as parseYaml } from 'yaml'
import { countWords } from '../src/main/services/words'

const root = join(process.cwd(), 'demo/雾港来信')
const read = (relPath: string) => readFileSync(join(root, relPath), 'utf8')

describe('middle novel authoring fixture', () => {
  it('contains the complete from-zero project foundation', () => {
    expect(existsSync(join(root, 'novel.yaml'))).toBe(true)
    expect(read('story/premise.md')).toContain('雾港来信')
    expect(read('story/outline.md')).toContain('第十四章')
    expect(read('story/volumes.yaml')).toContain('volume_first')
    expect(readdirSync(join(root, 'characters')).filter((name) => name.endsWith('.yaml'))).toHaveLength(4)
    expect(readdirSync(join(root, 'world/places')).filter((name) => name.endsWith('.yaml'))).toHaveLength(3)
    expect(readdirSync(join(root, 'chapters')).filter((name) => name.endsWith('.md'))).toHaveLength(14)
    expect(existsSync(join(root, 'story/authoring-progress.yaml'))).toBe(true)
  })

  it('contains a valid chapter workflow with a human writeback gate', () => {
    const workflow = workflowSchema.parse(JSON.parse(read('workflows/flow_middle_novel_authoring.novelflow.json')))
    expect(workflow.id).toBe('flow_middle_novel_authoring')
    expect(validateWorkflow(workflow)).toEqual([])
    const review = workflow.nodes.find((node) => node.type === 'human.review')
    const write = workflow.nodes.find((node) => node.type === 'chapter.write')
    expect(review).toBeDefined()
    expect(write).toBeDefined()
    expect(workflow.edges.some((edge) => edge.source === review?.id && edge.target === write?.id)).toBe(true)

    const reusable = workflowSchema.parse(JSON.parse(read('workflows/flow_my_authoring.novelflow.json')))
    expect(reusable.id).toBe('flow_my_authoring')
    expect(validateWorkflow(reusable)).toEqual([])
    expect(read('novel.yaml')).toContain('defaultWorkflow: flow_my_authoring')
  })

  it('keeps references and prompts present for the first chapter loop', () => {
    expect(read('chapters/001-录音里的求救声.md')).toContain('林岚')
    expect(read('chapters/001-录音里的求救声.scenes.yaml')).toContain('scene_001')
    for (const prompt of ['agent-plot-planner.md', 'agent-writer.md', 'agent-character-critic.md', 'agent-logic-critic.md', 'agent-style-critic.md', 'agent-rewrite.md', 'agent-memory-extractor.md']) {
      expect(existsSync(join(root, 'prompts', prompt))).toBe(true)
    }
  })

  it('keeps the persisted demo phase aligned with its chapter plans and draft', () => {
    const progress = parseYaml(read('story/authoring-progress.yaml')) as { phase?: string; chapters?: Array<{ status?: string; plan?: string }> }
    expect(progress.phase).toBe('chapter_writing')
    expect(progress.chapters?.[0]).toMatchObject({ status: 'draft' })
    expect(progress.chapters?.every((chapter) => Boolean(chapter.plan?.trim()))).toBe(true)
  })

  it('starts the novel with a substantial first-chapter draft', () => {
    const body = read('chapters/001-录音里的求救声.md').replace(/^#{1,6}\s+[^\r\n]*(?:\r?\n|$)/m, '')
    const chineseCharacters = body.match(/[\u4e00-\u9fff]/g) ?? []
    expect(chineseCharacters.length).toBeGreaterThanOrEqual(1500)
    expect(chineseCharacters.length).toBeLessThanOrEqual(2500)

    const progress = parseYaml(read('story/authoring-progress.yaml')) as { chapters?: Array<{ wordCount?: number }> }
    expect(progress.chapters?.[0]?.wordCount).toBe(countWords(body))
  })

  it('keeps later chapters planned until the authoring workflow reviews them', () => {
    const progress = parseYaml(read('story/authoring-progress.yaml')) as { chapters?: Array<{ number?: number; status?: string; wordCount?: number; plan?: string }> }
    expect(progress.chapters).toHaveLength(14)
    for (const chapter of progress.chapters?.slice(1) ?? []) {
      expect(chapter).toMatchObject({ status: 'planned', wordCount: 0 })
      expect(chapter.plan?.trim()).toBeTruthy()
    }
  })

  it('pauses before writeback and resumes through memory extraction after approval', async () => {
    const workflow = workflowSchema.parse(JSON.parse(read('workflows/flow_middle_novel_authoring.novelflow.json')))
    const pausedCalls: string[] = []
    const paused = await executeWorkflow(workflow, async ({ nodeId }) => {
      pausedCalls.push(nodeId)
      if (nodeId === 'review') return { status: 'waiting_human', output: { action: 'pending' as const } }
      return { status: 'succeeded', output: nodeId }
    }, { runId: 'run_middle_novel_review_gate', relPath: 'chapters/001-录音里的求救声.md' })

    expect(paused.state.status).toBe('waiting_human')
    expect(paused.waitingNodeId).toBe('review')
    expect(pausedCalls).toContain('rewrite')
    expect(pausedCalls).not.toContain('chapter-write')
    expect(pausedCalls).not.toContain('memory')

    const resumedCalls: string[] = []
    const resumed = await executeWorkflow(workflow, async ({ nodeId }) => {
      resumedCalls.push(nodeId)
      return { status: 'succeeded', output: nodeId }
    }, { initialState: paused.state, resumeInput: { action: 'approve' } })

    expect(resumed.state.status).toBe('succeeded')
    expect(resumed.state.nodes['chapter-write']?.status).toBe('succeeded')
    expect(resumed.state.nodes.memory?.status).toBe('succeeded')
    expect(resumedCalls).toEqual(['chapter-write', 'memory'])
  })

  it('opens, indexes, and validates the project sources without dangling references', async () => {
    const project = new ProjectService(new RecentProjectsStore(join(root, '.test-recents.json')))
    await project.open(root)
    try {
      const repair = await project.repairIndexes()
      expect(repair.documents).toBe(14)
      expect(repair.entities).toBe(7)
      expect(repair.timeline).toBe(1)
      expect(repair.invalidSourceFiles).toEqual([])
      const workflows = await new WorkflowService(project).list()
      expect(workflows).toContainEqual({ id: 'flow_middle_novel_authoring', name: '雾港来信·逐章创作闭环', relPath: 'workflows/flow_middle_novel_authoring.novelflow.json' })
      expect(workflows).toContainEqual({ id: 'flow_my_authoring', name: '我的创作流程', relPath: 'workflows/flow_my_authoring.novelflow.json' })
      expect(sceneSidecarSchema.safeParse(parseYaml(read('chapters/001-录音里的求救声.scenes.yaml'))).success).toBe(true)
      const integrity = await project.checkIntegrity()
      expect(integrity.danglingRelations).toBe(0)
      expect(integrity.danglingTimelineEntityRefs).toBe(0)
      expect(integrity.danglingTimelineChapterRefs).toBe(0)
      expect(integrity.invalidSourceFiles).toEqual([])
    } finally {
      await project.close()
    }
  })
})
