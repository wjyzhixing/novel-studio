import { readFile, readdir, rename, unlink } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { ChapterContent, ChapterMeta, SearchHit, ExportFormat, ExportOptions } from '../../shared/chapter'
import type { Revision } from '../../shared/revision'
import { CHAPTERS_DIR } from '../../shared/chapter'
import { DomainError } from './errors'
import type { ProjectService } from './project-service'
import { atomicWriteFile } from './atomic-fs'
import { countWords } from './words'
import { isInsideRoot } from './paths'
import { resolveInsideRoot } from './paths'
import MarkdownIt from 'markdown-it'
import { removeSceneSidecar, renameSceneSidecar } from './scene-service'
import { stripImageMetadata } from './image-metadata'
import type { ExtensionRegistry } from './extension-registry'

export interface ChapterPathReferenceUpdater {
  remapChapter(from: string, to: string): Promise<void>
  removeChapter(relPath: string): Promise<void>
}

// Three digits are the normal display format; long projects may exceed 999
// chapters, so the persisted filename contract accepts any 3+ digit prefix.
const CHAPTER_RE = /^(\d{3,})-(.+)\.md$/

function titleFromMarkdown(markdown: string, fallback: string): string {
  const m = markdown.match(/^#{1,6}\s+(.+)$/m)
  return (m?.[1]?.trim() || fallback).slice(0, 100)
}

function sanitizeSlug(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|#]/g, '').trim().replace(/\s+/g, '-').slice(0, 40)
  return cleaned || 'untitled'
}

/**
 * Chapter CRUD + FTS index (Sprint 2).
 * Files in chapters/*.md are the canonical source of truth; the DB
 * `documents` + `documents_fts` tables are a rebuildable index.
 */
export class ChapterService {
  constructor(private readonly project: ProjectService, private readonly createRevision?: (input: Omit<Revision, 'id' | 'createdAt'>) => Promise<Revision>, private readonly pathReferences?: ChapterPathReferenceUpdater, private readonly extensions?: ExtensionRegistry) {}

  get database() {
    return this.project.database.raw
  }

  private get db() {
    return this.project.database.raw
  }

  /** Validate that relPath is a .md file within chapters/ and stay inside the project root. */
  private chapterPath(relPath: string): string {
    if (!relPath.endsWith('.md')) {
      throw new DomainError('PATH_DENIED', '章节必须是 .md 文件')
    }
    if (!relPath.startsWith(`${CHAPTERS_DIR}/`) || relPath.includes('..')) {
      throw new DomainError('PATH_DENIED', '章节路径必须位于 chapters/ 下')
    }
    return this.project.resolveInProject(relPath)
  }

  async list(): Promise<ChapterMeta[]> {
    const dir = this.project.resolveInProject(CHAPTERS_DIR)
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      names = []
    }
    const metas: ChapterMeta[] = []
    for (const name of names) {
      const m = name.match(CHAPTER_RE)
      if (!m) continue
      const relPath = `${CHAPTERS_DIR}/${name}`
      const row = this.db
        .prepare('SELECT word_count, updated_at FROM documents WHERE rel_path = ?')
        .get(relPath) as { word_count: number; updated_at: string } | undefined
      metas.push({
        relPath,
        number: Number(m[1]),
        title: m[2].replace(/-/g, ' '),
        wordCount: row?.word_count ?? 0,
        updatedAt: row?.updated_at ?? new Date(0).toISOString()
      })
    }
    metas.sort((a, b) => a.number - b.number)
    return metas
  }

  async read(relPath: string): Promise<ChapterContent> {
    const file = this.chapterPath(relPath)
    let markdown: string
    try {
      markdown = await readFile(file, 'utf8')
    } catch {
      throw new DomainError('PROJECT_NOT_FOUND', `章节文件不存在: ${relPath}`)
    }
    return {
      relPath,
      title: titleFromMarkdown(markdown, basename(relPath, '.md')),
      markdown
    }
  }

  async create(title: string): Promise<ChapterMeta> {
    const existing = await this.list()
    const nextNumber =
      existing.length === 0 ? 1 : existing[existing.length - 1].number + 1
    const name = `${String(nextNumber).padStart(3, '0')}-${sanitizeSlug(title)}.md`
    const relPath = `${CHAPTERS_DIR}/${name}`
    const markdown = `# ${title}\n\n`
    await atomicWriteFile(this.chapterPath(relPath), markdown)
    const savedAt = await this.reindex(relPath, markdown)
    return {
      relPath,
      number: nextNumber,
      title,
      wordCount: countWords(markdown),
      updatedAt: savedAt
    }
  }

  async save(relPath: string, markdown: string): Promise<{ savedAt: string; wordCount: number }> {
    const file = this.chapterPath(relPath)
    await atomicWriteFile(file, markdown)
    const savedAt = await this.reindex(relPath, markdown)
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(`context.summary:${relPath}`)
    return { savedAt, wordCount: countWords(markdown) }
  }

  async rename(relPath: string, title: string): Promise<ChapterMeta[]> {
    const file = this.chapterPath(relPath)
    const nextTitle = title.trim()
    if (!nextTitle || nextTitle.length > 100) throw new DomainError('VALIDATION_FAILED', '章节标题不能为空且不能超过 100 个字符')
    const current = (await this.list()).find((chapter) => chapter.relPath === relPath)
    if (!current) throw new DomainError('PROJECT_NOT_FOUND', `章节不存在: ${relPath}`)
    const newRelPath = `${CHAPTERS_DIR}/${String(current.number).padStart(3, '0')}-${sanitizeSlug(nextTitle)}.md`
    const markdown = await readFile(file, 'utf8')
    const renamedMarkdown = /^#{1,6}\s+.+$/m.test(markdown)
      ? markdown.replace(/^#{1,6}\s+.+$/m, `# ${nextTitle}`)
      : `# ${nextTitle}\n\n${markdown}`
    if (newRelPath === relPath) {
      await this.save(relPath, renamedMarkdown)
      return this.list()
    }
    try {
      await readFile(this.chapterPath(newRelPath))
      throw new DomainError('VALIDATION_FAILED', `目标章节文件已存在: ${newRelPath}`)
    } catch (error) {
      if (error instanceof DomainError) throw error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const tempRelPath = `${CHAPTERS_DIR}/.renaming-${randomBytes(8).toString('hex')}.md`
    await rename(file, this.chapterPath(tempRelPath))
    await renameSceneSidecar(this.project, relPath, tempRelPath)
    try {
      await rename(this.chapterPath(tempRelPath), this.chapterPath(newRelPath))
      await renameSceneSidecar(this.project, tempRelPath, newRelPath)
      await atomicWriteFile(this.chapterPath(newRelPath), renamedMarkdown)
      this.db.prepare('DELETE FROM documents WHERE rel_path = ?').run(relPath)
      this.db.prepare('DELETE FROM documents_fts WHERE rel_path = ?').run(relPath)
      await this.reindex(newRelPath, renamedMarkdown)
      await this.remapPathReferences([{ oldRel: relPath, newRel: newRelPath }])
      await this.pathReferences?.remapChapter(relPath, newRelPath)
      return this.list()
    } catch (error) {
      try { await rename(this.chapterPath(tempRelPath), file) } catch { /* preserve original error */ }
      throw error
    }
  }

  /**
   * Move a chapter to a new 0-based slot in the sorted list.
   * Renames files on disk to keep numeric prefixes dense and in order,
   * then updates the index.
   */
  async move(relPath: string, toIndex: number): Promise<ChapterMeta[]> {
    const metas = await this.list()
    const fromIndex = metas.findIndex((c) => c.relPath === relPath)
    if (fromIndex < 0) {
      throw new DomainError('PROJECT_NOT_FOUND', `章节不存在: ${relPath}`)
    }
    const clamped = Math.max(0, Math.min(toIndex, metas.length - 1))
    if (clamped === fromIndex) return metas

    const [moving] = metas.splice(fromIndex, 1)
    metas.splice(clamped, 0, moving)

    const moves = metas.flatMap((meta, i) => {
      const expected = i + 1
      if (meta.number === expected) return []
      const newRel = `${CHAPTERS_DIR}/${String(expected).padStart(3, '0')}-${sanitizeSlug(meta.title)}.md`
      return [{ oldRel: meta.relPath, newRel, tempRel: `${CHAPTERS_DIR}/.moving-${randomBytes(8).toString('hex')}.md` }]
    })

    // Move every source out of the way first. This prevents duplicate slugs
    // from overwriting a still-unmoved chapter at its destination.
    for (const move of moves) {
      await rename(this.project.resolveInProject(move.oldRel), this.project.resolveInProject(move.tempRel))
      await renameSceneSidecar(this.project, move.oldRel, move.tempRel)
    }
    for (const move of moves) {
      await rename(this.project.resolveInProject(move.tempRel), this.project.resolveInProject(move.newRel))
      await renameSceneSidecar(this.project, move.tempRel, move.newRel)
      this.db.prepare('DELETE FROM documents WHERE rel_path = ?').run(move.oldRel)
      this.db.prepare('DELETE FROM documents_fts WHERE rel_path = ?').run(move.oldRel)
      await this.reindex(move.newRel, await readFile(this.project.resolveInProject(move.newRel), 'utf8'))
    }
    await this.remapPathReferences(moves)
    for (const move of moves) await this.pathReferences?.remapChapter(move.oldRel, move.newRel)
    return this.list()
  }

  async remove(relPath: string): Promise<void> {
    const file = this.chapterPath(relPath)
    let markdown: string
    try { markdown = await readFile(file, 'utf8') } catch { throw new DomainError('PROJECT_NOT_FOUND', `章节不存在: ${relPath}`) }
    if (this.createRevision) await this.createRevision({ relPath, actor: 'human', source: `chapter-delete:${relPath}`, original: markdown, replacement: '' })
    await unlink(file)
    await removeSceneSidecar(this.project, relPath)
    this.db.prepare('DELETE FROM documents WHERE rel_path = ?').run(relPath)
    this.db.prepare('DELETE FROM chapter_scenes WHERE chapter_rel_path = ?').run(relPath)
    this.db.prepare('DELETE FROM documents_fts WHERE rel_path = ?').run(relPath)
    this.db.prepare('DELETE FROM chapter_notes WHERE rel_path = ?').run(relPath)
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(`context.summary:${relPath}`)
    const timelineRows = this.db.prepare('SELECT * FROM timeline_events WHERE chapter_rel_path = ?').all(relPath) as unknown as TimelineRow[]
    if (timelineRows.length > 0) {
      this.db.prepare('UPDATE timeline_events SET chapter_rel_path = NULL, updated_at = ? WHERE chapter_rel_path = ?').run(new Date().toISOString(), relPath)
      const allTimeline = this.db.prepare('SELECT * FROM timeline_events ORDER BY updated_at').all() as unknown as TimelineRow[]
      await atomicWriteFile(this.project.resolveInProject('story/timeline.yaml'), stringifyYaml({ events: allTimeline.map(toTimeline) }))
    }
    await this.pathReferences?.removeChapter(relPath)
  }

  private async remapPathReferences(moves: Array<{ oldRel: string; newRel: string }>): Promise<void> {
    if (moves.length === 0) return
    const pathMap = new Map(moves.map((move) => [move.oldRel, move.newRel]))
    const db = this.db
    const noteRows = db.prepare(`SELECT rel_path, notes, updated_at FROM chapter_notes WHERE rel_path IN (${moves.map(() => '?').join(',')})`).all(...moves.map((move) => move.oldRel)) as unknown as Array<{ rel_path: string; notes: string; updated_at: string }>
    const revisionRows = db.prepare(`SELECT id, rel_path FROM revisions WHERE rel_path IN (${moves.map(() => '?').join(',')})`).all(...moves.map((move) => move.oldRel)) as unknown as Array<{ id: string; rel_path: string }>
    const suggestionRows = db.prepare(`SELECT id, rel_path FROM ai_suggestions WHERE rel_path IN (${moves.map(() => '?').join(',')})`).all(...moves.map((move) => move.oldRel)) as unknown as Array<{ id: string; rel_path: string }>
    const runRows = db.prepare('SELECT id, state_json FROM workflow_runs').all() as unknown as Array<{ id: string; state_json: string }>
    const updatedRuns = runRows.flatMap((row) => {
      try {
        const state = JSON.parse(row.state_json) as { relPath?: unknown }
        const nextPath = typeof state.relPath === 'string' ? pathMap.get(state.relPath) : undefined
        return nextPath ? [{ id: row.id, stateJson: JSON.stringify({ ...state, relPath: nextPath }) }] : []
      } catch { return [] }
    })
    db.exec('BEGIN')
    try {
      for (const move of moves) db.prepare('UPDATE timeline_events SET chapter_rel_path = ?, updated_at = ? WHERE chapter_rel_path = ?').run(move.newRel, new Date().toISOString(), move.oldRel)
      for (const move of moves) db.prepare('UPDATE chapter_scenes SET chapter_rel_path = ? WHERE chapter_rel_path = ?').run(move.newRel, move.oldRel)
      for (const move of moves) db.prepare('DELETE FROM chapter_notes WHERE rel_path = ?').run(move.oldRel)
      for (const note of noteRows) {
        const nextPath = pathMap.get(note.rel_path)
        if (nextPath) db.prepare('INSERT INTO chapter_notes(rel_path, notes, updated_at) VALUES(?, ?, ?)').run(nextPath, note.notes, note.updated_at)
      }
      for (const revision of revisionRows) {
        const nextPath = pathMap.get(revision.rel_path)
        if (nextPath) db.prepare('UPDATE revisions SET rel_path = ? WHERE id = ?').run(nextPath, revision.id)
      }
      for (const suggestion of suggestionRows) {
        const nextPath = pathMap.get(suggestion.rel_path)
        if (nextPath) db.prepare('UPDATE ai_suggestions SET rel_path = ? WHERE id = ?').run(nextPath, suggestion.id)
      }
      for (const run of updatedRuns) db.prepare('UPDATE workflow_runs SET state_json = ?, updated_at = ? WHERE id = ?').run(run.stateJson, new Date().toISOString(), run.id)
      for (const move of moves) db.prepare('UPDATE settings SET key = ? WHERE key = ?').run(`context.summary:${move.newRel}`, `context.summary:${move.oldRel}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    const updatedTimeline = db.prepare('SELECT * FROM timeline_events ORDER BY updated_at').all() as unknown as TimelineRow[]
    await atomicWriteFile(this.project.resolveInProject('story/timeline.yaml'), stringifyYaml({ events: updatedTimeline.map(toTimeline) }))
    for (const revision of revisionRows) {
      const file = this.project.resolveInProject(`.novel/revisions/${revision.id}.yaml`)
      try {
        const parsed = parseYaml(await readFile(file, 'utf8')) as Record<string, unknown>
        const nextPath = pathMap.get(revision.rel_path)
        if (nextPath) await atomicWriteFile(file, stringifyYaml({ ...parsed, relPath: nextPath }))
      } catch { /* the database remains the authoritative rebuildable audit index */ }
    }
  }

  async readNote(relPath: string): Promise<string> {
    this.chapterPath(relPath)
    const row = this.db.prepare('SELECT notes FROM chapter_notes WHERE rel_path = ?').get(relPath) as { notes: string } | undefined
    return row?.notes ?? ''
  }

  async saveNote(relPath: string, notes: string): Promise<null> {
    this.chapterPath(relPath)
    this.db.prepare('INSERT INTO chapter_notes(rel_path, notes, updated_at) VALUES(?, ?, ?) ON CONFLICT(rel_path) DO UPDATE SET notes=excluded.notes, updated_at=excluded.updated_at').run(relPath, notes, new Date().toISOString())
    return null
  }

  async importFile(sourcePath: string, title?: string): Promise<ChapterMeta> {
    const extension = extname(sourcePath).toLowerCase()
    const builtin = ['.md', '.markdown', '.txt'].includes(extension)
    let fallbackTitle = basename(sourcePath, extension).replace(/[-_]+/g, ' ').trim() || '导入章节'
    let markdown: string
    if (!builtin) {
      if (!this.extensions) throw new DomainError('VALIDATION_FAILED', '只支持导入 Markdown 或 TXT 文件')
      const importer = this.extensions.getImporterForExtension(extension)
      if (importer.extensionId) this.extensions.assertPermissionsGranted(importer.extensionId, importer.permissions ?? [])
      let imported: { title: string; markdown: string }
      try { imported = await importer.import(sourcePath, { signal: new AbortController().signal }) } catch (error) {
        if (error instanceof DomainError) throw error
        throw new DomainError('IO_ERROR', `扩展导入失败: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (typeof imported.title !== 'string' || typeof imported.markdown !== 'string' || imported.markdown.length > 2_000_000) throw new DomainError('VALIDATION_FAILED', '扩展导入器返回的章节内容无效')
      fallbackTitle = imported.title.trim() || fallbackTitle
      markdown = imported.markdown
    } else {
      let source: string
      try { source = await readFile(sourcePath, 'utf8') } catch { throw new DomainError('IO_ERROR', '无法读取要导入的文件') }
      if (source.length > 2_000_000) throw new DomainError('VALIDATION_FAILED', '导入文件不能超过 2MB')
      markdown = extension === '.txt' ? `# ${title?.trim() || fallbackTitle}\n\n${source}` : source
    }
    const chapterTitle = titleFromMarkdown(markdown, title?.trim() || fallbackTitle)
    const created = await this.create(chapterTitle)
    await this.save(created.relPath, markdown)
    return (await this.list()).find((chapter) => chapter.relPath === created.relPath) ?? created
  }

  async exportAll(format: ExportFormat, destination: string, options: ExportOptions = {}): Promise<{ destination: string; chapterCount: number }> {
    const projectRoot = this.project.getInfo()?.rootPath
    if (!projectRoot) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const destinationPath = resolve(destination)
    if (isInsideRoot(projectRoot, destinationPath)) throw new DomainError('PATH_DENIED', '导出文件不能覆盖项目内部文件')
    const builtin = ['markdown', 'plain', 'html'].includes(format)
    const extension = builtin ? (format === 'markdown' ? '.md' : format === 'plain' ? '.txt' : '.html') : `.${format}`
    const expectedExtension = extension
    if (extname(destinationPath).toLowerCase() !== expectedExtension) throw new DomainError('VALIDATION_FAILED', `导出文件扩展名必须是 ${expectedExtension}`)
    const metas = await this.list()
    const chapters = await Promise.all(metas.map((meta) => this.read(meta.relPath)))
    let content: string | Uint8Array
    if (!builtin) {
      if (!this.extensions) throw new DomainError('VALIDATION_FAILED', `没有支持 ${format} 的导出器`)
      const exporter = this.extensions.getExporter(format)
      if (exporter.extensionId) this.extensions.assertPermissionsGranted(exporter.extensionId, exporter.permissions ?? [])
      try { content = await exporter.export(chapters, { signal: new AbortController().signal }) } catch (error) {
        if (error instanceof DomainError) throw error
        throw new DomainError('IO_ERROR', `扩展导出失败: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (typeof content !== 'string' && !(content instanceof Uint8Array)) throw new DomainError('VALIDATION_FAILED', '扩展导出器返回的数据无效')
    } else {
      content = format === 'html' ? await renderHtml(chapters, projectRoot, options.cleanImageMetadata === true) : chapters.map((chapter) => format === 'plain' ? stripMarkdown(chapter.markdown) : chapter.markdown).join('\n\n---\n\n')
    }
    try { await atomicWriteFile(destinationPath, content) } catch (error) { throw new DomainError('IO_ERROR', `导出失败: ${error instanceof Error ? error.message : String(error)}`) }
    return { destination: destinationPath, chapterCount: chapters.length }
  }

  /**
   * Search chapters via FTS5 virtual-table LIKE (reliable for both
   * CJK and Latin; MVP scale is fine with a full scan on the FTS table).
   */
  async search(query: string): Promise<SearchHit[]> {
    const trimmed = query.trim()
    if (!trimmed) return []
    const like = `%${trimmed}%`
    const rows = this.db
      .prepare(
        `SELECT rel_path, title, content FROM documents_fts
         WHERE rel_path LIKE 'chapters/%' AND (content LIKE ? OR title LIKE ?)
         LIMIT 20`
      )
      .all(like, like) as Array<{ rel_path: string; title: string; content: string }>
    return rows.map((r) => {
      const idx = r.content.indexOf(trimmed)
      const start = Math.max(0, idx - 12)
      const seg = r.content.slice(start, start + 48)
      return { relPath: r.rel_path, title: r.title, snippet: `…${seg}…` }
    })
  }

  /** Insert/update both the documents table and the FTS index. */
  private async reindex(relPath: string, markdown: string): Promise<string> {
    const savedAt = new Date().toISOString()
    const title = titleFromMarkdown(markdown, basename(relPath, '.md'))
    const wordCount = countWords(markdown)
    const hash = randomBytes(8).toString('hex')
    const db = this.db
    db.prepare(
      `INSERT INTO documents(id, kind, rel_path, title, hash, updated_at, word_count)
       VALUES(?, 'chapter', ?, ?, ?, ?, ?)
       ON CONFLICT(rel_path) DO UPDATE SET
         title=excluded.title, hash=excluded.hash,
         updated_at=excluded.updated_at, word_count=excluded.word_count`
    ).run(randomBytes(8).toString('hex'), relPath, title, hash, savedAt, wordCount)
    // FTS5 has no ON CONFLICT — delete + insert
    db.prepare('DELETE FROM documents_fts WHERE rel_path = ?').run(relPath)
    db.prepare('INSERT INTO documents_fts(rel_path, title, content) VALUES(?, ?, ?)').run(
      relPath,
      title,
      markdown
    )
    return savedAt
  }

  /** Rebuild the FTS index from all chapter files (repair hook). */
  async rebuildIndex(): Promise<void> {
    this.db.exec('DELETE FROM documents_fts')
    this.db.exec("DELETE FROM documents WHERE kind = 'chapter'")
    for (const meta of await this.list()) {
      try {
        const content = await readFile(this.project.resolveInProject(meta.relPath), 'utf8')
        await this.reindex(meta.relPath, content)
      } catch {
        // skip unreadable file
      }
    }
  }
}

function stripMarkdown(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*+]\s+/gm, '').replace(/[*_~`]/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

interface TimelineRow { id: string; title: string; at: string | null; description: string; chapter_rel_path: string | null; entity_ids_json: string; location_id?: string | null; causes?: string; effects?: string; updated_at: string }
function toTimeline(row: TimelineRow) {
  let entityIds: unknown = []
  try { entityIds = JSON.parse(row.entity_ids_json) } catch { entityIds = [] }
  return { id: row.id, title: row.title, at: row.at, description: row.description, chapterRelPath: row.chapter_rel_path, entityIds: Array.isArray(entityIds) ? entityIds : [], locationId: row.location_id ?? null, causes: row.causes ?? '', effects: row.effects ?? '', updatedAt: row.updated_at }
}

const markdownRenderer = new MarkdownIt({ html: false, breaks: true, linkify: false })

async function renderHtml(chapters: ChapterContent[], projectRoot: string, cleanImageMetadata: boolean): Promise<string> {
  const body = (await Promise.all(chapters.map(async (chapter) => {
    const rendered = markdownRenderer.render(chapter.markdown)
    return `<article><h1>${escapeHtml(chapter.title)}</h1>${await embedExportImages(rendered, projectRoot, cleanImageMetadata)}</article>`
  }))).join('\n')
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Novel Studio Export</title><style>body{max-width:860px;margin:40px auto;padding:0 24px;font:16px/1.8 system-ui,sans-serif;color:#222}article{margin-bottom:56px}img{max-width:100%;height:auto}h1{line-height:1.3}</style></head><body>${body}</body></html>\n`
}

async function embedExportImages(html: string, projectRoot: string, cleanImageMetadata: boolean): Promise<string> {
  const sources = [...html.matchAll(/src="((?:\.\.?\/)?assets\/[^"?#]+)"/g)].map((match) => match[1])
  const replacements = await Promise.all([...new Set(sources)].map(async (source) => {
    const projectPath = source.replace(/^(?:\.\.?\/)+/, '')
    if (!projectPath.startsWith('assets/')) return [source, missingExportImage()] as const
    try {
      const rawData = await readFile(resolveInsideRoot(projectRoot, projectPath))
      const data = cleanImageMetadata ? Buffer.from(stripImageMetadata(rawData, exportImageMime(projectPath))) : rawData
      return [source, `data:${exportImageMime(projectPath)};base64,${data.toString('base64')}`] as const
    } catch { return [source, missingExportImage()] as const }
  }))
  return replacements.reduce((result, [source, dataUrl]) => result.replaceAll(`src="${source}"`, `src="${dataUrl}"`), html)
}

function exportImageMime(path: string): string {
  const extension = extname(path).toLowerCase()
  return extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.webp' ? 'image/webp' : extension === '.gif' ? 'image/gif' : 'image/png'
}

function missingExportImage(): string {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180"><rect width="640" height="180" rx="12" fill="#eee"/><text x="24" y="96" fill="#555" font-family="sans-serif" font-size="22">图片资产不可用</text></svg>'
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
