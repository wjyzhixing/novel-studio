import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('continuous integration workflow contract', () => {
  it('runs the core quality gates on pull requests and pushes', async () => {
    const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> }
    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('push:')
    for (const command of ['pnpm typecheck', 'pnpm lint', 'pnpm test -- --maxWorkers=1', 'pnpm build']) expect(workflow).toContain(command)
    expect(workflow).toContain('xvfb-run --auto-servernum pnpm e2e:electron')
    expect(packageJson.scripts?.['e2e:electron']).toContain('golden-path-electron.mjs')
  })

  it('checks release configuration without pretending to sign or notarize artifacts', async () => {
    const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
    expect(workflow).toContain('pnpm verify:packaging')
    expect(workflow).toContain('node scripts/release-preflight.mjs')
    expect(workflow).not.toContain('CSC_LINK')
    expect(workflow).not.toContain('APPLE_ID')
  })
})

describe('cross-platform packaging workflow contract', () => {
  it('builds unsigned Windows and macOS artifacts only on manual dispatch', async () => {
    const workflow = await readFile(new URL('../.github/workflows/package.yml', import.meta.url), 'utf8')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('runs-on: windows-latest')
    expect(workflow).toContain('runs-on: macos-latest')
    expect(workflow).toContain('pnpm dist:win:x64')
    expect(workflow).toContain('pnpm dist:mac:arm64')
    expect(workflow).toContain('actions/upload-artifact@v4')
    expect(workflow).toContain('pnpm verify:artifacts -- --platform win')
    expect(workflow).toContain('pnpm verify:artifacts -- --platform mac')
    expect(workflow).toContain('CSC_IDENTITY_AUTO_DISCOVERY: false')
    expect(workflow).not.toContain('APPLE_ID')
  })
})
