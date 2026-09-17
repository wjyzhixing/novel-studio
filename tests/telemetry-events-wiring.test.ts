import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('telemetry event wiring contract', () => {
  it('records only safe lifecycle metadata at Main boundaries', async () => {
    const main = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    const ipc = await readFile(new URL('../src/main/ipc.ts', import.meta.url), 'utf8')

    expect(main).toContain("telemetryService.record('app_started'")
    expect(ipc).toContain("telemetryService.record('project_opened'")
    expect(ipc).not.toContain('project.rootPath')
  })
})
