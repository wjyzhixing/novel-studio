import { describe, expect, it } from 'vitest'
import { normalizeLegacyRun } from '../src/main/services/workflow-run-store'

describe('WorkflowRunStore legacy path recovery', () => {
  it('recognizes Chinese chapter filenames as valid paths', () => {
    const state = {
      id: 'run_unicode', workflowId: 'flow_builtin_novel', status: 'waiting_human',
      relPath: 'chapters/005-美国之风.md', relPathRecovery: 'unavailable',
      nodes: {}, outputs: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    } as never
    const normalized = normalizeLegacyRun(state)
    expect(normalized.relPath).toBe('chapters/005-美国之风.md')
    expect(normalized.relPathRecovery).toBeUndefined()
  })
})
