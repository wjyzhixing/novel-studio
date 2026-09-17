import type { WorkflowRun } from '../../../shared/runtime'

/**
 * Keep an already selected run stable while the editor navigates between
 * chapters. Retry and Resume must continue to use the run's persisted input
 * path, never the chapter that happens to be visible now.
 */
export function selectWorkflowRunForPanel(
  runs: WorkflowRun[],
  activeRelPath: string | null,
  pinnedRunId?: string | null
): WorkflowRun | null {
  const pinned = pinnedRunId ? runs.find((run) => run.id === pinnedRunId) : undefined
  if (pinned) return pinned

  const matching = activeRelPath ? runs.find((run) => run.relPath === activeRelPath) : undefined
  return matching ?? runs.find((run) => run.relPathRecovery === 'unavailable' && run.status === 'waiting_human') ?? null
}
