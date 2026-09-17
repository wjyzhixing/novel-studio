import type { StoryEntity, StoryRelation } from '../../../shared/story'

export function filterGraphNeighborhood(
  entities: readonly StoryEntity[],
  relations: readonly StoryRelation[],
  focusEntityId: string | null,
  hops = 1,
): { entities: StoryEntity[]; relations: StoryRelation[] } {
  if (!focusEntityId) return { entities: [...entities], relations: [...relations] }
  const maxHops = Math.min(10, Math.max(1, Math.floor(Number.isFinite(hops) ? hops : 1)))
  const relatedIds = new Set<string>([focusEntityId])
  let frontier = new Set<string>([focusEntityId])
  for (let depth = 0; depth < maxHops && frontier.size > 0; depth += 1) {
    const nextFrontier = new Set<string>()
    for (const relation of relations) {
      if (!frontier.has(relation.fromId) && !frontier.has(relation.toId)) continue
      const fromIsNew = !relatedIds.has(relation.fromId)
      const toIsNew = !relatedIds.has(relation.toId)
      relatedIds.add(relation.fromId)
      relatedIds.add(relation.toId)
      if (fromIsNew) nextFrontier.add(relation.fromId)
      if (toIsNew) nextFrontier.add(relation.toId)
    }
    frontier = nextFrontier
  }
  const visibleRelations = relations.filter((relation) => relatedIds.has(relation.fromId) && relatedIds.has(relation.toId))
  return {
    entities: entities.filter((entity) => relatedIds.has(entity.id)),
    relations: visibleRelations
  }
}
