import { readFile, readdir, stat, unlink } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { parse, stringify } from 'yaml'
import {
  NOVEL_SCHEMA_VERSION,
  PROJECT_PATHS,
  GITIGNORE_CONTENT,
  makeManifest,
  novelManifestSchema,
  type NovelManifest
} from '../../shared/project-schema'
import type { InvalidSourceDetail, InvalidStoryArtifactDetail, ProjectInfo, ProjectIntegrity, ProjectRepairResult } from '../../shared/ipc'
import { DomainError } from './errors'
import { canonicalizeCreated, canonicalizeExisting, resolveInsideRoot } from './paths'
import { atomicWriteFile } from './atomic-fs'
import { DatabaseService, openDatabase } from './database'
import type { RecentProjectsStore } from './recent-projects'
import { builtinNovelFlow } from '../../shared/builtin-workflow'
import { LITTLE_COW_CHAPTERS, LITTLE_COW_ENTITIES, LITTLE_COW_TIMELINE } from '../../shared/mock-story'
import { countWords } from './words'
import { entityInputSchema, storyArtifactInputSchema, storyRelationInputSchema, timelineEventInputSchema } from '../../shared/story'
import { imageAssetMetadataSchema } from '../../shared/image'
import { chapterSceneSchema, sceneSidecarSchema } from '../../shared/scene'
import { volumeFileSchema } from '../../shared/volume'
import { normalizeVolumeFile } from './volume-service'
import { myAuthoringWorkflow } from '../../shared/authoring-workflow'
import { workflowSchema } from '../../shared/workflow'
import { validateWorkflow } from './workflow-validation'

interface OpenProject {
  root: string
  manifest: NovelManifest
  db: DatabaseService
}

function invalidStoryArtifactDetail(value: unknown): InvalidStoryArtifactDetail | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const candidate = {
    id: typeof record.id === 'string' ? record.id : 'unknown',
    kind: typeof record.kind === 'string' ? record.kind : 'unknown',
    title: typeof record.title === 'string' ? record.title : 'Untitled artifact',
    fields: record.fields && typeof record.fields === 'object' ? record.fields : {},
    notes: typeof record.notes === 'string' ? record.notes : ''
  }
  const parsed = storyArtifactInputSchema.safeParse(candidate)
  if (parsed.success) return null
  return {
    id: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    issues: parsed.error.issues.map((issue) => `${issue.path.length ? issue.path.join('.') : 'artifact'}: ${issue.message}`)
  }
}

function addInvalidArtifactDetail(details: InvalidStoryArtifactDetail[], value: unknown): void {
  const detail = invalidStoryArtifactDetail(value)
  if (detail && !details.some((item) => item.id === detail.id && item.kind === detail.kind)) details.push(detail)
}

function summarizeInvalidSourceFiles(paths: readonly string[]): InvalidSourceDetail[] {
  const details: InvalidSourceDetail[] = []
  for (const value of paths) {
    const separator = value.indexOf('#')
    const path = separator >= 0 ? value.slice(0, separator) : value
    const issue = separator >= 0 ? value.slice(separator + 1) : 'schema validation failed'
    const existing = details.find((detail) => detail.path === path)
    if (existing) {
      if (!existing.issues.includes(issue)) {
        const index = details.indexOf(existing)
        details[index] = { ...existing, issues: [...existing.issues, issue] }
      }
    } else {
      details.push({ path, issues: [issue] })
    }
  }
  return details
}

async function reportInvalidVolumeSource(root: string, invalidSourceFiles: string[]): Promise<void> {
  try {
    const raw = parse(await readFile(resolveInsideRoot(root, 'story/volumes.yaml'), 'utf8'))
    if (!volumeFileSchema.safeParse(normalizeVolumeFile(raw)).success) invalidSourceFiles.push('story/volumes.yaml')
  } catch {
    invalidSourceFiles.push('story/volumes.yaml')
  }
}

export interface ManifestMigration {
  fromVersion: number
  toVersion: number
  name: string
  up(manifest: NovelManifest): NovelManifest
}

/**
 * File-level migrations are deliberately separate from SQLite migrations.
 * Keep the list append-only: a project file is user data and must remain
 * recoverable if a future migration or its write fails halfway through.
 */
export const MANIFEST_MIGRATIONS: readonly ManifestMigration[] = []

