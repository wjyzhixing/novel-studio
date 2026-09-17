import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)

describe('packaging artifact verification', () => {
  it('checks builder inputs and build-before-package scripts', async () => {
    const script = await readFile(new URL('../scripts/verify-packaging-config.mjs', import.meta.url), 'utf8')
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> }
    expect(script).toContain('build.win?.icon')
    expect(script).toContain('build.mac?.icon')
    expect(script).toContain('dist:win')
    expect(script).toContain('dist:mac')
    expect(packageJson.scripts?.['dist:win']).toMatch(/npm run build/)
    expect(packageJson.scripts?.['dist:mac']).toMatch(/npm run build/)
    expect(packageJson.scripts?.['dist:mac:arm64']).toMatch(/electron-builder --mac dmg --arm64/)
    expect(packageJson.scripts?.['dist:mac:universal']).toMatch(/electron-builder --mac dmg --universal/)
    expect(packageJson.scripts?.['dist:win:x64']).toMatch(/electron-builder --win nsis --x64/)
  })

  it('provides a platform-aware release artifact check', async () => {
    const script = await readFile(new URL('../scripts/verify-packaging-artifacts.mjs', import.meta.url), 'utf8')
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> }
    expect(packageJson.scripts?.['verify:artifacts']).toContain('verify-packaging-artifacts.mjs')
    expect(packageJson.scripts?.['verify:release']).toContain('verify:packaging')
    expect(packageJson.scripts?.['verify:release']).toContain('verify:artifacts')
    expect(packageJson.scripts?.['verify:release']).toContain('release-preflight.mjs')
    expect(script).toContain('--platform')
    expect(script).toContain('.exe')
    expect(script).toContain('.dmg')
    expect(script).toContain('SHA-512')
    expect(script).toContain('latest-mac.yml')
    expect(script).toContain('安装测试')
  })

  it('fails when the requested release directory has no installers', async () => {
    const script = new URL('../scripts/verify-packaging-artifacts.mjs', import.meta.url)
    await expect(run(process.execPath, [script.pathname, '--dir', '/tmp/novel-studio-no-release-directory'])).rejects.toMatchObject({ code: 1 })
  })

  it('validates update metadata hashes for discovered platform manifests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-packaging-'))
    const artifact = Buffer.alloc(1_000_001, 7)
    await writeFile(join(root, 'Novel Studio-1.0.0-arm64.dmg'), artifact)
    const sha512 = createHash('sha512').update(artifact).digest('base64')
    await writeFile(join(root, 'latest-mac.yml'), `version: 1.0.0\nfiles:\n  - url: Novel Studio-1.0.0-arm64.dmg\n    sha512: ${sha512}\n    size: ${artifact.length}\n`)
    const script = new URL('../scripts/verify-packaging-artifacts.mjs', import.meta.url)
    const { stdout } = await run(process.execPath, [script.pathname, '--dir', root, '--platform', 'mac'])
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, metadata: { issues: [] } })
  })

  it('fails when installers exist but their platform update metadata is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-packaging-metadata-'))
    await writeFile(join(root, 'Novel Studio-1.0.0-x64.exe'), Buffer.alloc(1_000_001, 1))
    await writeFile(join(root, 'Novel Studio-1.0.0-arm64.dmg'), Buffer.alloc(1_000_001, 2))
    const script = new URL('../scripts/verify-packaging-artifacts.mjs', import.meta.url)

    await expect(run(process.execPath, [script.pathname, '--dir', root, '--platform', 'all'])).rejects.toMatchObject({ code: 1 })
  })

  it('fails when platform update metadata has no valid release version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-packaging-version-'))
    const artifact = Buffer.alloc(1_000_001, 3)
    await writeFile(join(root, 'Novel Studio-1.0.0-arm64.dmg'), artifact)
    const sha512 = createHash('sha512').update(artifact).digest('base64')
    await writeFile(join(root, 'latest-mac.yml'), `files:\n  - url: Novel Studio-1.0.0-arm64.dmg\n    sha512: ${sha512}\n    size: ${artifact.length}\n`)
    const script = new URL('../scripts/verify-packaging-artifacts.mjs', import.meta.url)

    await expect(run(process.execPath, [script.pathname, '--dir', root, '--platform', 'mac'])).rejects.toMatchObject({ code: 1 })
  })

  it('fails when update metadata omits the actual platform installer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-packaging-installer-binding-'))
    const installer = Buffer.alloc(1_000_001, 4)
    const helper = Buffer.alloc(1_000_001, 5)
    await writeFile(join(root, 'Novel Studio-1.0.0-arm64.dmg'), installer)
    await writeFile(join(root, 'Novel Studio-1.0.0-arm64.zip'), helper)
    const sha512 = createHash('sha512').update(helper).digest('base64')
    await writeFile(join(root, 'latest-mac.yml'), `version: 1.0.0\nfiles:\n  - url: Novel Studio-1.0.0-arm64.zip\n    sha512: ${sha512}\n    size: ${helper.length}\n`)
    const script = new URL('../scripts/verify-packaging-artifacts.mjs', import.meta.url)

    await expect(run(process.execPath, [script.pathname, '--dir', root, '--platform', 'mac'])).rejects.toMatchObject({ code: 1 })
  })

  it('resolves Electron extract-zip to the patched symlink guard', async () => {
    const electronRequire = createRequire(new URL('../node_modules/electron/install.js', import.meta.url))
    const extractZipPath = electronRequire.resolve('extract-zip')
    const source = await readFile(extractZipPath, 'utf8')
    expect(source).toContain('Symlink entries are not supported')
  })
})
