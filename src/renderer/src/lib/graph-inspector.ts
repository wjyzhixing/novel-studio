import type { StoryEntity, StoryRelation } from '../../../shared/story'

export type GraphRelationDirection = 'incoming' | 'outgoing'

export interface GraphAdjacentRelation {
  relationId: string
  relationType: string
  direction: GraphRelationDirection
  neighbor: StoryEntity
}

export function getAdjacentRelations(
  entities: readonly StoryEntity[],
  relations: readonly StoryRelation[],
  entityId: string | null,
): GraphAdjacentRelation[] {
  if (!entityId) return []
  const entityById = new Map(entities.map((entity) => [entity.id, entity]))
  if (!entityById.has(entityId)) return []

  return relations.flatMap((relation) => {
    const direction: GraphRelationDirection | null = relation.fromId === entityId
      ? 'outgoing'
      : relation.toId === entityId
        ? 'incoming'
        : null
    if (!direction) return []
    const neighbor = entityById.get(direction === 'outgoing' ? relation.toId : relation.fromId)
    if (!neighbor) return []
    return [{ relationId: relation.id, relationType: relation.relationType, direction, neighbor }]
  })
}
