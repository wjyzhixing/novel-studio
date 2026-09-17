import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IPC } from '../src/shared/ipc'

const preload = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
const rendererTypes = readFileSync(join(process.cwd(), 'src/renderer/src/env.d.ts'), 'utf8')
const mainIpc = readFileSync(join(process.cwd(), 'src/main/ipc.ts'), 'utf8')
const mainIndex = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

describe('settings and secret IPC namespaces', () => {
  it('exposes dedicated channels and preload methods', () => {
    expect(IPC.settingsGet).toBe('settings:get')
    expect(IPC.settingsSet).toBe('settings:set')
    expect(IPC.secretHas).toBe('secret:has')
    expect(IPC.secretSet).toBe('secret:set')
    expect(IPC.secretRemove).toBe('secret:remove')
    expect(preload).toContain('get: (key: string) => ipcRenderer.invoke(IPC.settingsGet, key)')
    expect(preload).toContain('set: (key: string, value: string) => ipcRenderer.invoke(IPC.settingsSet, { key, value })')
    expect(preload).toContain('has: (key: string) => ipcRenderer.invoke(IPC.secretHas, key)')
    expect(preload).toContain('set: (key: string, value: string) => ipcRenderer.invoke(IPC.secretSet, { key, value })')
    expect(preload).toContain('remove: (key: string) => ipcRenderer.invoke(IPC.secretRemove, key)')
    expect(rendererTypes).toContain('settings: SettingsApiContract')
    expect(rendererTypes).toContain('secret: SecretApiContract')
  })

  it('exposes job control without requiring renderer access to runtime internals', () => {
    expect(IPC.jobsCancel).toBe('jobs:cancel')
    expect(IPC.jobsRetry).toBe('jobs:retry')
    expect(IPC.jobsEvent).toBe('jobs:event')
    expect(preload).toContain('cancel: (jobId: string) => ipcRenderer.invoke(IPC.jobsCancel, jobId)')
    expect(preload).toContain('retry: (jobId: string) => ipcRenderer.invoke(IPC.jobsRetry, jobId)')
    expect(preload).toContain('onEvent:')
    expect(rendererTypes).toContain('jobs: JobsApiContract')
    expect(mainIpc).toContain('workflowRuntime.cancelJob(')
    expect(mainIpc).toContain('workflowRuntime.retryJob(')
    expect(mainIndex).toContain('IPC.jobsEvent')
  })
})
