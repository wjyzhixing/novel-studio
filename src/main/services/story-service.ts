import { randomBytes } from 'node:crypto'
import type { EntityInput, EntityKind, StoryEntity, TimelineEvent, TimelineEventInput, StoryArtifact, StoryArtifactInput, StoryArtifactKind, StoryRelation, StoryRelationInput, ForeshadowingRecord, ForeshadowingStatus, StorySearchResult } from '../../shared/story'
import { entityInputSchema, timelineEventInputSchema, storyArtifactInputSchema, storyRelationInputSchema } from '../../shared/story'
import type { ProjectService } from './project-service'
import { DomainError } from './errors'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { readFile, unlink } from 'node:fs/promises'
import { atomicWriteFile } from './atomic-fs'

function newId(prefix: 'ent' | 'evt' | 'art' | 'rel'): string {
  return `${prefix}_${randomBytes(10).toString('hex')}`
}

function decode<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T } catch { return fallback }
}

/** Main-process Story Bible persistence. SQLite stores structured state; notes remain plain text. */
export class StoryService {
  constructor(private readonly project: ProjectService) {}

  private get db() { return this.project.database.raw }

  async listEntities(kind?: EntityKind): Promise<StoryEntity[]> {
    const rows = (kind
      ? this.db.prepare('SELECT * FROM entities WHERE kind = ? ORDER BY name COLLATE NOCASE').all(kind)
      : this.db.prepare('SELECT * FROM entities ORDER BY name COLLATE NOCASE').all()) as unknown as EntityRow[]
    return rows.map(toEntity)
  }

  async getEntity(id: string): Promise<StoryEntity> {
    const row = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as EntityRow | undefined
    if (!row) throw new DomainError('PROJECT_NOT_FOUND', `实体不存在: ${id}`)
    return toEntity(row)
  }

