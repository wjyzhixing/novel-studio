import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeTempRoot } from './helpers'
import { readFile } from 'node:fs/promises'

const run = promisify(execFile)

describe('fixture verifier', () => {
  it('exposes a repository-safe release fixture verification command', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> }
    const script = await readFile(new URL('../scripts/verify-generated-fixtures.mjs', import.meta.url), 'utf8')
    expect(packageJson.scripts?.['verify:fixtures']).toBe('node scripts/verify-generated-fixtures.mjs')
    expect(packageJson.scripts?.['verify:release']).toContain('verify:fixtures')
    expect(script).toContain('mkdtemp')
    expect(script).toContain('generate-fixtures.mjs')
    expect(script).toContain('verify-fixtures.mjs')
  })

  it('reports the purpose-specific contract for the small, conflict, and image fixtures', async () => {
    const root = await makeTempRoot()
    await run(process.execPath, ['scripts/generate-fixtures.mjs', root], { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 })
    const { stdout } = await run(process.execPath, ['scripts/verify-fixtures.mjs', root], { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 })
    const report = JSON.parse(stdout) as { projects: Array<{ name: string; migrationReady?: boolean; profile?: Record<string, unknown> }> }
    expect(report.projects.find((project) => project.name === 'tiny-cn')?.profile).toEqual({ chapterFiles: 3, entityFiles: 2 })
    expect(report.projects.find((project) => project.name === 'conflict-cn')?.profile).toEqual({ chapterFiles: 1, hasInjuryConflict: true, artifactFiles: 1 })
    expect(report.projects.find((project) => project.name === 'image-heavy')?.profile).toEqual({ imageFiles: 30, sidecarFiles: 30, validSidecars: 30 })
    expect(report.projects.find((project) => project.name === 'migration-v0')?.migrationReady).toBe(true)
    expect(report.projects.find((project) => project.name === 'migration-v1')?.migrationReady).toBe(true)
  })

  it('verifies the long fixture scale when explicitly requested', async () => {
    const root = await makeTempRoot()
    await run(process.execPath, ['scripts/generate-fixtures.mjs', root, '--long'], { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 })
    const { stdout } = await run(process.execPath, ['scripts/verify-fixtures.mjs', root, '--long'], { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 })
    const report = JSON.parse(stdout) as { long?: { chapterFiles: number; entityFiles: number; factRows: number; fourDigitChapterNames: boolean } }
    expect(report.long).toEqual({ chapterFiles: 1000, entityFiles: 1000, factRows: 100000, fourDigitChapterNames: true })
  }, 60_000)
})
