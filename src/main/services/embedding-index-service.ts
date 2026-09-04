import { createHash } from 'node:crypto'
import type { SearchHit } from '../../shared/chapter'
import type { ProviderProfile } from '../../shared/ai'
import type { ProjectService } from './project-service'
import type { ChapterService } from './chapter-service'
import type { AiService } from './ai-service'

interface EmbeddingRow { rel_path: string; model: string; dimensions: number; vector_json: string; content_hash: string; title: string; preview: string; updated_at: string }

/** Rebuildable semantic index. Chapter Markdown remains the source of truth. */
export class EmbeddingIndexService {
  constructor(private readonly project: ProjectService, private readonly chapters: ChapterService, private readonly ai: AiService) {}

  async search(query: string, limit: number): Promise<{ hits: SearchHit[]; method: 'embedding' | 'fts' } | null> {
    const profile = await this.profile()
    if (!profile?.embeddingModel || limit <= 0) return null
    try {
      await this.sync(profile)
      const [queryVector] = (await this.ai.embed(profile.id, [query])).vectors
      if (!queryVector?.length) return null
      const rows = this.project.database.raw.prepare('SELECT rel_path, model, dimensions, vector_json, content_hash, title, preview, updated_at FROM embeddings WHERE model = ?').all(profile.embeddingModel) as unknown as EmbeddingRow[]
      return { method: 'embedding', hits: rows.map((row) => ({ row, score: cosine(queryVector, parseVector(row.vector_json)) })).filter((item) => Number.isFinite(item.score)).sort((a, b) => b.score - a.score).slice(0, limit).map(({ row }) => ({ relPath: row.rel_path, title: row.title, snippet: row.preview })) }
    } catch {
      return null
    }
  }

  async sync(profile?: ProviderProfile): Promise<{ indexed: number; removed: number }> {
    const selected = profile ?? await this.profile()
    if (!selected?.embeddingModel) return { indexed: 0, removed: 0 }
    const metas = await this.chapters.list()
    const current = new Set(metas.map((meta) => meta.relPath))
    const db = this.project.database.raw
    const rows = db.prepare('SELECT rel_path, content_hash FROM embeddings WHERE model = ?').all(selected.embeddingModel) as unknown as Array<{ rel_path: string; content_hash: string }>
    const existing = new Map(rows.map((row) => [row.rel_path, row.content_hash]))
    const pending: Array<{ relPath: string; title: string; text: string; preview: string; hash: string }> = []
    for (const meta of metas) {
      const chapter = await this.chapters.read(meta.relPath)
      const hash = contentHash(chapter.markdown)
      if (existing.get(meta.relPath) !== hash) pending.push({ relPath: meta.relPath, title: chapter.title, text: chapter.markdown, preview: chapter.markdown.replace(/\s+/g, ' ').slice(0, 500), hash })
    }
    let indexed = 0
    if (pending.length) {
      const result = await this.ai.embed(selected.id, pending.map((item) => item.text))
      const now = new Date().toISOString()
      db.exec('BEGIN')
      try {
        for (const [index, item] of pending.entries()) {
          const vector = result.vectors[index]
          if (!vector?.length || vector.some((value) => !Number.isFinite(value))) throw new Error('Embedding 向量无效')
          db.prepare(`INSERT INTO embeddings(rel_path, model, dimensions, vector_json, content_hash, title, preview, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(rel_path) DO UPDATE SET model=excluded.model, dimensions=excluded.dimensions, vector_json=excluded.vector_json, content_hash=excluded.content_hash, title=excluded.title, preview=excluded.preview, updated_at=excluded.updated_at`).run(item.relPath, selected.embeddingModel, vector.length, JSON.stringify(vector), item.hash, item.title, item.preview, now)
          indexed++
        }
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    }
    const stale = rows.filter((row) => !current.has(row.rel_path))
    for (const row of stale) db.prepare('DELETE FROM embeddings WHERE rel_path = ? AND model = ?').run(row.rel_path, selected.embeddingModel)
    return { indexed, removed: stale.length }
  }

  private async profile(): Promise<ProviderProfile | undefined> {
    const id = this.project.getInfo()?.manifest.providerProfile
    if (!id) return undefined
    return (await this.ai.listProfiles()).find((profile) => profile.id === id)
  }
}

function contentHash(value: string): string { return createHash('sha256').update(value).digest('hex') }
function parseVector(value: string): number[] { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : [] } catch { return [] } }
function cosine(left: number[], right: number[]): number { if (left.length !== right.length || left.length === 0) return Number.NaN; const denominator = Math.hypot(...left) * Math.hypot(...right); return denominator === 0 ? Number.NaN : left.reduce((sum, value, index) => sum + value * right[index], 0) / denominator }
