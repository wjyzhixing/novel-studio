import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { CanonService } from '../src/main/services/canon-service'
import { StoryService } from '../src/main/services/story-service'
import type { Fact } from '../src/shared/canon'
import { makeTempRoot } from './helpers'

describe('CanonService human-gated proposals', () => {
  it('keeps proposed facts out of Canon until Apply, preserves source, and reverts', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Canon test')
    const canon = new CanonService(project)
    const input = { subjectId: 'ent_linmo', predicate: 'status.alive', object: { value: true }, validFrom: 'chapter:1', validTo: null, confidence: 1, source: { documentId: 'ch01', range: [10, 24] as [number, number] } }
    const proposal = await canon.proposeFact(input)
    expect((await canon.listFacts())).toEqual([])
    expect(proposal.status).toBe('pending')
    const applied = await canon.applyProposal(proposal.id)
    expect((applied as Fact).canonical).toBe(true); expect((applied as Fact).source).toEqual(input.source)
    expect((await canon.listFacts())).toHaveLength(1)
    await canon.revertProposal(proposal.id)
    expect(await canon.listFacts()).toEqual([])
  })

  it('detects deterministic unique-attribute conflicts before Apply', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Conflict test'); const canon = new CanonService(project)
    const base = { subjectId: 'ent_linmo', predicate: 'status.locationId', object: 'place_a', validFrom: null, validTo: null, confidence: 1, source: { documentId: 'ch01', range: [1, 2] as [number, number] } }
    const first = await canon.proposeFact(base); await canon.applyProposal(first.id)
    const conflict = await canon.check({ ...base, object: 'place_b', source: { documentId: 'ch02', range: [3, 4] as [number, number] } })
    expect(conflict).toHaveLength(1); expect(conflict[0].kind).toBe('unique-attribute')
  })

  it('reports a knowledge leak when a future chapter fact is sourced from an earlier chapter', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Knowledge leak test'); const canon = new CanonService(project)
    const conflicts = await canon.check({ subjectId: 'ent_linmo', predicate: 'knowledge.secret', object: '禁门位置', validFrom: 'chapter:9', validTo: null, confidence: 1, source: { documentId: 'chapters/001-first.md', range: [1, 2] as [number, number] } })

    expect(conflicts).toEqual([expect.objectContaining({ kind: 'knowledge-leak', severity: 'warning', factIds: ['candidate'] })])
  })

  it('does not report knowledge leaks without an ordered chapter boundary', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Knowledge boundary test'); const canon = new CanonService(project)
    await expect(canon.check({ subjectId: 'ent_linmo', predicate: 'knowledge.secret', object: '已知', validFrom: 'chapter:1', validTo: null, confidence: 1, source: { documentId: 'notes/author-note.md', range: [0, 1] as [number, number] } })).resolves.toEqual([])
  })

  it('compares chapter numbers numerically when validating temporal ranges', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Chapter time test'); const canon = new CanonService(project)
    const conflicts = await canon.check({ subjectId: 'ent_linmo', predicate: 'status', object: 'x', validFrom: 'chapter:10', validTo: 'chapter:2', confidence: 1, source: { documentId: 'chapters/010-late.md', range: [0, 1] as [number, number] } })

    expect(conflicts).toEqual([expect.objectContaining({ kind: 'temporal', severity: 'error' })])
  })

  it('does not mark numerically disjoint chapter ranges as overlapping', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Chapter overlap test'); const canon = new CanonService(project)
    const first = await canon.proposeFact({ subjectId: 'ent_linmo', predicate: 'status', object: 'first', validFrom: 'chapter:1', validTo: 'chapter:2', confidence: 1, source: { documentId: 'chapters/001-first.md', range: [0, 1] as [number, number] } })
    await canon.applyProposal(first.id)
    await expect(canon.check({ subjectId: 'ent_linmo', predicate: 'status', object: 'later', validFrom: 'chapter:10', validTo: null, confidence: 1, source: { documentId: 'chapters/010-later.md', range: [0, 1] as [number, number] } })).resolves.toEqual([])
  })

  it('rejects a pending proposal without creating a Canon fact', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Reject test'); const canon = new CanonService(project)
    const proposal = await canon.proposeFact({ subjectId: 'ent_x', predicate: 'role', object: 'extra', validFrom: null, validTo: null, confidence: 1, source: { documentId: 'ch01', range: [1, 1] as [number, number] } })
    await canon.rejectProposal(proposal.id)
    expect((await canon.listProposals())[0].status).toBe('rejected')
    expect(await canon.listFacts()).toEqual([])
  })

  it('blocks applying a proposal that conflicts with existing Canon', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Apply conflict'); const canon = new CanonService(project)
    const base = { subjectId: 'ent_x', predicate: 'location', object: 'place_a', validFrom: null, validTo: null, confidence: 1, source: { documentId: 'ch01', range: [1, 2] as [number, number] } }
    await canon.applyProposal((await canon.proposeFact(base)).id)
    const conflicting = await canon.proposeFact({ ...base, object: 'place_b' })
    await expect(canon.applyProposal(conflicting.id)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect((await canon.listProposals()).find((proposal) => proposal.id === conflicting.id)?.status).toBe('pending')
  })

  it('keeps relation updates pending until Apply and restores the prior relation on Revert', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Relation proposal test')
    const story = new StoryService(project)
    const from = await story.saveEntity({ kind: 'character', name: '林默', aliases: [], fields: {}, notes: '' })
    const to = await story.saveEntity({ kind: 'place', name: '旧城', aliases: [], fields: {}, notes: '' })
    const relation = await story.saveRelation({ fromId: from.id, relationType: 'knows', toId: to.id, metadata: { source: 'draft' } })
    const canon = new CanonService(project, story)

    const proposal = await canon.proposeRelationUpdate({ ...relation, relationType: 'protects', metadata: { source: 'chapter-1' } })
    expect(proposal).toMatchObject({ type: 'relation.update', status: 'pending' })
    expect((await story.listRelations())[0]).toMatchObject({ id: relation.id, relationType: 'knows', metadata: { source: 'draft' } })

    const applied = await canon.applyProposal(proposal.id)
    expect(applied).toMatchObject({ id: relation.id, relationType: 'protects', metadata: { source: 'chapter-1' } })
    expect((await story.listRelations())[0].relationType).toBe('protects')

    await canon.revertProposal(proposal.id)
    expect((await story.listRelations())[0]).toMatchObject({ id: relation.id, relationType: 'knows', metadata: { source: 'draft' } })
    expect((await canon.listProposals())[0].status).toBe('reverted')
  })

  it('keeps fact updates pending until Apply and restores the prior fact on Revert', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Fact update proposal test')
    const canon = new CanonService(project)
    const original = await canon.proposeFact({ subjectId: 'ent_linmo', predicate: 'status.injury', object: 'severe', validFrom: null, validTo: null, confidence: 1, source: { documentId: 'ch01', range: [1, 4] as [number, number] } })
    const fact = await canon.applyProposal(original.id)
    const proposal = await canon.proposeFactUpdate({ ...(fact as { id: string }), id: (fact as { id: string }).id, subjectId: 'ent_linmo', predicate: 'status.injury', object: 'healed', validFrom: null, validTo: null, confidence: 1, source: { documentId: 'ch02', range: [2, 6] as [number, number] } })

    expect(proposal).toMatchObject({ type: 'fact.update', status: 'pending' })
    expect((await canon.listFacts())[0].object).toBe('severe')
    const updated = await canon.applyProposal(proposal.id)
    expect(updated).toMatchObject({ id: fact.id, object: 'healed', canonical: true })
    expect((await canon.listFacts())[0].object).toBe('healed')

    await canon.revertProposal(proposal.id)
    expect((await canon.listFacts())[0]).toMatchObject({ id: fact.id, object: 'severe', source: { documentId: 'ch01', range: [1, 4] } })
  })

  it('labels knowledge fact updates explicitly while retaining the same human gate', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Knowledge update proposal test')
    const canon = new CanonService(project)
    const original = await canon.proposeFact({ subjectId: 'ent_suli', predicate: 'knowledge.identity', object: 'unknown', validFrom: null, validTo: null, confidence: 1, source: { documentId: 'ch01', range: [1, 2] as [number, number] } })
    const fact = await canon.applyProposal(original.id)
    const proposal = await canon.proposeFactUpdate({ id: (fact as { id: string }).id, subjectId: 'ent_suli', predicate: 'knowledge.identity', object: 'revealed', validFrom: 'chapter:2', validTo: null, confidence: 1, source: { documentId: 'ch02', range: [3, 5] as [number, number] } })

    expect(proposal.type).toBe('knowledge.update')
    expect((await canon.listFacts())[0].object).toBe('unknown')
    await canon.applyProposal(proposal.id)
    expect((await canon.listFacts())[0].object).toBe('revealed')
    await canon.revertProposal(proposal.id)
    expect((await canon.listFacts())[0].object).toBe('unknown')
  })

  it('keeps timeline additions pending until Apply and removes them on Revert', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Timeline proposal test')
    const story = new StoryService(project)
    const canon = new CanonService(project, story)
    const proposal = await canon.proposeTimelineAdd({ id: 'evt_canon_test', title: '进入地下城', at: '2127-05-17T21:42:00Z', description: '主角进入地下城', chapterRelPath: null, entityIds: [], locationId: null, causes: '追踪线索', effects: '开启新区域' })

    expect(proposal).toMatchObject({ type: 'timeline.add', status: 'pending' })
    expect(await story.listTimeline()).toEqual([])
    const applied = await canon.applyProposal(proposal.id)
    expect(applied).toMatchObject({ id: 'evt_canon_test', title: '进入地下城' })
    expect((await story.listTimeline())[0].title).toBe('进入地下城')

    await canon.revertProposal(proposal.id)
    expect(await story.listTimeline()).toEqual([])
  })

  it('keeps foreshadowing additions pending until Apply and removes them on Revert', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Foreshadowing proposal test')
    const story = new StoryService(project)
    const canon = new CanonService(project, story)
    const proposal = await canon.proposeForeshadowingAdd({ id: 'art_canon_test', kind: 'foreshadowing', title: '黑色芯片', fields: { setup: '首次出现', target: '地下城', status: 'planted' }, notes: '等待回收' })

    expect(proposal).toMatchObject({ type: 'foreshadowing.add', status: 'pending' })
    expect(await story.listArtifacts('foreshadowing')).toEqual([])
    const applied = await canon.applyProposal(proposal.id)
    expect(applied).toMatchObject({ id: 'art_canon_test', kind: 'foreshadowing', title: '黑色芯片' })
    expect((await story.listArtifacts('foreshadowing'))[0].title).toBe('黑色芯片')

    await canon.revertProposal(proposal.id)
    expect(await story.listArtifacts('foreshadowing')).toEqual([])
  })
})
