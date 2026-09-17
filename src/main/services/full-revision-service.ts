import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { stringify } from 'yaml'
import type { ProjectIntegrity } from '../../shared/ipc'
import {
  fullRevisionReportSchema,
  fullRevisionReportIdSchema,
  type FullRevisionFinding,
  type FullRevisionReport,
  type AuthoringProgress
} from '../../shared/authoring'
import type { CanonProposal } from '../../shared/canon'
import type { StoryEntity, StoryArtifact, TimelineEvent } from '../../shared/story'
import type { AuthoringProgressService } from './authoring-progress-service'
import type { CanonService } from './canon-service'
import type { ChapterService } from './chapter-service'
import type { ProjectService } from './project-service'
import type { StoryService } from './story-service'
import { DomainError } from './errors'
import { atomicWriteFile } from './atomic-fs'

const REPORT_DIR = '.novel/checkpoints'

export class FullRevisionService {
  constructor(
    private readonly authoring: Pick<AuthoringProgressService, 'get' | 'completeRevision'>,
    private readonly project: Pick<ProjectService, 'checkIntegrity' | 'resolveInProject'>,
    private readonly canon: Pick<CanonService, 'listProposals'>,
    private readonly story: Pick<StoryService, 'listEntities' | 'listTimeline' | 'listArtifacts'>,
    private readonly chapters: Pick<ChapterService, 'list'>
  ) {}

  async prepare(): Promise<FullRevisionReport> {
    const progress = await this.authoring.get()
    const [integrity, proposals, entities, timeline, artifacts, chapters] = await Promise.all([
      this.project.checkIntegrity(),
      this.canon.listProposals(),
      this.story.listEntities(),
      this.story.listTimeline(),
      this.story.listArtifacts(),
      this.chapters.list()
    ])
    const report = buildReport(progress, chapters, integrity, proposals, entities, timeline, artifacts)
    await atomicWriteFile(this.project.resolveInProject(`${REPORT_DIR}/full-revision-${report.reportId}.json`), JSON.stringify(report, null, 2) + '\n')
    return report
  }

  async approve(reportId: string): Promise<AuthoringProgress> {
    const id = fullRevisionReportIdSchema.parse(reportId)
    let report: FullRevisionReport
    try {
      report = fullRevisionReportSchema.parse(JSON.parse(await readFile(this.project.resolveInProject(`${REPORT_DIR}/full-revision-${id}.json`), 'utf8')))
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError('PROJECT_NOT_FOUND', `全稿修订报告不存在: ${id}`)
    }
    if (!report.passed) throw new DomainError('VALIDATION_FAILED', '全稿修订报告未通过，不能确认')
    const current = await this.authoring.get()
    if (current.revision.completed && current.revision.reportId === id) return current
    if (current.revision.completed) throw new DomainError('VALIDATION_FAILED', '全稿修订已经由另一份报告确认')
    const [integrity, proposals, entities, timeline, artifacts, chapters] = await Promise.all([
      this.project.checkIntegrity(), this.canon.listProposals(), this.story.listEntities(), this.story.listTimeline(), this.story.listArtifacts(), this.chapters.list()
    ])
    const latest = buildReport(current, chapters, integrity, proposals, entities, timeline, artifacts)
    if (!latest.passed) throw new DomainError('VALIDATION_FAILED', '项目在报告生成后发生变化，请重新准备全稿修订')
    return this.authoring.completeRevision(id)
  }
}

function buildReport(
  progress: AuthoringProgress,
  chapters: Awaited<ReturnType<ChapterService['list']>>,
  integrity: ProjectIntegrity,
  proposals: CanonProposal[],
  entities: StoryEntity[],
  timeline: TimelineEvent[],
  artifacts: StoryArtifact[]
): FullRevisionReport {
  const findings: FullRevisionFinding[] = []
  const add = (category: FullRevisionFinding['category'], severity: FullRevisionFinding['severity'], message: string, relPaths?: string[]) => {
    const id = `finding_${randomBytes(8).toString('hex')}`
    findings.push({ id, category, severity, message, ...(relPaths?.length ? { relPaths } : {}) })
  }
  const completed = progress.chapters.filter((chapter) => ['approved', 'revised'].includes(chapter.status)).length
  const words = progress.chapters.reduce((total, chapter) => total + chapter.wordCount, 0)
  const pendingCanon = proposals.filter((proposal) => proposal.status === 'pending').length
  const invalidChapters = progress.chapters.filter((chapter) => !['approved', 'revised'].includes(chapter.status) || chapter.wordCount === 0)
  if (invalidChapters.length > 0) add('completion', 'error', `${invalidChapters.length} 章尚未完成人工审核或没有正文`, invalidChapters.map((chapter) => chapter.relPath))
  if (pendingCanon > 0) add('completion', 'error', `${pendingCanon} 条 Canon 提案仍待处理`)
  if (entities.length === 0) add('characters', 'error', 'Story Bible 中没有角色或实体资料')
  if (timeline.length === 0) add('timeline', 'error', 'Story Bible 中没有时间线事件')
  const foreshadowing = artifacts.filter((artifact) => artifact.kind === 'foreshadowing')
  const unresolved = foreshadowing.filter((artifact) => !['resolved', 'abandoned'].includes(String(artifact.fields.status ?? 'planned')))
  if (foreshadowing.length === 0) add('foreshadowing', 'error', 'Story Bible 中没有伏笔条目')
  else if (unresolved.length > 0) add('foreshadowing', 'error', `${unresolved.length} 条伏笔尚未回收或明确放弃`)
  const expectedNumbers = chapters.map((chapter, index) => index + 1)
  if (chapters.some((chapter, index) => chapter.number !== expectedNumbers[index])) add('continuity', 'error', '章节编号或顺序不连续')
  if (hasIntegrityIssue(integrity)) add('integrity', 'error', '项目源文件、引用或 Story Bible 完整性检查未通过')
  for (const chapter of progress.chapters) if (chapter.wordCount > 0 && chapter.wordCount < Math.floor(chapter.targetWords * 0.5)) add('word-count', 'warning', `第 ${chapter.number} 章字数低于目标的一半`, [chapter.relPath])
  if (progress.chapters.length > 0 && words < Math.floor(progress.premise.targetWordCount * 0.8)) add('word-count', 'warning', `全书当前字数低于目标的 80%（${words}/${progress.premise.targetWordCount}）`)
  if (findings.length === 0 || findings.every((finding) => finding.severity !== 'error')) {
    add('characters', 'info', '角色资料已纳入全稿复核，请人工确认每章行为与已知信息一致')
    add('timeline', 'info', '时间线资料已纳入全稿复核，请人工确认章节因果和时间顺序一致')
    add('continuity', 'info', '章节顺序完整，请人工通读确认段落衔接和信息释放节奏')
  }
  const report = {
    schemaVersion: 1 as const,
    reportId: `fullrev_${randomBytes(10).toString('hex')}`,
    createdAt: new Date().toISOString(),
    passed: findings.every((finding) => finding.severity !== 'error'),
    findings,
    chapters: { total: progress.chapters.length, completed, words, targetWords: progress.premise.targetWordCount },
    pendingCanon
  }
  return fullRevisionReportSchema.parse(report)
}

function hasIntegrityIssue(integrity: ProjectIntegrity): boolean {
  return integrity.danglingRelations > 0 || integrity.danglingTimelineEntityRefs > 0 || integrity.danglingTimelineChapterRefs > 0 || integrity.invalidSourceFiles.length > 0 || integrity.missingFiles.length > 0 || integrity.invalidStoryArtifacts > 0
}
