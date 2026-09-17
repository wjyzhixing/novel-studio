import type { WorkflowSummary } from '../../../shared/workflow'

export function selectWorkflowSummary(
  summaries: readonly WorkflowSummary[],
  defaultWorkflow: string | null | undefined,
): WorkflowSummary | undefined {
  if (defaultWorkflow) {
    const preferred = summaries.find((summary) => summary.id === defaultWorkflow || summary.relPath === defaultWorkflow)
    if (preferred) return preferred
  }
  return summaries.find((summary) => summary.id === 'flow_builtin_novel') ?? summaries[0]
}
