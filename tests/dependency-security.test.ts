import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('dependency security overrides', () => {
  it('pins a local extract-zip symlink hardening patch for Electron install tooling', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { pnpm?: { patchedDependencies?: Record<string, string> } }
    const patchPath = packageJson.pnpm?.patchedDependencies?.['extract-zip@2.0.1']
    expect(patchPath).toBe('patches/extract-zip@2.0.1.patch')
    const patch = await readFile(new URL(`../${patchPath}`, import.meta.url), 'utf8')
    expect(patch).toContain('Symlink entries are not supported')
    expect(patch).toContain('-      await fs.symlink(link, dest)')
  })
})
