import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { ChapterService } from '../src/main/services/chapter-service'
import { makeTempRoot } from './helpers'

describe('load baseline', () => {
  it('indexes 1000 chapters and 100000 facts within local smoke-test limits', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Load baseline'); const chapters = new ChapterService(project)
    for (let index = 0; index < 1000; index++) await chapters.create(`章节 ${index + 1}`)
    const db = project.database.raw; db.exec('BEGIN'); const insert = db.prepare('INSERT INTO facts(id, subject_id, predicate, object_json, valid_from, valid_to, confidence, source_document_id, source_start, source_end, canonical, created_at) VALUES(?, ?, ?, ?, NULL, NULL, 1, ?, 0, 1, 1, ?)'); const now = new Date().toISOString(); for (let index = 0; index < 100_000; index++) insert.run(`fact_load_${index}`, `ent_${index % 1000}`, 'status.value', JSON.stringify(index), `ch_${index % 1000}`, now); db.exec('COMMIT')
    expect((db.prepare('SELECT COUNT(*) AS count FROM facts').get() as { count: number }).count).toBe(100_000)
    const started = performance.now(); expect(await chapters.search('章节 500')).not.toEqual([]); expect(performance.now() - started).toBeLessThan(1_000)
  }, 60_000)
})
