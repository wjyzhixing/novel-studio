import { describe, expect, it } from 'vitest'
import {
  authoringInitializeInputSchema,
  authoringProgressSchema,
  authoringWorkflowBlockReason,
  deriveAuthoringStage,
  makeAuthoringProgress,
  updateChapterProgress
} from '../src/shared/authoring'

describe('authoring progress contract', () => {
  it('starts a new book at the premise stage and creates planned chapters', () => {
    const progress = makeAuthoringProgress({
      genre: '都市悬疑',
      premise: '一名修复师从一盘旧磁带开始追查父亲的失踪。',
      targetWordCount: 40_000,
      chapterCount: 3,
      volumeTitles: ['雾起', '潮落'],
      chapterTitles: ['录音里的求救声', '潮汐坐标', '第二扇门']
    }, '2026-09-15T00:00:00.000Z')

    expect(progress.phase).toBe('premise')
    expect(progress.chapters).toHaveLength(3)
    expect(progress.chapters[0]).toMatchObject({
      number: 1,
      relPath: 'chapters/001-录音里的求救声.md',
      status: 'planned',
      wordCount: 0
    })
    expect(authoringProgressSchema.parse(progress)).toEqual(progress)
  })

  it('advances derived stages only from explicit completion data', () => {
    const progress = makeAuthoringProgress({
      genre: '成长',
      premise: '一个人必须面对过去。',
      targetWordCount: 10_000,
      chapterCount: 1,
      volumeTitles: ['第一卷'],
      chapterTitles: ['开始']
    })

    expect(deriveAuthoringStage(progress)).toBe('bible')
    expect(authoringWorkflowBlockReason(progress)).toBe('premise')
    const bibleReady = { ...progress, premise: { ...progress.premise, completed: true }, bible: { ...progress.bible, completed: true } }
    expect(deriveAuthoringStage(bibleReady)).toBe('outline')
    expect(authoringWorkflowBlockReason(bibleReady)).toBe('outline')
    const outlineReady = { ...bibleReady, outline: { ...bibleReady.outline, completed: true } }
    expect(deriveAuthoringStage(outlineReady)).toBe('chapter_plan')
    expect(authoringWorkflowBlockReason(outlineReady)).toBeNull()

    const planned = { ...outlineReady, chapters: outlineReady.chapters.map((chapter) => ({ ...chapter, plan: '本章计划' })) }
    expect(deriveAuthoringStage(planned)).toBe('chapter_writing')
  })

  it('updates one chapter immutably and keeps unrelated chapters unchanged', () => {
    const progress = makeAuthoringProgress({
      genre: '悬疑',
      premise: '寻找答案。',
      targetWordCount: 10_000,
      chapterCount: 2,
      volumeTitles: ['第一卷'],
      chapterTitles: ['一', '二']
    })
    const next = updateChapterProgress(progress, 'chapters/002-二.md', { status: 'approved', wordCount: 1800, lastReviewedAt: '2026-09-15T01:00:00.000Z' })
    expect(next).not.toBe(progress)
    expect(next.chapters[1]).toMatchObject({ status: 'approved', wordCount: 1800 })
    expect(next.chapters[0]).toEqual(progress.chapters[0])
    expect(progress.chapters[1]?.status).toBe('planned')
  })

  it('rejects unsafe paths, invalid chapter counts, and invalid statuses', () => {
    expect(() => authoringInitializeInputSchema.parse({ genre: '悬疑', premise: 'x', targetWordCount: 1, chapterCount: 15, volumeTitles: ['一'], chapterTitles: ['一'] })).toThrow()
    expect(() => authoringProgressSchema.parse({
      schemaVersion: 1,
      phase: 'premise',
      createdAt: 'now',
      updatedAt: 'now',
      premise: { completed: false, genre: '', targetWordCount: -1 },
      bible: { completed: false, entityCount: 0, timelineCount: 0, artifactCount: 0 },
      outline: { completed: false, actCount: 3, plannedChapterCount: 1 },
      chapters: [{ number: 1, title: '坏路径', relPath: '../novel.yaml', status: 'draft', wordCount: 0, targetWords: 1000 }],
      canon: { pendingProposals: 0 },
      revision: { completed: false },
      export: { completed: false }
    })).toThrow()
  })
})
