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
  it('builds unsigned Windows and macOS artifacts on release tags and publishes them', async () => {
    const workflow = await readFile(new URL('../.github/workflows/package.yml', import.meta.url), 'utf8')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('tags:')
    expect(workflow).toContain('permissions:\n      contents: write')
    expect(workflow).toContain('runs-on: windows-2022')
    expect(workflow).toContain('runs-on: macos-14')
    expect(workflow).toContain('pnpm dist:win:x64')
    expect(workflow).toContain('pnpm dist:mac:arm64')
    expect(workflow).toContain('actions/upload-artifact@v4')
    expect(workflow).toContain('pnpm verify:artifacts -- --platform win')
    expect(workflow).toContain('pnpm verify:artifacts -- --platform mac')
    expect(workflow).toContain('CSC_IDENTITY_AUTO_DISCOVERY: false')
    expect(workflow).toContain('actions/download-artifact@v4')
    expect(workflow).toContain('gh release create')
    expect(workflow).toContain('--verify-tag')
    expect(workflow).toContain('CHANGELOG.md')
    expect(workflow).toContain('for attempt in 1 2 3')
    expect(workflow).toContain('node node_modules/electron/install.js')
    expect(workflow).toContain("v1.0.0-retry*")
    expect(workflow).not.toContain('APPLE_ID')
  })
})
