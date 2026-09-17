import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('release update preflight', () => {
  it('checks the update manifest contract and integrity primitives', async () => {
    const script = await readFile(new URL('../scripts/release-preflight.mjs', import.meta.url), 'utf8')
    expect(script).toContain("src/shared/update.ts")
    expect(script).toContain('HTTPS')
    expect(script).toContain('SHA-512')
    expect(script).toContain('publisher signature')
    expect(script).toContain('sign:update-manifest')
    expect(script).toContain('verify:artifacts')
    expect(script).toContain('verify:fixtures')
    expect(script).toContain('dist:win')
    expect(script).toContain('dist:mac')
    expect(script).toContain('extract-zip@2.0.1')
    expect(script).toContain('Symlink entries are not supported')
  })
})
