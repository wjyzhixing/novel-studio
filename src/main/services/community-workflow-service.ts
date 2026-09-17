import { readFile, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import type { CommunityWorkflowPackage, CommunityWorkflowPreview } from '../../shared/community-workflow'
import type { ExtensionPermission } from '../../shared/extensions'
import { communityWorkflowPackageSchema } from '../../shared/community-workflow'
import type { Workflow, WorkflowSummary } from '../../shared/workflow'
import { workflowSchema } from '../../shared/workflow'
import { ExtensionRegistry } from './extension-registry'
import { DomainError } from './errors'
import { atomicWriteFile } from './atomic-fs'
import { ProjectService } from './project-service'
import { validateWorkflow } from './workflow-validation'
import { isInsideRoot } from './paths'

const MAX_PACKAGE_BYTES = 4 * 1024 * 1024
const SENSITIVE_KEY = /(?:secret|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|credential)/i
const COMMUNITY_WORKFLOW_FILE_RE = /^[a-zA-Z0-9_-]+\.novelflow\.json$/
const COMMUNITY_PROMPT_ID_RE = /^prompt_[a-zA-Z0-9_-]+$/

export class CommunityWorkflowService {
  constructor(private readonly project: ProjectService, private readonly registry: ExtensionRegistry) {}

  async preview(sourcePath: string): Promise<CommunityWorkflowPreview> {
    const value = await this.readPackage(sourcePath)
    return {
      name: value.name,
      description: value.description,
      workflow: { id: value.workflow.id, name: value.workflow.name, nodes: value.workflow.nodes, variables: value.workflow.variables },
      permissions: value.permissions.map(({ permission }) => permission),
      dependencies: value.dependencies.map((dependency) => ({ ...dependency, installed: this.registry.snapshot().manifests.some((manifest) => manifest.id === dependency.id) })),
      prompts: value.prompts.length,
      promptNames: value.prompts.map(({ name }) => name)
    }
  }

  async install(sourcePath: string, approvedPermissions: readonly ExtensionPermission[] = []): Promise<WorkflowSummary> {
    const value = await this.readPackage(sourcePath)
    this.assertPermissionApproval(value, approvedPermissions)
    this.registry.assertDependencies(value.dependencies)
    const issues = validateWorkflow(value.workflow, this.registry.snapshot().workflowNodes.map(({ type }) => type))
    if (issues.length) throw new DomainError('VALIDATION_FAILED', 'Community Workflow 校验失败', { details: issues })
    const relPath = `workflows/${value.workflow.id}.novelflow.json`
    await this.persistPrompts(value.workflow.id, value.prompts)
    await atomicWriteFile(this.project.resolveInProject(relPath), `${JSON.stringify(value.workflow, null, 2)}\n`)
    return { id: value.workflow.id, name: value.workflow.name, relPath }
  }

  private assertPermissionApproval(value: CommunityWorkflowPackage, approvedPermissions: readonly ExtensionPermission[]): void {
    const required = new Set(value.permissions.map(({ permission }) => permission))
    const approved = new Set(approvedPermissions)
    if (approved.size !== approvedPermissions.length || [...approved].some((permission) => !required.has(permission)) || approved.size !== required.size) {
      throw new DomainError('VALIDATION_FAILED', 'Community Workflow 权限未获得用户批准')
    }
  }

  async export(workflow: Workflow, destination: string): Promise<null> {
    const value = workflowSchema.parse(workflow)
    const issues = validateWorkflow(value)
    if (issues.length) throw new DomainError('VALIDATION_FAILED', 'Workflow 校验失败', { details: issues })
    await this.assertExportDestination(destination)
    const prompts = await this.readPersistedPrompts(value.id)
    const packageValue: CommunityWorkflowPackage = {
      format: 'novel-studio.community-workflow',
      formatVersion: 1,
      name: value.name,
      description: '',
      permissions: [],
      dependencies: [],
      prompts,
      workflow: value
    }
    await atomicWriteFile(destination, `${JSON.stringify(packageValue, null, 2)}\n`)
    return null
  }

  private async persistPrompts(workflowId: string, prompts: CommunityWorkflowPackage['prompts']): Promise<void> {
    const directory = this.project.resolveInProject(`prompts/community/${workflowId}`)
    const manifest = {
      format: 'novel-studio.community-prompt-pack',
      formatVersion: 1,
      workflowId,
      prompts: prompts.map(({ id, name }) => ({ id, name, file: `${id}.md` }))
    }
    await atomicWriteFile(resolve(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    for (const prompt of prompts) {
      if (!COMMUNITY_PROMPT_ID_RE.test(prompt.id)) throw new DomainError('VALIDATION_FAILED', 'Community Prompt ID 不合法')
      await atomicWriteFile(resolve(directory, `${prompt.id}.md`), prompt.template)
    }
  }

  private async readPersistedPrompts(workflowId: string): Promise<CommunityWorkflowPackage['prompts']> {
    const directory = this.project.resolveInProject(`prompts/community/${workflowId}`)
    let raw: string
    try { raw = await readFile(resolve(directory, 'manifest.json'), 'utf8') } catch { return [] }
    let input: unknown
    try { input = JSON.parse(raw) } catch { return [] }
    if (!input || typeof input !== 'object') return []
    const entries = (input as { prompts?: unknown }).prompts
    if (!Array.isArray(entries)) return []
    const prompts: CommunityWorkflowPackage['prompts'] = []
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const value = entry as { id?: unknown; name?: unknown; file?: unknown }
      if (typeof value.id !== 'string' || !COMMUNITY_PROMPT_ID_RE.test(value.id) || typeof value.name !== 'string' || typeof value.file !== 'string' || value.file !== `${value.id}.md`) continue
      try {
        const template = await readFile(resolve(directory, value.file), 'utf8')
        prompts.push({ id: value.id, name: value.name, template })
      } catch { /* ignore incomplete historical prompt entries */ }
    }
    return prompts
  }

  private async readPackage(sourcePath: string): Promise<CommunityWorkflowPackage> {
    let raw: string
    try {
      const file = await readFile(sourcePath)
      if (file.byteLength > MAX_PACKAGE_BYTES) throw new DomainError('VALIDATION_FAILED', 'Community Workflow 包不能超过 4 MB')
      raw = file.toString('utf8')
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError('IO_ERROR', '无法读取 Community Workflow 包')
    }
    let input: unknown
    try { input = JSON.parse(raw) } catch { throw new DomainError('VALIDATION_FAILED', 'Community Workflow 包不是有效 JSON') }
    this.rejectSensitiveFields(input)
    const parsed = communityWorkflowPackageSchema.safeParse(input)
    if (!parsed.success) throw new DomainError('VALIDATION_FAILED', 'Community Workflow 包格式无效', { details: parsed.error.issues })
    return parsed.data
  }

  private rejectSensitiveFields(value: unknown, path = 'package'): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach((item, index) => this.rejectSensitiveFields(item, `${path}[${index}]`)); return }
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) throw new DomainError('VALIDATION_FAILED', `Community Workflow 包包含敏感字段：${path}.${key}`)
      this.rejectSensitiveFields(child, `${path}.${key}`)
    }
  }

  private async assertExportDestination(destination: string): Promise<void> {
    if (!destination || !isAbsolute(destination)) throw new DomainError('VALIDATION_FAILED', 'Workflow 导出位置必须是绝对路径')
    const target = resolve(destination)
    const projectRoot = this.project.getInfo()?.rootPath
    if (!projectRoot) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const canonicalParent = await realpath(dirname(target)).catch(() => dirname(target))
    if (isInsideRoot(projectRoot, target) || isInsideRoot(projectRoot, canonicalParent)) throw new DomainError('PATH_DENIED', 'Workflow 导出不能覆盖当前项目文件')
    if (!COMMUNITY_WORKFLOW_FILE_RE.test(basename(target))) throw new DomainError('VALIDATION_FAILED', 'Workflow 导出文件名必须以 .novelflow.json 结尾')
  }
}
