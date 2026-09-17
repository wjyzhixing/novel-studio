import { z } from 'zod'
import type { Result } from './result'
import { extensionPermissionSchema, type ExtensionPermission } from './extensions'
import { workflowSchema, type Workflow, type WorkflowSummary } from './workflow'

const semverRangeSchema = z.string().regex(/^(?:\^|~)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)

export const communityWorkflowDependencySchema = z.object({
  id: z.string().regex(/^ext_[a-zA-Z0-9_-]+$/),
  version: semverRangeSchema
}).strict()

export const communityWorkflowPromptSchema = z.object({
  id: z.string().regex(/^prompt_[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(160),
  template: z.string().max(100_000)
}).strict()

export const communityWorkflowPermissionSchema = z.object({
  permission: extensionPermissionSchema,
  reason: z.string().trim().min(1).max(500)
}).strict()

export const communityWorkflowPackageSchema = z.object({
  format: z.literal('novel-studio.community-workflow'),
  formatVersion: z.literal(1),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2_000).default(''),
  permissions: z.array(communityWorkflowPermissionSchema).max(20),
  dependencies: z.array(communityWorkflowDependencySchema).max(50),
  prompts: z.array(communityWorkflowPromptSchema).max(100),
  workflow: workflowSchema
}).strict().superRefine((value, context) => {
  const permissions = new Set<string>()
  value.permissions.forEach((item, index) => {
    if (permissions.has(item.permission)) context.addIssue({ code: 'custom', path: ['permissions', index, 'permission'], message: '权限不能重复声明' })
    permissions.add(item.permission)
  })
  const dependencies = new Set<string>()
  value.dependencies.forEach((item, index) => {
    if (dependencies.has(item.id)) context.addIssue({ code: 'custom', path: ['dependencies', index, 'id'], message: '依赖不能重复声明' })
    dependencies.add(item.id)
  })
  const promptIds = new Set<string>()
  value.prompts.forEach((item, index) => {
    if (promptIds.has(item.id)) context.addIssue({ code: 'custom', path: ['prompts', index, 'id'], message: 'Prompt ID 不能重复' })
    promptIds.add(item.id)
  })
})

export type CommunityWorkflowPackage = z.infer<typeof communityWorkflowPackageSchema>
export interface CommunityWorkflowPreview {
  name: string
  description: string
  workflow: Pick<Workflow, 'id' | 'name' | 'nodes' | 'variables'>
  permissions: readonly ExtensionPermission[]
  dependencies: readonly { id: string; version: string; installed: boolean }[]
  prompts: number
  promptNames: readonly string[]
}
export interface CommunityWorkflowApiContract {
  preview(sourcePath: string): Promise<Result<CommunityWorkflowPreview>>
  install(sourcePath: string, approvedPermissions?: readonly ExtensionPermission[]): Promise<Result<WorkflowSummary>>
  export(workflow: Workflow, destination: string): Promise<Result<null>>
}