  async saveEntity(input: EntityInput): Promise<StoryEntity> {
    const value = entityInputSchema.parse(input)
    const id = value.id ?? newId('ent')
    const updatedAt = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO entities(id, kind, name, aliases_json, fields_json, notes, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, name=excluded.name,
        aliases_json=excluded.aliases_json, fields_json=excluded.fields_json,
        notes=excluded.notes, updated_at=excluded.updated_at
    `).run(id, value.kind, value.name, JSON.stringify(value.aliases), JSON.stringify(value.fields), value.notes, updatedAt)
    await atomicWriteFile(this.project.resolveInProject(entityFilePath(value.kind, id)), stringifyYaml({
      id, name: value.name, aliases: value.aliases, ...value.fields, notes: value.notes
    }))
    return this.getEntity(id)
  }

  async deleteEntity(id: string): Promise<null> {
    const row = this.db.prepare('SELECT kind FROM entities WHERE id = ?').get(id) as { kind: EntityKind } | undefined
    const factCount = this.db.prepare('SELECT COUNT(*) AS count FROM facts WHERE subject_id = ?').get(id) as { count: number }
    if (factCount.count > 0) throw new DomainError('VALIDATION_FAILED', '该实体已有 Canon 事实，不能直接删除；请先处理相关 Canon 记录')
    const result = this.db.prepare('DELETE FROM entities WHERE id = ?').run(id)
    if (Number(result.changes) === 0) throw new DomainError('PROJECT_NOT_FOUND', `实体不存在: ${id}`)
    this.db.prepare('DELETE FROM relations WHERE from_id = ? OR to_id = ?').run(id, id)
    const timelineRows = this.db.prepare('SELECT * FROM timeline_events WHERE entity_ids_json LIKE ?').all(`%${id}%`) as unknown as TimelineRow[]
    for (const timeline of timelineRows) {
      const entityIds = decode<string[]>(timeline.entity_ids_json, []).filter((entityId) => entityId !== id)
      this.db.prepare('UPDATE timeline_events SET entity_ids_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(entityIds), new Date().toISOString(), timeline.id)
    }
    await this.persistRelations()
    for (const timeline of timelineRows) {
      const updated = this.db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(timeline.id) as unknown as TimelineRow
      await this.persistTimelineEvent(toTimeline(updated))
    }
    if (row) await unlink(this.project.resolveInProject(entityFilePath(row.kind, id))).catch(() => {})
    return null
  }

  async search(query: string): Promise<StoryEntity[]> {
    const q = query.trim()
    if (!q) return []
    const like = `%${q}%`
    const rows = this.db.prepare(`
      SELECT * FROM entities
      WHERE name LIKE ? OR aliases_json LIKE ? OR fields_json LIKE ? OR notes LIKE ?
      ORDER BY name COLLATE NOCASE LIMIT 50
    `).all(like, like, like, like) as unknown as EntityRow[]
    return rows.map(toEntity)
  }

  async searchAll(query: string): Promise<StorySearchResult[]> {
    const q = query.trim()
    if (!q) return []
    const like = `%${q}%`
    const entities = (this.db.prepare(`SELECT id, kind, name FROM entities WHERE name LIKE ? OR aliases_json LIKE ? OR fields_json LIKE ? OR notes LIKE ? ORDER BY updated_at DESC LIMIT 20`).all(like, like, like, like) as Array<{ id: string; kind: EntityKind; name: string }>).map((item) => ({ id: item.id, title: item.name, kind: 'entity' as const, type: item.kind, hint: `${item.kind} · ${item.id}` }))
    const timeline = (this.db.prepare(`SELECT id, title, at, chapter_rel_path FROM timeline_events WHERE title LIKE ? OR description LIKE ? OR causes LIKE ? OR effects LIKE ? ORDER BY updated_at DESC LIMIT 20`).all(like, like, like, like) as Array<{ id: string; title: string; at: string | null; chapter_rel_path: string | null }>).map((item) => ({ id: item.id, title: item.title, kind: 'timeline' as const, type: 'timeline' as const, hint: [item.at, item.chapter_rel_path].filter(Boolean).join(' · ') || 'timeline' }))
    const artifacts = (this.db.prepare(`SELECT id, kind, title, updated_at FROM story_artifacts WHERE title LIKE ? OR fields_json LIKE ? OR notes LIKE ? ORDER BY updated_at DESC LIMIT 20`).all(like, like, like) as Array<{ id: string; kind: StoryArtifactKind; title: string }>).map((item) => ({ id: item.id, title: item.title, kind: 'artifact' as const, type: item.kind, hint: `${item.kind} · Story Bible` }))
    const relations = (this.db.prepare(`
      SELECT relations.id, relations.relation_type, relations.metadata_json,
        from_entity.name AS from_name, to_entity.name AS to_name
      FROM relations
      LEFT JOIN entities AS from_entity ON from_entity.id = relations.from_id
      LEFT JOIN entities AS to_entity ON to_entity.id = relations.to_id
      WHERE relations.relation_type LIKE ? OR relations.metadata_json LIKE ?
        OR from_entity.name LIKE ? OR to_entity.name LIKE ?
      ORDER BY relations.created_at DESC LIMIT 20
    `).all(like, like, like, like) as Array<{ id: string; relation_type: string; metadata_json: string; from_name: string | null; to_name: string | null }>).map((item) => ({
      id: item.id,
      title: `${item.from_name ?? '∅'} — ${item.relation_type} → ${item.to_name ?? '∅'}`,
      kind: 'relation' as const,
      type: 'relation' as const,
      hint: `relation · ${item.id}`
    }))
    const documents = (this.db.prepare(`
      SELECT rel_path, title, content FROM documents_fts
      WHERE rel_path LIKE 'chapters/%' AND (content LIKE ? OR title LIKE ?)
      ORDER BY rowid DESC LIMIT 20
    `).all(like, like) as Array<{ rel_path: string; title: string; content: string }>).map((item) => {
      const index = item.content.indexOf(q)
      const start = Math.max(0, index - 24)
      const snippet = item.content.slice(start, start + 120).replaceAll(/\s+/g, ' ').trim()
      return { id: `doc:${item.rel_path}`, title: item.title, kind: 'document' as const, type: 'document' as const, hint: `chapter · ${snippet}`, relPath: item.rel_path }
    })
    return [...entities, ...timeline, ...artifacts, ...relations, ...documents]
  }

  async listTimeline(): Promise<TimelineEvent[]> {
    const rows = this.db.prepare(`
      SELECT * FROM timeline_events
      ORDER BY CASE WHEN at IS NULL OR at = '' THEN 1 ELSE 0 END, at, updated_at
    `).all() as unknown as TimelineRow[]
    return rows.map(toTimeline)
  }

  async saveTimelineEvent(input: TimelineEventInput): Promise<TimelineEvent> {
    const value = timelineEventInputSchema.parse(input)
    await this.validateTimelineReferences(value)
    const id = value.id ?? newId('evt')
    const updatedAt = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO timeline_events(id, title, at, description, chapter_rel_path, entity_ids_json, location_id, causes, effects, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, at=excluded.at,
        description=excluded.description, chapter_rel_path=excluded.chapter_rel_path,
        entity_ids_json=excluded.entity_ids_json, location_id=excluded.location_id,
        causes=excluded.causes, effects=excluded.effects, updated_at=excluded.updated_at
    `).run(id, value.title, value.at, value.description, value.chapterRelPath, JSON.stringify(value.entityIds), value.locationId, value.causes, value.effects, updatedAt)
    await this.persistTimelineEvent({ id, title: value.title, at: value.at, description: value.description, chapterRelPath: value.chapterRelPath, entityIds: value.entityIds, locationId: value.locationId, causes: value.causes, effects: value.effects, updatedAt })
    const row = this.db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(id) as unknown as TimelineRow
    return toTimeline(row)
  }

