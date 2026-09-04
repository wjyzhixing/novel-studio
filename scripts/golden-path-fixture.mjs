import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const run = promisify(execFile)

export async function createGoldenFixture(parentDir = tmpdir()) {
  const taskRoot = await mkdtemp(join(parentDir, 'novel-studio-golden-'))
  let cleaned = false
  try {
    await run(process.execPath, ['scripts/generate-fixtures.mjs', taskRoot], { cwd: process.cwd() })
    const projectRoot = join(taskRoot, 'tiny-cn')
    const chapterRelPath = 'chapters/001-fixture.md'
    const evidencePath = join(taskRoot, 'golden-evidence.json')
    const evidence = Object.freeze({ projectCreated: true, projectName: 'tiny-cn', chapterRelPath, providerMode: 'fixture', sourceRoot: '[temporary]' })
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
    const cleanup = async () => {
      if (cleaned) return
      cleaned = true
      await rm(taskRoot, { recursive: true, force: true })
    }
    return Object.freeze({ taskRoot, projectRoot, chapterRelPath, evidencePath, evidence, cleanup })
  } catch (error) {
    await rm(taskRoot, { recursive: true, force: true })
    throw error
  }
}

export async function readFixtureEvidence(fixture) {
  const value = JSON.parse(await readFile(fixture.evidencePath, 'utf8'))
  return Object.freeze(value)
}

if (process.argv[1] && process.argv[1].endsWith('golden-path-fixture.mjs')) {
  const fixture = await createGoldenFixture()
  await fixture.cleanup()
  console.log(JSON.stringify({ ...fixture.evidence, cleaned: true }))
}
