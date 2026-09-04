import { readFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parse, stringify } from 'yaml'
import type { ChapterScene, SceneCreateInput, SceneUpdateInput } from '../../shared/scene'
import { chapterSceneSchema, sceneSidecarSchema } from '../../shared/scene'
import { DomainError } from './errors'
import type { ProjectService } from './project-service'
import { atomicWriteFile } from './atomic-fs'

export function sceneSidecarRelPath(chapterRelPath: string): string {
  if (!/^chapters\/[^/]+\.md$/.test(chapterRelPath) || chapterRelPath.includes('..')) throw new DomainError('PATH_DENIED', '场景只能属于 chapters/ 下的 Markdown 章节')
  return `${chapterRelPath.slice(0, -3)}.scenes.yaml`
}

export function paragraphCount(markdown: string): number {
  return markdown.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).length
}

async function readSidecar(project: ProjectService, chapterRelPath: string): Promise<ChapterScene[]> {
  const file = project.resolveInProject(sceneSidecarRelPath(chapterRelPath))
  try {
    const parsed = sceneSidecarSchema.safeParse(parse(await readFile(file, 'utf8')))
    if (!parsed.success) throw new DomainError('INVALID_PROJECT', `场景 sidecar schema 无效: ${chapterRelPath}`, { details: parsed.error.issues })
    return parsed.data.scenes.sort((a, b) => a.order - b.order)
  } catch (error) {
    if (error instanceof DomainError) throw error
    if ((error as { code?: string }).code === 'ENOENT') return []
    throw new DomainError('INVALID_PROJECT', `无法读取场景 sidecar: ${chapterRelPath}`)
  }
}

async function writeSidecar(project: ProjectService, chapterRelPath: string, scenes: ChapterScene[]): Promise<void> {
  const checked = sceneSidecarSchema.safeParse({ schemaVersion: 1, scenes })
  if (!checked.success) throw new DomainError('VALIDATION_FAILED', '场景数据不满足 schema', { details: checked.error.issues })
  await atomicWriteFile(project.resolveInProject(sceneSidecarRelPath(chapterRelPath)), stringify(checked.data))
}

export async function renameSceneSidecar(project: ProjectService, oldRelPath: string, newRelPath: string): Promise<void> {
  const oldFile = project.resolveInProject(sceneSidecarRelPath(oldRelPath))
  const newFile = project.resolveInProject(sceneSidecarRelPath(newRelPath))
  try {
    await rename(oldFile, newFile)
    const parsed = sceneSidecarSchema.safeParse(parse(await readFile(newFile, 'utf8')))
    if (parsed.success) await atomicWriteFile(newFile, stringify({ schemaVersion: 1, scenes: parsed.data.scenes.map((scene) => ({ ...scene, chapterRelPath: newRelPath })) }))
  } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error }
}

export async function removeSceneSidecar(project: ProjectService, chapterRelPath: string): Promise<void> {
  try { await unlink(project.resolveInProject(sceneSidecarRelPath(chapterRelPath))) } catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error }
}

export class SceneService {
  constructor(private readonly project: ProjectService) {}

  private async chapter(chapterRelPath: string): Promise<{ markdown: string; scenes: ChapterScene[] }> {
    if (!/^chapters\/[^/]+\.md$/.test(chapterRelPath) || chapterRelPath.includes('..')) throw new DomainError('PATH_DENIED', '场景只能属于 chapters/ 下的 Markdown 章节')
    let markdown: string
    try { markdown = await readFile(this.project.resolveInProject(chapterRelPath), 'utf8') } catch { throw new DomainError('PROJECT_NOT_FOUND', `章节文件不存在: ${chapterRelPath}`) }
    return { markdown, scenes: await readSidecar(this.project, chapterRelPath) }
  }

  async list(chapterRelPath: string): Promise<ChapterScene[]> {
    const { scenes } = await this.chapter(chapterRelPath)
    this.syncIndex(chapterRelPath, scenes)
    return scenes
  }

