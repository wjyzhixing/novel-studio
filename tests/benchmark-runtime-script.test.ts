import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('runtime benchmark command', () => {
  it('has bounded iterations, uses the long runtime verifier, and emits timing summaries', async () => {
    const script = await readFile(new URL('../scripts/benchmark-runtime.mjs', import.meta.url), 'utf8')
    expect(script).toContain("process.argv.find((value) => value.startsWith('--iterations='))")
    expect(script).toContain('Math.min(10')
    expect(script).toContain("'--long'")
    expect(script).toContain('timingsMs')
    expect(script).toContain('averageMs')
  })

  it('emits reproducible environment and percentile data with optional budget gates', async () => {
    const script = await readFile(new URL('../scripts/benchmark-runtime.mjs', import.meta.url), 'utf8')
    expect(script).toContain("platform: process.platform")
    expect(script).toContain('p95')
    expect(script).toContain('`--budget-${key}=`')
    expect(script).toContain('budgetPassed')
    expect(script).toContain('process.exitCode = 1')
  })
})
