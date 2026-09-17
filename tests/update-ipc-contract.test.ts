import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('update IPC contract', () => {
  it('keeps the shared channel, preload bridge, and main handlers aligned', async () => {
    const shared = await readFile(new URL('../src/shared/ipc.ts', import.meta.url), 'utf8')
    const preload = await readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
    const main = await readFile(new URL('../src/main/ipc.ts', import.meta.url), 'utf8')
    expect(shared).toContain("updateCheck: 'update:check'")
    expect(shared).toContain("updateDownload: 'update:download'")
    expect(shared).toContain("updateInstall: 'update:install'")
    expect(shared).toContain("updateCancel: 'update:cancel'")
    expect(preload).toContain('satisfies UpdateApiContract')
    expect(preload).toContain('IPC.updateEvent')
    expect(main).toContain('handle(IPC.updateCheck')
    expect(main).toContain('handle(IPC.updateDownload')
    expect(main).toContain('handle(IPC.updateInstall')
    expect(main).toContain('handle(IPC.updateCancel')
  })
})
