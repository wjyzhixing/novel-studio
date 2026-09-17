import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AgentService } from '../src/main/services/agent-service'
import { AiService } from '../src/main/services/ai-service'
import { AuthoringProgressService } from '../src/main/services/authoring-progress-service'
import { CanonService } from '../src/main/services/canon-service'
import { ChapterService } from '../src/main/services/chapter-service'
import { ContextService } from '../src/main/services/context-service'
import { ImageService } from '../src/main/services/image-service'
import { MemoryService } from '../src/main/services/memory-service'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { RevisionService } from '../src/main/services/revision-service'
import { MemorySecretStore } from '../src/main/services/secret-store'
import { StoryService } from '../src/main/services/story-service'
import { VolumeService } from '../src/main/services/volume-service'
import { WorkflowRunStore } from '../src/main/services/workflow-run-store'
import { WorkflowRuntimeService } from '../src/main/services/workflow-runtime-service'
import { WorkflowService } from '../src/main/services/workflow-service'
import { makeTempRoot } from './helpers'

describe('authoring workflow golden path', () => {
  it('keeps the chapter unchanged until review, then writes back and creates pending Canon proposals', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recents.json')))
    await project.create(join(root, 'novel'), 'Golden path')
    const volumes = new VolumeService(project)
    const chapters = new ChapterService(project, undefined, volumes)
    const story = new StoryService(project)
    const entity = await story.saveEntity({ kind: 'character', name: '林岚', aliases: [], fields: {}, notes: '' })
    const canon = new CanonService(project, story)
    const authoring = new AuthoringProgressService(project, chapters, volumes, canon)
    await authoring.initialize({ genre: '都市悬疑', premise: '从旧录音追查失踪者。', targetWordCount: 2_000, chapterCount: 2, volumeTitles: ['第一卷'], chapterTitles: ['录音', '潮线'], chapterPlans: ['收到录音并建立疑问', '沿潮线寻找证据'] })

    const chapter = (await chapters.list())[0]!
    const original = (await chapters.read(chapter.relPath)).markdown
    const secrets = new MemorySecretStore()
    const agents = new AgentService()
    const ai = new AiService(project, secrets, agents)
    await ai.saveProfile({ id: 'profile_mock_flow', name: 'Mock flow', kind: 'mock', model: 'mock-model', temperature: 0, maxOutputTokens: 4096 })
    await ai.selectProfile('profile_mock_flow')
    const context = new ContextService(project, chapters, story, canon)
    const memory = new MemoryService(chapters, context, ai, agents, canon)
    const revisions = new RevisionService(project, chapters)
    const workflowService = new WorkflowService(project)
    const runtime = new WorkflowRuntimeService(
      workflowService,
      new WorkflowRunStore(project),
      ai,
      chapters,
      context,
      memory,
      new ImageService(project, chapters),
      agents,
      revisions,
      undefined,
      authoring
    )

    const paused = await runtime.run('flow_my_authoring', chapter.relPath)
    expect(paused.status).toBe('waiting_human')
    expect(paused.nodes.review?.status).toBe('waiting_human')
    expect(await readFile(join(project.getInfo()!.rootPath, chapter.relPath), 'utf8')).toBe(original)
    expect((await authoring.refresh()).chapters[0]?.plan).toContain('mock:')

    const resumed = await runtime.resume(paused.id, { action: 'approve' })
    expect(resumed.status).toBe('succeeded')
    expect(resumed.nodes['chapter-write']?.status).toBe('succeeded')
    expect(resumed.nodes.memory?.status).toBe('succeeded')
    expect((await chapters.read(chapter.relPath)).markdown).toContain('雨声落在旧路上')
    expect(await revisions.list(chapter.relPath)).toHaveLength(1)

    const proposals = await canon.listProposals()
    expect(proposals).toHaveLength(1)
    expect(proposals[0]?.status).toBe('pending')
    expect(project.database.raw.prepare('SELECT COUNT(*) AS count FROM facts WHERE canonical = 1').get()).toEqual({ count: 0 })

    const progress = await authoring.refresh()
    expect(progress.chapters[0]).toMatchObject({ status: 'approved', workflowRunId: paused.id })
    expect(progress.chapters[1]).toMatchObject({ status: 'planned', wordCount: 0 })
    expect(progress.canon.pendingProposals).toBe(1)
    await project.close()
  })
})