  private async validateTimelineReferences(value: TimelineEventInput): Promise<void> {
    if (value.chapterRelPath) {
      if (!value.chapterRelPath.startsWith('chapters/') || value.chapterRelPath.includes('..')) throw new DomainError('PATH_DENIED', '时间线章节路径必须位于 chapters/ 下')
      try { await readFile(this.project.resolveInProject(value.chapterRelPath), 'utf8') } catch { throw new DomainError('PROJECT_NOT_FOUND', `时间线关联章节不存在: ${value.chapterRelPath}`) }
    }
    const entityIds = [...new Set(value.entityIds)]
    for (const entityId of entityIds) {
      const row = this.db.prepare('SELECT id FROM entities WHERE id = ?').get(entityId) as { id: string } | undefined
      if (!row) throw new DomainError('PROJECT_NOT_FOUND', `时间线参与实体不存在: ${entityId}`)
    }
    if (value.locationId) {
      const row = this.db.prepare('SELECT kind FROM entities WHERE id = ?').get(value.locationId) as { kind: EntityKind } | undefined
      if (!row) throw new DomainError('PROJECT_NOT_FOUND', `时间线地点实体不存在: ${value.locationId}`)
      if (row.kind !== 'place') throw new DomainError('VALIDATION_FAILED', '时间线发生地点必须是 place 类型实体')
    }
  }

  async deleteTimelineEvent(id: string): Promise<null> {
    const existing = this.db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(id) as TimelineRow | undefined
    const result = this.db.prepare('DELETE FROM timeline_events WHERE id = ?').run(id)
    if (!Number(result.changes)) throw new DomainError('PROJECT_NOT_FOUND', `时间线事件不存在: ${id}`)
    if (existing) await this.persistTimelineEvent(toTimeline(existing), true)
    return null
  }

  async listRelations(): Promise<StoryRelation[]> {
    const rows = this.db.prepare('SELECT * FROM relations ORDER BY created_at').all() as unknown as RelationRow[]
    return rows.map(toRelation)
  }

  async saveRelation(input: StoryRelationInput): Promise<StoryRelation> {
    const value = storyRelationInputSchema.parse(input)
    const entityCount = this.db.prepare('SELECT COUNT(*) AS count FROM entities WHERE id IN (?, ?)').get(value.fromId, value.toId) as { count: number } | undefined
    if (!entityCount || entityCount.count !== 2) throw new DomainError('PROJECT_NOT_FOUND', '关系引用的实体不存在')
    const id = value.id ?? newId('rel')
    const existing = this.db.prepare('SELECT created_at FROM relations WHERE id = ?').get(id) as { created_at: string } | undefined
    const createdAt = existing?.created_at ?? new Date().toISOString()
    this.db.prepare('INSERT INTO relations(id, from_id, relation_type, to_id, metadata_json, created_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET from_id=excluded.from_id, relation_type=excluded.relation_type, to_id=excluded.to_id, metadata_json=excluded.metadata_json').run(id, value.fromId, value.relationType, value.toId, JSON.stringify(value.metadata), createdAt)
    const relation = toRelation(this.db.prepare('SELECT * FROM relations WHERE id = ?').get(id) as unknown as RelationRow)
    await this.persistRelations()
    return relation
  }

  async deleteRelation(id: string): Promise<null> { const result = this.db.prepare('DELETE FROM relations WHERE id = ?').run(id); if (!Number(result.changes)) throw new DomainError('PROJECT_NOT_FOUND', `关系不存在: ${id}`); await this.persistRelations(); return null }

  private async persistRelations(): Promise<void> {
    await atomicWriteFile(this.project.resolveInProject('story/relations.yaml'), stringifyYaml({ relations: await this.listRelations() }))
  }

