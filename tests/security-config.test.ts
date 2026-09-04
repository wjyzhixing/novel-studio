import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

describe('Electron security configuration', () => {
  it('keeps privileged capabilities behind isolation and a restricted bridge', async () => {
    const main = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8'); const preload = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
    expect(main).toContain('contextIsolation: true'); expect(main).toContain('nodeIntegration: false'); expect(main).toContain('sandbox: true'); expect(main).toContain('setWindowOpenHandler')
    expect(preload).toContain('contextBridge.exposeInMainWorld'); expect(preload).not.toContain('exposeInMainWorld(\'ipcRenderer\'')
  })
})
