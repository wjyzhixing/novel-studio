import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CommunityWorkflowService } from '../src/main/services/community-workflow-service'
import { ExtensionRegistry } from '../src/main/services/extension-registry'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import type { CommunityWorkflowPackage } from '../src/shared/community-workflow'
import type { Workflow } from '../src/shared/workflow'

const workflow: Workflow = {
  schemaVersion: 1,
  id: 'flow_community_review',
  name: '社区审稿流程',
  cyclePolicy: 'reject',
  variables: [{ name: 'tone', type: 'string', defaultValue: '克制' }],
  nodes: [
    { id: 'input', type: 'input.chapter', label: '章节输入', position: { x: 0, y: 0 }, inputs: [], outputs: [{ id: 'out', type: 'chapter', required: false }], config: {} },
    { id: 'review', type: 'human.review', label: '人工审核', position: { x: 220, y: 0 }, inputs: [{ id: 'in', type: 'chapter', required: true }], outputs: [{ id: 'out', type: 'any', required: false }], config: {} }
  ],
  edges: [{ id: 'edge', source: 'input', sourcePort: 'out', target: 'review', targetPort: 'in' }]
}

function packageValue(overrides: Partial<CommunityWorkflowPackage> = {}): CommunityWorkflowPackage {
  return {
    format: 'novel-studio.community-workflow',
    formatVersion: 1,
    name: '社区审稿流程',
    description: '只包含工作流数据',
    permissions: [],
    dependencies: [],
    prompts: [{ id: 'prompt_review', name: '审稿提示', template: '检查章节的一致性。' }],
    workflow,
    ...overrides
  }
}

