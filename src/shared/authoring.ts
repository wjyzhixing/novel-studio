import { z } from 'zod'
import type { Result } from './result'

export const AUTHORING_SCHEMA_VERSION = 1
export const MAX_AUTHORING_CHAPTERS = 14

export const authoringFoundationInputSchema = z.object({
  premise: z.string().trim().min(1).max(20_000),
  outline: z.string().trim().min(1).max(50_000)
})
export type AuthoringFoundationInput = z.infer<typeof authoringFoundationInputSchema>

export const authoringStageSchema = z.enum([
  'premise',
  'bible',
  'outline',
  'chapter_plan',
  'chapter_writing',
  'canon_review',
  'full_revision',
  'export'
])
export type AuthoringStage = z.infer<typeof authoringStageSchema>

export const authoringWorkflowBlockReasonSchema = z.enum(['premise', 'bible', 'outline', 'canon'])
export type AuthoringWorkflowBlockReason = z.infer<typeof authoringWorkflowBlockReasonSchema>

export const chapterAuthoringStatusSchema = z.enum(['planned', 'draft', 'review', 'approved', 'revised'])
export type ChapterAuthoringStatus = z.infer<typeof chapterAuthoringStatusSchema>

const chapterRelPathSchema = z.string().regex(/^chapters\/\d{3,}-[^/\\]+\.md$/)

export const authoringChapterSchema = z.object({
  number: z.number().int().min(1).max(999),
  title: z.string().min(1).max(200),
  relPath: chapterRelPathSchema,
  status: chapterAuthoringStatusSchema,
  wordCount: z.number().int().nonnegative(),
  targetWords: z.number().int().positive().max(1_000_000),
  plan: z.string().max(20_000).optional(),
  workflowRunId: z.string().min(1).max(200).optional(),
  lastReviewedAt: z.string().min(1).max(100).optional()
})
export type AuthoringChapter = z.infer<typeof authoringChapterSchema>

export const authoringProgressSchema = z.object({
  schemaVersion: z.literal(AUTHORING_SCHEMA_VERSION),
  phase: authoringStageSchema,
  createdAt: z.string().min(1).max(100),
  updatedAt: z.string().min(1).max(100),
  premise: z.object({
    completed: z.boolean(),
    genre: z.string().max(200),
    targetWordCount: z.number().int().positive().max(10_000_000)
  }),
  bible: z.object({
    completed: z.boolean(),
    entityCount: z.number().int().nonnegative(),
    timelineCount: z.number().int().nonnegative(),
    artifactCount: z.number().int().nonnegative()
  }),
  outline: z.object({
    completed: z.boolean(),
    actCount: z.number().int().positive().max(10),
    plannedChapterCount: z.number().int().min(0).max(MAX_AUTHORING_CHAPTERS)
  }),
  chapters: z.array(authoringChapterSchema).max(MAX_AUTHORING_CHAPTERS),
  canon: z.object({
    pendingProposals: z.number().int().nonnegative(),
    lastReviewedAt: z.string().min(1).max(100).optional()
  }),
  revision: z.object({
    completed: z.boolean(),
    checkedAt: z.string().min(1).max(100).optional(),
    reportId: z.string().regex(/^fullrev_[a-zA-Z0-9_-]{1,200}$/).optional()
  }),
  export: z.object({
    completed: z.boolean(),
    lastExportPath: z.string().min(1).max(4_000).optional()
  })
})
export type AuthoringProgress = z.infer<typeof authoringProgressSchema>

