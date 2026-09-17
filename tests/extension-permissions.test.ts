import { describe, expect, it } from 'vitest'
import { ExtensionRegistry } from '../src/main/services/extension-registry'
import { extensionManifestSchema } from '../src/shared/extensions'

describe('extension permission declarations', () => {
  it('accepts a scoped manifest and exposes a redacted preview', () => {
    const registry = new ExtensionRegistry()
    registry.registerManifest({
      id: 'ext_example',
      name: 'Example Importer',
      version: '1.0.0',
      permissions: [
        { permission: 'project.read', reason: '读取章节以生成导入预览' },
        { permission: 'filesystem.read', reason: '读取用户选择的导入文件' }
      ]
    })

    expect(registry.permissionPreview('ext_example')).toEqual({
      id: 'ext_example',
      name: 'Example Importer',
      version: '1.0.0',
      permissions: ['project.read', 'filesystem.read']
    })
  })

  it('rejects unknown, duplicate, or unexplained permissions', () => {
    expect(() => extensionManifestSchema.parse({
      id: 'ext_example', name: 'Example', version: '1.0.0',
      permissions: [{ permission: 'shell.exec', reason: 'run commands' }]
    })).toThrow()
    expect(() => extensionManifestSchema.parse({
      id: 'ext_example', name: 'Example', version: '1.0.0',
      permissions: [{ permission: 'project.read', reason: 'read' }, { permission: 'project.read', reason: 'again' }]
    })).toThrow()
    expect(() => extensionManifestSchema.parse({
      id: 'ext_example', name: 'Example', version: '1.0.0',
      permissions: [{ permission: 'project.read', reason: '   ' }]
    })).toThrow()
  })

  it('does not execute code when only registering a permission manifest', () => {
    const registry = new ExtensionRegistry()
    const manifest = { id: 'ext_descriptor', name: 'Descriptor', version: '1.0.0', permissions: [] }
    expect(() => registry.registerManifest(manifest)).not.toThrow()
    expect(registry.snapshot().providers).toEqual([])
    expect(registry.permissionPreview('ext_descriptor')?.permissions).toEqual([])
  })
})
