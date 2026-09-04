import { mkdir, readFile, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { CONTEXT_RETRIEVAL_VERSION, CONTEXT_SNAPSHOT_FORMAT_VERSION, type ContextItem, type ContextManifest, type ContextRequest, type ContextResult, type ContextReplayDifference, type ContextReplayResult, type ContextSnapshot, type ContextSnapshotSummary } from '../../shared/context'
import { NOVEL_SCHEMA_VERSION } from '../../shared/project-schema'
import { contextRecipeSchema } from '../../shared/context'
import type { ProjectService } from './project-service'
import type { ChapterService } from './chapter-service'
import type { StoryService } from './story-service'
import { DomainError } from './errors'
import type { CanonService } from './canon-service'
import { atomicWriteFile } from './atomic-fs'
import type { EmbeddingIndexService } from './embedding-index-service'
import type { SceneService } from './scene-service'

const estimateTokens = (text: string): number => Math.max(1, Math.ceil(Array.from(text).length / 4))
const MAX_SNAPSHOTS_PER_CHAPTER = 100
const MAX_SNAPSHOTS_PER_PROJECT = 500

export class ContextService {
  constructor(private readonly project: ProjectService, private readonly chapters: ChapterService, private readonly story: StoryService, private readonly canon?: CanonService, private readonly embeddings?: EmbeddingIndexService, private readonly scenes?: SceneService) {}

  async build(request: ContextRequest): Promise<ContextResult> {
    const normalized = contextRecipeSchema.parse(request.recipe)
    const result = await this.buildContext({ ...request, recipe: normalized })
    await this.saveSnapshot({ ...request, recipe: normalized }, result)
    return result
  }

  async listSnapshots(relPath?: string): Promise<ContextSnapshotSummary[]> {
    const db = this.project.database.raw
    const rows = (relPath
      ? db.prepare('SELECT id, rel_path, recipe_id, query, request_hash, result_hash, total_tokens, item_count, created_at, format_version, project_schema_version, retrieval_version FROM context_snapshots WHERE rel_path = ? ORDER BY created_at DESC LIMIT 100').all(relPath)
      : db.prepare('SELECT id, rel_path, recipe_id, query, request_hash, result_hash, total_tokens, item_count, created_at, format_version, project_schema_version, retrieval_version FROM context_snapshots ORDER BY created_at DESC LIMIT 100').all()) as unknown as SnapshotRow[]
    return rows.map(toSummary)
  }

  async readSnapshot(id: string): Promise<ContextSnapshot> {
    const row = this.project.database.raw.prepare('SELECT file_path FROM context_snapshots WHERE id = ?').get(id) as { file_path: string } | undefined
    if (!row) throw new DomainError('PROJECT_NOT_FOUND', `Context Snapshot 不存在: ${id}`)
    try {
      const value = JSON.parse(await readFile(this.project.resolveInProject(row.file_path), 'utf8')) as ContextSnapshot
      if (value.id !== id) throw new Error('snapshot id mismatch')
      return normalizeSnapshot(value)
    } catch (error) {
      throw new DomainError('IO_ERROR', `Context Snapshot 无法读取: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async replaySnapshot(id: string): Promise<ContextReplayResult> {
    const snapshot = await this.readSnapshot(id)
    const current = await this.buildContext(snapshot.request)
    const currentResultHash = hashResult(current)
    const fromFormatVersion = snapshot.sourceFormatVersion ?? snapshot.formatVersion
    const fromRetrievalVersion = snapshot.sourceRetrievalVersion ?? snapshot.retrievalVersion
    const fromProjectSchemaVersion = snapshot.sourceProjectSchemaVersion ?? snapshot.projectSchemaVersion
    const migrated = fromFormatVersion !== CONTEXT_SNAPSHOT_FORMAT_VERSION || fromRetrievalVersion !== CONTEXT_RETRIEVAL_VERSION || fromProjectSchemaVersion !== NOVEL_SCHEMA_VERSION
    const notes = migrated ? ['旧 Snapshot 已按当前格式重新规范化并回放'] : []
    if (fromRetrievalVersion !== CONTEXT_RETRIEVAL_VERSION) notes.push(`检索版本 v${fromRetrievalVersion} → v${CONTEXT_RETRIEVAL_VERSION}：使用当前 Embedding/FTS 索引重新计算来源与预算`)
    return { snapshot, current, currentResultHash, changed: currentResultHash !== snapshot.resultHash, differences: compareContextItems(snapshot.result.manifest.items, current.manifest.items), compatibility: { migrated, fromFormatVersion, fromRetrievalVersion, notes } }
  }

  private async buildContext(request: ContextRequest): Promise<ContextResult> {
    const recipe = contextRecipeSchema.parse(request.recipe)
    const chapter = await this.chapters.read(request.relPath)
    const selectedScene = request.sceneId && this.scenes ? (await this.scenes.list(request.relPath)).find((scene) => scene.id === request.sceneId) : undefined
    if (request.sceneId && !selectedScene) throw new DomainError('PROJECT_NOT_FOUND', `场景不存在: ${request.sceneId}`)
    const paragraphs = chapter.markdown.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
    const scopedChapter = selectedScene ? paragraphs.slice(selectedScene.startParagraph, selectedScene.endParagraph + 1).join('\n\n') : chapter.markdown
    const items: ContextItem[] = []
    const add = (layer: ContextItem['layer'], source: string, text: string, priority: number) => {
      if (!text.trim()) return
      items.push({ id: `${layer}:${source}`, layer, source, text, priority, estimatedTokens: estimateTokens(text) })
    }
    add('pinned', `chapter:${request.relPath}${selectedScene ? `#${selectedScene.id}` : ''}`, scopedChapter.slice(0, recipe.maxTokens * 4), 100)
    if (recipe.includeSelection && request.selection) add('pinned', 'selection', request.selection, 110)

    const entities = await this.story.listEntities()
    const timeline = await this.story.listTimeline()
    const facts = this.canon ? await this.canon.listFacts() : []
    const structured = [
      entities.slice(0, recipe.entityLimit).map((entity) => `${entity.kind}: ${entity.name}${entity.aliases.length ? ` (${entity.aliases.join(', ')})` : ''}`).join('\n'),
      timeline.slice(0, recipe.entityLimit).map((event) => `event: ${event.at ?? 'unknown'} ${event.title}`).join('\n'),
      facts.slice(0, recipe.entityLimit).map((fact) => `fact: ${fact.subjectId} · ${fact.predicate} = ${JSON.stringify(fact.object)}`).join('\n')
    ].filter(Boolean).join('\n')
    add('structured', 'story-bible', structured, 80)

    const query = request.query?.trim() || chapter.title
    const semantic = await this.embeddings?.search(query, recipe.semanticLimit)
    const hits = semantic?.hits ?? await this.chapters.search(query)
    const retrievalPrefix = semantic?.method === 'embedding' ? 'embedding:' : 'fts:'
    hits.slice(0, recipe.semanticLimit).forEach((hit, index) => {
      add('semantic', `${retrievalPrefix}${hit.relPath}`, `${hit.title}: ${hit.snippet}`, 60 - index)
    })

    const fitted = fitItems(items, recipe.maxTokens)
    const candidateCounts = { pinned: (chapter.markdown.trim() ? 1 : 0) + (recipe.includeSelection && Boolean(request.selection?.trim()) ? 1 : 0), structured: entities.slice(0, recipe.entityLimit).length + timeline.slice(0, recipe.entityLimit).length + facts.slice(0, recipe.entityLimit).length, semantic: Math.min(hits.length, recipe.semanticLimit) }
    const manifest: ContextManifest = { recipeId: recipe.id, budgetTokens: recipe.maxTokens, totalTokens: fitted.items.reduce((sum, item) => sum + item.estimatedTokens, 0), omittedSources: fitted.omittedSources, items: fitted.items, retrieval: { query, selectionIncluded: recipe.includeSelection && Boolean(request.selection?.trim()), method: semantic?.method ?? 'fts', candidateCounts, selectedSources: fitted.items.map((item) => item.source), omittedSources: fitted.omittedSources }, retrievalVersion: CONTEXT_RETRIEVAL_VERSION, generatedAt: new Date().toISOString() }
    return { manifest, text: fitted.items.map((item) => `[${capitalize(item.layer)}] ${item.source}\n${item.text}`).join('\n\n') }
  }

  private async saveSnapshot(request: ContextRequest, result: ContextResult): Promise<void> {
    const id = `ctxsnap_${randomUUID()}`
    const createdAt = result.manifest.generatedAt
    const requestHash = hashValue({ relPath: request.relPath, selection: request.selection ?? null, query: request.query ?? '', recipe: request.recipe })
    const resultHash = hashResult(result)
    const filePath = `.novel/cache/context-snapshots/${id}.json`
    const snapshot: ContextSnapshot = {
      id, relPath: request.relPath, recipeId: request.recipe.id, query: request.query?.trim() ?? '', requestHash, resultHash, formatVersion: CONTEXT_SNAPSHOT_FORMAT_VERSION, projectSchemaVersion: NOVEL_SCHEMA_VERSION, retrievalVersion: CONTEXT_RETRIEVAL_VERSION,
      totalTokens: result.manifest.totalTokens, itemCount: result.manifest.items.length, createdAt, request, result
    }
    await mkdir(this.project.resolveInProject('.novel/cache/context-snapshots'), { recursive: true })
    await atomicWriteFile(this.project.resolveInProject(filePath), JSON.stringify(snapshot, null, 2))
    this.project.database.raw.prepare(`INSERT INTO context_snapshots(id, rel_path, recipe_id, query, request_hash, result_hash, total_tokens, item_count, file_path, created_at, format_version, project_schema_version, retrieval_version) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, snapshot.relPath, snapshot.recipeId, snapshot.query, requestHash, resultHash, snapshot.totalTokens, snapshot.itemCount, filePath, createdAt, snapshot.formatVersion, snapshot.projectSchemaVersion, snapshot.retrievalVersion)
    await this.pruneSnapshots(snapshot.relPath)
  }

  private async pruneSnapshots(relPath: string): Promise<void> {
    const db = this.project.database.raw
    const byChapter = db.prepare('SELECT id, file_path FROM context_snapshots WHERE rel_path = ? ORDER BY created_at DESC, id DESC').all(relPath) as unknown as SnapshotFileRow[]
    const byProject = db.prepare('SELECT id, file_path FROM context_snapshots ORDER BY created_at DESC, id DESC').all() as unknown as SnapshotFileRow[]
    const expired = new Map<string, SnapshotFileRow>()
    for (const row of byChapter.slice(MAX_SNAPSHOTS_PER_CHAPTER)) expired.set(row.id, row)
    for (const row of byProject.slice(MAX_SNAPSHOTS_PER_PROJECT)) expired.set(row.id, row)
    for (const row of expired.values()) {
      if (row.file_path.startsWith('.novel/cache/context-snapshots/')) {
        try { await unlink(this.project.resolveInProject(row.file_path)) } catch { /* missing snapshot file is already unrecoverable */ }
      }
      db.prepare('DELETE FROM context_snapshots WHERE id = ?').run(row.id)
    }
  }

  async summarize(relPath: string): Promise<string> {
    const key = `context.summary:${relPath}`
    const cached = this.project.database.getSetting(key)
    if (cached) return cached
    const chapter = await this.chapters.read(relPath)
    const summary = chapter.markdown.replace(/^#{1,6}\s+/gm, '').split(/\n\s*\n/).filter(Boolean).slice(0, 2).join('\n\n').slice(0, 1000)
    if (!summary) throw new DomainError('VALIDATION_FAILED', '章节没有可摘要内容')
    this.project.database.setSetting(key, summary)
    return summary
  }
}

interface SnapshotRow {
  id: string; rel_path: string; recipe_id: string; query: string; request_hash: string; result_hash: string;
  total_tokens: number; item_count: number; created_at: string; format_version: number; project_schema_version: number; retrieval_version: number
}

interface SnapshotFileRow { id: string; file_path: string }

function toSummary(row: SnapshotRow): ContextSnapshotSummary {
  return { id: row.id, relPath: row.rel_path, recipeId: row.recipe_id, query: row.query, requestHash: row.request_hash, resultHash: row.result_hash, totalTokens: row.total_tokens, itemCount: row.item_count, createdAt: row.created_at, formatVersion: row.format_version, projectSchemaVersion: row.project_schema_version, retrievalVersion: row.retrieval_version }
}

function normalizeSnapshot(value: ContextSnapshot): ContextSnapshot {
  const sourceFormatVersion = value.formatVersion ?? 0
  if (sourceFormatVersion > CONTEXT_SNAPSHOT_FORMAT_VERSION) throw new DomainError('VALIDATION_FAILED', `Context Snapshot 格式 v${sourceFormatVersion} 高于当前支持的 v${CONTEXT_SNAPSHOT_FORMAT_VERSION}，无法回放`)
  const sourceRetrievalVersion = value.retrievalVersion ?? value.result?.manifest?.retrievalVersion ?? 0
  if (sourceRetrievalVersion > CONTEXT_RETRIEVAL_VERSION) throw new DomainError('VALIDATION_FAILED', `Context 检索版本 v${sourceRetrievalVersion} 高于当前支持的 v${CONTEXT_RETRIEVAL_VERSION}，无法回放`)
  return { ...value, sourceFormatVersion: sourceFormatVersion, sourceProjectSchemaVersion: value.projectSchemaVersion ?? 1, sourceRetrievalVersion, formatVersion: CONTEXT_SNAPSHOT_FORMAT_VERSION, projectSchemaVersion: value.projectSchemaVersion ?? 1, retrievalVersion: CONTEXT_RETRIEVAL_VERSION, result: { ...value.result, manifest: { ...value.result.manifest, retrievalVersion: CONTEXT_RETRIEVAL_VERSION } } }
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function hashResult(result: ContextResult): string {
  return hashValue({ text: result.text, manifest: { ...result.manifest, generatedAt: undefined } })
}

function fitItems(items: ContextItem[], maxTokens: number): { items: ContextItem[]; omittedSources: string[] } {
  let remaining = maxTokens
  const omittedSources: string[] = []
  const fittedItems = [...items].map((item, index) => ({ item, index })).sort((a, b) => b.item.priority - a.item.priority || a.index - b.index).flatMap(({ item }) => {
    if (remaining <= 0) { omittedSources.push(item.source); return [] }
    const originalEstimatedTokens = item.estimatedTokens
    const truncated = originalEstimatedTokens > remaining
    const text = truncated ? Array.from(item.text).slice(0, remaining * 4).join('') : item.text
    const fitted = { ...item, text, estimatedTokens: estimateTokens(text), ...(truncated ? { originalEstimatedTokens, truncated: true } : {}) }
    if (!text) { omittedSources.push(item.source); return [] }
    remaining -= fitted.estimatedTokens
    return [fitted]
  })
  return { items: fittedItems, omittedSources }
}

function compareContextItems(previous: ContextItem[], current: ContextItem[]): ContextReplayDifference[] {
  const previousBySource = new Map(previous.map((item) => [item.source, item]))
  const currentBySource = new Map(current.map((item) => [item.source, item]))
  const sources = [...new Set([...previous.map((item) => item.source), ...current.map((item) => item.source)])]
  const differences: ContextReplayDifference[] = []
  for (const source of sources) {
    const before = previousBySource.get(source)
    const after = currentBySource.get(source)
    if (!before && after) differences.push({ source, kind: 'added', currentTokens: after.estimatedTokens })
    else if (before && !after) differences.push({ source, kind: 'removed', previousTokens: before.estimatedTokens })
    else if (before && after && (before.text !== after.text || before.estimatedTokens !== after.estimatedTokens || before.truncated !== after.truncated)) differences.push({ source, kind: 'changed', previousTokens: before.estimatedTokens, currentTokens: after.estimatedTokens })
  }
  return differences
}

function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1) }
