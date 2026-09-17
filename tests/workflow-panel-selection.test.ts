import { describe, expect, it } from 'vitest'
import { selectWorkflowRunForPanel } from '../src/renderer/src/lib/workflow-run-selection'
import type { WorkflowRun } from '../src/shared/runtime'

const run = (id: string, relPath: string, status: WorkflowRun['status'] = 'failed'): WorkflowRun => ({
  id,
  workflowId: 'flow_story',
  relPath,
  status,
  nodes: {},
  outputs: {},
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-05T00:00:01.000Z'
})

describe('workflow panel run selection', () => {
  it('keeps the pinned run when the user switches to another chapter', () => {
    const chapterA = run('run-a', 'chapters/001-a.md')
    const chapterB = run('run-b', 'chapters/002-b.md')

    expect(selectWorkflowRunForPanel([chapterA, chapterB], 'chapters/002-b.md', 'run-a')).toBe(chapterA)
  })

  it('uses the active chapter when there is no pinned run', () => {
    const chapterA = run('run-a', 'chapters/001-a.md')
    const chapterB = run('run-b', 'chapters/002-b.md')

    expect(selectWorkflowRunForPanel([chapterA, chapterB], 'chapters/002-b.md')).toBe(chapterB)
  })
})
