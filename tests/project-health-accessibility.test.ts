import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { withTimeout } from '../src/renderer/src/lib/with-timeout'

describe('project health operation timeout', () => {
  it('resolves promptly and clears the timeout when the request succeeds', async () => {
    await expect(withTimeout(Promise.resolve('healthy'), 50, 'should not timeout')).resolves.toBe('healthy')
  })

  it('preserves an underlying IPC rejection before the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('ipc failed')), 50, 'should not timeout')).rejects.toThrow('ipc failed')
  })

  it('rejects a stuck integrity request with the supplied user-facing error', async () => {
    await expect(withTimeout(new Promise<never>(() => undefined), 5, 'integrity timeout')).rejects.toThrow('integrity timeout')
  })

  it('ignores a late resolution after the timeout has settled', async () => {
    let resolveRequest!: (value: string) => void
    const request = new Promise<string>((resolve) => { resolveRequest = resolve })
    await expect(withTimeout(request, 5, 'integrity timeout')).rejects.toThrow('integrity timeout')
    resolveRequest('late result')
    await new Promise((resolve) => setTimeout(resolve, 1))
  })

  it('ignores a late rejection after the timeout has settled', async () => {
    let rejectRequest!: (reason: Error) => void
    const request = new Promise<string>((_, reject) => { rejectRequest = reject })
    await expect(withTimeout(request, 5, 'integrity timeout')).rejects.toThrow('integrity timeout')
    rejectRequest(new Error('late failure'))
    await new Promise((resolve) => setTimeout(resolve, 1))
  })
})

describe('project health dialog accessibility contract', () => {
  it('traps keyboard focus and restores it after closing', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ProjectHealthPanel.tsx', import.meta.url), 'utf8')
    expect(source).toContain('const dialogRef = useRef<HTMLElement | null>(null)')
    expect(source).toContain('document.activeElement')
    expect(source).toContain('event.key === \'Tab\'')
    expect(source).toContain('event.preventDefault()')
    expect(source).toContain('ref={dialogRef}')
  })

  it('guards integrity and repair IPC calls against indefinite loading', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ProjectHealthPanel.tsx', import.meta.url), 'utf8')
    expect(source).toContain('HEALTH_OPERATION_TIMEOUT_MS = 15_000')
    expect(source).toContain('withTimeout(window.novelAPI.project.checkIntegrity()')
    expect(source).toContain('withTimeout(window.novelAPI.project.repairIndexes()')
    expect(source).toContain('operationRef.current !== operationId')
    expect(source).toContain('operationRef.current += 1')
    expect(source).toContain("uiText('integrityTimeout')")
    expect(source).toContain("uiText('repairTimeout')")
  })

  it('renders structured invalid Story Bible diagnostics without source payloads', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ProjectHealthPanel.tsx', import.meta.url), 'utf8')
    expect(source).toContain('invalidStoryArtifactDetails')
    expect(source).toContain('invalidArtifactDetails')
    expect(source).toContain('invalidArtifactIssue')
    expect(source).not.toContain('fields_json')
  })

  it('renders grouped legacy source diagnostics with field locations', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ProjectHealthPanel.tsx', import.meta.url), 'utf8')
    expect(source).toContain('invalidSourceDetails')
    expect(source).toContain('detail.path')
    expect(source).toContain('detail.issues')
    expect(source).toContain('invalidSourceIssue')
  })
})
