import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('stable Electron path resolution', () => {
  it('separates native runtime and app bundle paths in diagnostics', async () => {
    const source = await readFile(new URL('../scripts/dev-stable.mjs', import.meta.url), 'utf8')

    expect(source).toContain('export function getStableElectronPaths(projectRoot = process.cwd(), platform = process.platform)')
    expect(source).toContain("'dist/Electron.app/Contents/MacOS/Electron'")
    expect(source).toContain("resolve(projectRoot, 'out/main/index.js')")
    expect(source).toContain("resolve(projectRoot, 'out/preload/index.cjs')")
    expect(source).toContain('Electron 原生运行时未安装')
  })
})
