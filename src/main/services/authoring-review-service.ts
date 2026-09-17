import type { ProjectIntegrity } from '../../shared/ipc'
import { authoringReviewReportSchema, type AuthoringIssue, type AuthoringReviewReport } from '../../shared/authoring'
import type { AuthoringProgressService } from './authoring-progress-service'
import type { CanonService } from './canon-service'
import type { ProjectService } from './project-service'

export class AuthoringReviewService {
  constructor(
    private readonly authoring: Pick<AuthoringProgressService, 'get'>,
    private readonly project: Pick<ProjectService, 'checkIntegrity'>,
    private readonly canon: Pick<CanonService, 'listProposals'>
  ) {}

  async review(): Promise<AuthoringReviewReport> {
    const [progress, integrity, proposals] = await Promise.all([this.authoring.get(), this.project.checkIntegrity(), this.canon.listProposals()])
    const issues: AuthoringIssue[] = []
    const completed = progress.chapters.filter((chapter) => chapter.status === 'approved' || chapter.status === 'revised').length
    const words = progress.chapters.reduce((total, chapter) => total + chapter.wordCount, 0)
    const pendingCanon = proposals.filter((proposal) => proposal.status === 'pending').length

    if (progress.outline.plannedChapterCount > progress.chapters.length) issues.push({ code: 'missing-chapters', severity: 'error', message: `章节计划 ${progress.outline.plannedChapterCount} 章，但当前只有 ${progress.chapters.length} 章` })
    for (const chapter of progress.chapters) {
      if (chapter.wordCount === 0) issues.push({ code: 'empty-chapter', severity: 'error', message: `第 ${chapter.number} 章《${chapter.title}》没有正文` })
      if (chapter.status !== 'approved' && chapter.status !== 'revised') issues.push({ code: 'unreviewed-chapter', severity: 'error', message: `第 ${chapter.number} 章《${chapter.title}》尚未通过人工审核` })
      if (chapter.wordCount > 0 && chapter.wordCount < Math.floor(chapter.targetWords * 0.5)) issues.push({ code: 'word-count', severity: 'warning', message: `第 ${chapter.number} 章字数低于目标的一半` })
    }
    if (pendingCanon > 0) issues.push({ code: 'pending-canon', severity: 'error', message: `${pendingCanon} 条 Canon 提案仍待人工处理` })
    if (!progress.revision.completed) issues.push({ code: 'revision', severity: 'error', message: '全稿修订尚未完成' })
    if (hasIntegrityIssue(integrity)) issues.push({ code: 'integrity', severity: 'error', message: buildIntegrityMessage(integrity) })

    const report = { passed: issues.every((issue) => issue.severity !== 'error'), checkedAt: new Date().toISOString(), issues, chapters: { total: progress.chapters.length, completed, words, targetWords: progress.premise.targetWordCount }, pendingCanon, revisionCompleted: progress.revision.completed }
    return authoringReviewReportSchema.parse(report)
  }
}

function hasIntegrityIssue(integrity: ProjectIntegrity): boolean {
  return integrity.danglingRelations > 0 || integrity.danglingTimelineEntityRefs > 0 || integrity.danglingTimelineChapterRefs > 0 || integrity.invalidSourceFiles.length > 0 || integrity.missingFiles.length > 0 || integrity.invalidStoryArtifacts > 0
}

function buildIntegrityMessage(integrity: ProjectIntegrity): string {
  const details = [
    integrity.danglingRelations > 0 ? `${integrity.danglingRelations} 个悬空关系` : '',
    integrity.danglingTimelineEntityRefs > 0 ? `${integrity.danglingTimelineEntityRefs} 个悬空时间线实体引用` : '',
    integrity.danglingTimelineChapterRefs > 0 ? `${integrity.danglingTimelineChapterRefs} 个悬空时间线章节引用` : '',
    integrity.invalidSourceFiles.length > 0 ? `${integrity.invalidSourceFiles.length} 个无效源文件` : '',
    integrity.missingFiles.length > 0 ? `${integrity.missingFiles.length} 个缺失源文件` : '',
    integrity.invalidStoryArtifacts > 0 ? `${integrity.invalidStoryArtifacts} 个无效 Story Bible 条目` : ''
  ].filter(Boolean)
  return `项目完整性检查未通过：${details.join('、')}`
}
