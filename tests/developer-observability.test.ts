import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Developer observability filters', () => {
  it('exposes status filters and a metadata-only trace region', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/DeveloperPanel.tsx', import.meta.url), 'utf8')
    expect(source).toContain('developer-run-filter')
    expect(source).toContain('developer-job-filter')
    expect(source).toContain('developer-trace')
    expect(source).toContain('filteredRuns')
    expect(source).toContain('filteredJobs')
    expect(source).toContain('developer-log-filter')
    expect(source).toContain('developer-trace-timeline')
    expect(source).toContain('exportCompressedDiagnostics')
  })
})
