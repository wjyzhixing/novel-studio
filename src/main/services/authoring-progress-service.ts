import { readFile } from 'node:fs/promises'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'
import type { CanonService } from './canon-service'
import type { ChapterService } from './chapter-service'
import { DomainError } from './errors'
import { atomicWriteFile } from './atomic-fs'
import { countWords } from './words'
import type { ProjectService } from './project-service'
import type { VolumeService } from './volume-service'
import {
  authoringFoundationInputSchema,
  authoringInitializeInputSchema,
  authoringProgressSchema,
  chapterRelPathForTitle,
  deriveAuthoringStage,
  makeAuthoringProgress,
  type AuthoringInitializeInput,
  type AuthoringProgress,
  type ChapterAuthoringStatus,
  fullRevisionReportIdSchema
} from '../../shared/authoring'

const PROGRESS_PATH = 'story/authoring-progress.yaml'
const DEFAULT_TARGET_WORD_COUNT = 40_000

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT')
}

function isBlankProgress(progress: AuthoringProgress): boolean {
  return !progress.premise.completed && !progress.outline.completed && progress.bible.entityCount === 0 &&
    progress.bible.timelineCount === 0 && progress.bible.artifactCount === 0 && progress.chapters.every((chapter) => chapter.status === 'planned' && chapter.wordCount === 0)
}

