import { describe, expect, it } from 'vitest'
import { approvedDraftFromInput, humanReviewOutput, isDraftOutput, markdownForChapterWrite, workflowCompletionFromState } from '../src/main/services/workflow-runtime-service'
import type { WorkflowRun } from '../src/shared/runtime'

describe('workflow chapter writeback', () => {
  it('keeps the chapter heading and writes generated body text', () => {
    expect(markdownForChapterWrite('# 第一章\n\n旧正文\n', '第一章', '审核后的正文')).toBe('# 第一章\n\n审核后的正文\n')
  })

  it('accepts generated Markdown with its own heading', () => {
    expect(markdownForChapterWrite('# 旧标题\n\n旧正文\n', '旧标题', '# 新标题\n\n新正文')).toBe('# 新标题\n\n新正文\n')
  })

  it('exposes the upstream正文 directly to human review and writeback', () => {
    expect(humanReviewOutput({ in: '审核正文' })).toBe('审核正文')
  })

  it('only recognises an explicit draft as writable workflow output', () => {
    const draft = { kind: 'draft' as const, content: '可写入的小说正文', mode: 'replace' as const, target: 'chapter' as const, sourceNode: 'writer' }
    expect(isDraftOutput(draft)).toBe(true)
    expect(approvedDraftFromInput(draft)).toEqual(draft)
    expect(approvedDraftFromInput({ action: 'approve', draft })).toEqual(draft)
    expect(approvedDraftFromInput({ action: 'reject', draft })).toBeUndefined()
    expect(isDraftOutput('写作习惯：保持克制叙事')).toBe(false)
    expect(isDraftOutput({ ...draft, content: '以下是改写后的正文：\n\n可写入内容' })).toBe(false)
    expect(isDraftOutput({ ...draft, content: '定位：这是本次写作的确认信息' })).toBe(false)
    expect(isDraftOutput({ ...draft, content: '```markdown\n不应直接写回\n```' })).toBe(false)
    expect(isDraftOutput({ kind: 'review', findings: [{ severity: 'warning', message: '人物动机不一致' }] })).toBe(false)
    expect(isDraftOutput({ content: '以下是改写建议' })).toBe(false)
  })

  it('exposes the completed chapter and revision from a successful run', () => {
    const state = {
      id: 'run_1', workflowId: 'flow_1', relPath: 'chapters/001-a.md', status: 'succeeded',
      nodes: { write: { nodeId: 'write', status: 'succeeded', input: null, output: { relPath: 'chapters/001-a.md', markdown: '# 第一章\n\n正文\n', revisionId: 'rev_1' }, attempts: 1, log: [] } },
      outputs: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:01.000Z'
    } satisfies WorkflowRun
    expect(workflowCompletionFromState(state)).toEqual({ targetRelPath: 'chapters/001-a.md', revisionId: 'rev_1' })
  })
})
