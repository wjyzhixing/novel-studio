import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('telemetry consent UI contract', () => {
  it('exposes explicit enable and revoke actions', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/DeveloperPanel.tsx', import.meta.url), 'utf8')
    expect(source).toContain('window.novelAPI.telemetry.getStatus()')
    expect(source).toContain('setTelemetryConsent(true)')
    expect(source).toContain('setTelemetryConsent(false)')
    expect(source).toContain("uiText('telemetryDefault')")
    expect(source).toContain("uiText('telemetryRevoke')")
  })
})
