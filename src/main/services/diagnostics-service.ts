import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { atomicWriteFile } from './atomic-fs'
import { DomainError, redactSensitive } from './errors'
import type { ProjectService } from './project-service'
import type { WorkflowRunStore } from './workflow-run-store'
import type { AiInvocationAudit, DiagnosticsBundle } from '../../shared/diagnostics'
import { isInsideRoot } from './paths'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const gzipAsync = promisify(gzip)

export class DiagnosticsService {
  constructor(private readonly project: ProjectService, private readonly runs: WorkflowRunStore) {}

  async export(destination: string): Promise<{ destination: string; runCount: number; invocationCount: number }> {
    const bundle = await this.buildBundle()
    const output = this.validateDestination(destination)
    await atomicWriteFile(output, JSON.stringify(bundle, null, 2))
    return { destination: output, runCount: bundle.workflowRuns.length, invocationCount: bundle.aiInvocations.length }
  }

  async exportCompressed(destination: string): Promise<{ destination: string; runCount: number; invocationCount: number }> {
    const bundle = await this.buildBundle()
    const output = this.validateDestination(destination)
    await atomicWriteFile(output, await gzipAsync(JSON.stringify(bundle)))
    return { destination: output, runCount: bundle.workflowRuns.length, invocationCount: bundle.aiInvocations.length }
  }

  private validateDestination(destination: string): string {
    const info = this.project.getInfo()
    if (!info) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const output = resolve(destination)
    if (isInsideRoot(info.rootPath, output)) throw new DomainError('PATH_DENIED', '诊断包不能写入项目目录内')
    return output
  }

  private async buildBundle(): Promise<DiagnosticsBundle> {
    const info = this.project.getInfo()
    if (!info) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const invocations = await this.readInvocations(info.rootPath)
    const workflowRuns = (await this.runs.list(100)).map(sanitizeDiagnosticRun)
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), project: { title: info.manifest.title, schemaVersion: info.manifest.schemaVersion }, workflowRuns, aiInvocations: invocations }
  }

  private async readInvocations(root: string): Promise<AiInvocationAudit[]> {
    const logPath = `${root}/.novel/logs/ai-invocations.jsonl`
    const raw = await readFile(logPath, 'utf8').catch(() => '')
    return raw.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const value = sanitizeDiagnosticInvocation(JSON.parse(line))
        return value ? [value] : []
      } catch { return [] }
    }).slice(-500)
  }
}

/**
 * Keep the exported invocation record metadata-only even when reading a
 * legacy or hand-edited JSONL file. Do not spread the input object: unknown
 * fields could contain prompts, provider responses, credentials, or image
 * data URLs.
 */
export function sanitizeDiagnosticInvocation(value: unknown): AiInvocationAudit | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  if (
    typeof source.id !== 'string' || typeof source.kind !== 'string' || !['chat', 'stream'].includes(source.kind) ||
    typeof source.profileId !== 'string' || !isNonNegativeInteger(source.messageCount) ||
    !isNonNegativeInteger(source.inputChars) || typeof source.outcome !== 'string' ||
    !['succeeded', 'failed', 'cancelled'].includes(source.outcome) || typeof source.startedAt !== 'string' ||
    !isNonNegativeFinite(source.durationMs)
  ) return null
  const result: AiInvocationAudit = {
    id: source.id,
    kind: source.kind as AiInvocationAudit['kind'],
    profileId: source.profileId,
    messageCount: source.messageCount,
    inputChars: source.inputChars,
    outcome: source.outcome as AiInvocationAudit['outcome'],
    startedAt: source.startedAt,
    durationMs: source.durationMs
  }
  const optionalFields = Object.fromEntries(
    ['model', 'requestId', 'agentId', 'contextRecipeId', 'errorCategory']
      .filter((key) => typeof source[key] === 'string')
      .map((key) => [key, source[key]])
  )
  return { ...result, ...optionalFields, ...(isTokenUsage(source.usage) ? { usage: source.usage } : {}) }
}

function isTokenUsage(value: unknown): value is NonNullable<AiInvocationAudit['usage']> {
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  return ['inputTokens', 'outputTokens', 'totalTokens'].every((key) => typeof source[key] === 'number' && Number.isFinite(source[key]))
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeFinite(value) && Number.isInteger(value)
}

export function sanitizeDiagnosticRun(run: import('../../shared/runtime').WorkflowRun): import('../../shared/runtime').WorkflowRun {
  return {
    ...run,
    outputs: {},
    nodes: Object.fromEntries(Object.entries(run.nodes).map(([id, node]) => [id, {
      ...node,
      input: undefined,
      output: undefined,
      error: node.error ? redactSensitive(node.error) : undefined,
      log: node.log.map((entry) => redactSensitive(String(entry)))
    }]))
  }
}
