import { readFile } from 'node:fs/promises'
import { atomicWriteFile } from './atomic-fs'

export type TelemetryConsent = 'not-granted' | 'granted' | 'revoked'

export interface TelemetryStatus {
  enabled: boolean
  consent: TelemetryConsent
}

interface StoredTelemetryState {
  schemaVersion: 1
  consent: TelemetryConsent
}

export interface TelemetryEvent {
  schemaVersion: 1
  event: string
  timestamp: string
  properties: Record<string, string | number | boolean>
}

const DEFAULT_STATE: StoredTelemetryState = { schemaVersion: 1, consent: 'not-granted' }
const MAX_EVENTS = 500
const ALLOWED_EVENTS = new Set(['app_started', 'project_opened', 'workflow_completed', 'workflow_failed', 'export_completed', 'error_shown'])
const ALLOWED_PROPERTIES = new Set(['platform', 'arch', 'workflowId', 'durationMs', 'itemCount', 'format', 'source', 'errorCode'])

/** Main-owned privacy gate. It does not collect or transmit anything itself. */
export class TelemetryService {
  private writeQueue = Promise.resolve()

  constructor(private readonly file: string, private readonly eventsFile = `${file}.events.jsonl`) {}

  async getStatus(): Promise<TelemetryStatus> {
    const state = await this.readState()
    return { enabled: state.consent === 'granted', consent: state.consent }
  }

  async setConsent(enabled: boolean): Promise<TelemetryStatus> {
    const next: StoredTelemetryState = { schemaVersion: 1, consent: enabled ? 'granted' : 'revoked' }
    await atomicWriteFile(this.file, JSON.stringify(next, null, 2) + '\n')
    return { enabled, consent: next.consent }
  }

  /**
   * Record a bounded, local-only event. The allowlist is deliberately kept in
   * Main so Renderer callers cannot accidentally persist document text,
   * credentials, project paths, or arbitrary payloads.
   */
  async record(event: string, properties: Record<string, unknown> = {}): Promise<boolean> {
    const state = await this.readState()
    if (state.consent !== 'granted' || !ALLOWED_EVENTS.has(event)) return false
    const safeProperties: Record<string, string | number | boolean> = {}
    for (const [key, value] of Object.entries(properties)) {
      if (!ALLOWED_PROPERTIES.has(key)) return false
      if (typeof value === 'string' && value.length <= 120) safeProperties[key] = value
      else if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000) safeProperties[key] = value
      else if (typeof value === 'boolean') safeProperties[key] = value
      else return false
    }
    const entry: TelemetryEvent = { schemaVersion: 1, event, timestamp: new Date().toISOString(), properties: safeProperties }
    this.writeQueue = this.writeQueue.then(async () => {
      let previous = ''
      try { previous = await readFile(this.eventsFile, 'utf8') } catch { /* first event */ }
      const lines = previous.split('\n').filter(Boolean).slice(-(MAX_EVENTS - 1))
      await atomicWriteFile(this.eventsFile, [...lines, JSON.stringify(entry)].join('\n') + '\n')
    })
    await this.writeQueue
    return true
  }

  private async readState(): Promise<StoredTelemetryState> {
    let raw: string
    try { raw = await readFile(this.file, 'utf8') } catch { return DEFAULT_STATE }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredTelemetryState>
      const consent = parsed.consent
      return parsed.schemaVersion === 1 && (consent === 'not-granted' || consent === 'granted' || consent === 'revoked')
        ? { schemaVersion: 1, consent }
        : DEFAULT_STATE
    } catch { return DEFAULT_STATE }
  }
}