  private async persistTimelineEvent(event: TimelineEvent, remove = false): Promise<void> {
    const file = this.project.resolveInProject('story/timeline.yaml')
    let events: TimelineEvent[] = []
    try {
      const parsed = parseYaml(await readFile(file, 'utf8')) as { events?: unknown }
      events = Array.isArray(parsed?.events) ? parsed.events.filter((item): item is TimelineEvent => Boolean(item && typeof item === 'object' && typeof (item as TimelineEvent).id === 'string')) : []
    } catch { /* create a valid source file below */ }
    const next = remove ? events.filter((item) => item.id !== event.id) : [...events.filter((item) => item.id !== event.id), event]
    await atomicWriteFile(file, stringifyYaml({ events: next }))
  }

  async listArtifacts(kind?: StoryArtifactKind): Promise<StoryArtifact[]> {
    const rows = (kind ? this.db.prepare('SELECT * FROM story_artifacts WHERE kind = ? ORDER BY updated_at DESC').all(kind) : this.db.prepare('SELECT * FROM story_artifacts ORDER BY updated_at DESC').all()) as unknown as ArtifactRow[]
    return rows.map(toArtifact)
  }

  async saveArtifact(input: StoryArtifactInput): Promise<StoryArtifact> {
    const value = storyArtifactInputSchema.parse(input); const id = value.id ?? newId('art'); const updatedAt = new Date().toISOString()
    const existing = this.db.prepare('SELECT kind FROM story_artifacts WHERE id = ?').get(id) as { kind: StoryArtifactKind } | undefined
    this.db.prepare('INSERT INTO story_artifacts(id, kind, title, fields_json, notes, updated_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title, fields_json=excluded.fields_json, notes=excluded.notes, updated_at=excluded.updated_at').run(id, value.kind, value.title, JSON.stringify(value.fields), value.notes, updatedAt)
    const artifact = toArtifact(this.db.prepare('SELECT * FROM story_artifacts WHERE id = ?').get(id) as unknown as ArtifactRow)
    if (artifact.kind === 'foreshadowing') this.upsertForeshadowing(artifact)
    else this.db.prepare('DELETE FROM foreshadowing WHERE id = ?').run(id)
    await this.persistArtifacts()
    await this.persistLoreSource(artifact, existing?.kind)
    return artifact
  }

  async deleteArtifact(id: string): Promise<null> {
    const existing = this.db.prepare('SELECT kind FROM story_artifacts WHERE id = ?').get(id) as { kind: StoryArtifactKind } | undefined
    const result = this.db.prepare('DELETE FROM story_artifacts WHERE id = ?').run(id)
    if (!Number(result.changes)) throw new DomainError('PROJECT_NOT_FOUND', `故事条目不存在: ${id}`)
    this.db.prepare('DELETE FROM foreshadowing WHERE id = ?').run(id)
    await this.persistArtifacts()
    if (existing?.kind === 'lore') await this.removeLoreSource(id)
    return null
  }

  async listForeshadowing(status?: ForeshadowingStatus): Promise<ForeshadowingRecord[]> {
    this.backfillForeshadowingIndex()
    const rows = (status ? this.db.prepare('SELECT f.*, a.fields_json FROM foreshadowing f LEFT JOIN story_artifacts a ON a.id = f.id WHERE f.status = ? ORDER BY f.updated_at DESC').all(status) : this.db.prepare('SELECT f.*, a.fields_json FROM foreshadowing f LEFT JOIN story_artifacts a ON a.id = f.id ORDER BY f.updated_at DESC').all()) as unknown as ForeshadowingRow[]
    return rows.map(toForeshadowing)
  }

  private upsertForeshadowing(artifact: StoryArtifact): void {
    const fields = artifact.fields
    const status = foreshadowingStatus(fields.status) ?? 'planned'
    const stringValue = (key: string) => typeof fields[key] === 'string' ? fields[key] as string : ''
    const relatedChapters = Array.isArray(fields.relatedChapters) ? fields.relatedChapters.filter((value): value is string => typeof value === 'string') : typeof fields.relatedChapters === 'string' ? fields.relatedChapters.split(',').map((value) => value.trim()).filter(Boolean) : []
    this.db.prepare(`INSERT INTO foreshadowing(id, title, setup, target, payoff_deadline, status, evidence, related_chapters_json, notes, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, setup=excluded.setup, target=excluded.target, payoff_deadline=excluded.payoff_deadline, status=excluded.status, evidence=excluded.evidence, related_chapters_json=excluded.related_chapters_json, notes=excluded.notes, updated_at=excluded.updated_at`).run(artifact.id, artifact.title, stringValue('setup'), stringValue('target'), stringValue('payoffDeadline'), status, stringValue('evidence'), JSON.stringify(relatedChapters), artifact.notes, artifact.updatedAt)
  }

