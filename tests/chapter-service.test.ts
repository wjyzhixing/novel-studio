import { describe, expect, it, beforeEach } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project-service'
import { ChapterService } from '../src/main/services/chapter-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { DomainError } from '../src/main/services/errors'
import { makeTempRoot } from './helpers'

let projectRoot: string
let chapters: ChapterService
let project: ProjectService

beforeEach(async () => {
  const root = await makeTempRoot()
  projectRoot = join(root, 'proj')
  project = new ProjectService(new RecentProjectsStore(join(root, 'r.json')))
  await project.create(projectRoot, '测试书')
  chapters = new ChapterService(project)
  // New projects scaffold a 001-第一章.md placeholder; remove it so tests
  // start with an empty chapters/ directory.
  await chapters.remove('chapters/001-第一章.md')
})

describe('ChapterService.create', () => {
  it('creates a 001-slug.md file with heading', async () => {
    const meta = await chapters.create('第一章 雨夜')
    expect(meta.number).toBe(1)
    expect(meta.relPath).toBe('chapters/001-第一章-雨夜.md')
    expect(meta.title).toBe('第一章 雨夜')
    const file = join(projectRoot, 'chapters/001-第一章-雨夜.md')
    expect(existsSync(file)).toBe(true)
    expect(await readFile(file, 'utf8')).toBe('# 第一章 雨夜\n\n')
  })

  it('increments the chapter number for subsequent chapters', async () => {
    await chapters.create('a')
    const b = await chapters.create('b')
    expect(b.number).toBe(2)
    expect(b.relPath).toBe('chapters/002-b.md')
  })

  it('sanitizes bad characters in the slug', async () => {
    const meta = await chapters.create('标题:含/非法*字符?')
    expect(meta.relPath).toMatch(/^chapters\/001-标题含非法字符/)
  })

  it('records word_count and updated_at in the index', async () => {
    const meta = await chapters.create('字数测试')
    expect(meta.wordCount).toBe(4) // 4 CJK chars in the heading
    expect(meta.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('ChapterService.list / read', () => {
  it('lists chapters sorted by number with word counts from index', async () => {
    await chapters.create('alpha')
    await chapters.create('beta')
    const list = await chapters.list()
    expect(list.map((c) => c.number)).toEqual([1, 2])
    expect(list.every((c) => c.updatedAt)).toBeTruthy()
  })

  it('reads markdown and extracts title from heading', async () => {
    await chapters.create('雨夜')
    const c = await chapters.read('chapters/001-雨夜.md')
    expect(c.title).toBe('雨夜')
    expect(c.markdown).toContain('# 雨夜')
  })

  it('throws PROJECT_NOT_FOUND for missing file', async () => {
    await expect(chapters.read('chapters/999-missing.md')).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND'
    })
  })
})

describe('ChapterService.save (autosave + FTS index)', () => {
  it('writes the file atomically and updates index', async () => {
    await chapters.create('雨夜')
    const md = '# 雨夜\n\n雨水沿着屋檐落下，滴在青石板上。\n'
    const result = await chapters.save('chapters/001-雨夜.md', md)
    expect(result.wordCount).toBe(16)
    expect(await readFile(join(projectRoot, 'chapters/001-雨夜.md'), 'utf8')).toBe(md)
  })

  it('rejects .md extension mismatch', async () => {
    await expect(chapters.save('chapters/evil.txt', 'x')).rejects.toMatchObject({
      code: 'PATH_DENIED'
    })
  })

  it('rejects path traversal outside chapters/', async () => {
    await chapters.create('雨夜')
    await expect(chapters.save('chapters/../novel.yaml', 'x')).rejects.toMatchObject({
      code: 'PATH_DENIED'
    })
  })
})

describe('ChapterService.rename', () => {
  it('renames the chapter file, heading, and index path', async () => {
    await chapters.create('旧标题')
    const renamed = await chapters.rename('chapters/001-旧标题.md', '新标题')
    expect(renamed[0].relPath).toBe('chapters/001-新标题.md')
    expect(await readFile(join(projectRoot, 'chapters/001-新标题.md'), 'utf8')).toContain('# 新标题')
    expect(existsSync(join(projectRoot, 'chapters/001-旧标题.md'))).toBe(false)
  })
})

describe('ChapterService.search (FTS5 trigram + LIKE fallback)', () => {
  beforeEach(async () => {
    await chapters.create('雨夜')
    await chapters.save(
      'chapters/001-雨夜.md',
      '# 雨夜\n\n林默站在朱雀大街的拐角处，左手的伤口还在隐隐作痛。\n苏璃的声音从伞下传来。\n'
    )
  })

  it('finds CJK substring via trigram (≥3 chars)', async () => {
    const hits = await chapters.search('朱雀大街')
    expect(hits).toHaveLength(1)
    expect(hits[0].relPath).toBe('chapters/001-雨夜.md')
    expect(hits[0].snippet).toContain('朱雀大街')
  })

  it('falls back to LIKE for short CJK queries (2 chars)', async () => {
    const hits = await chapters.search('林默')
    expect(hits).toHaveLength(1)
    expect(hits[0].relPath).toBe('chapters/001-雨夜.md')
  })

  it('returns empty for non-matching query', async () => {
    const hits = await chapters.search('完全不存在的词组xyz')
    expect(hits).toEqual([])
  })
})

describe('ChapterService.move / remove', () => {
  it('renames files when moving to a new slot', async () => {
    await chapters.create('a')
    await chapters.create('b')
    await chapters.create('c')
    const list = await chapters.move('chapters/003-c.md', 0)
    expect(list.map((c) => c.number)).toEqual([1, 2, 3])
    expect(list[0].title).toBe('c')
    expect(existsSync(join(projectRoot, 'chapters/001-c.md'))).toBe(true)
    expect(existsSync(join(projectRoot, 'chapters/003-c.md'))).toBe(false)
  })

  it('preserves content when moving chapters with duplicate slugs', async () => {
    const first = await chapters.create('序章')
    const second = await chapters.create('序章')
    await chapters.save(first.relPath, '# 序章\n\n第一份正文\n')
    await chapters.save(second.relPath, '# 序章\n\n第二份正文\n')

    const list = await chapters.move(second.relPath, 0)

    expect(await readFile(join(projectRoot, list[0].relPath), 'utf8')).toContain('第二份正文')
    expect(await readFile(join(projectRoot, list[1].relPath), 'utf8')).toContain('第一份正文')
  })

  it('deletes file and index entries', async () => {
    await chapters.create('to-delete')
    await chapters.remove('chapters/001-to-delete.md')
    expect(existsSync(join(projectRoot, 'chapters/001-to-delete.md'))).toBe(false)
    expect(await chapters.list()).toHaveLength(0)
    expect(await chapters.search('to-delete')).toEqual([])
  })
})

describe('ChapterService.rebuildIndex', () => {
  it('restores FTS entries from chapter files on disk', async () => {
    await chapters.create('重建测试')
    await chapters.save('chapters/001-重建测试.md', '# 重建测试\n\n苏璃在伞下等待。\n')
    // simulate index loss
    project.database.raw.exec('DELETE FROM documents_fts')
    project.database.raw.exec("DELETE FROM documents WHERE kind = 'chapter'")
    expect(await chapters.search('苏璃')).toEqual([])
    await chapters.rebuildIndex()
    const hits = await chapters.search('苏璃')
    expect(hits).toHaveLength(1)
  })
})

describe('ChapterService.exportAll', () => {
  it('embeds project image assets in standalone HTML exports', async () => {
    const chapter = await chapters.create('带插图章节')
    await mkdir(join(projectRoot, 'assets/scenes'), { recursive: true })
    await writeFile(join(projectRoot, 'assets/scenes/asset_export.png'), Buffer.from([137, 80, 78, 71]))
    await chapters.save(chapter.relPath, '# 带插图章节\n\n![场景](../assets/scenes/asset_export.png "asset_export")\n')
    const destination = join(projectRoot, '..', 'standalone-export.html')
    await chapters.exportAll('html', destination)
    const html = await readFile(destination, 'utf8')
    expect(html).toContain('<img')
    expect(html).toContain('data:image/png;base64,iVBORw==')
  })
})

describe('ChapterService error handling', () => {
  it('throws NO_PROJECT_OPEN when no project is active', async () => {
    await project.close()
    await expect(chapters.list()).rejects.toMatchObject({ code: 'NO_PROJECT_OPEN' })
  })

  it('throws DomainError with correct code for missing relPath', async () => {
    try {
      await chapters.save('does-not-end-with-md', 'x')
      expect.unreachable('should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('PATH_DENIED')
    }
  })
})
