import { describe, expect, it } from 'vitest'
import { sanitizeDiagnosticInvocation, sanitizeDiagnosticRun } from '../src/main/services/diagnostics-service'
import { DiagnosticsService } from '../src/main/services/diagnostics-service'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { WorkflowRunStore } from '../src/main/services/workflow-run-store'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { makeTempRoot } from './helpers'
import { DomainError, redactLogMessage, redactSensitive, toAppError } from '../src/main/services/errors'

const gunzipAsync = promisify(gunzip)

describe('diagnostics export safety', () => {
  it('redacts header and JSON-style credential fields', () => {
    const value = redactSensitive('x-api-key: live-secret Authorization: Basic abc123 {"apiKey":"json-secret","token":"json-token"} https://example.test/?access_token=url-secret&refresh_token=refresh-secret')
    expect(value).not.toContain('live-secret')
    expect(value).not.toContain('abc123')
    expect(value).not.toContain('json-secret')
    expect(value).not.toContain('json-token')
    expect(value).not.toContain('url-secret')
    expect(value).not.toContain('refresh-secret')
  })

  it('redacts sensitive strings inside IPC error details without dropping safe context', () => {
    const error = toAppError(new DomainError('INTERNAL', '请求失败', {
      details: { provider: 'fixture', error: 'Bearer sk_test_secret_123456789', nested: ['data:image/png;base64,QUJD', 'safe'] }
    }))
    expect(error.details).toEqual({ provider: 'fixture', error: 'Bearer [redacted]', nested: ['[redacted-data-url]', 'safe'] })
  })

  it('redacts secrets and embedded image data from node logs and errors', () => {
    const run = {
      id: 'run_safe', workflowId: 'flow_safe', status: 'failed' as const, nodes: {
        node: {
          nodeId: 'node', status: 'failed' as const, input: { prompt: '正文' }, output: { data: 'secret' }, attempts: 1,
          error: 'Bearer sk_test_secret_123456789', log: ['data:image/png;base64,QUJDREVGRw=='],
        }
      }, outputs: { node: '正文' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:01.000Z'
    }

    const sanitized = sanitizeDiagnosticRun(run)
    const node = sanitized.nodes.node
    expect(node.input).toBeUndefined()
    expect(node.output).toBeUndefined()
    expect(node.error).toBe('Bearer [redacted]')
    expect(node.log[0]).toBe('[redacted-data-url]')
  })

  it('redacts numeric base64 data URLs and access-token query parameters', () => {
    const value = redactSensitive('data:image/png;base64,QUJD123+/= https://example.test/a?access_token=abc123&api_key=xyz')
    expect(value).toBe('[redacted-data-url] https://example.test/a?access_token=[redacted]&api_key=[redacted]')
  })

  it('normalizes and bounds dynamic main-process log messages', () => {
    const value = redactLogMessage(`  Bearer secret-token\n${'x'.repeat(700)}  `, 64)
    expect(value.startsWith('Bearer [redacted] ')).toBe(true)
    expect(value.length).toBeLessThanOrEqual(64)
    expect(value).not.toContain('\n')
  })

  it('exports only metadata fields from legacy AI invocation records', () => {
    const sanitized = sanitizeDiagnosticInvocation({
      id: 'ai_legacy', kind: 'chat', profileId: 'profile_writer', model: 'model-a', requestId: 'req-1',
      messageCount: 2, inputChars: 100, outcome: 'succeeded', startedAt: '2026-01-01T00:00:00.000Z', durationMs: 12,
      prompt: '正文机密', ['api' + 'Key']: 'test-api-key-placeholder', image: 'data:image/png;base64,QUJD123+/='
    })
    expect(sanitized).toEqual({
      id: 'ai_legacy', kind: 'chat', profileId: 'profile_writer', model: 'model-a', requestId: 'req-1',
      messageCount: 2, inputChars: 100, outcome: 'succeeded', startedAt: '2026-01-01T00:00:00.000Z', durationMs: 12
    })
  })

  it('rejects malformed invocation counters instead of exporting misleading metadata', () => {
    expect(sanitizeDiagnosticInvocation({
      id: 'ai_bad', kind: 'chat', profileId: 'profile_writer', messageCount: -1, inputChars: 4,
      outcome: 'succeeded', startedAt: '2026-01-01T00:00:00.000Z', durationMs: Number.POSITIVE_INFINITY
    })).toBeNull()
  })

  it('keeps valid usage metadata while dropping malformed usage', () => {
    const valid = sanitizeDiagnosticInvocation({
      id: 'ai_usage', kind: 'stream', profileId: 'profile_writer', messageCount: 1, inputChars: 4,
      outcome: 'failed', startedAt: '2026-01-01T00:00:00.000Z', durationMs: 3,
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }, errorCategory: 'provider', unknown: 'secret'
    })
    expect(valid).toMatchObject({ usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }, errorCategory: 'provider' })
    expect(sanitizeDiagnosticInvocation({
      id: 'ai_usage_bad', kind: 'chat', profileId: 'profile_writer', messageCount: 1, inputChars: 4,
      outcome: 'succeeded', startedAt: '2026-01-01T00:00:00.000Z', durationMs: 3,
      usage: { inputTokens: 1, outputTokens: Number.NaN, totalTokens: 3 }
    })).not.toHaveProperty('usage')
  })

  it('exports a metadata-only diagnostics bundle outside the project root', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Diagnostics export')
    const projectRoot = project.getInfo()!.rootPath
    await mkdir(join(projectRoot, '.novel/logs'), { recursive: true })
    await writeFile(join(projectRoot, '.novel/logs/ai-invocations.jsonl'), [
      JSON.stringify({ id: 'ai_export', kind: 'chat', profileId: 'profile_writer', messageCount: 1, inputChars: 8, outcome: 'succeeded', startedAt: '2026-01-01T00:00:00.000Z', durationMs: 5, prompt: 'secret prompt' }),
      '{malformed}'
    ].join('\n'))
    const runs = new WorkflowRunStore(project)
    await runs.save({ id: 'run_export', workflowId: 'workflow_export', status: 'failed', nodes: { node: { nodeId: 'node', status: 'failed', input: { prompt: 'private' }, output: { answer: 'private' }, attempts: 1, error: 'Bearer secret-token', log: ['safe log'] } }, outputs: { node: 'private' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:01.000Z' })
    const destination = join(root, 'diagnostics.json')
    const result = await new DiagnosticsService(project, runs).export(destination)
    expect(result).toMatchObject({ destination, runCount: 1, invocationCount: 1 })
    const bundle = JSON.parse(await readFile(destination, 'utf8'))
    expect(bundle.project).toEqual({ title: 'Diagnostics export', schemaVersion: 1 })
    expect(bundle.workflowRuns[0].outputs).toEqual({})
    expect(bundle.workflowRuns[0].nodes.node.input).toBeUndefined()
    expect(bundle.workflowRuns[0].nodes.node.error).toBe('Bearer [redacted]')
    expect(JSON.stringify(bundle)).not.toContain('secret prompt')
    await expect(new DiagnosticsService(project, runs).export(join(projectRoot, 'inside.json'))).rejects.toThrow('不能写入项目目录内')
  })

  it('rejects diagnostics export when no project is open', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await expect(new DiagnosticsService(project, new WorkflowRunStore(project)).export(join(root, 'diagnostics.json'))).rejects.toThrow('当前没有打开的项目')
  })

  it('exports a redacted diagnostics bundle as gzip', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Compressed diagnostics')
    const runs = new WorkflowRunStore(project)
    const destination = join(root, 'diagnostics.json.gz')
    await new DiagnosticsService(project, runs).exportCompressed(destination)
    const bundle = JSON.parse((await gunzipAsync(await readFile(destination))).toString('utf8'))
    expect(bundle.schemaVersion).toBe(1)
    expect(bundle.project.title).toBe('Compressed diagnostics')
  })
})
