import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TelemetryService } from '../src/main/services/telemetry-service'
import { makeTempRoot } from './helpers'

describe('TelemetryService', () => {
  it('defaults to disabled without writing any consent', async () => {
    const root = await makeTempRoot()
    const file = join(root, 'telemetry.json')
    const service = new TelemetryService(file)

    expect(await service.getStatus()).toEqual({ enabled: false, consent: 'not-granted' })
    await expect(readFile(file, 'utf8')).rejects.toThrow()
  })

  it('persists explicit consent and allows it to be revoked', async () => {
    const root = await makeTempRoot()
    const file = join(root, 'telemetry.json')
    const service = new TelemetryService(file)

    expect(await service.setConsent(true)).toMatchObject({ enabled: true, consent: 'granted' })
    const reopened = new TelemetryService(file)
    expect(await reopened.getStatus()).toMatchObject({ enabled: true, consent: 'granted' })

    expect(await reopened.setConsent(false)).toEqual({ enabled: false, consent: 'revoked' })
    expect(await new TelemetryService(file).getStatus()).toEqual({ enabled: false, consent: 'revoked' })
  })

  it('records only allowlisted metadata after consent and stops after revocation', async () => {
    const root = await makeTempRoot()
    const consentFile = join(root, 'telemetry.json')
    const eventsFile = join(root, 'telemetry-events.jsonl')
    const service = new TelemetryService(consentFile, eventsFile)

    expect(await service.record('app_started', { platform: 'darwin', arch: 'arm64' })).toBe(false)
    await service.setConsent(true)
    expect(await service.record('workflow_completed', { workflowId: 'wf-1', durationMs: 42 })).toBe(true)
    expect(await service.record('workflow_completed', { content: '正文不应进入 telemetry' })).toBe(false)
    expect(await service.record('unknown_event', {})).toBe(false)

    const lines = (await readFile(eventsFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as { event: string; properties: Record<string, unknown> })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ event: 'workflow_completed', properties: { workflowId: 'wf-1', durationMs: 42 } })
    expect(lines[0].properties).not.toHaveProperty('content')

    await service.setConsent(false)
    expect(await service.record('app_started', { platform: 'darwin' })).toBe(false)
    expect((await readFile(eventsFile, 'utf8')).trim().split('\n')).toHaveLength(1)
  })
})
