import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { ProjectService } from './project-service'
import { atomicWriteFile } from './atomic-fs'
import { DomainError } from './errors'
import { resolveInsideRoot } from './paths'
import { volumeChapterInputSchema, volumeCreateInputSchema, volumeFileSchema, volumeIdSchema, volumeReorderInputSchema, volumeSchema, volumeUpdateInputSchema, type Volume } from '../../shared/volume'

const VOLUME_FILE = 'story/volumes.yaml'

export class VolumeService {
  constructor(private readonly project: ProjectService) {}

  async list(): Promise<Volume[]> {
    try {
      const filePath = resolveInsideRoot(this.root(), VOLUME_FILE)
      const raw = parseYaml(await readFile(filePath, 'utf8')) as unknown
      const normalized = normalizeVolumeFile(raw)
      const parsed = volumeFileSchema.safeParse(normalized)
      if (!parsed.success) throw new DomainError('INVALID_PROJECT', 'story/volumes.yaml 格式无效')
      if (normalized !== raw) await atomicWriteFile(filePath, stringifyYaml(parsed.data))
      return parsed.data.volumes.map((volume) => volumeSchema.parse(volume)).sort((a, b) => a.order - b.order)
    } catch (error) {
      if (error instanceof DomainError) throw error
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new DomainError('INVALID_PROJECT', '无法读取 story/volumes.yaml')
    }
  }

  async create(input: { title: string }): Promise<Volume> {
    const value = volumeCreateInputSchema.parse(input)
    const volumes = await this.list()
    const now = new Date().toISOString()
    const volume: Volume = { id: `volume_${randomUUID()}`, title: value.title.trim(), order: volumes.length, chapterRelPaths: [], createdAt: now, updatedAt: now }
    await this.saveFile([...volumes, volume])
    return volume
  }

  async update(input: { id: string; title: string }): Promise<Volume> {
    const value = volumeUpdateInputSchema.parse(input)
    const volumes = await this.list()
    const current = volumes.find((volume) => volume.id === value.id)
    if (!current) throw new DomainError('PROJECT_NOT_FOUND', `卷不存在: ${value.id}`)
    const next = { ...current, title: value.title.trim(), updatedAt: new Date().toISOString() }
    await this.saveFile(volumes.map((volume) => volume.id === next.id ? next : volume))
    return next
  }

  async remove(id: string): Promise<null> {
    const validId = volumeIdSchema.parse(id)
    const volumes = await this.list()
    const current = volumes.find((volume) => volume.id === validId)
    if (!current) throw new DomainError('PROJECT_NOT_FOUND', `卷不存在: ${validId}`)
    if (current.chapterRelPaths.length > 0) throw new DomainError('VALIDATION_FAILED', '请先移出卷内章节，再删除卷')
    await this.saveFile(volumes.filter((volume) => volume.id !== validId).map((volume, order) => ({ ...volume, order, updatedAt: new Date().toISOString() })))
    return null
  }

  async assignChapter(volumeId: string, chapterRelPath: string): Promise<Volume[]> {
    const value = volumeChapterInputSchema.parse({ volumeId, chapterRelPath })
    await this.requireChapter(value.chapterRelPath)
    const volumes = await this.list()
    if (!volumes.some((volume) => volume.id === value.volumeId)) throw new DomainError('PROJECT_NOT_FOUND', `卷不存在: ${value.volumeId}`)
    const now = new Date().toISOString()
    await this.saveFile(volumes.map((volume) => ({ ...volume, chapterRelPaths: volume.id === value.volumeId ? [...volume.chapterRelPaths.filter((path) => path !== value.chapterRelPath), value.chapterRelPath] : volume.chapterRelPaths.filter((path) => path !== value.chapterRelPath), updatedAt: now })))
    return this.list()
  }

  async unassignChapter(chapterRelPath: string): Promise<Volume[]> {
    const value = volumeChapterInputSchema.shape.chapterRelPath.parse(chapterRelPath)
    const volumes = await this.list()
    const now = new Date().toISOString()
    await this.saveFile(volumes.map((volume) => ({ ...volume, chapterRelPaths: volume.chapterRelPaths.filter((path) => path !== value), updatedAt: now })))
    return this.list()
  }

  async reorder(volumeIds: string[]): Promise<Volume[]> {
    const value = volumeReorderInputSchema.parse({ volumeIds })
    const volumes = await this.list()
    if (value.volumeIds.length !== volumes.length || new Set(value.volumeIds).size !== volumes.length || volumes.some((volume) => !value.volumeIds.includes(volume.id))) throw new DomainError('VALIDATION_FAILED', '卷排序必须包含当前全部卷且不能重复')
    const byId = new Map(volumes.map((volume) => [volume.id, volume]))
    const now = new Date().toISOString()
    await this.saveFile(value.volumeIds.map((id, order) => ({ ...byId.get(id)!, order, updatedAt: now })))
    return this.list()
  }

  async remapChapter(from: string, to: string): Promise<void> {
    const fromPath = volumeChapterInputSchema.shape.chapterRelPath.parse(from)
    const toPath = volumeChapterInputSchema.shape.chapterRelPath.parse(to)
    const volumes = await this.list()
    if (!volumes.some((volume) => volume.chapterRelPaths.includes(fromPath))) return
    const now = new Date().toISOString()
    await this.saveFile(volumes.map((volume) => ({ ...volume, chapterRelPaths: volume.chapterRelPaths.map((path) => path === fromPath ? toPath : path), updatedAt: now })))
  }

  async removeChapter(chapterRelPath: string): Promise<void> {
    await this.unassignChapter(chapterRelPath)
  }

  private async requireChapter(relPath: string): Promise<void> {
    try { await readFile(resolveInsideRoot(this.root(), relPath)) } catch { throw new DomainError('PROJECT_NOT_FOUND', `章节文件不存在: ${relPath}`) }
  }

  private async saveFile(volumes: Volume[]): Promise<void> {
    const value = volumeFileSchema.parse({ version: 1, volumes })
    await atomicWriteFile(resolveInsideRoot(this.root(), VOLUME_FILE), stringifyYaml(value))
  }

  private root(): string {
    const root = this.project.getInfo()?.rootPath
    if (!root) throw new DomainError('PROJECT_NOT_FOUND', '请先打开项目')
    return root
  }
}

export function normalizeVolumeFile(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.volumes)) return value
  const now = new Date().toISOString()
  const volumes = record.volumes.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const entry = item as Record<string, unknown>
    const chapterRelPaths = Array.isArray(entry.chapterRelPaths) ? entry.chapterRelPaths : entry.chapters
    return {
      ...entry,
      ...(!Object.prototype.hasOwnProperty.call(entry, 'id') ? { id: `volume_legacy_${index}` } : {}),
      ...(!Object.prototype.hasOwnProperty.call(entry, 'title') ? { title: `第${index + 1}卷` } : {}),
      ...(!Object.prototype.hasOwnProperty.call(entry, 'order') ? { order: index } : {}),
      ...(Array.isArray(chapterRelPaths) && !Object.prototype.hasOwnProperty.call(entry, 'chapterRelPaths') ? { chapterRelPaths } : {}),
      ...(!Object.prototype.hasOwnProperty.call(entry, 'createdAt') ? { createdAt: now } : {}),
      ...(!Object.prototype.hasOwnProperty.call(entry, 'updatedAt') ? { updatedAt: now } : {})
    }
  })
  return { ...record, version: Object.prototype.hasOwnProperty.call(record, 'version') ? record.version : 1, volumes }
}
