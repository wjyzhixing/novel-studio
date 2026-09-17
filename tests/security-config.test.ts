import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

describe('Electron security configuration', () => {
  it('keeps privileged capabilities behind isolation and a restricted bridge', async () => {
    const main = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8'); const preload = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
    expect(main).toContain('contextIsolation: true'); expect(main).toContain('nodeIntegration: false'); expect(main).toContain('sandbox: true'); expect(main).toContain('setWindowOpenHandler')
    expect(preload).toContain('contextBridge.exposeInMainWorld'); expect(preload).not.toContain('exposeInMainWorld(\'ipcRenderer\'')
  })

  it('provides a renderer boundary lint command', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> }
    const script = await readFile(new URL('../scripts/lint-boundaries.mjs', import.meta.url), 'utf8')
    expect(packageJson.scripts?.lint).toBe('npm run lint:boundaries')
    expect(script).toContain('renderer-no-privileged-import')
    expect(script).toContain('renderer-no-direct-ipc')
  })
})