  private backfillForeshadowingIndex(): void {
    const artifacts = this.db.prepare("SELECT * FROM story_artifacts WHERE kind = 'foreshadowing'").all() as unknown as ArtifactRow[]
    for (const artifact of artifacts) {
      const value = toArtifact(artifact)
      if (storyArtifactInputSchema.safeParse(value).success) this.upsertForeshadowing(value)
    }
  }

  private async persistArtifacts(): Promise<void> {
    const artifacts = await this.listArtifacts()
    await atomicWriteFile(this.project.resolveInProject('story/artifacts.yaml'), stringifyYaml({ artifacts }))
  }

  private async persistLoreSource(artifact: StoryArtifact, previousKind?: StoryArtifactKind): Promise<void> {
    if (previousKind === 'lore' && artifact.kind !== 'lore') await this.removeLoreSource(artifact.id)
    if (artifact.kind !== 'lore') return
    const frontmatter = stringifyYaml({ id: artifact.id, kind: artifact.kind, title: artifact.title, fields: artifact.fields }).trimEnd()
    await atomicWriteFile(this.project.resolveInProject(`world/lore/${artifact.id}.md`), `---\n${frontmatter}\n---\n\n${artifact.notes.trimEnd()}\n`)
  }

  private async removeLoreSource(id: string): Promise<void> {
    try { await unlink(this.project.resolveInProject(`world/lore/${id}.md`)) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}

interface EntityRow { id: string; kind: EntityKind; name: string; aliases_json: string; fields_json: string; notes: string; updated_at: string }
interface TimelineRow { id: string; title: string; at: string | null; description: string; chapter_rel_path: string | null; entity_ids_json: string; location_id?: string | null; causes?: string; effects?: string; updated_at: string }
interface ArtifactRow { id: string; kind: StoryArtifactKind; title: string; fields_json: string; notes: string; updated_at: string }
interface ForeshadowingRow { id: string; title: string; setup: string; target: string; payoff_deadline: string; status: ForeshadowingStatus; evidence: string; related_chapters_json: string; notes: string; updated_at: string; fields_json?: string | null }
interface RelationRow { id: string; from_id: string; relation_type: string; to_id: string; metadata_json: string; created_at: string }

function toEntity(row: EntityRow): StoryEntity {
  return { id: row.id, kind: row.kind, name: row.name, aliases: decode(row.aliases_json, []), fields: decode(row.fields_json, {}), notes: row.notes, updatedAt: row.updated_at }
}

function toTimeline(row: TimelineRow): TimelineEvent {
  return { id: row.id, title: row.title, at: row.at, description: row.description, chapterRelPath: row.chapter_rel_path, entityIds: decode(row.entity_ids_json, []), locationId: row.location_id ?? null, causes: row.causes ?? '', effects: row.effects ?? '', updatedAt: row.updated_at }
}
function toArtifact(row: ArtifactRow): StoryArtifact { return { id: row.id, kind: row.kind, title: row.title, fields: decode(row.fields_json, {}), notes: row.notes, updatedAt: row.updated_at } }
function toForeshadowing(row: ForeshadowingRow): ForeshadowingRecord {
  const fields = decode<Record<string, unknown>>(row.fields_json ?? '{}', {})
  const evidenceItems = Array.isArray(fields.evidenceItems) ? fields.evidenceItems.filter((item): item is { chapterRelPath: string; quote: string; note?: string } => Boolean(item && typeof item === 'object' && typeof (item as { chapterRelPath?: unknown }).chapterRelPath === 'string' && typeof (item as { quote?: unknown }).quote === 'string')).map((item) => ({ chapterRelPath: item.chapterRelPath, quote: item.quote, note: item.note ?? '' })) : []
  return { id: row.id, title: row.title, setup: row.setup, target: row.target, payoffDeadline: row.payoff_deadline, status: row.status, evidence: row.evidence, evidenceItems, relatedChapters: decode(row.related_chapters_json, []), notes: row.notes, updatedAt: row.updated_at }
}
function foreshadowingStatus(value: unknown): ForeshadowingStatus | null { return typeof value === 'string' && ['planned', 'planted', 'echoed', 'resolved', 'abandoned'].includes(value) ? value as ForeshadowingStatus : null }
function toRelation(row: RelationRow): StoryRelation { return { id: row.id, fromId: row.from_id, relationType: row.relation_type, toId: row.to_id, metadata: decode(row.metadata_json, {}), createdAt: row.created_at } }

function entityFilePath(kind: EntityKind, id: string): string {
  const directory = { character: 'characters', place: 'world/places', org: 'world/organizations', item: 'world/items' }[kind]
  return `${directory}/${id}.yaml`
}
