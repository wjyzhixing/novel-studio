import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { atomicWriteFile } from './atomic-fs'
import { DomainError } from './errors'
import type { ProjectService } from './project-service'
import type { WorkflowRunStore } from './workflow-run-store'
import type { AiInvocationAudit, DiagnosticsBundle } from '../../shared/diagnostics'
import { isInsideRoot } from './paths'

export class DiagnosticsService {
  constructor(private readonly project: ProjectService, private readonly runs: WorkflowRunStore) {}

  async export(destination: string): Promise<{ destination: string; runCount: number; invocationCount: number }> {
    const info = this.project.getInfo()
    if (!info) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const output = resolve(destination)
    if (isInsideRoot(info.rootPath, output)) throw new DomainError('PATH_DENIED', '诊断包不能写入项目目录内')
    const invocations = await this.readInvocations(info.rootPath)
    const workflowRuns = (await this.runs.list(100)).map(sanitizeRun)
    const bundle: DiagnosticsBundle = { schemaVersion: 1, generatedAt: new Date().toISOString(), project: { title: info.manifest.title, schemaVersion: info.manifest.schemaVersion }, workflowRuns, aiInvocations: invocations }
    await atomicWriteFile(output, JSON.stringify(bundle, null, 2))
    return { destination: output, runCount: bundle.workflowRuns.length, invocationCount: bundle.aiInvocations.length }
  }

  private async readInvocations(root: string): Promise<AiInvocationAudit[]> {
    const logPath = `${root}/.novel/logs/ai-invocations.jsonl`
    const raw = await readFile(logPath, 'utf8').catch(() => '')
    return raw.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const value = JSON.parse(line) as AiInvocationAudit
        return value && typeof value.id === 'string' && typeof value.profileId === 'string' ? [value] : []
      } catch { return [] }
    }).slice(-500)
  }
}

function sanitizeRun(run: import('../../shared/runtime').WorkflowRun): import('../../shared/runtime').WorkflowRun {
  return { ...run, outputs: {}, nodes: Object.fromEntries(Object.entries(run.nodes).map(([id, node]) => [id, { ...node, input: undefined, output: undefined }])) }
}