function countOutlineChapters(markdown: string): number {
  return Math.min(14, (markdown.match(/^#{2,4}\s*第\s*(?:\d+|[一二三四五六七八九十百千]+)章/gm) ?? []).length)
}

function hasPremiseContent(markdown: string): boolean {
  return markdown.replace(/^#{1,6}\s*[^\r\n]*$/gm, '').replace(/^[-*+]\s+[^\r\n]*$/gm, '').trim().length > 0
}

function countTable(project: ProjectService, table: string): number {
  if (!/^[a-z_]+$/.test(table)) throw new DomainError('VALIDATION_FAILED', '非法的进度统计表名')
  const row = project.database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
  return Number(row.count)
}

export class AuthoringProgressService {
  constructor(
    private readonly project: ProjectService,
    private readonly chapters: Pick<ChapterService, 'list' | 'read' | 'create' | 'rename'>,
    private readonly volumes: Pick<VolumeService, 'list' | 'create' | 'assignChapter'>,
    private readonly canon: Pick<CanonService, 'listProposals'>
  ) {}

  async get(): Promise<AuthoringProgress> {
    const stored = await this.readStored()
    if (stored) return this.refreshFrom(stored)
    const baseline = await this.createBaseline()
    return this.save(baseline)
  }

  async initialize(input: AuthoringInitializeInput): Promise<AuthoringProgress> {
    const value = authoringInitializeInputSchema.parse(input)
    const stored = await this.readStored()
    if (stored && !isBlankProgress(stored)) throw new DomainError('VALIDATION_FAILED', '本项目已经初始化过创作流程，不能覆盖已有创作资料')

    const current = await this.chapters.list()
    const currentContents = await Promise.all(current.map((chapter) => this.chapters.read(chapter.relPath)))
    if (currentContents.some((chapter) => bodyWordCount(chapter.markdown) > 0)) throw new DomainError('VALIDATION_FAILED', '初始化向导只允许用于没有正文的项目')
    if (current.length > 1) throw new DomainError('VALIDATION_FAILED', '初始化向导需要空项目，已有多个章节请先手动整理')
    const existingVolumes = await this.volumes.list()
    if (existingVolumes.length > 0) throw new DomainError('VALIDATION_FAILED', '初始化向导不能覆盖已有卷结构')

    const paths: string[] = []
    if (current[0]) {
      const desired = chapterRelPathForTitle(1, value.chapterTitles[0]!)
      if (current[0].relPath === desired) paths.push(desired)
      else {
        const renamed = await this.chapters.rename(current[0].relPath, value.chapterTitles[0]!)
        paths.push(renamed.find((chapter) => chapter.number === 1)?.relPath ?? desired)
      }
    } else {
      const created = await this.chapters.create(value.chapterTitles[0]!)
      paths.push(created.relPath)
    }
    for (const title of value.chapterTitles.slice(1)) paths.push((await this.chapters.create(title)).relPath)

    const outline = buildOutline(value)
    await atomicWriteFile(this.project.resolveInProject('story/premise.md'), buildPremise(value))
    await atomicWriteFile(this.project.resolveInProject('story/outline.md'), outline)

    for (const title of value.volumeTitles) await this.volumes.create({ title })
    const createdVolumes = await this.volumes.list()
    for (const [index, relPath] of paths.entries()) {
      const volume = createdVolumes[Math.min(createdVolumes.length - 1, Math.floor(index * createdVolumes.length / paths.length))]
      if (volume) await this.volumes.assignChapter(volume.id, relPath)
    }

    await this.project.installAuthoringWorkflow()
    const progress = makeAuthoringProgress({ ...value, chapterPlans: value.chapterPlans ?? value.chapterTitles.map(() => '') })
    const completed = {
      ...progress,
      outline: { ...progress.outline, completed: true },
      chapters: progress.chapters.map((chapter, index) => ({ ...chapter, relPath: paths[index] ?? chapter.relPath }))
    }
    return this.save({ ...completed, phase: deriveAuthoringStage(completed) })
  }

  async refresh(): Promise<AuthoringProgress> {
    const stored = await this.readStored()
    if (!stored) return this.get()
    return this.refreshFrom(stored)
  }

  async save(progress: AuthoringProgress): Promise<AuthoringProgress> {
    const checked = authoringProgressSchema.parse(progress)
    const current = await this.readStored()
    if (current && !current.revision.completed && checked.revision.completed) throw new DomainError('VALIDATION_FAILED', '必须通过全稿修订确认后才能完成修订')
    if (current && !current.revision.completed && checked.phase === 'export') throw new DomainError('VALIDATION_FAILED', '必须通过全稿修订确认后才能进入导出阶段')
    if (current && !current.export.completed && checked.export.completed) throw new DomainError('VALIDATION_FAILED', '必须通过导出门禁后才能记录导出')
    return this.persist(checked)
  }

  async markExported(destination: string): Promise<AuthoringProgress> {
    const path = destination.trim()
    if (!path || path.length > 4_000) throw new DomainError('VALIDATION_FAILED', '导出路径无效')
    const current = await this.get()
    if (!current.revision.completed) throw new DomainError('VALIDATION_FAILED', '全稿修订完成后才能记录导出')
    const next = { ...current, phase: 'export' as const, export: { completed: true, lastExportPath: path }, updatedAt: new Date().toISOString() }
    return this.persist(next)
  }

  async markChapterStatus(relPath: string, status: ChapterAuthoringStatus, workflowRunId?: string): Promise<AuthoringProgress> {
    const current = await this.get()
    const chapter = current.chapters.find((item) => item.relPath === relPath)
    if (!chapter) throw new DomainError('PROJECT_NOT_FOUND', `创作进度中没有章节: ${relPath}`)
    const now = new Date().toISOString()
    const chapters = current.chapters.map((item) => item.relPath === relPath
      ? { ...item, status, ...(workflowRunId ? { workflowRunId } : {}), ...(status === 'approved' || status === 'revised' ? { lastReviewedAt: now } : {}) }
      : item)
    return this.save({ ...current, chapters, phase: deriveAuthoringStage({ ...current, chapters }), updatedAt: now })
  }

  async saveChapterPlan(relPath: string, plan: string, workflowRunId?: string): Promise<AuthoringProgress> {
    const checkedPlan = z.string().trim().min(1).max(20_000).parse(plan)
    const current = await this.get()
    const chapter = current.chapters.find((item) => item.relPath === relPath)
    if (!chapter) throw new DomainError('PROJECT_NOT_FOUND', `创作进度中没有章节: ${relPath}`)
    const now = new Date().toISOString()
    const chapters = current.chapters.map((item) => item.relPath === relPath
      ? { ...item, plan: checkedPlan, ...(workflowRunId ? { workflowRunId } : {}) }
      : item)
    const next = { ...current, chapters, phase: deriveAuthoringStage({ ...current, chapters }), updatedAt: now }
    return this.save(next)
  }

  async saveFoundation(input: { premise: string; outline: string }): Promise<AuthoringProgress> {
    const value = authoringFoundationInputSchema.parse(input)
    await atomicWriteFile(this.project.resolveInProject('story/premise.md'), `${value.premise}\n`)
    await atomicWriteFile(this.project.resolveInProject('story/outline.md'), `${value.outline}\n`)
    const current = await this.get()
    const premiseCompleted = hasPremiseContent(value.premise)
    const outlineCompleted = countOutlineChapters(value.outline) > 0
    const foundation = {
      ...current,
      premise: { ...current.premise, completed: premiseCompleted },
      outline: { ...current.outline, completed: outlineCompleted }
    }
    return this.save({ ...foundation, phase: deriveAuthoringStage(foundation), updatedAt: new Date().toISOString() })
  }

  async completeRevision(reportId: string): Promise<AuthoringProgress> {
    const id = fullRevisionReportIdSchema.parse(reportId)
    const current = await this.get()
    if (current.revision.completed) {
      if (current.revision.reportId === id) return current
      throw new DomainError('VALIDATION_FAILED', '全稿修订已经由另一份报告确认')
    }
    if (current.chapters.some((chapter) => !['approved', 'revised'].includes(chapter.status))) throw new DomainError('VALIDATION_FAILED', '所有章节通过人工审核后才能完成全稿修订')
    if (current.canon.pendingProposals > 0) throw new DomainError('VALIDATION_FAILED', '仍有 Canon 提案待处理，不能完成全稿修订')
    const checkedAt = new Date().toISOString()
    return this.persist({ ...current, phase: 'export', revision: { completed: true, checkedAt, reportId: id }, updatedAt: checkedAt })
  }

  private async readStored(): Promise<AuthoringProgress | null> {
    try {
      const parsed = authoringProgressSchema.safeParse(parseYaml(await readFile(this.project.resolveInProject(PROGRESS_PATH), 'utf8')))
      if (!parsed.success) throw new DomainError('INVALID_PROJECT', 'story/authoring-progress.yaml 格式无效')
      return parsed.data
    } catch (error) {
      if (error instanceof DomainError) throw error
      if (isMissing(error)) return null
      throw new DomainError('INVALID_PROJECT', `无法读取 ${PROGRESS_PATH}`)
    }
  }

  private async persist(progress: AuthoringProgress): Promise<AuthoringProgress> {
    await atomicWriteFile(this.project.resolveInProject(PROGRESS_PATH), stringifyYaml(progress))
    return progress
  }

  private async createBaseline(): Promise<AuthoringProgress> {
    const chapters = await this.chapters.list()
    const now = new Date().toISOString()
    const chaptersWithBodyCounts = await Promise.all(chapters.map(async (chapter) => ({ chapter, wordCount: bodyWordCount((await this.chapters.read(chapter.relPath)).markdown) })))
    return authoringProgressSchema.parse({
      schemaVersion: 1,
      phase: 'premise',
      createdAt: now,
      updatedAt: now,
      premise: { completed: false, genre: '', targetWordCount: DEFAULT_TARGET_WORD_COUNT },
      bible: { completed: false, entityCount: countTable(this.project, 'entities'), timelineCount: countTable(this.project, 'timeline_events'), artifactCount: countTable(this.project, 'story_artifacts') },
      outline: { completed: false, actCount: 3, plannedChapterCount: chapters.length },
      chapters: chaptersWithBodyCounts.map(({ chapter, wordCount }) => ({
        number: chapter.number,
        title: chapter.title,
        relPath: chapter.relPath,
        status: (wordCount > 0 ? 'draft' : 'planned') as ChapterAuthoringStatus,
        wordCount,
        targetWords: Math.ceil(DEFAULT_TARGET_WORD_COUNT / Math.max(1, chapters.length))
      })),
      canon: { pendingProposals: 0 },
      revision: { completed: false },
      export: { completed: false }
    })
  }

  private async refreshFrom(stored: AuthoringProgress): Promise<AuthoringProgress> {
    const current = await this.chapters.list()
    const oldByPath = new Map(stored.chapters.map((chapter) => [chapter.relPath, chapter]))
    const chapters = await Promise.all(current.map(async (chapter) => {
      const old = oldByPath.get(chapter.relPath)
      const wordCount = bodyWordCount((await this.chapters.read(chapter.relPath)).markdown)
      const inferred: ChapterAuthoringStatus = wordCount > 0 ? 'draft' : 'planned'
      const status: ChapterAuthoringStatus = old?.status === 'planned' && wordCount > 0
        ? 'draft'
        : old && (old.status === 'approved' || old.status === 'revised') && wordCount === 0
          ? 'planned'
          : old?.status ?? inferred
      return { number: chapter.number, title: chapter.title, relPath: chapter.relPath, status, wordCount, targetWords: old?.targetWords ?? Math.ceil(stored.premise.targetWordCount / Math.max(1, stored.chapters.length || current.length)), ...(old?.plan ? { plan: old.plan } : {}), ...(old?.workflowRunId ? { workflowRunId: old.workflowRunId } : {}), ...(old?.lastReviewedAt ? { lastReviewedAt: old.lastReviewedAt } : {}) }
    }))
    const outline = await this.project.readText('story/outline.md').catch(() => '')
    const entityCount = countTable(this.project, 'entities')
    const timelineCount = countTable(this.project, 'timeline_events')
    const artifactCount = countTable(this.project, 'story_artifacts')
    const pendingProposals = (await this.canon.listProposals()).filter((proposal) => proposal.status === 'pending').length
    const next: AuthoringProgress = {
      ...stored,
      updatedAt: new Date().toISOString(),
      bible: { completed: entityCount > 0 && timelineCount > 0, entityCount, timelineCount, artifactCount },
      outline: { ...stored.outline, completed: stored.outline.completed || countOutlineChapters(outline) > 0, plannedChapterCount: Math.max(stored.outline.plannedChapterCount, countOutlineChapters(outline), chapters.length) },
      chapters,
      canon: { ...stored.canon, pendingProposals },
      phase: deriveAuthoringStage({ ...stored, bible: { completed: entityCount > 0 && timelineCount > 0, entityCount, timelineCount, artifactCount }, outline: { ...stored.outline, completed: stored.outline.completed || countOutlineChapters(outline) > 0, plannedChapterCount: Math.max(stored.outline.plannedChapterCount, countOutlineChapters(outline), chapters.length) }, chapters, canon: { ...stored.canon, pendingProposals } })
    }
    return this.save(next)
  }
}

function bodyWordCount(markdown: string): number {
  const body = markdown.replace(/^#{1,6}[ \t]+[^\r\n]*(?:\r?\n|$)/m, '')
  return countWords(body)
}

function buildPremise(input: AuthoringInitializeInput): string {
  return `# 故事前提\n\n- 题材：${input.genre}\n- 目标字数：${input.targetWordCount}\n- 章节数：${input.chapterCount}\n\n## 核心 Premise\n\n${input.premise}\n\n## 创作边界\n\n- AI 生成内容必须经过人工审核后写回。\n- 未经 Canon 审核的事实只能作为候选，不得当作既定设定。\n`
}

function buildOutline(input: AuthoringInitializeInput): string {
  const plans = input.chapterPlans ?? input.chapterTitles.map(() => '')
  const sections = input.chapterTitles.map((title, index) => `### 第${index + 1}章 ${title}\n\n- 章节计划：${plans[index] || '待补充'}\n- 冲突：待补充\n- 转折：待补充\n- 结尾钩子：待补充\n`).join('\n')
  return `# 大纲\n\n## 第一幕：建立问题\n\n## 第二幕：逼近真相\n\n## 第三幕：付出代价\n\n${sections}`
}
