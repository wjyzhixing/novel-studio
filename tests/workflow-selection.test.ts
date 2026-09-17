import { describe, expect, it } from 'vitest'
import { selectWorkflowSummary } from '../src/renderer/src/lib/workflow-selection'

describe('workflow selection', () => {
  const summaries = [
    { id: 'flow_builtin_novel', name: '内置流程', relPath: 'workflows/flow_builtin_novel.novelflow.json' },
    { id: 'flow_middle_novel_authoring', name: '我的中篇小说创作流程', relPath: 'workflows/flow_middle_novel_authoring.novelflow.json' }
  ]

  it('selects the project default workflow before the built-in fallback', () => {
    expect(selectWorkflowSummary(summaries, 'flow_middle_novel_authoring')?.id).toBe('flow_middle_novel_authoring')
  })

  it('falls back to the built-in workflow when project default is absent', () => {
    expect(selectWorkflowSummary(summaries, null)?.id).toBe('flow_builtin_novel')
  })
})
