import { randomBytes } from 'node:crypto'
import { stringify } from 'yaml'
import type { ProjectService } from './project-service'
import { atomicWriteFile } from './atomic-fs'
import type { Revision } from '../../shared/revision'
import { DomainError } from './errors'
import type { ChapterService } from './chapter-service'

export class RevisionService {
  constructor(private readonly project: ProjectService, private readonly chapters?: ChapterService) {}
  async create(input: Omit<Revision, 'id' | 'createdAt'>): Promise<Revision> {
    const revision: Revision = { ...input, id: `rev_${randomBytes(10).toString('hex')}`, createdAt: new Date().toISOString() }
    this.project.database.raw.prepare(`INSERT INTO revisions(id, rel_path, actor, source, original, replacement, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)`).run(revision.id, revision.relPath, revision.actor, revision.source, revision.original, revision.replacement, revision.createdAt)
    await atomicWriteFile(this.project.resolveInProject(`.novel/revisions/${revision.id}.yaml`), stringify(revision))
    return revision
  }

  async list(relPath?: string): Promise<Revision[]> {
    const rows = (relPath
      ? this.project.database.raw.prepare('SELECT * FROM revisions WHERE rel_path = ? ORDER BY created_at DESC').all(relPath)
      : this.project.database.raw.prepare('SELECT * FROM revisions ORDER BY created_at DESC').all()) as unknown as RevisionRow[]
    return rows.map(toRevision)
  }

  async get(id: string): Promise<Revision> {
    const row = this.project.database.raw.prepare('SELECT * FROM revisions WHERE id = ?').get(id) as unknown as RevisionRow | undefined
    if (!row) throw new DomainError('PROJECT_NOT_FOUND', `Revision 不存在: ${id}`)
    return toRevision(row)
  }

  async revert(id: string): Promise<{ relPath: string; revisionId: string }> {
    if (!this.chapters) throw new DomainError('VALIDATION_FAILED', '当前环境未配置章节回退能力')
    const revision = await this.get(id); const chapter = await this.chapters.read(revision.relPath)
    if (chapter.markdown !== revision.replacement) throw new DomainError('VALIDATION_FAILED', '章节已经发生后续修改，拒绝覆盖；请先查看 Diff')
    const inverse = await this.create({ relPath: revision.relPath, actor: 'human', source: `revert:${revision.id}`, original: chapter.markdown, replacement: revision.original })
    await this.chapters.save(revision.relPath, revision.original)
    return { relPath: revision.relPath, revisionId: inverse.id }
  }
}

interface RevisionRow { id: string; rel_path: string; actor: Revision['actor']; source: string; original: string; replacement: string; created_at: string }
const toRevision = (row: RevisionRow): Revision => ({ id: row.id, relPath: row.rel_path, actor: row.actor, source: row.source, original: row.original, replacement: row.replacement, createdAt: row.created_at })