export const authoringInitializeInputSchema = z.object({
  genre: z.string().trim().min(1).max(200),
  premise: z.string().trim().min(1).max(20_000),
  targetWordCount: z.number().int().positive().max(10_000_000),
  chapterCount: z.number().int().min(1).max(MAX_AUTHORING_CHAPTERS),
  volumeTitles: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
  chapterTitles: z.array(z.string().trim().min(1).max(200)).min(1).max(MAX_AUTHORING_CHAPTERS),
  chapterPlans: z.array(z.string().max(20_000)).max(MAX_AUTHORING_CHAPTERS).optional()
}).superRefine((value, ctx) => {
  if (value.chapterTitles.length !== value.chapterCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chapterTitles'], message: '章节标题数量必须等于章节数' })
  }
  if (value.chapterPlans && value.chapterPlans.length !== value.chapterCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chapterPlans'], message: '章节计划数量必须等于章节数' })
  }
})
export type AuthoringInitializeInput = z.infer<typeof authoringInitializeInputSchema>

export interface AuthoringApiContract {
  get(): Promise<Result<AuthoringProgress>>
  initialize(input: AuthoringInitializeInput): Promise<Result<AuthoringProgress>>
  refresh(): Promise<Result<AuthoringProgress>>
  save(progress: AuthoringProgress): Promise<Result<AuthoringProgress>>
  saveFoundation(input: AuthoringFoundationInput): Promise<Result<AuthoringProgress>>
  markExported(destination: string): Promise<Result<AuthoringProgress>>
  review(): Promise<Result<AuthoringReviewReport>>
}

export const authoringIssueSchema = z.object({
  code: z.enum(['missing-chapters', 'empty-chapter', 'unreviewed-chapter', 'pending-canon', 'integrity', 'word-count', 'revision']),
  severity: z.enum(['error', 'warning']),
  message: z.string().min(1).max(1_000)
})
export type AuthoringIssue = z.infer<typeof authoringIssueSchema>

export const authoringReviewReportSchema = z.object({
  passed: z.boolean(),
  checkedAt: z.string().min(1).max(100),
  issues: z.array(authoringIssueSchema).max(1_000),
  chapters: z.object({ total: z.number().int().nonnegative(), completed: z.number().int().nonnegative(), words: z.number().int().nonnegative(), targetWords: z.number().int().positive() }),
  pendingCanon: z.number().int().nonnegative(),
  revisionCompleted: z.boolean()
})
export type AuthoringReviewReport = z.infer<typeof authoringReviewReportSchema>

export const fullRevisionCategorySchema = z.enum(['characters', 'timeline', 'foreshadowing', 'continuity', 'word-count', 'integrity', 'completion'])
export type FullRevisionCategory = z.infer<typeof fullRevisionCategorySchema>
export const fullRevisionSeveritySchema = z.enum(['info', 'warning', 'error'])
export type FullRevisionSeverity = z.infer<typeof fullRevisionSeveritySchema>
export const fullRevisionReportIdSchema = z.string().regex(/^fullrev_[a-zA-Z0-9_-]{1,200}$/)
export const fullRevisionFindingSchema = z.object({
  id: z.string().regex(/^finding_[a-zA-Z0-9_-]{1,200}$/),
  category: fullRevisionCategorySchema,
  severity: fullRevisionSeveritySchema,
  message: z.string().min(1).max(2_000),
  relPaths: z.array(z.string().startsWith('chapters/').max(500)).max(100).optional()
})
export type FullRevisionFinding = z.infer<typeof fullRevisionFindingSchema>
export const fullRevisionReportSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: fullRevisionReportIdSchema,
  createdAt: z.string().min(1).max(100),
  passed: z.boolean(),
  findings: z.array(fullRevisionFindingSchema).max(1_000),
  chapters: z.object({ total: z.number().int().nonnegative(), completed: z.number().int().nonnegative(), words: z.number().int().nonnegative(), targetWords: z.number().int().positive() }),
  pendingCanon: z.number().int().nonnegative()
})
export type FullRevisionReport = z.infer<typeof fullRevisionReportSchema>

export interface FullRevisionApiContract {
  prepare(): Promise<Result<FullRevisionReport>>
  approve(reportId: string): Promise<Result<AuthoringProgress>>
}

