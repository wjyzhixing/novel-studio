import { describe, expect, it, vi } from 'vitest'
import { WorkflowRuntimeService } from '../src/main/services/workflow-runtime-service'

describe('WorkflowRuntimeService inspector reads', () => {
  it('supports read-only run and job listing without recovery writes', async () => {
    const runs = {
      recoverInterrupted: vi.fn(async () => 1),
      list: vi.fn(async () => []),
      listSummaries: vi.fn(async () => []),
      listJobs: vi.fn(async () => [])
    }
    const runtime = new WorkflowRuntimeService(
      {} as never, runs as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never
    )

    await runtime.listRuns(false)
    await runtime.listRuns(false, true)
    await runtime.listJobs(false)
    expect(runs.recoverInterrupted).not.toHaveBeenCalled()
    expect(runs.list).toHaveBeenCalledOnce()
    expect(runs.listSummaries).toHaveBeenCalledOnce()
    expect(runs.listJobs).toHaveBeenCalledOnce()

    await runtime.listRuns()
    expect(runs.recoverInterrupted).toHaveBeenCalledOnce()
  })
})