  async create(input: SceneCreateInput): Promise<ChapterScene> {
    const { markdown, scenes } = await this.chapter(input.chapterRelPath)
    this.validateRange(input.startParagraph, input.endParagraph, paragraphCount(markdown))
    const now = new Date().toISOString()
    const scene = chapterSceneSchema.parse({ id: `scene_${randomUUID()}`, chapterRelPath: input.chapterRelPath, title: input.title.trim(), order: scenes.length, startParagraph: input.startParagraph, endParagraph: input.endParagraph, summary: input.summary, createdAt: now, updatedAt: now })
    const next = [...scenes, scene]
    await writeSidecar(this.project, input.chapterRelPath, next)
    this.syncIndex(input.chapterRelPath, next)
    return scene
  }

  async update(input: SceneUpdateInput): Promise<ChapterScene> {
    const { markdown, scenes } = await this.chapter(input.chapterRelPath)
    this.validateRange(input.startParagraph, input.endParagraph, paragraphCount(markdown))
    const current = scenes.find((item) => item.id === input.id)
    if (!current) throw new DomainError('PROJECT_NOT_FOUND', `场景不存在: ${input.id}`)
    const nextScene = chapterSceneSchema.parse({ ...current, title: input.title.trim(), startParagraph: input.startParagraph, endParagraph: input.endParagraph, summary: input.summary, updatedAt: new Date().toISOString() })
    const next = scenes.map((item) => item.id === input.id ? nextScene : item)
    await writeSidecar(this.project, input.chapterRelPath, next)
    this.syncIndex(input.chapterRelPath, next)
    return nextScene
  }

  async remove(chapterRelPath: string, sceneId: string): Promise<null> {
    const { scenes } = await this.chapter(chapterRelPath)
    if (!scenes.some((item) => item.id === sceneId)) throw new DomainError('PROJECT_NOT_FOUND', `场景不存在: ${sceneId}`)
    const next = scenes.filter((item) => item.id !== sceneId).map((item, order) => ({ ...item, order, updatedAt: new Date().toISOString() }))
    await writeSidecar(this.project, chapterRelPath, next)
    this.syncIndex(chapterRelPath, next)
    return null
  }

  async reorder(chapterRelPath: string, sceneIds: string[]): Promise<ChapterScene[]> {
    const { scenes } = await this.chapter(chapterRelPath)
    if (sceneIds.length !== scenes.length || new Set(sceneIds).size !== scenes.length || scenes.some((scene) => !sceneIds.includes(scene.id))) throw new DomainError('VALIDATION_FAILED', '场景排序必须包含当前章节的全部场景且不能重复')
    const now = new Date().toISOString()
    const byId = new Map(scenes.map((scene) => [scene.id, scene]))
    const next = sceneIds.map((id, order) => ({ ...byId.get(id)!, order, updatedAt: now }))
    await writeSidecar(this.project, chapterRelPath, next)
    this.syncIndex(chapterRelPath, next)
    return next
  }

  syncIndex(chapterRelPath: string, scenes: ChapterScene[]): void {
    const db = this.project.database.raw
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM chapter_scenes WHERE chapter_rel_path = ?').run(chapterRelPath)
      const insert = db.prepare('INSERT INTO chapter_scenes(id, chapter_rel_path, title, scene_order, start_paragraph, end_paragraph, summary, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)')
      for (const scene of scenes) insert.run(scene.id, chapterRelPath, scene.title, scene.order, scene.startParagraph, scene.endParagraph, scene.summary, scene.createdAt, scene.updatedAt)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw new DomainError('DB_ERROR', `场景索引更新失败: ${error instanceof Error ? error.message : String(error)}`) }
  }

  private validateRange(start: number, end: number, count: number): void {
    if (count === 0 || start < 0 || end < 0 || start > end || end >= count) throw new DomainError('VALIDATION_FAILED', `场景段落范围无效：当前章节有 ${count} 个段落`)
  }
}