export async function migrateManifestFile(
  filePath: string,
  migrations: readonly ManifestMigration[] = MANIFEST_MIGRATIONS,
  targetVersion?: number
): Promise<{ manifest: NovelManifest; applied: Array<{ version: number; name: string }> }> {
  const originalRaw = await readFile(filePath, 'utf8')
  let current: NovelManifest
  try {
    const parsed = novelManifestSchema.safeParse(parse(originalRaw))
    if (!parsed.success) throw new DomainError('INVALID_PROJECT', 'novel.yaml 字段不满足 schema')
    current = parsed.data
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError('INVALID_PROJECT', `novel.yaml 不是合法 YAML: ${error instanceof Error ? error.message : String(error)}`)
  }

  const applied: Array<{ version: number; name: string }> = []
  let activeMigration: ManifestMigration | null = null
  try {
    while (targetVersion === undefined || current.schemaVersion < targetVersion) {
      const migration = migrations.find((candidate) => candidate.fromVersion === current.schemaVersion)
      if (!migration) break
      if (migration.toVersion <= migration.fromVersion) throw new DomainError('INVALID_PROJECT', `项目 schema 迁移 ${migration.name} 的目标版本无效`)
      activeMigration = migration
      const migrated = migration.up(current)
      const checked = novelManifestSchema.safeParse({ ...migrated, schemaVersion: migration.toVersion })
      if (!checked.success) throw new DomainError('INVALID_PROJECT', `项目 schema 迁移 ${migration.name} 生成了无效 manifest`)
      current = checked.data
      applied.push({ version: migration.toVersion, name: migration.name })
    }
    if (targetVersion !== undefined && current.schemaVersion < targetVersion) {
      throw new DomainError('INVALID_PROJECT', `缺少从 schema v${current.schemaVersion} 到 v${targetVersion} 的迁移`)
    }
    if (applied.length > 0) await atomicWriteFile(filePath, stringify(current))
  } catch (error) {
    // atomicWriteFile already protects a single write; this second write is a
    // defense-in-depth rollback for migration batches and custom migrators.
    await atomicWriteFile(filePath, originalRaw).catch(() => undefined)
    if (error instanceof DomainError) throw error
    const failed = activeMigration?.name ?? (applied.length > 0 ? applied[applied.length - 1].name : 'unknown')
    throw new DomainError('INVALID_PROJECT', `项目 schema 迁移 ${failed} 失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { manifest: current, applied }
}

// Asset sidecars are metadata only. Refuse to parse unexpectedly large files
// so a legacy sidecar containing embedded image bytes cannot freeze integrity
// checks or index repair.
const MAX_ASSET_METADATA_BYTES = 1_000_000

function parseLegacyAssetMetadata(raw: string): Record<string, unknown> | null {
  const dataMarker = raw.search(/^data\s*:/m)
  if (dataMarker < 0) return null
  try {
    const value = parse(raw.slice(0, dataMarker))
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

/**
 * Project lifecycle (Sprint 1): create / open / close / recents.
 * Electron-free — takes a recents store, so unit tests can run it on temp dirs.
 */
export class ProjectService {
  private current: OpenProject | null = null

  constructor(private readonly recents: RecentProjectsStore) {}

  get isProjectOpen(): boolean {
    return this.current !== null
  }

  async create(rootPath: string, title: string, language = 'zh-CN'): Promise<ProjectInfo> {
    const root = await canonicalizeCreated(rootPath)
    const entries = await readdir(root)
    if (entries.length > 0) {
      throw new DomainError('DIR_NOT_EMPTY', `目标目录不是空的，请选择一个空文件夹: ${root}`)
    }
    await this.scaffold(root, title, language)
    return this.open(root)
  }

  async open(rootPath: string): Promise<ProjectInfo> {
    const root = await canonicalizeExisting(rootPath)
    const manifestPath = resolveInsideRoot(root, PROJECT_PATHS.manifest)

    let raw: string
    try {
      raw = await readFile(manifestPath, 'utf8')
    } catch {
      throw new DomainError('PROJECT_NOT_FOUND', `该目录不是 Novel Studio 项目（缺少 novel.yaml）: ${root}`)
    }

    let doc: unknown
    try {
      doc = parse(raw)
    } catch (e) {
      throw new DomainError('INVALID_PROJECT', `novel.yaml 不是合法 YAML: ${e instanceof Error ? e.message : String(e)}`)
    }
    const parsed = novelManifestSchema.safeParse(doc)
    if (!parsed.success) {
      throw new DomainError('INVALID_PROJECT', 'novel.yaml 字段不满足 schema', {
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      })
    }
    let manifest = parsed.data

    if (manifest.schemaVersion > NOVEL_SCHEMA_VERSION) {
      throw new DomainError(
        'PROJECT_TOO_NEW',
        `项目 schema v${manifest.schemaVersion} 比当前应用（v${NOVEL_SCHEMA_VERSION}）更新，请升级应用`
      )
    }
    if (manifest.schemaVersion < NOVEL_SCHEMA_VERSION) {
      const migrated = await migrateManifestFile(manifestPath, MANIFEST_MIGRATIONS, NOVEL_SCHEMA_VERSION)
      manifest = migrated.manifest
    }

    await this.ensureDirs(root)
    await this.ensureDefaultChapter(root)
    await this.ensurePromptPack(root)
    const db = await openDatabase(resolveInsideRoot(root, PROJECT_PATHS.db))
    this.current = { root, manifest, db }
    // A project may outlive a deleted/renamed provider profile. Reconcile the
    // manifest at open time so the renderer never carries a stale profile ID.
    const configuredProfiles = (() => {
      const rawProfiles = db.getSetting('ai.providerProfiles')
      if (!rawProfiles) return [] as Array<{ id?: unknown }>
      try { return JSON.parse(rawProfiles) as Array<{ id?: unknown }> } catch { return [] as Array<{ id?: unknown }> }
    })()
    const hasCurrent = typeof manifest.providerProfile === 'string' && configuredProfiles.some((profile) => profile.id === manifest.providerProfile)
    const fallbackId = configuredProfiles.find((profile): profile is { id: string } => typeof profile.id === 'string' && profile.id.startsWith('profile_'))?.id
    if (!hasCurrent && (fallbackId || manifest.providerProfile !== null)) {
      manifest = { ...manifest, providerProfile: fallbackId ?? null }
      await atomicWriteFile(resolveInsideRoot(root, PROJECT_PATHS.manifest), stringify(manifest))
      this.current = { root, manifest, db }
    }
    await this.recents.record(root, manifest.title)
    return { rootPath: root, manifest }
  }

  async close(): Promise<void> {
    if (!this.current) return
    const { db } = this.current
    await db.close()
    this.current = null
  }

  getInfo(): ProjectInfo | null {
    if (!this.current) return null
    return { rootPath: this.current.root, manifest: this.current.manifest }
  }

  /** Persist the provider selected by the project, keeping the manifest authoritative. */
  async setProviderProfile(profileId: string | null): Promise<void> {
    if (!this.current) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const manifest = { ...this.current.manifest, providerProfile: profileId }
    await atomicWriteFile(resolveInsideRoot(this.current.root, PROJECT_PATHS.manifest), stringify(manifest))
    this.current = { ...this.current, manifest }
  }

  /** Persist the book-wide visual language used by Illustration Studio. */
  async setArtDirection(value: string): Promise<ProjectInfo> {
    if (!this.current) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const artDirection = value.trim()
    if (artDirection.length > 20_000) throw new DomainError('VALIDATION_FAILED', 'Art Direction 不能超过 20000 个字符')
    const manifest = { ...this.current.manifest, artDirection }
    await atomicWriteFile(resolveInsideRoot(this.current.root, PROJECT_PATHS.manifest), stringify(manifest))
    this.current = { ...this.current, manifest }
    return { rootPath: this.current.root, manifest }
  }

  /** Install the reusable authoring flow without replacing the legacy built-in flow. */
  async installAuthoringWorkflow(): Promise<ProjectInfo> {
    if (!this.current) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const workflow = workflowSchema.parse(myAuthoringWorkflow())
    const issues = validateWorkflow(workflow)
    if (issues.length > 0) throw new DomainError('VALIDATION_FAILED', '我的创作流程模板无效', { details: issues })
    const workflowPath = resolveInsideRoot(this.current.root, 'workflows/flow_my_authoring.novelflow.json')
    try {
      const existing = workflowSchema.parse(JSON.parse(await readFile(workflowPath, 'utf8')))
      if (existing.id !== workflow.id) throw new DomainError('INVALID_PROJECT', '我的创作流程文件 ID 无效')
    } catch (error) {
      if (error instanceof DomainError) throw error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new DomainError('INVALID_PROJECT', '无法读取我的创作流程文件')
      await atomicWriteFile(workflowPath, JSON.stringify(workflow, null, 2) + '\n')
    }
    const manifest = { ...this.current.manifest, defaultWorkflow: workflow.id }
    await atomicWriteFile(resolveInsideRoot(this.current.root, PROJECT_PATHS.manifest), stringify(manifest))
    this.current = { ...this.current, manifest }
    return { rootPath: this.current.root, manifest }
  }

  /** Sandbox guard for all project IO; throws NO_PROJECT_OPEN / PATH_DENIED. */
  resolveInProject(relPath: string): string {
    if (!this.current) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    return resolveInsideRoot(this.current.root, relPath)
  }

  get database(): DatabaseService {
    if (!this.current) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    return this.current.db
  }

  async readText(relPath: string): Promise<string> {
    if (!/^story\/(premise|outline)\.md$/.test(relPath)) throw new DomainError('PATH_DENIED', '只允许读取项目公开故事文档')
    try { return await readFile(this.resolveInProject(relPath), 'utf8') } catch (error) { throw new DomainError('IO_ERROR', `无法读取项目文档: ${error instanceof Error ? error.message : String(error)}`) }
  }

  /** Read-only comparison between file sources and rebuildable SQLite indexes. */
  async checkIntegrity(): Promise<ProjectIntegrity> {
    if (!this.current) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const root = this.current.root
    const db = this.current.db.raw
    const missingFiles: string[] = []
    for (const relPath of ['story/premise.md', 'story/outline.md', 'story/timeline.yaml', 'story/artifacts.yaml', 'story/relations.yaml', 'story/volumes.yaml']) {
      try { await readFile(resolveInsideRoot(root, relPath), 'utf8') } catch { missingFiles.push(relPath) }
    }
    const chapterEntries = await readdir(resolveInsideRoot(root, 'chapters'), { withFileTypes: true })
    const chaptersOnDisk = chapterEntries.filter((entry) => entry.isFile() && /^\d{3,}-.+\.md$/.test(entry.name)).length
    const chaptersIndexed = Number((db.prepare("SELECT COUNT(*) AS count FROM documents WHERE kind = 'chapter'").get() as { count: number }).count)
    const entityDirs = ['characters', 'world/places', 'world/organizations', 'world/items']
    let entitiesOnDisk = 0
    for (const dir of entityDirs) {
      const entries = await readdir(resolveInsideRoot(root, dir), { withFileTypes: true })
      entitiesOnDisk += entries.filter((entry) => entry.isFile() && entry.name.endsWith('.yaml')).length
    }
    const entitiesIndexed = Number((db.prepare('SELECT COUNT(*) AS count FROM entities').get() as { count: number }).count)
    const sourceEntityRows = db.prepare('SELECT id, kind FROM entities').all() as unknown as Array<{ id: string; kind: string }>
    const sourceEntityIds = new Set(sourceEntityRows.map((row) => row.id))
    const sourceEntityKinds = new Map(sourceEntityRows.map((row) => [row.id, row.kind]))
    const sourceChapterPaths = new Set(chapterEntries
      .filter((entry) => entry.isFile() && /^\d{3,}-.+\.md$/.test(entry.name))
      .map((entry) => `chapters/${entry.name}`))
    const relationsIndexed = Number((db.prepare('SELECT COUNT(*) AS count FROM relations').get() as { count: number }).count)
    const danglingRelations = Number((db.prepare('SELECT COUNT(*) AS count FROM relations r WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = r.from_id) OR NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = r.to_id)').get() as { count: number }).count)
    const timelineRows = db.prepare('SELECT entity_ids_json FROM timeline_events').all() as unknown as Array<{ entity_ids_json: string }>
    const entityIds = new Set((db.prepare('SELECT id FROM entities').all() as unknown as Array<{ id: string }>).map((row) => row.id))
    const danglingTimelineEntityRefs = timelineRows.reduce((total, row) => {
      let referenced: unknown
      try { referenced = JSON.parse(row.entity_ids_json) } catch { referenced = [] }
      return total + (Array.isArray(referenced) ? referenced.filter((id): id is string => typeof id === 'string' && !entityIds.has(id)).length : 0)
    }, 0)
    const chapterPaths = new Set((db.prepare("SELECT rel_path FROM documents WHERE kind = 'chapter'").all() as unknown as Array<{ rel_path: string }>).map((row) => row.rel_path))
    const timelineChapterRows = db.prepare("SELECT chapter_rel_path FROM timeline_events WHERE chapter_rel_path IS NOT NULL AND chapter_rel_path != ''").all() as unknown as Array<{ chapter_rel_path: string }>
    const danglingTimelineChapterRefs = timelineChapterRows.filter((row) => !chapterPaths.has(row.chapter_rel_path)).length
    const factsIndexed = Number((db.prepare('SELECT COUNT(*) AS count FROM facts').get() as { count: number }).count)
    const assetEntries = await readdir(resolveInsideRoot(root, 'assets/scenes'), { withFileTypes: true })
    const assetsOnDisk = assetEntries.filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|gif|svg)$/i.test(entry.name)).length
    const assetsIndexed = Number((db.prepare('SELECT COUNT(*) AS count FROM assets').get() as { count: number }).count)
    const embeddingRows = Number((db.prepare('SELECT COUNT(*) AS count FROM embeddings').get() as { count: number }).count)
    const embeddingRowsOnDisk = db.prepare('SELECT rel_path, content_hash FROM embeddings').all() as unknown as Array<{ rel_path: string; content_hash: string }>
    const chapterSources = new Map<string, string>()
    for (const entry of chapterEntries) {
      if (!entry.isFile() || !/^\d{3,}-.+\.md$/.test(entry.name)) continue
      const relPath = `chapters/${entry.name}`
      chapterSources.set(relPath, createHash('sha256').update(await readFile(resolveInsideRoot(root, relPath), 'utf8')).digest('hex'))
    }
    const danglingEmbeddings = embeddingRowsOnDisk.filter((row) => !chapterSources.has(row.rel_path)).length
    const staleEmbeddings = embeddingRowsOnDisk.filter((row) => chapterSources.get(row.rel_path) !== undefined && chapterSources.get(row.rel_path) !== row.content_hash).length
    const invalidStoryArtifactDetails: InvalidStoryArtifactDetail[] = []
    for (const row of db.prepare("SELECT id, kind, title, fields_json, notes FROM story_artifacts WHERE kind IN ('foreshadowing', 'lore', 'plot')").all() as unknown as Array<{ id: string; kind: string; title: string; fields_json: string; notes: string }>) {
      try {
        addInvalidArtifactDetail(invalidStoryArtifactDetails, { id: row.id, kind: row.kind, title: row.title, fields: JSON.parse(row.fields_json), notes: row.notes })
      } catch {
        addInvalidArtifactDetail(invalidStoryArtifactDetails, { id: row.id, kind: row.kind, title: row.title, fields: {}, notes: row.notes })
        invalidStoryArtifactDetails[invalidStoryArtifactDetails.length - 1]!.issues.push('fields: invalid JSON')
      }
    }
    const invalidSourceFiles: string[] = []
    const legacyAssetMetadata: string[] = []
    const entityDirsWithKinds: Array<[string, 'character' | 'place' | 'org' | 'item']> = [['characters', 'character'], ['world/places', 'place'], ['world/organizations', 'org'], ['world/items', 'item']]
    for (const [dir, kind] of entityDirsWithKinds) {
      for (const entry of await readdir(resolveInsideRoot(root, dir), { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue
        const relPath = `${dir}/${entry.name}`
        try {
          const value = parse(await readFile(resolveInsideRoot(root, relPath), 'utf8')) as Record<string, unknown>
          const { id, name, aliases, notes, ...fields } = value
          if (!entityInputSchema.safeParse({ id, kind, name, aliases: aliases ?? [], fields, notes: notes ?? '' }).success) invalidSourceFiles.push(relPath)
        } catch { invalidSourceFiles.push(relPath) }
      }
    }
    const validateListSource = async <T>(relPath: string, key: string, schema: { safeParse(value: unknown): { success: boolean } }): Promise<void> => {
      try {
        const parsed = parse(await readFile(resolveInsideRoot(root, relPath), 'utf8')) as Record<string, unknown>
        const values = parsed?.[key]
        if (!Array.isArray(values)) { invalidSourceFiles.push(relPath); return }
        values.forEach((value, index) => { if (!schema.safeParse(value).success) invalidSourceFiles.push(`${relPath}#${key}[${index}]`) })
      } catch { invalidSourceFiles.push(relPath) }
    }
    await validateListSource('story/timeline.yaml', 'events', timelineEventInputSchema)
    await validateListSource('story/relations.yaml', 'relations', storyRelationInputSchema)
    await reportInvalidVolumeSource(root, invalidSourceFiles)
    await this.validateSourceReferences(root, sourceEntityIds, sourceEntityKinds, sourceChapterPaths, invalidSourceFiles)
    try {
      const parsed = parse(await readFile(resolveInsideRoot(root, 'story/artifacts.yaml'), 'utf8')) as Record<string, unknown>
      const values = parsed?.artifacts
      if (!Array.isArray(values)) invalidSourceFiles.push('story/artifacts.yaml')
      else values.forEach((value, index) => { if (!storyArtifactInputSchema.safeParse(value).success) { invalidSourceFiles.push(`story/artifacts.yaml#artifacts[${index}]`); addInvalidArtifactDetail(invalidStoryArtifactDetails, value) } })
    } catch { invalidSourceFiles.push('story/artifacts.yaml') }
    for (const entry of await readdir(resolveInsideRoot(root, 'assets/scenes'), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue
      const relPath = `assets/scenes/${entry.name}`
      try {
        const metadataPath = resolveInsideRoot(root, relPath)
        if ((await stat(metadataPath)).size > MAX_ASSET_METADATA_BYTES) {
          // Legacy image sidecars may contain a huge `data` array, but the
          // adjacent PNG is still a valid source of truth. Keep this as a
          // compatibility warning instead of reporting the image as corrupt.
          legacyAssetMetadata.push(relPath)
          continue
        }
        const value = parse(await readFile(metadataPath, 'utf8'))
        const metadata = imageAssetMetadataSchema.safeParse(value)
        if (!metadata.success) invalidSourceFiles.push(relPath)
        else {
          try {
            const imageStat = await stat(resolveInsideRoot(root, metadata.data.relPath))
            if (!imageStat.isFile()) invalidSourceFiles.push(`${relPath}#relPath`)
          } catch {
            invalidSourceFiles.push(`${relPath}#relPath`)
          }
        }
      } catch { invalidSourceFiles.push(relPath) }
    }
    for (const entry of await readdir(resolveInsideRoot(root, 'world/lore'), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      try {
        const rawLore = await readFile(resolveInsideRoot(root, 'world/lore', entry.name), 'utf8')
        const match = rawLore.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
        const value = match ? parse(match[1]) as Record<string, unknown> : null
        const valid = value ? storyArtifactInputSchema.safeParse({ id: value.id, kind: value.kind, title: value.title, fields: value.fields ?? {}, notes: match?.[2].trim() ?? '' }).success : false
        if (!valid) invalidSourceFiles.push(`world/lore/${entry.name}`)
      } catch { invalidSourceFiles.push(`world/lore/${entry.name}`) }
    }
    const warnings: string[] = []
    if (chaptersOnDisk !== chaptersIndexed) warnings.push(`章节文件 ${chaptersOnDisk} 个，但索引 ${chaptersIndexed} 个`)
    if (entitiesOnDisk !== entitiesIndexed) warnings.push(`实体文件 ${entitiesOnDisk} 个，但索引 ${entitiesIndexed} 个`)
    if (assetsOnDisk !== assetsIndexed) warnings.push(`场景图片 ${assetsOnDisk} 个，但索引 ${assetsIndexed} 个`)
    if (danglingEmbeddings > 0) warnings.push(`存在 ${danglingEmbeddings} 条悬空 Embedding 索引`)
    if (staleEmbeddings > 0) warnings.push(`存在 ${staleEmbeddings} 条过期 Embedding 索引`)
    if (danglingRelations > 0) warnings.push(`存在 ${danglingRelations} 条悬空关系`)
    if (danglingTimelineEntityRefs > 0) warnings.push(`时间线存在 ${danglingTimelineEntityRefs} 个悬空实体引用`)
    if (danglingTimelineChapterRefs > 0) warnings.push(`时间线存在 ${danglingTimelineChapterRefs} 个悬空章节引用`)
    if (missingFiles.length) warnings.push(`缺少项目源文件：${missingFiles.join('、')}`)
    const invalidStoryArtifacts = invalidStoryArtifactDetails.length
    if (invalidStoryArtifacts > 0) warnings.push(`存在 ${invalidStoryArtifacts} 个 Story Bible 条目字段不完整或类型错误`)
    if (invalidSourceFiles.length) warnings.push(`存在 ${invalidSourceFiles.length} 个无法通过 schema 的源文件`)
    if (legacyAssetMetadata.length) warnings.push(`存在 ${legacyAssetMetadata.length} 个旧版图片元数据（包含嵌入图片数据），图片文件仍可用`)
    return { chaptersOnDisk, chaptersIndexed, entitiesOnDisk, entitiesIndexed, relationsIndexed, danglingRelations, danglingTimelineEntityRefs, danglingTimelineChapterRefs, factsIndexed, assetsOnDisk, assetsIndexed, embeddingRows, staleEmbeddings, danglingEmbeddings, invalidStoryArtifacts, invalidStoryArtifactDetails, invalidSourceFiles, invalidSourceDetails: summarizeInvalidSourceFiles(invalidSourceFiles), migration: this.current.db.migrationReport, missingFiles, warnings }
  }

  private async validateSourceReferences(
    root: string,
    entityIds: Set<string>,
    entityKinds: Map<string, string>,
    chapterPaths: Set<string>,
    invalidSourceFiles: string[]
  ): Promise<void> {
    try {
      const parsed = parse(await readFile(resolveInsideRoot(root, 'story/relations.yaml'), 'utf8')) as Record<string, unknown>
      if (Array.isArray(parsed?.relations)) parsed.relations.forEach((item, index) => {
        const result = storyRelationInputSchema.safeParse(item)
        if (!result.success) return
        if (!entityIds.has(result.data.fromId)) invalidSourceFiles.push(`story/relations.yaml#relations[${index}].fromId`)
        if (!entityIds.has(result.data.toId)) invalidSourceFiles.push(`story/relations.yaml#relations[${index}].toId`)
      })
    } catch {
      // Structural/schema validation reports malformed relation sources.
    }
    try {
      const parsed = parse(await readFile(resolveInsideRoot(root, 'story/timeline.yaml'), 'utf8')) as Record<string, unknown>
      if (Array.isArray(parsed?.events)) parsed.events.forEach((item, index) => {
        const result = timelineEventInputSchema.safeParse(item)
        if (!result.success) return
        const event = result.data
        if (event.chapterRelPath && !chapterPaths.has(event.chapterRelPath)) invalidSourceFiles.push(`story/timeline.yaml#events[${index}].chapterRelPath`)
        event.entityIds.forEach((id, entityIndex) => {
          if (!entityIds.has(id)) invalidSourceFiles.push(`story/timeline.yaml#events[${index}].entityIds[${entityIndex}]`)
        })
        if (event.locationId && (!entityIds.has(event.locationId) || entityKinds.get(event.locationId) !== 'place')) {
          invalidSourceFiles.push(`story/timeline.yaml#events[${index}].locationId`)
        }
      })
    } catch {
      // Structural/schema validation reports malformed timeline sources.
    }
  }

  /** Rebuild file-derived indexes without touching Canon, revisions, or workflow history. */
  async repairIndexes(): Promise<ProjectRepairResult> {
    if (!this.current) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const root = this.current.root
    const db = this.current.db.raw
    const restoredSources: string[] = []
    const invalidStoryArtifactDetails: InvalidStoryArtifactDetail[] = []
    const invalidSourceFiles: string[] = []
    let embeddingsRemoved = 0
    const sourceDefaults: Array<[string, string]> = [
      ['story/premise.md', '# 故事前提\n'],
      ['story/outline.md', '# 大纲\n'],
      ['story/timeline.yaml', 'events: []\n'],
      ['story/artifacts.yaml', 'artifacts: []\n'],
      ['story/relations.yaml', 'relations: []\n']
      ,['story/volumes.yaml', 'version: 1\nvolumes: []\n']
    ]
    for (const [relPath, content] of sourceDefaults) {
      try { await readFile(resolveInsideRoot(root, relPath), 'utf8') } catch { await atomicWriteFile(resolveInsideRoot(root, relPath), content); restoredSources.push(relPath) }
    }
    await reportInvalidVolumeSource(root, invalidSourceFiles)
    const chapters: Array<{ relPath: string; markdown: string; title: string }> = []
    for (const entry of await readdir(resolveInsideRoot(root, 'chapters'), { withFileTypes: true })) {
      if (!entry.isFile() || !/^\d{3,}-.+\.md$/.test(entry.name)) continue
      const relPath = `chapters/${entry.name}`
      const markdown = await readFile(resolveInsideRoot(root, relPath), 'utf8')
      chapters.push({ relPath, markdown, title: markdown.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim() || entry.name.replace(/\.md$/, '') })
    }
    const sceneIndexes: Array<ReturnType<typeof chapterSceneSchema.parse>> = []
    for (const chapter of chapters) {
      try {
        const parsed = sceneSidecarSchema.safeParse(parse(await readFile(resolveInsideRoot(root, `${chapter.relPath.slice(0, -3)}.scenes.yaml`), 'utf8')))
        if (parsed.success) sceneIndexes.push(...parsed.data.scenes.map((scene) => ({ ...scene, chapterRelPath: chapter.relPath })))
      } catch { /* malformed or missing sidecars remain visible to the dedicated scene read path */ }
    }
    const entities: Array<{ id: string; kind: string; name: string; aliases: string[]; fields: Record<string, unknown>; notes: string }> = []
    const entityDirs: Array<[string, string]> = [['characters', 'character'], ['world/places', 'place'], ['world/organizations', 'org'], ['world/items', 'item']]
    for (const [dir, kind] of entityDirs) {
      for (const entry of await readdir(resolveInsideRoot(root, dir), { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue
        const relPath = `${dir}/${entry.name}`
        try {
          const value = parse(await readFile(resolveInsideRoot(root, dir, entry.name), 'utf8')) as Record<string, unknown>
          const id = typeof value.id === 'string' ? value.id : entry.name.replace(/\.yaml$/, '')
          const name = typeof value.name === 'string' ? value.name : id
          const aliases = Array.isArray(value.aliases) ? value.aliases.filter((item): item is string => typeof item === 'string') : []
          const { id: _id, name: _name, aliases: _aliases, notes: rawNotes, ...fields } = value
          entities.push({ id, kind, name, aliases, fields, notes: typeof rawNotes === 'string' ? rawNotes : '' })
        } catch {
          invalidSourceFiles.push(relPath)
        }
      }
    }
    const timeline: Array<{ id: string; title: string; at: string | null; description: string; chapterRelPath: string | null; entityIds: string[]; locationId: string | null; causes: string; effects: string }> = []
    try {
      const parsed = parse(await readFile(resolveInsideRoot(root, 'story/timeline.yaml'), 'utf8')) as { events?: unknown }
      for (const item of Array.isArray(parsed?.events) ? parsed.events : []) {
        if (!item || typeof item !== 'object') continue
        const value = item as Record<string, unknown>
        if (typeof value.id !== 'string' || typeof value.title !== 'string') continue
        timeline.push({ id: value.id, title: value.title, at: typeof value.at === 'string' ? value.at : null, description: typeof value.description === 'string' ? value.description : '', chapterRelPath: typeof value.chapterRelPath === 'string' ? value.chapterRelPath : null, entityIds: Array.isArray(value.entityIds) ? value.entityIds.filter((id): id is string => typeof id === 'string') : [], locationId: typeof value.locationId === 'string' ? value.locationId : null, causes: typeof value.causes === 'string' ? value.causes : '', effects: typeof value.effects === 'string' ? value.effects : '' })
      }
    } catch { /* an absent or malformed optional timeline yields an empty index */ }
    const validateRepairListSource = async (relPath: string, key: string, schema: { safeParse(value: unknown): { success: boolean } }): Promise<void> => {
      try {
        const parsed = parse(await readFile(resolveInsideRoot(root, relPath), 'utf8')) as Record<string, unknown>
        const values = parsed?.[key]
        if (!Array.isArray(values)) {
          invalidSourceFiles.push(relPath)
          return
        }
        values.forEach((value, index) => {
          if (!schema.safeParse(value).success) invalidSourceFiles.push(`${relPath}#${key}[${index}]`)
        })
      } catch {
        invalidSourceFiles.push(relPath)
      }
    }
    await validateRepairListSource('story/timeline.yaml', 'events', timelineEventInputSchema)
    await validateRepairListSource('story/relations.yaml', 'relations', storyRelationInputSchema)
    await this.validateSourceReferences(
      root,
      new Set(entities.map((entity) => entity.id)),
      new Map(entities.map((entity) => [entity.id, entity.kind])),
      new Set(chapters.map((chapter) => chapter.relPath)),
      invalidSourceFiles
    )
    const artifacts: Array<{ id: string; kind: string; title: string; fields: Record<string, unknown>; notes: string; updatedAt: string }> = []
    try {
      const parsed = parse(await readFile(resolveInsideRoot(root, 'story/artifacts.yaml'), 'utf8')) as { artifacts?: unknown }
      for (const item of Array.isArray(parsed?.artifacts) ? parsed.artifacts : []) {
        if (!item || typeof item !== 'object') continue
        const value = item as Record<string, unknown>
        if (typeof value.id !== 'string' || typeof value.kind !== 'string' || typeof value.title !== 'string') continue
        artifacts.push({ id: value.id, kind: value.kind, title: value.title, fields: value.fields && typeof value.fields === 'object' ? value.fields as Record<string, unknown> : {}, notes: typeof value.notes === 'string' ? value.notes : '', updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString() })
      }
    } catch { /* older projects may not have an artifact source file */ }
    const artifactIds = new Set(artifacts.map((artifact) => artifact.id))
    for (const entry of await readdir(resolveInsideRoot(root, 'world/lore'), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      try {
        const rawLore = await readFile(resolveInsideRoot(root, 'world/lore', entry.name), 'utf8')
        const match = rawLore.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
        if (!match) continue
        const value = parse(match[1]) as Record<string, unknown>
        if (typeof value.id !== 'string' || value.kind !== 'lore' || typeof value.title !== 'string' || artifactIds.has(value.id)) continue
        const fields = value.fields && typeof value.fields === 'object' ? value.fields as Record<string, unknown> : {}
        const candidate = { id: value.id, kind: 'lore' as const, title: value.title, fields, notes: match[2].trim() }
        if (!storyArtifactInputSchema.safeParse(candidate).success) { invalidSourceFiles.push(`world/lore/${entry.name}`); continue }
        artifacts.push({ ...candidate, updatedAt: new Date(0).toISOString() })
        artifactIds.add(value.id)
      } catch { invalidSourceFiles.push(`world/lore/${entry.name}`) }
    }
    const relations: Array<{ id: string; fromId: string; relationType: string; toId: string; metadata: Record<string, unknown>; createdAt: string }> = []
    try {
      const parsed = parse(await readFile(resolveInsideRoot(root, 'story/relations.yaml'), 'utf8')) as { relations?: unknown }
      for (const item of Array.isArray(parsed?.relations) ? parsed.relations : []) {
        if (!item || typeof item !== 'object') continue
        const value = item as Record<string, unknown>
        if (typeof value.id !== 'string' || typeof value.fromId !== 'string' || typeof value.relationType !== 'string' || typeof value.toId !== 'string') continue
        relations.push({ id: value.id, fromId: value.fromId, relationType: value.relationType, toId: value.toId, metadata: value.metadata && typeof value.metadata === 'object' ? value.metadata as Record<string, unknown> : {}, createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString() })
      }
    } catch { /* older projects may not have a relation source file */ }
    const sceneDirEntries = await readdir(resolveInsideRoot(root, 'assets/scenes'), { withFileTypes: true })
    const sceneNames = new Set(sceneDirEntries.filter((entry) => entry.isFile()).map((entry) => entry.name))
    const assets: Array<{ id: string; relPath: string; mimeType: string; provider: string; model: string; createdAt: string }> = []
    for (const entry of sceneDirEntries) {
      if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue
      try {
        const metadataPath = resolveInsideRoot(root, 'assets/scenes', entry.name)
        const metadataSize = (await stat(metadataPath)).size
        const rawMetadata = await readFile(metadataPath, 'utf8')
        // Legacy sidecars placed a large YAML `data:` array after the normal
        // metadata. Parse only the metadata prefix so repair can preserve the
        // adjacent PNG without loading that array into the YAML parser.
        const value = metadataSize > MAX_ASSET_METADATA_BYTES
          ? parseLegacyAssetMetadata(rawMetadata)
          : parse(rawMetadata) as Record<string, unknown>
        if (!value) { invalidSourceFiles.push(`assets/scenes/${entry.name}`); continue }
        if (!imageAssetMetadataSchema.safeParse(value).success) { invalidSourceFiles.push(`assets/scenes/${entry.name}`); continue }
        const relPath = typeof value.relPath === 'string' ? value.relPath : ''
        const imageName = relPath.split('/').pop() ?? ''
        if (typeof value.assetId !== 'string' || !relPath) continue
        if (!sceneNames.has(imageName)) {
          invalidSourceFiles.push(`assets/scenes/${entry.name}#relPath`)
          continue
        }
        assets.push({ id: value.assetId, relPath, mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'image/png', provider: typeof value.provider === 'string' ? value.provider : 'unknown', model: typeof value.model === 'string' ? value.model : 'unknown', createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString() })
      } catch { /* skip malformed sidecars */ }
    }
    db.exec('BEGIN')
    try {
      const embeddingRows = db.prepare('SELECT rel_path, content_hash FROM embeddings').all() as unknown as Array<{ rel_path: string; content_hash: string }>
      const sourceHashes = new Map(chapters.map((chapter) => [chapter.relPath, createHash('sha256').update(chapter.markdown).digest('hex')]))
      for (const row of embeddingRows) {
        if (sourceHashes.get(row.rel_path) === undefined || sourceHashes.get(row.rel_path) !== row.content_hash) {
          db.prepare('DELETE FROM embeddings WHERE rel_path = ?').run(row.rel_path)
          embeddingsRemoved++
        }
      }
      db.exec("DELETE FROM documents_fts; DELETE FROM documents WHERE kind = 'chapter'; DELETE FROM chapter_scenes; DELETE FROM entities; DELETE FROM timeline_events; DELETE FROM story_artifacts; DELETE FROM foreshadowing; DELETE FROM relations; DELETE FROM assets;")
      for (const chapter of chapters) {
        const now = new Date().toISOString()
        db.prepare('INSERT INTO documents(id, kind, rel_path, title, hash, updated_at, word_count) VALUES(?, ?, ?, ?, ?, ?, ?)').run(randomBytes(8).toString('hex'), 'chapter', chapter.relPath, chapter.title, createHash('sha256').update(chapter.markdown).digest('hex'), now, countWords(chapter.markdown))
        db.prepare('INSERT INTO documents_fts(rel_path, title, content) VALUES(?, ?, ?)').run(chapter.relPath, chapter.title, chapter.markdown)
      }
      const insertScene = db.prepare('INSERT INTO chapter_scenes(id, chapter_rel_path, title, scene_order, start_paragraph, end_paragraph, summary, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)')
      for (const scene of sceneIndexes) insertScene.run(scene.id, scene.chapterRelPath, scene.title, scene.order, scene.startParagraph, scene.endParagraph, scene.summary, scene.createdAt, scene.updatedAt)
      for (const entity of entities) db.prepare('INSERT INTO entities(id, kind, name, aliases_json, fields_json, notes, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)').run(entity.id, entity.kind, entity.name, JSON.stringify(entity.aliases), JSON.stringify(entity.fields), entity.notes, new Date().toISOString())
      for (const event of timeline) db.prepare('INSERT INTO timeline_events(id, title, at, description, chapter_rel_path, entity_ids_json, location_id, causes, effects, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(event.id, event.title, event.at, event.description, event.chapterRelPath, JSON.stringify(event.entityIds), event.locationId, event.causes, event.effects, new Date().toISOString())
      for (const artifact of artifacts) {
        db.prepare('INSERT INTO story_artifacts(id, kind, title, fields_json, notes, updated_at) VALUES(?, ?, ?, ?, ?, ?)').run(artifact.id, artifact.kind, artifact.title, JSON.stringify(artifact.fields), artifact.notes, artifact.updatedAt)
        addInvalidArtifactDetail(invalidStoryArtifactDetails, artifact)
        if (artifact.kind === 'foreshadowing') {
          const parsedArtifact = storyArtifactInputSchema.safeParse(artifact)
          if (!parsedArtifact.success) continue
          const fields = artifact.fields
          const chapters = Array.isArray(fields.relatedChapters) ? fields.relatedChapters.filter((value): value is string => typeof value === 'string') : typeof fields.relatedChapters === 'string' ? fields.relatedChapters.split(',').map((value) => value.trim()).filter(Boolean) : []
          db.prepare('INSERT INTO foreshadowing(id, title, setup, target, payoff_deadline, status, evidence, related_chapters_json, notes, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(artifact.id, artifact.title, typeof fields.setup === 'string' ? fields.setup : '', typeof fields.target === 'string' ? fields.target : '', typeof fields.payoffDeadline === 'string' ? fields.payoffDeadline : '', typeof fields.status === 'string' ? fields.status : 'planned', typeof fields.evidence === 'string' ? fields.evidence : '', JSON.stringify(chapters), artifact.notes, artifact.updatedAt)
        }
      }
      for (const relation of relations) {
        const count = db.prepare('SELECT COUNT(*) AS count FROM entities WHERE id IN (?, ?)').get(relation.fromId, relation.toId) as { count: number }
        if (count.count === 2) db.prepare('INSERT INTO relations(id, from_id, relation_type, to_id, metadata_json, created_at) VALUES(?, ?, ?, ?, ?, ?)').run(relation.id, relation.fromId, relation.relationType, relation.toId, JSON.stringify(relation.metadata), relation.createdAt)
      }
      for (const asset of assets) db.prepare('INSERT INTO assets(id, rel_path, mime_type, provider, model, provenance_json, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)').run(asset.id, asset.relPath, asset.mimeType, asset.provider, asset.model, JSON.stringify(asset), asset.createdAt)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw new DomainError('DB_ERROR', `索引修复失败: ${error instanceof Error ? error.message : String(error)}`) }
    return { documents: chapters.length, entities: entities.length, timeline: timeline.length, artifacts: artifacts.length, relations: relations.length, assets: assets.length, embeddingsRemoved, restoredSources, invalidStoryArtifacts: invalidStoryArtifactDetails.length, invalidStoryArtifactDetails, invalidSourceFiles, invalidSourceDetails: summarizeInvalidSourceFiles(invalidSourceFiles) }
  }

  /** Reset only authoring content to the deterministic Little Cow fixture. */
  async seedMockStory(): Promise<null> {
    const chapterDir = this.resolveInProject('chapters')
    for (const entry of await readdir(chapterDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) await unlink(resolveInsideRoot(this.current!.root, 'chapters', entry.name))
    }
    const entityDirs = ['characters', 'world/places', 'world/organizations', 'world/items']
    for (const dir of entityDirs) {
      for (const entry of await readdir(this.resolveInProject(dir), { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.yaml')) await unlink(resolveInsideRoot(this.current!.root, dir, entry.name))
      }
    }
    const db = this.database.raw
    db.exec("DELETE FROM documents_fts; DELETE FROM documents WHERE kind = 'chapter'; DELETE FROM entities; DELETE FROM timeline_events; DELETE FROM relations; DELETE FROM foreshadowing;")
    await atomicWriteFile(this.resolveInProject('story/relations.yaml'), 'relations: []\n')
    const now = new Date().toISOString()
    for (const chapter of LITTLE_COW_CHAPTERS) {
      const relPath = `chapters/${chapter.filename}`
      await atomicWriteFile(this.resolveInProject(relPath), chapter.markdown)
      const title = chapter.markdown.match(/^#\s+(.+)$/m)?.[1] ?? chapter.filename
      db.prepare(`INSERT INTO documents(id, kind, rel_path, title, hash, updated_at, word_count) VALUES(?, 'chapter', ?, ?, ?, ?, ?)`).run(randomBytes(8).toString('hex'), relPath, title, createHash('sha256').update(chapter.markdown).digest('hex'), now, countWords(chapter.markdown))
      db.prepare('INSERT INTO documents_fts(rel_path, title, content) VALUES(?, ?, ?)').run(relPath, title, chapter.markdown)
    }
    for (const entity of LITTLE_COW_ENTITIES) {
      const id = entity.id
      if (!id) throw new DomainError('INVALID_PROJECT', '示例实体缺少稳定 ID')
      const updatedAt = now
      db.prepare('INSERT INTO entities(id, kind, name, aliases_json, fields_json, notes, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)').run(id, entity.kind, entity.name, JSON.stringify(entity.aliases), JSON.stringify(entity.fields), entity.notes ?? '', updatedAt)
      const directory = { character: 'characters', place: 'world/places', org: 'world/organizations', item: 'world/items' }[entity.kind]
      await atomicWriteFile(this.resolveInProject(`${directory}/${id}.yaml`), stringify({ id, name: entity.name, aliases: entity.aliases, ...entity.fields, notes: entity.notes ?? '' }))
    }
    for (const event of LITTLE_COW_TIMELINE) {
      const id = event.id
      if (!id) throw new DomainError('INVALID_PROJECT', '示例时间线事件缺少稳定 ID')
      db.prepare('INSERT INTO timeline_events(id, title, at, description, chapter_rel_path, entity_ids_json, location_id, causes, effects, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, event.title, event.at ?? null, event.description ?? '', event.chapterRelPath ?? null, JSON.stringify(event.entityIds ?? []), event.locationId ?? null, event.causes ?? '', event.effects ?? '', now)
    }
    return null
  }

  private async ensureDirs(root: string): Promise<void> {
    for (const dir of PROJECT_PATHS.dirs) {
      await atomicWriteFile(resolveInsideRoot(root, dir, '.gitkeep'), '')
    }
  }

  private async ensureDefaultChapter(root: string): Promise<void> {
    const chaptersDir = resolveInsideRoot(root, 'chapters')
    const entries = await readdir(chaptersDir)
    if (entries.some((entry) => entry.toLowerCase().endsWith('.md'))) return
    await atomicWriteFile(resolveInsideRoot(root, 'chapters/001-第一章.md'), '# 第一章\n\n')
  }

  private async ensurePromptPack(root: string): Promise<void> {
    const prompts: Record<string, string> = {
      'ai-edit': '# AI Edit · v1\n\n只返回可替换正文，不要解释、不要添加 Markdown 代码围栏，不要修改未被请求的内容。\n',
      'agent-rewrite': '# Rewrite Agent · v1\n\n只输出可替换正文，不解释，不添加 Markdown 代码围栏。\n',
      'agent-writer': '# Writer Agent · v1\n\n保持当前叙事视角、人物口吻和 Canon 连续性，输出正文。\n',
      'agent-logic-critic': '# Logic Critic · v1\n\n检查因果、时间、空间和规则冲突，列出证据和修复建议。\n',
      'agent-character-critic': '# Character Critic · v1\n\n检查人物行为、口吻、目标和已知信息是否一致。\n',
      'agent-style-critic': '# Style Critic · v1\n\n检查重复、节奏、视角和表达质量。\n',
      'agent-plot-planner': '# Plot Planner · v1\n\n输出章节目标、冲突、节拍和场景 beats。\n',
      'agent-memory-extractor': '# Memory Extractor · v1\n\n提取事实、关系和事件；不得直接修改 Canon。\n',
      'agent-visual-director': '# Visual Director · v1\n\n把章节整理成镜头、构图和画面提示词。\n',
      'agent-image-prompt': '# Image Prompt Agent · v1\n\n把场景、角色视觉身份、地点和全书 Art Direction 编译成稳定、可执行的图片模型提示词。只输出结构化图片提示词，不生成图片。\n'
    }
    for (const [name, content] of Object.entries(prompts)) {
      const promptPath = resolveInsideRoot(root, `prompts/${name}.md`)
      try { await readFile(promptPath, 'utf8') } catch { await atomicWriteFile(promptPath, content) }
    }
  }

  /** Blueprint §6 scaffold. Only called on empty dirs. */
  private async scaffold(root: string, title: string, language: string): Promise<void> {
    const manifest = makeManifest(title, language)
    const files: Array<[string, string]> = [
      [PROJECT_PATHS.manifest, stringify(manifest)],
      ['.gitignore', GITIGNORE_CONTENT],
      ['DIRECTORY.md', '# Novel Studio 项目目录\n\n- `chapters/`：章节 Markdown 正文；场景元数据使用同名 `.scenes.yaml`\n- `story/`：前提、大纲、时间线、关系、伏笔和卷结构\n- `characters/`：角色 YAML 设定\n- `world/`：地点、组织、物品和 Lore 设定\n- `workflows/`：可视化 DAG 工作流定义\n- `prompts/`：版本化 Prompt Pack\n- `assets/characters/`：角色参考图\n- `assets/scenes/`：场景图片和 Asset provenance\n- `assets/covers/`：封面与宣传视觉\n- `.novel/`：SQLite 索引、Revision、Checkpoint、缓存和运行日志（不要手动删除）\n'],
      ['story/premise.md', '# 故事前提\n\n> 用一段话说清这本书。\n'],
      ['story/outline.md', '# 大纲\n'],
      ['story/timeline.yaml', 'events: []\n'],
      ['story/artifacts.yaml', 'artifacts: []\n'],
      ['story/relations.yaml', 'relations: []\n'],
      ['story/volumes.yaml', 'version: 1\nvolumes: []\n'],
      ['story/README.md', '# Story Bible\n\n这里保存全书级设定：前提、大纲、时间线、关系、伏笔/设定条目和卷结构。\n\n- `premise.md`：故事前提\n- `outline.md`：大纲与章节规划\n- `timeline.yaml`：故事时间线\n- `artifacts.yaml`：伏笔、Lore 等结构化条目\n- `relations.yaml`：实体关系\n- `volumes.yaml`：卷与章节归属\n'],
      ['chapters/001-第一章.md', '# 第一章\n\n'],
      ['prompts/README.md', '# Prompt Pack\n\nPrompt 文件化并版本化（蓝图 §12），不要把 prompt 写死在源码常量里。\n\n- `ai-edit.md`：AI 编辑替换规则\n'],
      ['prompts/ai-edit.md', '# AI Edit · v1\n\n只返回可替换正文，不要解释、不要添加 Markdown 代码围栏，不要修改未被请求的内容。\n'],
      ['workflows/README.md', '# Workflows\n\n创作流程保存为 .novelflow.json（蓝图 §11）。\n']
      ,['workflows/flow_builtin_novel.novelflow.json', JSON.stringify(builtinNovelFlow(), null, 2) + '\n']
    ]
    for (const [rel, content] of files) {
      await atomicWriteFile(resolveInsideRoot(root, rel), content)
    }
    await this.ensureDirs(root)
  }
}
