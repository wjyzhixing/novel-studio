import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProjectService, migrateManifestFile } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { DomainError } from '../src/main/services/errors'
import { makeTempRoot } from './helpers'
import { parse } from 'yaml'

function makeService(recentsFile: string): ProjectService {
  return new ProjectService(new RecentProjectsStore(recentsFile))
}

describe('ProjectService', () => {
  it('restores the original manifest when a file schema migration fails', async () => {
    const root = await makeTempRoot()
    const manifestPath = join(root, 'novel.yaml')
    const original = `projectId: proj_legacy\ntitle: 旧项目\nlanguage: zh-CN\ncreatedAt: '2026-01-01T00:00:00.000Z'\nschemaVersion: 1\ndefaultWorkflow: null\nartDirection: ''\nproviderProfile: null\n`
    await writeFile(manifestPath, original)

    await expect(migrateManifestFile(manifestPath, [
      { fromVersion: 1, toVersion: 2, name: 'rename-title', up: (manifest) => ({ ...manifest, title: '迁移中的项目' }) },
      { fromVersion: 2, toVersion: 3, name: 'broken-migration', up: () => { throw new Error('fixture manifest migration failure') } }
    ])).rejects.toThrow('broken-migration')

    expect(await readFile(manifestPath, 'utf8')).toBe(original)
  })

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
    expect(await readFile(join(empty, 'prompts/agent-image-prompt.md'), 'utf8')).toContain('Image Prompt Agent')
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

  it('reports structurally valid but dangling relation and timeline source references', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'dangling-source-references')
    const svc = makeService(join(root, 'recents.json'))
    await svc.create(dir, '引用完整性')
    await writeFile(join(dir, 'story/relations.yaml'), `relations:
  - id: rel_missing_entity
    fromId: ent_missing_from
    relationType: knows
    toId: ent_missing_to
    metadata: {}
`)
    await writeFile(join(dir, 'story/timeline.yaml'), `events:
  - id: evt_missing_refs
    title: 悬空事件
    at: null
    description: ''
    chapterRelPath: chapters/999-不存在.md
    entityIds:
      - ent_missing
    locationId: ent_missing_location
    causes: ''
    effects: ''
`)

    const report = await svc.checkIntegrity()
    expect(report.invalidSourceFiles).toEqual(expect.arrayContaining([
      'story/relations.yaml#relations[0].fromId',
      'story/relations.yaml#relations[0].toId',
      'story/timeline.yaml#events[0].chapterRelPath',
      'story/timeline.yaml#events[0].entityIds[0]',
      'story/timeline.yaml#events[0].locationId'
    ]))
    const repaired = await svc.repairIndexes()
    expect(repaired.invalidSourceFiles).toEqual(expect.arrayContaining([
      'story/relations.yaml#relations[0].fromId',
      'story/relations.yaml#relations[0].toId',
      'story/timeline.yaml#events[0].chapterRelPath',
      'story/timeline.yaml#events[0].entityIds[0]',
      'story/timeline.yaml#events[0].locationId'
    ]))
    expect(repaired.invalidSourceDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'story/relations.yaml', issues: expect.arrayContaining(['relations[0].fromId', 'relations[0].toId']) }),
      expect.objectContaining({ path: 'story/timeline.yaml', issues: expect.arrayContaining(['events[0].chapterRelPath', 'events[0].entityIds[0]', 'events[0].locationId']) })
    ]))
    await svc.close()
  })

  it('reports asset sidecars whose metadata points to a missing image file', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'dangling-asset-source')
    const svc = makeService(join(root, 'recents.json'))
    await svc.create(dir, '图片引用完整性')
    await writeFile(join(dir, 'assets/scenes/asset_missing-image.yaml'), `assetId: asset_missing-image
relPath: assets/scenes/asset_missing-image.png
mimeType: image/png
provider: fixture
model: fixture
prompt: missing image
references: []
createdAt: 2026-01-01T00:00:00.000Z
`)

    const report = await svc.checkIntegrity()
    expect(report.invalidSourceFiles).toContain('assets/scenes/asset_missing-image.yaml#relPath')
    const repaired = await svc.repairIndexes()
    expect(repaired.invalidSourceFiles).toContain('assets/scenes/asset_missing-image.yaml#relPath')
    await svc.close()
  })

  it('preserves malformed entity sources and reports them during index repair', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'malformed-entity-source')
    const svc = makeService(join(root, 'recents.json'))
    await svc.create(dir, '损坏实体源')
    const sourcePath = join(dir, 'characters/entity-broken.yaml')
    const original = 'id: ent_broken\nname: [无法闭合\n'
    await writeFile(sourcePath, original)

    const report = await svc.checkIntegrity()
    expect(report.invalidSourceFiles).toContain('characters/entity-broken.yaml')

    const repaired = await svc.repairIndexes()
    expect(repaired.invalidSourceFiles).toContain('characters/entity-broken.yaml')
    expect(repaired.invalidSourceDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'characters/entity-broken.yaml', issues: expect.arrayContaining(['schema validation failed']) })
    ]))
    expect(await readFile(sourcePath, 'utf8')).toBe(original)
    expect((svc.database.raw.prepare('SELECT COUNT(*) AS count FROM entities').get() as { count: number }).count).toBe(0)
    await svc.close()
  })

  it('reports malformed relation and timeline lists without aborting index repair', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'malformed-story-sources')
    const svc = makeService(join(root, 'recents.json'))
    await svc.create(dir, '损坏故事源')
    await writeFile(join(dir, 'story/relations.yaml'), 'relations:\n  - id: rel_broken\n    metadata: [\n')
    await writeFile(join(dir, 'story/timeline.yaml'), 'events:\n  - id: evt_broken\n    title: [\n')

    const report = await svc.checkIntegrity()
    expect(report.invalidSourceFiles).toEqual(expect.arrayContaining(['story/relations.yaml', 'story/timeline.yaml']))

    const repaired = await svc.repairIndexes()
    expect(repaired.invalidSourceFiles).toEqual(expect.arrayContaining(['story/relations.yaml', 'story/timeline.yaml']))
    expect(await readFile(join(dir, 'story/relations.yaml'), 'utf8')).toContain('metadata: [')
    expect(await readFile(join(dir, 'story/timeline.yaml'), 'utf8')).toContain('title: [')
    await svc.close()
  })

  it('reports invalid Story Bible artifacts with identity and validation details', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'invalid-artifact-details')
    const svc = makeService(join(root, 'recents.json'))
    await svc.create(dir, '异常设定报告')
    const sourcePath = join(dir, 'story/artifacts.yaml')
    const original = `artifacts:\n  - id: art_broken\n    kind: foreshadowing\n    title: 未完成伏笔\n    fields:\n      setup: 已出现\n      status: invalid-status\n    notes: 保留原文\n`
    await writeFile(sourcePath, original)

    const report = await svc.checkIntegrity()
    expect(report.invalidStoryArtifactDetails).toEqual([expect.objectContaining({ id: 'art_broken', kind: 'foreshadowing', title: '未完成伏笔', issues: expect.arrayContaining([expect.stringContaining('fields')]) })])
    expect(report.invalidStoryArtifacts).toBe(1)

    const repaired = await svc.repairIndexes()
    expect(repaired.invalidStoryArtifactDetails).toEqual([expect.objectContaining({ id: 'art_broken', title: '未完成伏笔' })])
    expect(repaired.invalidStoryArtifacts).toBe(1)
    expect(await readFile(sourcePath, 'utf8')).toBe(original)
    await svc.close()
  })

  it('reports and restores a missing volumes source with the safe default schema', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'missing-volumes-source')
    const svc = makeService(join(root, 'recents.json'))
    const info = await svc.create(dir, '缺失卷文件')
    await (await import('node:fs/promises')).unlink(join(info.rootPath, 'story/volumes.yaml'))

    const report = await svc.checkIntegrity()
    expect(report.missingFiles).toContain('story/volumes.yaml')

    const repaired = await svc.repairIndexes()
    expect(repaired.restoredSources).toContain('story/volumes.yaml')
    expect(parse(await readFile(join(info.rootPath, 'story/volumes.yaml'), 'utf8'))).toEqual({ version: 1, volumes: [] })
    await svc.close()
  })

  it('reports a malformed volumes source during integrity repair without overwriting it', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'malformed-volumes-source')
    const svc = makeService(join(root, 'recents.json'))
    const info = await svc.create(dir, '损坏卷文件')
    const original = 'version: 1\nvolumes:\n  - id: [无法闭合\n'
    await (await import('node:fs/promises')).writeFile(join(info.rootPath, 'story/volumes.yaml'), original)

    const report = await svc.checkIntegrity()
    expect(report.invalidSourceFiles).toContain('story/volumes.yaml')

    const repaired = await svc.repairIndexes()
    expect(repaired.invalidSourceFiles).toContain('story/volumes.yaml')
    expect(repaired.invalidSourceDetails).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'story/volumes.yaml' })]))
    expect(await readFile(join(info.rootPath, 'story/volumes.yaml'), 'utf8')).toBe(original)
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

  it('restores a default first chapter when an older project has no chapters', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'empty-legacy')
    const svc = makeService(join(root, 'recents.json'))
    await svc.create(dir, 'Untitled')
    await svc.close()
    await (await import('node:fs/promises')).unlink(join(dir, 'chapters/001-第一章.md'))

    await svc.open(dir)
    expect(await readFile(join(dir, 'chapters/001-第一章.md'), 'utf8')).toBe('# 第一章\n\n')
    await svc.close()
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

  it('keeps the project context when database close fails', async () => {
    const root = await makeTempRoot()
    const svc = makeService(join(root, 'r.json'))
    await svc.create(join(root, 'close-failure'), '关闭失败')
    const database = svc.database
    const close = vi.spyOn(database, 'close').mockRejectedValueOnce(new Error('database is busy'))

    await expect(svc.close()).rejects.toThrow('database is busy')
    expect(svc.getInfo()?.manifest.title).toBe('关闭失败')

    close.mockRestore()
    await svc.close()
  })

  it('seeds the reusable Little Cow story without touching workflows or assets', async () => {
    const root = await makeTempRoot()
    const dir = join(root, 'cow')
    const svc = makeService(join(root, 'r.json'))
    await svc.create(dir, '原项目')
    await writeFile(join(dir, 'chapters/099-old.md'), '# 旧章节\n\n旧内容')
    svc.database.raw.prepare('INSERT INTO entities(id, kind, name, aliases_json, fields_json, notes, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)').run('ent_old', 'character', '旧角色', '[]', '{}', '', new Date().toISOString())
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
    expect(svc.database.raw.prepare('SELECT COUNT(*) AS count FROM entities WHERE id = ?').get('ent_old')).toMatchObject({ count: 0 })
    expect(svc.database.raw.prepare('SELECT COUNT(*) AS count FROM timeline_events').get()).toMatchObject({ count: 4 })
    expect(svc.database.raw.prepare('SELECT COUNT(*) AS count FROM documents WHERE kind = \'chapter\'').get()).toMatchObject({ count: 3 })
    await svc.close()
  })
})
