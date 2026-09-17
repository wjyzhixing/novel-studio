import { describe, expect, it } from 'vitest'
import { filterGraphNeighborhood } from '../src/renderer/src/lib/graph-neighborhood'
import type { StoryEntity, StoryRelation } from '../src/shared/story'

const entity = (id: string): StoryEntity => ({ id, kind: 'character', name: id, aliases: [], fields: {}, notes: '', updatedAt: '2026-09-09' })
const relation = (id: string, fromId: string, toId: string): StoryRelation => ({ id, fromId, toId, relationType: 'related', metadata: {}, createdAt: '2026-09-09' })

describe('graph neighborhood filtering', () => {
  it('keeps the focus entity and both endpoints of its direct relations', () => {
    const result = filterGraphNeighborhood([entity('a'), entity('b'), entity('c'), entity('d')], [relation('r1', 'a', 'b'), relation('r2', 'c', 'a'), relation('r3', 'c', 'd')], 'a')
    expect(result.entities.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(result.relations.map((item) => item.id)).toEqual(['r1', 'r2'])
  })

  it('returns copies of the complete graph when no focus is selected', () => {
    const entities = [entity('a'), entity('b')]
    const relations = [relation('r1', 'a', 'b')]
    const result = filterGraphNeighborhood(entities, relations, null)
    expect(result).toEqual({ entities, relations })
    expect(result.entities).not.toBe(entities)
    expect(result.relations).not.toBe(relations)
  })

  it('expands the focus to the requested number of hops without leaking unrelated branches', () => {
    const result = filterGraphNeighborhood(
      [entity('a'), entity('b'), entity('c'), entity('d'), entity('e')],
      [relation('r1', 'a', 'b'), relation('r2', 'b', 'c'), relation('r3', 'c', 'd'), relation('r4', 'd', 'e')],
      'a',
      2,
    )
    expect(result.entities.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(result.relations.map((item) => item.id)).toEqual(['r1', 'r2'])
  })

  it('clamps invalid hop counts to the direct neighborhood', () => {
    const relations = [relation('r1', 'a', 'b'), relation('r2', 'b', 'c')]
    expect(filterGraphNeighborhood([entity('a'), entity('b'), entity('c')], relations, 'a', 0).entities.map((item) => item.id)).toEqual(['a', 'b'])
    expect(filterGraphNeighborhood([entity('a'), entity('b'), entity('c')], relations, 'a', 99).entities.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })
})
