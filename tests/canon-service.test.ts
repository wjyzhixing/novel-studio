import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { CanonService } from '../src/main/services/canon-service'
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
    expect(applied.canonical).toBe(true); expect(applied.source).toEqual(input.source)
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
})
