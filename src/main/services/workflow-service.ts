import { readFile, readdir } from 'node:fs/promises'
import { basename } from 'node:path'
import { atomicWriteFile } from './atomic-fs'
import type { ProjectService } from './project-service'
import { DomainError } from './errors'
import { workflowSchema, type Workflow, type WorkflowSummary } from '../../shared/workflow'
import { validateWorkflow } from './workflow-validation'
import { builtinNovelFlow } from '../../shared/builtin-workflow'

const WORKFLOWS_DIR = 'workflows'
const FILE_RE = /^flow_[a-zA-Z0-9_-]+\.novelflow\.json$/

export class WorkflowService {
  constructor(private readonly project: ProjectService) {}
  async list(): Promise<WorkflowSummary[]> {
    const dir = this.project.resolveInProject(WORKFLOWS_DIR); let files: string[]
    try { files = await readdir(dir) } catch { return [] }
    const summaries: WorkflowSummary[] = []
    for (const file of files.filter((name) => FILE_RE.test(name))) {
      const relPath = `${WORKFLOWS_DIR}/${file}`
      try { const workflow = await this.read(relPath); summaries.push({ id: workflow.id, name: workflow.name, relPath }) } catch { /* invalid files are excluded from picker */ }
    }
    return summaries.sort((a, b) => a.name.localeCompare(b.name))
  }
  async read(relPath: string): Promise<Workflow> {
    this.validatePath(relPath)
    try {
      const workflow = workflowSchema.parse(JSON.parse(await readFile(this.project.resolveInProject(relPath), 'utf8')))
      if (workflow.id === 'flow_builtin_novel' && (!workflow.nodes.some((node) => node.id === 'critic-character') || !workflow.nodes.some((node) => node.id === 'image-propose') || !workflow.nodes.some((node) => node.type === 'chapter.write'))) {
        const upgraded = builtinNovelFlow()
        await atomicWriteFile(this.project.resolveInProject(relPath), JSON.stringify(upgraded, null, 2) + '\n')
        return upgraded
      }
      return workflow
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError('INVALID_PROJECT', `Workflow 文件无效: ${basename(relPath)}`)
    }
  }
  async save(input: Workflow): Promise<WorkflowSummary> {
    const workflow = workflowSchema.parse(input); const issues = validateWorkflow(workflow)
    if (issues.length) throw new DomainError('VALIDATION_FAILED', 'Workflow 校验失败', { details: issues })
    const relPath = `${WORKFLOWS_DIR}/${workflow.id}.novelflow.json`
    await atomicWriteFile(this.project.resolveInProject(relPath), JSON.stringify(workflow, null, 2) + '\n')
    return { id: workflow.id, name: workflow.name, relPath }
  }
  async validate(input: Workflow) { return validateWorkflow(workflowSchema.parse(input)) }
  private validatePath(relPath: string) { if (!relPath.startsWith(`${WORKFLOWS_DIR}/`) || !FILE_RE.test(basename(relPath)) || relPath.includes('..')) throw new DomainError('PATH_DENIED', 'Workflow 路径必须位于 workflows/ 下') }
}