describe('community workflow data packages', () => {
  it('installs a valid data-only package into project workflows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-community-workflow-'))
    try {
      const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
      await project.create(join(root, 'book'), 'Community fixture')
      const source = join(root, 'community.novelflow')
      await writeFile(source, JSON.stringify(packageValue()), 'utf8')
      const service = new CommunityWorkflowService(project, new ExtensionRegistry())

      await expect(service.install(source)).resolves.toMatchObject({ id: workflow.id, name: workflow.name })
      await expect(readFile(join(root, 'book', 'workflows', `${workflow.id}.novelflow.json`), 'utf8')).resolves.toContain(workflow.name)
      await expect(readFile(join(root, 'book', 'prompts', 'community', workflow.id, 'prompt_review.md'), 'utf8')).resolves.toContain('检查章节的一致性')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('includes Prompt Pack names in the import preview', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-community-workflow-'))
    try {
      const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
      await project.create(join(root, 'book'), 'Community fixture')
      const source = join(root, 'community.novelflow')
      await writeFile(source, JSON.stringify(packageValue()), 'utf8')
      const service = new CommunityWorkflowService(project, new ExtensionRegistry())

      await expect(service.preview(source)).resolves.toMatchObject({ promptNames: ['审稿提示'], prompts: 1 })
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects executable or secret-like package fields before replacing an existing workflow', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-community-workflow-'))
    try {
      const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
      await project.create(join(root, 'book'), 'Community fixture')
      const target = join(root, 'book', 'workflows', `${workflow.id}.novelflow.json`)
      const original = JSON.stringify(workflow)
      await writeFile(target, `${original}\n`, 'utf8')
      const source = join(root, 'malicious.novelflow')
      await writeFile(source, JSON.stringify(packageValue({ workflow: { ...workflow, config: { apiKey: 'secret' } } as Workflow })), 'utf8')
      const service = new CommunityWorkflowService(project, new ExtensionRegistry())

      await expect(service.install(source)).rejects.toThrow('敏感')
      await expect(readFile(target, 'utf8')).resolves.toBe(`${original}\n`)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects unresolved extension dependencies without executing package code', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-community-workflow-'))
    try {
      const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
      await project.create(join(root, 'book'), 'Community fixture')
      const source = join(root, 'dependency.novelflow')
      await writeFile(source, JSON.stringify(packageValue({ dependencies: [{ id: 'ext_missing', version: '^1.0.0' }] })), 'utf8')
      const service = new CommunityWorkflowService(project, new ExtensionRegistry())

      await expect(service.install(source)).rejects.toThrow('依赖未安装')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects unregistered executable node types before installation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-community-workflow-'))
    try {
      const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
      await project.create(join(root, 'book'), 'Community fixture')
      const source = join(root, 'unknown-node.novelflow')
      const maliciousWorkflow = { ...workflow, nodes: workflow.nodes.map((node) => node.id === 'review' ? { ...node, type: 'community.execute-code' } : node) }
      await writeFile(source, JSON.stringify(packageValue({ workflow: maliciousWorkflow })), 'utf8')
      const service = new CommunityWorkflowService(project, new ExtensionRegistry())

      await expect(service.install(source)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('allows a node type only when its Main-owned handler is registered', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-community-workflow-'))
    try {
      const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
      await project.create(join(root, 'book'), 'Community fixture')
      const source = join(root, 'registered-node.novelflow')
      const registry = new ExtensionRegistry()
      registry.registerWorkflowNode({ type: 'demo.node', label: 'Demo', inputTypes: [], outputTypes: ['any'], run: async () => null })
      const customWorkflow = { ...workflow, nodes: workflow.nodes.map((node) => node.id === 'review' ? { ...node, type: 'demo.node' } : node) }
      await writeFile(source, JSON.stringify(packageValue({ workflow: customWorkflow })), 'utf8')
      const service = new CommunityWorkflowService(project, registry)

      await expect(service.install(source)).resolves.toMatchObject({ id: workflow.id })
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects an installed dependency whose version does not satisfy the package range', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-community-workflow-'))
    try {
      const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
      await project.create(join(root, 'book'), 'Community fixture')
      const source = join(root, 'dependency-version.novelflow')
      const registry = new ExtensionRegistry()
      registry.registerManifest({ id: 'ext_base', name: 'Base', version: '1.2.0', permissions: [] })
      await writeFile(source, JSON.stringify(packageValue({ dependencies: [{ id: 'ext_base', version: '^2.0.0' }] })), 'utf8')
      const service = new CommunityWorkflowService(project, registry)

      await expect(service.install(source)).rejects.toThrow('版本不兼容')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('requires explicit approval for every declared community permission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-community-workflow-'))
    try {
      const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
      await project.create(join(root, 'book'), 'Community fixture')
      const source = join(root, 'permission.novelflow')
      await writeFile(source, JSON.stringify(packageValue({ permissions: [{ permission: 'project.read', reason: '读取章节' }] })), 'utf8')
      const service = new CommunityWorkflowService(project, new ExtensionRegistry())

      await expect(service.install(source)).rejects.toThrow('未获得用户批准')
      await expect(service.install(source, ['project.read'])).resolves.toMatchObject({ id: workflow.id })
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('exports a validated workflow as a data-only package outside the project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-community-workflow-'))
    try {
      const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
      await project.create(join(root, 'book'), 'Community fixture')
      const destination = join(root, 'exported.novelflow.json')
      const service = new CommunityWorkflowService(project, new ExtensionRegistry())

      await expect(service.export(workflow, destination)).resolves.toBeNull()
      const exported = JSON.parse(await readFile(destination, 'utf8')) as CommunityWorkflowPackage
      expect(exported.format).toBe('novel-studio.community-workflow')
      expect(exported.workflow.id).toBe(workflow.id)
      await expect(service.export(workflow, join(root, 'book', 'workflows', 'blocked.novelflow.json'))).rejects.toMatchObject({ code: 'PATH_DENIED' })
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('round-trips installed Prompt Pack entries when exporting the workflow', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-community-workflow-'))
    try {
      const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
      await project.create(join(root, 'book'), 'Community fixture')
      const source = join(root, 'community.novelflow')
      const destination = join(root, 'round-trip.novelflow.json')
      await writeFile(source, JSON.stringify(packageValue()), 'utf8')
      const service = new CommunityWorkflowService(project, new ExtensionRegistry())

      await service.install(source)
      await service.export(workflow, destination)
      const exported = JSON.parse(await readFile(destination, 'utf8')) as CommunityWorkflowPackage
      expect(exported.prompts).toEqual(packageValue().prompts)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
