import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { ChapterService } from '../src/main/services/chapter-service'
import { StoryService } from '../src/main/services/story-service'
import { CanonService } from '../src/main/services/canon-service'
import { ContextService } from '../src/main/services/context-service'
import { AgentService } from '../src/main/services/agent-service'
import { MemoryService } from '../src/main/services/memory-service'
import { makeTempRoot } from './helpers'

describe('MemoryService', () => {
  it('turns structured extractor output into pending Canon proposals with source ranges', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Memory extraction')
    const chapters = new ChapterService(project); const chapter = await chapters.create('第一章'); await chapters.save(chapter.relPath, '# 第一章\n\n林默受伤了。')
    const story = new StoryService(project); const entity = await story.saveEntity({ kind: 'character', name: '林默', aliases: [], fields: {}, notes: '' })
    const canon = new CanonService(project); const context = new ContextService(project, chapters, story, canon)
    const ai = { structured: async () => ({ facts: [{ subjectId: entity.id, predicate: 'status.injured', object: true, validFrom: null, validTo: null, confidence: 0.9, range: [4, 9] }] }) }
    const memory = new MemoryService(chapters, context, ai as never, new AgentService(), canon)
    let calls = 0
    const idempotentAi = { structured: async (_profileId: string, request: { responseSchema?: { name: string; schema: Record<string, unknown> } }) => { calls += 1; expect(request.responseSchema).toEqual({ name: 'memory_extraction', schema: expect.objectContaining({ type: 'object' }) }); return { facts: [{ subjectId: entity.id, predicate: 'status.injured', object: true, validFrom: null, validTo: null, confidence: 0.9, range: [4, 9] }] } } }
    const idempotentMemory = new MemoryService(chapters, context, idempotentAi as never, new AgentService(), canon)
    const proposals = await idempotentMemory.extractFromChapter('profile_mock', chapter.relPath, 'run_memory_1')
    const retried = await idempotentMemory.extractFromChapter('profile_mock', chapter.relPath, 'run_memory_1')
    expect(proposals).toHaveLength(1); expect(proposals[0].status).toBe('pending'); expect('source' in proposals[0].payload && proposals[0].payload.source).toEqual({ documentId: chapter.relPath, range: [4, 9] })
    expect(retried.map((proposal) => proposal.id)).toEqual(proposals.map((proposal) => proposal.id))
    expect(calls).toBe(1)
  })
})
