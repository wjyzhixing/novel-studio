import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { DomainError } from '../src/main/services/errors'
import { makeTempRoot } from './helpers'
import { parse } from 'yaml'

function makeService(recentsFile: string): ProjectService {
  return new ProjectService(new RecentProjectsStore(recentsFile))
}

describe('ProjectService', () => {
  it('creates a project with the full blueprint §6 scaffold', async () => {
    const root = await makeTempRoot()
    const empty = join(root, 'my-novel')
    const svc = makeService(join(root, 'recents.json'))

    const info = await svc.create(empty, '赛博长安')
    expect(info.manifest.title).toBe('赛博长安')
    expect(info.manifest.schemaVersion).toBe(1)
    expect(info.manifest.projectId).toMatch(/^proj_/)

    expect(existsSync(join(empty, 'novel.yaml'))).toBe(true)
    expect(existsSync(join(empty, 'chapters'))).toBe(true)
    expect(existsSync(join(empty, 'story/premise.md'))).toBe(true)
    expect(existsSync(join(empty, 'world/places'))).toBe(true)
    expect(existsSync(join(empty, 'assets/covers'))).toBe(true)
    expect(existsSync(join(empty, 'story/volumes.yaml'))).toBe(true)
    expect(parse(await readFile(join(empty, 'story/volumes.yaml'), 'utf8'))).toEqual({ version: 1, volumes: [] })
    expect(await readFile(join(empty, 'chapters/001-第一章.md'), 'utf8')).toBe('# 第一章\n\n')
    expect(existsSync(join(empty, 'DIRECTORY.md'))).toBe(true)
    expect(existsSync(join(empty, '.novel/project.db'))).toBe(true)
    expect(await readFile(join(empty, '.gitignore'), 'utf8')).toContain('.novel/')
    expect((svc.database.raw.prepare("SELECT COUNT(*) AS count FROM entities").get() as { count: number }).count).toBe(0)
    expect((await import('../src/main/services/chapter-service')).ChapterService).toBeDefined()

    const doc = parse(await readFile(join(empty, 'novel.yaml'), 'utf8'))
    expect(doc.title).toBe('赛博长安')

    // db is open and migrated
    expect(svc.database.getSetting('anything')).toBeNull()
    await svc.close()
  })

  it('rebuilds indexes for legacy image sidecars without parsing embedded image bytes', async () => {
    const root = await makeTempRoot(); const dir = join(root, 'legacy-images'); const svc = makeService(join(root, 'recents.json'))
    await svc.create(dir, 'Legacy images')
    const assetId = 'asset_legacy-image'
    await writeFile(join(dir, 'assets/scenes', `${assetId}.png`), Buffer.from([137, 80, 78, 71]))
    await writeFile(join(dir, 'assets/scenes', `${assetId}.yaml`), `assetId: ${assetId}\nrelPath: assets/scenes/${assetId}.png\nmimeType: image/png\nprovider: legacy\nmodel: legacy\nprompt: old image\nreferences: []\ncreatedAt: 2026-01-01T00:00:00.000Z\ndata:\n  - 1\n  - 2\n` + ' '.repeat(1_000_010))
    const report = await svc.checkIntegrity()
    expect(report.assetsOnDisk).toBe(1)
    expect(report.invalidSourceFiles).not.toContain(`assets/scenes/${assetId}.yaml`)
    const repaired = await svc.repairIndexes()
    expect(repaired.assets).toBe(1)
    expect((svc.database.raw.prepare('SELECT COUNT(*) AS count FROM assets').get() as { count: number }).count).toBe(1)
    await svc.close()
  })

  it('refuses to create a project in a non-empty directory', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'occupied')
    await mkdir(dir)
    await writeFile(join(dir, 'some-file.txt'), 'x')
    const svc = makeService(join(root, 'recents.json'))
    await expect(svc.create(dir, 'T')).rejects.toMatchObject({ code: 'DIR_NOT_EMPTY' })
  })

  it('opens an existing project and records a recent entry', async () => {
    const root = await makeTempRoot()
    const recentsFile = join(root, 'recents.json')
    const dir = join(root, 'p1')
    const svc = makeService(recentsFile)
    await svc.create(dir, '书一')
    await svc.close()

    const svc2 = makeService(recentsFile)
    const info = await svc2.open(dir)
    expect(info.manifest.title).toBe('书一')
    // macOS /var → /private/var: open() canonicalizes via realpath
    const canonicalDir = await realpath(dir)
    expect(svc2.getInfo()?.rootPath).toBe(canonicalDir)
    expect(svc2.resolveInProject('chapters/001.md')).toBe(join(canonicalDir, 'chapters/001.md'))

    const recents = await new RecentProjectsStore(recentsFile).list()
    expect(recents[0].path).toBe(canonicalDir)
    await svc2.close()
  })

  it('persists Art Direction in the project manifest', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'art-direction')
    const svc = makeService(join(root, 'recents.json'))
    await svc.create(dir, '视觉小说')

    const info = await svc.setArtDirection('水彩绘本，柔和蓝紫色，电影感构图')
    expect(info.manifest.artDirection).toBe('水彩绘本，柔和蓝紫色，电影感构图')
    expect(svc.getInfo()?.manifest.artDirection).toBe(info.manifest.artDirection)
    expect(parse(await readFile(join(dir, 'novel.yaml'), 'utf8')).artDirection).toBe(info.manifest.artDirection)
    await svc.close()
  })

  it('rejects opening a folder without novel.yaml', async () => {
    const root = await makeTempRoot()
    const svc = makeService(join(root, 'r.json'))
    await expect(svc.open(root)).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    await expect(svc.open(join(root, 'does-not-exist'))).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
  })

  it('rejects a corrupt novel.yaml with INVALID_PROJECT and issue details', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'broken')
    const svc = makeService(join(root, 'r.json'))
    await svc.create(dir, '书')
    await svc.close()
    await writeFile(join(dir, 'novel.yaml'), 'title: ""\nschemaVersion: "x"\n')

    const svc2 = makeService(join(root, 'r.json'))
    try {
      await svc2.open(dir)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('INVALID_PROJECT')
      expect(Array.isArray((e as DomainError).details)).toBe(true)
    }
  })

  it('rejects projects with a newer schemaVersion', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'future')
    const svc = makeService(join(root, 'r.json'))
    await svc.create(dir, '书')
    await svc.close()
    await writeFile(join(dir, 'novel.yaml'), 'projectId: proj_x\ntitle: 书\ncreatedAt: "2026-01-01"\nschemaVersion: 99\n')

    const svc2 = makeService(join(root, 'r.json'))
    await expect(svc2.open(dir)).rejects.toMatchObject({ code: 'PROJECT_TOO_NEW' })
  })

  it('close() is idempotent and getInfo() nulls out', async () => {
    const root = await makeTempRoot()
    const svc = makeService(join(root, 'r.json'))
    await svc.create(join(root, 'p'), '书')
    await svc.close()
    await svc.close()
    expect(svc.getInfo()).toBeNull()
    expect(() => svc.resolveInProject('x')).toThrow(DomainError)
    expect(() => svc.database).toThrow(DomainError)
  })

  it('seeds the reusable Little Cow story without touching workflows or assets', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'cow')
    const svc = makeService(join(root, 'r.json'))
    await svc.create(dir, '原项目')
    await writeFile(join(dir, 'chapters/099-old.md'), '# 旧章节\n\n旧内容')
    await writeFile(join(dir, 'assets/covers/keep.txt'), 'keep')
    const workflow = await readFile(join(dir, 'workflows/flow_builtin_novel.novelflow.json'), 'utf8')

    await svc.seedMockStory()

    const chapters = (await import('../src/main/services/chapter-service')).ChapterService
    const chapterList = await new chapters(svc).list()
    expect(chapterList.map((chapter) => chapter.title)).toEqual([
      '小牛第一次看见星星',
      '小牛穿过会发光的草地',
      '小牛把星星带回家'
    ])
    expect(await readFile(join(dir, 'assets/covers/keep.txt'), 'utf8')).toBe('keep')
    expect(await readFile(join(dir, 'workflows/flow_builtin_novel.novelflow.json'), 'utf8')).toBe(workflow)
    expect(svc.database.raw.prepare('SELECT COUNT(*) AS count FROM entities').get()).toMatchObject({ count: 5 })
    expect(svc.database.raw.prepare('SELECT COUNT(*) AS count FROM timeline_events').get()).toMatchObject({ count: 4 })
    expect(svc.database.raw.prepare('SELECT COUNT(*) AS count FROM documents WHERE kind = \'chapter\'').get()).toMatchObject({ count: 3 })
    await svc.close()
  })
})
