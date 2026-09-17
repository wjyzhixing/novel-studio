import { describe, expect, it } from 'vitest'
import { getAdjacentRelations } from '../src/renderer/src/lib/graph-inspector'
import type { StoryEntity, StoryRelation } from '../src/shared/story'

const entity = (id: string, name = id): StoryEntity => ({ id, kind: 'character', name, aliases: [], fields: {}, notes: '', updatedAt: '2026-09-14' })
const relation = (id: string, fromId: string, toId: string, relationType = 'related'): StoryRelation => ({ id, fromId, toId, relationType, metadata: {}, createdAt: '2026-09-14' })

describe('graph entity inspector', () => {
  it('projects incoming and outgoing neighbors with direction', () => {
    const result = getAdjacentRelations(
      [entity('ent-a', 'A'), entity('ent-b', 'B'), entity('ent-c', 'C')],
      [relation('rel-ab', 'ent-a', 'ent-b', 'knows'), relation('rel-ca', 'ent-c', 'ent-a', 'follows')],
      'ent-a',
    )

    expect(result).toEqual([
      { relationId: 'rel-ab', relationType: 'knows', direction: 'outgoing', neighbor: entity('ent-b', 'B') },
      { relationId: 'rel-ca', relationType: 'follows', direction: 'incoming', neighbor: entity('ent-c', 'C') },
    ])
  })

  it('ignores missing endpoints and does not mutate source arrays', () => {
    const entities = [entity('ent-a'), entity('ent-b')]
    const relations = [relation('rel-ab', 'ent-a', 'ent-b'), relation('rel-missing', 'ent-a', 'ent-x')]
    const result = getAdjacentRelations(entities, relations, 'ent-a')

    expect(result).toHaveLength(1)
    expect(entities).toHaveLength(2)
    expect(relations).toHaveLength(2)
  })

  it('returns no neighbors when the selected entity is absent', () => {
    expect(getAdjacentRelations([entity('ent-a')], [relation('rel-ab', 'ent-a', 'ent-b')], 'ent-x')).toEqual([])
  })
})
