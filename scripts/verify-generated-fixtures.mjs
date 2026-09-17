import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = await mkdtemp(join(tmpdir(), 'novel-studio-fixtures-'))

try {
  const generated = await run(process.execPath, ['scripts/generate-fixtures.mjs', root], { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 })
  if (generated.stdout) process.stdout.write(generated.stdout)
  const verified = await run(process.execPath, ['scripts/verify-fixtures.mjs', root], { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 })
  if (verified.stdout) process.stdout.write(verified.stdout)
  if (verified.stderr) process.stderr.write(verified.stderr)
} catch (error) {
  if (error && typeof error === 'object' && 'stdout' in error && error.stdout) process.stdout.write(String(error.stdout))
  if (error && typeof error === 'object' && 'stderr' in error && error.stderr) process.stderr.write(String(error.stderr))
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await rm(root, { recursive: true, force: true })
}
