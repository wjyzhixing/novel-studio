import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { VolumeService } from '../src/main/services/volume-service'
import { makeTempRoot } from './helpers'

describe('VolumeService', () => {
  it('accepts and normalizes legacy volumes files without a version field', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const info = await project.create(join(root, 'novel'), 'Legacy volumes')
    await project.close()
    await (await import('node:fs/promises')).writeFile(join(info.rootPath, 'story/volumes.yaml'), 'volumes: []\n')
    await project.open(info.rootPath)

    const volumes = await new VolumeService(project).list()
    expect(volumes).toEqual([])
    expect(parse(await readFile(join(info.rootPath, 'story/volumes.yaml'), 'utf8'))).toEqual({ version: 1, volumes: [] })
  })

  it('normalizes legacy volume entries with chapters and missing audit fields', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const info = await project.create(join(root, 'novel'), 'Legacy volume entries')
    await writeFile(join(info.rootPath, 'story/volumes.yaml'), `volumes:
  - id: volume_legacy
    title: 第一卷
    chapters:
      - chapters/001-第一章.md
`)

    const volumes = await new VolumeService(project).list()
    expect(volumes).toEqual([expect.objectContaining({ id: 'volume_legacy', title: '第一卷', order: 0, chapterRelPaths: ['chapters/001-第一章.md'], createdAt: expect.any(String), updatedAt: expect.any(String) })])
    expect(parse(await readFile(join(info.rootPath, 'story/volumes.yaml'), 'utf8'))).toMatchObject({ version: 1, volumes: [{ id: 'volume_legacy', chapterRelPaths: ['chapters/001-第一章.md'] }] })
    await project.close()
  })

  it('manages volume lifecycle, chapter ownership, ordering, and safety checks', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const info = await project.create(join(root, 'novel'), 'Volume lifecycle')
    await project.open(info.rootPath)
    const service = new VolumeService(project)

    const first = await service.create({ title: '  第一卷  ' })
    const second = await service.create({ title: '第二卷' })
    expect(first.title).toBe('第一卷')
    expect(second.order).toBe(1)

    const renamed = await service.update({ id: first.id, title: '序章卷' })
    expect(renamed.title).toBe('序章卷')
    await expect(service.update({ id: 'volume_missing', title: '不存在' })).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })

    await writeFile(join(info.rootPath, 'chapters/001-first.md'), '# 第一章\n')
    await expect(service.assignChapter(first.id, 'chapters/missing.md')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    let volumes = await service.assignChapter(first.id, 'chapters/001-first.md')
    expect(volumes.find((volume) => volume.id === first.id)?.chapterRelPaths).toEqual(['chapters/001-first.md'])
    volumes = await service.assignChapter(second.id, 'chapters/001-first.md')
    expect(volumes.find((volume) => volume.id === first.id)?.chapterRelPaths).toEqual([])
    expect(volumes.find((volume) => volume.id === second.id)?.chapterRelPaths).toEqual(['chapters/001-first.md'])

    await expect(service.remove(second.id)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    volumes = await service.unassignChapter('chapters/001-first.md')
    expect(volumes.every((volume) => volume.chapterRelPaths.length === 0)).toBe(true)
    volumes = await service.reorder([second.id, first.id])
    expect(volumes.map((volume) => volume.id)).toEqual([second.id, first.id])
    await service.remapChapter('chapters/unused.md', 'chapters/001-first.md')
    await service.remove(first.id)
    await service.remove(second.id)
    expect(await service.list()).toEqual([])
  })
})
