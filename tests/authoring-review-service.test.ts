import { describe, expect, it } from 'vitest'
import { AuthoringReviewService } from '../src/main/services/authoring-review-service'
import { canExportAuthoring, makeAuthoringProgress, type AuthoringProgress } from '../src/shared/authoring'

const baseProgress = (): AuthoringProgress => {
  const progress = makeAuthoringProgress({ genre: '悬疑', premise: '寻找答案。', targetWordCount: 1000, chapterCount: 1, volumeTitles: ['一'], chapterTitles: ['开始'] })
  return { ...progress, bible: { completed: true, entityCount: 1, timelineCount: 1, artifactCount: 1 }, outline: { ...progress.outline, completed: true }, chapters: [{ ...progress.chapters[0]!, status: 'approved', wordCount: 1000 }], revision: { completed: true } }
}

const healthyIntegrity = {
  danglingRelations: 0, danglingTimelineEntityRefs: 0, danglingTimelineChapterRefs: 0, invalidSourceFiles: [], missingFiles: [], warnings: [], invalidStoryArtifacts: 0
} as unknown as import('../src/shared/ipc').ProjectIntegrity

describe('authoring review service', () => {
  it('allows export only when chapters, Canon, revision, and integrity are complete', async () => {
    const progress = baseProgress()
    const service = new AuthoringReviewService({ get: async () => progress }, { checkIntegrity: async () => healthyIntegrity }, { listProposals: async () => [] })
    const report = await service.review()
    expect(report.passed).toBe(true)
    expect(report.chapters).toMatchObject({ total: 1, completed: 1, words: 1000 })
    expect(canExportAuthoring(report)).toBe(true)
  })

  it('reports missing chapters, empty or unreviewed chapters, pending Canon, and integrity issues', async () => {
    const progress = baseProgress()
    const incomplete = { ...progress, outline: { ...progress.outline, plannedChapterCount: 2 }, chapters: [{ ...progress.chapters[0]!, status: 'draft' as const, wordCount: 0 }], revision: { completed: false } }
    const service = new AuthoringReviewService({ get: async () => incomplete }, { checkIntegrity: async () => ({ ...healthyIntegrity, danglingRelations: 1, invalidSourceFiles: ['story/timeline.yaml'] }) as never }, { listProposals: async () => [{ status: 'pending' }] as never })
    const report = await service.review()
    expect(report.passed).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['missing-chapters', 'empty-chapter', 'unreviewed-chapter', 'pending-canon', 'integrity']))
    expect(canExportAuthoring(report)).toBe(false)
  })
})
