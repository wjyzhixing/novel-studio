import { describe, expect, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ChapterService } from '../src/main/services/chapter-service'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { openProjectAndSyncChapterIndex, syncChapterIndex } from '../src/main/services/project-open-service'
import { makeTempRoot } from './helpers'

describe('project open chapter index synchronization', () => {
  it('wires chapter synchronization into both project lifecycle IPC handlers', async () => {
    const ipc = await readFile(new URL('../src/main/ipc.ts', import.meta.url), 'utf8')

    expect(ipc).toContain('await syncChapterIndex(chapterService)')
    expect(ipc).toContain('openProjectAndSyncChapterIndex(projectService, chapterService, v)')
  })

  it('reindexes the default chapter created with a new project', async () => {
    const root = await makeTempRoot()
    const service = new ProjectService(new RecentProjectsStore(join(root, 'recents.json')))
    const chapters = new ChapterService(service)

    await service.create(join(root, 'new-project'), '新项目')
    await syncChapterIndex(chapters)

    expect(service.database.raw.prepare("SELECT COUNT(*) AS count FROM documents WHERE kind = 'chapter'").get()).toMatchObject({ count: 1 })
    await service.close()
  })

  it('reindexes chapters from disk when an existing project is opened', async () => {
    const root = await makeTempRoot()
    const projectRoot = join(root, 'existing-project')
    const service = new ProjectService(new RecentProjectsStore(join(root, 'recents.json')))
    const chapters = new ChapterService(service)
    await service.create(projectRoot, '已有项目')
    await service.close()
    await mkdir(join(projectRoot, 'chapters'), { recursive: true })
    await writeFile(join(projectRoot, 'chapters/002-第二章.md'), '# 第二章\n\n')

    await openProjectAndSyncChapterIndex(service, chapters, projectRoot)

    expect(service.database.raw.prepare("SELECT COUNT(*) AS count FROM documents WHERE kind = 'chapter'").get()).toMatchObject({ count: 2 })
    const report = await service.checkIntegrity()
    expect(report.chaptersIndexed).toBe(report.chaptersOnDisk)
    expect(report.warnings).not.toContain('章节文件 2 个，但索引 1 个')
    await service.close()
  })
})
