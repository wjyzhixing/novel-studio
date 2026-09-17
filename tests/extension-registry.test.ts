import { describe, expect, it } from 'vitest'
import { ExtensionRegistry } from '../src/main/services/extension-registry'

describe('ExtensionRegistry runtime descriptors', () => {
  it('registers each descriptor family, replaces duplicates, and exposes a safe snapshot', () => {
    const registry = new ExtensionRegistry()
    registry.registerManifest({ id: 'ext_demo', name: 'Demo', version: '1.0.0', permissions: [] })
    registry.registerManifest({ id: 'ext_demo', name: 'Demo v2', version: '2.0.0', permissions: [{ permission: 'project.read', reason: '读取项目' }] })

    const provider = { id: 'provider_demo', kind: 'llm', label: 'Demo LLM', models: async () => [] }
    registry.registerProvider(provider as never)
    registry.registerProvider({ ...provider, label: 'Demo LLM v2' } as never)
    const workflowNode = { type: 'demo.node', label: 'Demo node', extensionId: 'ext_demo', inputTypes: [], outputTypes: [], run: async () => null } as never
    registry.registerWorkflowNode(workflowNode)
    const importer = { id: 'importer_demo', label: 'Markdown', extensions: ['.MD', 'txt'], import: async () => ({ title: 'x', markdown: 'x' }) } as never
    registry.registerImporter(importer)
    const exporter = { id: 'exporter_demo', label: 'Text', format: 'txt', export: async () => 'x' } as never
    registry.registerExporter(exporter)

    expect(registry.getProvider('provider_demo').label).toBe('Demo LLM v2')
    expect(registry.getImporterForExtension('.md')).toBe(importer)
    expect(registry.getImporterForExtension('TXT')).toBe(importer)
    expect(registry.getExporter('txt')).toBe(exporter)
    expect(registry.permissionPreview('ext_demo')).toEqual({ id: 'ext_demo', name: 'Demo v2', version: '2.0.0', permissions: ['project.read'] })
    expect(registry.snapshot()).toEqual({
      manifests: [{ id: 'ext_demo', name: 'Demo v2', version: '2.0.0', permissions: [{ permission: 'project.read', reason: '读取项目' }] }],
      providers: [{ id: 'provider_demo', kind: 'llm', label: 'Demo LLM v2' }],
      workflowNodes: [{ type: 'demo.node', label: 'Demo node' }],
      importers: [{ id: 'importer_demo', label: 'Markdown', extensions: ['.MD', 'txt'] }],
      exporters: [{ id: 'exporter_demo', label: 'Text', format: 'txt' }]
    })
  })

  it('rejects invalid registration and reports missing capabilities', () => {
    const registry = new ExtensionRegistry()
    expect(() => registry.registerManifest({ id: 'bad', name: '', version: 'latest', permissions: [] })).toThrow('扩展权限声明无效')
    expect(() => registry.registerProvider({ id: '', kind: 'llm', label: 'bad', models: async () => [] } as never)).toThrow('扩展 ID 不能为空')
    expect(registry.permissionPreview('ext_missing')).toBeNull()
    expect(() => registry.getProvider('provider_missing')).toThrow('Provider extension 不存在')
    expect(() => registry.getImporterForExtension('pdf')).toThrow('没有支持 .pdf 的导入器')
    expect(() => registry.getExporter('pdf')).toThrow('没有支持 pdf 的导出器')
    expect(() => registry.assertPackageDependencies({ id: 'ext_needs', dependencies: [{ id: 'ext_missing', version: '^1.0.0' }] })).toThrow('扩展依赖未安装')
  })

  it('rejects installed dependencies outside the declared semver range', () => {
    const registry = new ExtensionRegistry()
    registry.registerManifest({ id: 'ext_base', name: 'Base', version: '1.2.0', permissions: [] })

    expect(() => registry.assertPackageDependencies({ id: 'ext_needs', dependencies: [{ id: 'ext_base', version: '^1.0.0' }] })).not.toThrow()
    expect(() => registry.assertPackageDependencies({ id: 'ext_needs', dependencies: [{ id: 'ext_base', version: '^2.0.0' }] })).toThrow('版本不兼容')
  })

  it('uninstalls a registered manifest without affecting other descriptors', () => {
    const registry = new ExtensionRegistry()
    registry.registerManifest({ id: 'ext_base', name: 'Base', version: '1.0.0', permissions: [] })
    registry.registerWorkflowNode({ type: 'base.node', label: 'Base node', extensionId: 'ext_base', inputTypes: [], outputTypes: [], run: async () => null })
    registry.uninstallManifest('ext_base')
    expect(registry.snapshot().manifests).toEqual([])
    expect(() => registry.getWorkflowNode('base.node')).toThrow('不存在')
    expect(() => registry.uninstallManifest('ext_base')).toThrow('扩展不存在')
  })

  it('does not allow a workflow handler to outlive its owning extension', () => {
    const registry = new ExtensionRegistry()
    expect(() => registry.registerWorkflowNode({ type: 'orphan.node', label: 'Orphan', extensionId: 'ext_missing', inputTypes: [], outputTypes: [], run: async () => null })).toThrow('扩展不存在')
  })

  it('rejects a workflow handler that requests permissions absent from its manifest', () => {
    const registry = new ExtensionRegistry()
    registry.registerManifest({ id: 'ext_limited', name: 'Limited', version: '1.0.0', permissions: [{ permission: 'project.read', reason: '读取章节' }] })

    expect(() => registry.registerWorkflowNode({ type: 'network.node', label: 'Network', extensionId: 'ext_limited', permissions: ['network.request'], inputTypes: [], outputTypes: [], run: async () => null })).toThrow('权限未声明')
    expect(() => registry.registerWorkflowNode({ type: 'reader.node', label: 'Reader', extensionId: 'ext_limited', permissions: ['project.read'], inputTypes: [], outputTypes: [], run: async () => null })).not.toThrow()
  })

  it('binds importer and exporter permissions to an installed manifest', () => {
    const registry = new ExtensionRegistry()
    expect(() => registry.registerImporter({ id: 'importer-permission', label: 'Importer', extensions: ['.book'], permissions: ['project.read'], import: async () => ({ title: 'x', markdown: 'x' }) })).toThrow('所属扩展')
    registry.registerManifest({ id: 'ext_io', name: 'IO', version: '1.0.0', permissions: [{ permission: 'project.read', reason: '读取章节' }] })
    expect(() => registry.registerExporter({ id: 'exporter-permission', label: 'Exporter', format: 'book', extensionId: 'ext_io', permissions: ['network.request'], export: async () => 'x' })).toThrow('权限未声明')
    expect(() => registry.registerImporter({ id: 'importer-approved', label: 'Importer', extensions: ['.book'], extensionId: 'ext_io', permissions: ['project.read'], import: async () => ({ title: 'x', markdown: 'x' }) })).not.toThrow()
  })

  it('revokes old workflow handlers when an extension manifest is replaced', () => {
    const registry = new ExtensionRegistry()
    registry.registerManifest({ id: 'ext_replace', name: 'Replaceable', version: '1.0.0', permissions: [] })
    registry.registerWorkflowNode({ type: 'old.node', label: 'Old', extensionId: 'ext_replace', inputTypes: [], outputTypes: [], run: async () => 'old' })

    registry.registerManifest({ id: 'ext_replace', name: 'Replaceable', version: '2.0.0', permissions: [] })
    expect(() => registry.getWorkflowNode('old.node')).toThrow('不存在')
  })

  it('requires an exact permission grant before a workflow handler may run', async () => {
    const registry = new ExtensionRegistry()
    registry.registerManifest({ id: 'ext_granted', name: 'Granted', version: '1.0.0', permissions: [{ permission: 'project.read', reason: '读取项目' }] })
    registry.registerWorkflowNode({ type: 'reader.node', label: 'Reader', extensionId: 'ext_granted', permissions: ['project.read'], inputTypes: [], outputTypes: [], run: async () => 'ok' })

    expect(() => registry.assertPermissionsGranted('ext_granted', ['project.read'])).toThrow('未获得批准')
    registry.grantPermissions('ext_granted', ['project.read'])
    expect(() => registry.assertPermissionsGranted('ext_granted', ['project.read'])).not.toThrow()
    registry.revokePermissions('ext_granted')
    expect(() => registry.assertPermissionsGranted('ext_granted', ['project.read'])).toThrow('未获得批准')
  })

  it('revokes a grant when the manifest is replaced, even at the same extension id', () => {
    const registry = new ExtensionRegistry()
    registry.registerManifest({ id: 'ext_upgrade', name: 'Upgrade', version: '1.0.0', permissions: [{ permission: 'project.read', reason: '读取项目' }] })
    registry.grantPermissions('ext_upgrade', ['project.read'])
    registry.registerManifest({ id: 'ext_upgrade', name: 'Upgrade', version: '2.0.0', permissions: [{ permission: 'project.read', reason: '读取项目' }] })
    expect(() => registry.assertPermissionsGranted('ext_upgrade', ['project.read'])).toThrow('未获得批准')
  })
})