export function canExportAuthoring(report: AuthoringReviewReport): boolean {
  return report.passed && report.pendingCanon === 0 && report.revisionCompleted && report.issues.every((issue) => issue.severity !== 'error')
}

export function chapterRelPathForTitle(number: number, title: string): string {
  const safeTitle = title.replace(/[/\\:*?"<>|#]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'untitled'
  return `chapters/${String(number).padStart(3, '0')}-${safeTitle}.md`
}

export function makeAuthoringProgress(input: AuthoringInitializeInput, now = new Date().toISOString()): AuthoringProgress {
  const parsed = authoringInitializeInputSchema.parse(input)
  const targetWords = Math.max(1, Math.ceil(parsed.targetWordCount / parsed.chapterCount))
  return {
    schemaVersion: AUTHORING_SCHEMA_VERSION,
    phase: 'premise',
    createdAt: now,
    updatedAt: now,
    premise: { completed: Boolean(parsed.premise.trim()), genre: parsed.genre.trim(), targetWordCount: parsed.targetWordCount },
    bible: { completed: false, entityCount: 0, timelineCount: 0, artifactCount: 0 },
    outline: { completed: false, actCount: 3, plannedChapterCount: parsed.chapterCount },
    chapters: parsed.chapterTitles.map((title, index) => ({
      number: index + 1,
      title: title.trim(),
      relPath: chapterRelPathForTitle(index + 1, title),
      status: 'planned',
      wordCount: 0,
      targetWords,
      ...(parsed.chapterPlans?.[index] ? { plan: parsed.chapterPlans[index] } : {})
    })),
    canon: { pendingProposals: 0 },
    revision: { completed: false },
    export: { completed: false }
  }
}

export function updateChapterProgress(
  progress: AuthoringProgress,
  relPath: string,
  patch: Partial<Pick<AuthoringChapter, 'status' | 'wordCount' | 'workflowRunId' | 'lastReviewedAt'>>,
  now = new Date().toISOString()
): AuthoringProgress {
  const parsed = authoringProgressSchema.parse(progress)
  const index = parsed.chapters.findIndex((chapter) => chapter.relPath === relPath)
  if (index < 0) throw new Error(`章节不存在: ${relPath}`)
  const chapters = parsed.chapters.map((chapter, chapterIndex) => chapterIndex === index ? { ...chapter, ...patch } : chapter)
  return { ...parsed, chapters, updatedAt: now }
}

export function deriveAuthoringStage(progress: AuthoringProgress): AuthoringStage {
  const parsed = authoringProgressSchema.parse(progress)
  if (!parsed.premise.completed) return 'premise'
  if (!parsed.bible.completed) return 'bible'
  if (!parsed.outline.completed) return 'outline'
  if (parsed.chapters.some((chapter) => chapter.status === 'planned' && !chapter.plan?.trim())) return 'chapter_plan'
  if (parsed.chapters.some((chapter) => chapter.status === 'draft' || chapter.status === 'review')) return 'chapter_writing'
  if (parsed.chapters.length > 0 && parsed.chapters.some((chapter) => chapter.status !== 'approved' && chapter.status !== 'revised')) return 'chapter_writing'
  if (parsed.canon.pendingProposals > 0) return 'canon_review'
  if (!parsed.revision.completed) return 'full_revision'
  return 'export'
}

export function authoringWorkflowBlockReason(progress: AuthoringProgress): AuthoringWorkflowBlockReason | null {
  const parsed = authoringProgressSchema.parse(progress)
  // A freshly constructed progress object carries premise text but is still
  // explicitly at the premise stage until it is persisted by initialization.
  // Keep that boundary visible to callers instead of inferring readiness from
  // the text alone.
  if (parsed.phase === 'premise' && !parsed.bible.completed) return 'premise'
  if (!parsed.premise.completed) return 'premise'
  if (!parsed.bible.completed) return 'bible'
  if (!parsed.outline.completed) return 'outline'
  if (parsed.canon.pendingProposals > 0) return 'canon'
  return null
}
