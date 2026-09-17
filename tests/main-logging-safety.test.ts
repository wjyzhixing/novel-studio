import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('main process logging safety', () => {
  it('redacts all dynamic startup and renderer failure log messages', async () => {
    const source = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    expect(source).toContain("import { redactLogMessage } from './services/errors'")
    expect(source).toContain('redactLogMessage(`[did-fail-load]')
    expect(source).toContain('redactLogMessage(`[render-process-gone]')
    expect(source).toContain('redactLogMessage(`[extensions] trusted publisher configuration unavailable:')
    expect(source).toContain('redactLogMessage(`[extensions] installed package recovery skipped:')
  })
})
