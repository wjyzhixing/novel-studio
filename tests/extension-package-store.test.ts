import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extensionManifestSigningPayload, type ExtensionPackageManifest } from '../src/shared/extensions'
import { ExtensionRegistry } from '../src/main/services/extension-registry'
import { ExtensionPackageStore } from '../src/main/services/extension-package-store'
import { ExtensionPermissionStore } from '../src/main/services/extension-permission-store'

function signedManifest(id = 'ext_store', permissions: ExtensionPackageManifest['permissions'] = [], version = '1.0.0', privateKey?: KeyObject): { manifest: ExtensionPackageManifest; publicKey: string; privateKey: KeyObject } {
  const { publicKey, privateKey: generatedPrivateKey } = generateKeyPairSync('ed25519')
  const unsigned = { id, name: 'Stored extension', version, permissions, dependencies: [] }
  const signer = privateKey ?? generatedPrivateKey
  const value = sign(null, Buffer.from(extensionManifestSigningPayload(unsigned)), signer).toString('base64')
  return {
    manifest: { ...unsigned, signature: { algorithm: 'ed25519', keyId: 'key_fixture', value } },
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: signer
  }
}

class FailingPermissionStore extends ExtensionPermissionStore {
  constructor(private readonly operation: 'grant' | 'revoke', path: string) { super(path) }
  override async grant(...args: Parameters<ExtensionPermissionStore['grant']>): Promise<void> {
    if (this.operation === 'grant') throw new Error('permission persistence failed')
    return super.grant(...args)
  }
  override async revoke(...args: Parameters<ExtensionPermissionStore['revoke']>): Promise<void> {
    if (this.operation === 'revoke') throw new Error('permission persistence failed')
    return super.revoke(...args)
  }
}

describe('extension package persistence', () => {
  it('reports installation as disabled when no publisher key is configured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const store = new ExtensionPackageStore(join(root, 'installed'), new ExtensionRegistry(), [])
      expect(store.trustStatus()).toEqual({ trustedPublisherCount: 0, installEnabled: false })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('atomically installs a verified manifest and restores it after a new store is created', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const { manifest, publicKey } = signedManifest()
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(manifest), 'utf8')
      const first = new ExtensionPackageStore(join(root, 'installed'), new ExtensionRegistry(), [{ keyId: 'key_fixture', publicKey }])
      await expect(first.install(source)).resolves.toEqual({ id: manifest.id, version: manifest.version })
      const secondRegistry = new ExtensionRegistry()
      const second = new ExtensionPackageStore(join(root, 'installed'), secondRegistry, [{ keyId: 'key_fixture', publicKey }])
      await expect(second.load()).resolves.toHaveLength(1)
      expect(secondRegistry.permissionPreview(manifest.id)?.name).toBe(manifest.name)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps the previous version when a replacement package is invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const { manifest, publicKey } = signedManifest()
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(manifest), 'utf8')
      const registry = new ExtensionRegistry()
      const store = new ExtensionPackageStore(join(root, 'installed'), registry, [{ keyId: 'key_fixture', publicKey }])
      await store.install(source)
      await writeFile(source, JSON.stringify({ ...manifest, name: 'forged' }), 'utf8')
      await expect(store.install(source)).rejects.toThrow('签名校验失败')
      expect(registry.permissionPreview(manifest.id)?.name).toBe(manifest.name)
      expect(JSON.parse(await readFile(join(root, 'installed', manifest.id, 'manifest.json'), 'utf8')).name).toBe(manifest.name)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rolls back the last verified replacement and its approved permissions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const permission = { permission: 'project.read' as const, reason: '读取项目' }
      const firstPackage = signedManifest('ext_rollback', [permission], '1.0.0')
      const nextPackage = signedManifest('ext_rollback', [], '2.0.0', firstPackage.privateKey)
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(firstPackage.manifest), 'utf8')
      const registry = new ExtensionRegistry()
      const store = new ExtensionPackageStore(join(root, 'installed'), registry, [{ keyId: 'key_fixture', publicKey: firstPackage.publicKey }])
      await store.install(source, ['project.read'])
      await writeFile(source, JSON.stringify(nextPackage.manifest), 'utf8')
      await store.install(source)

      await expect(store.rollback(firstPackage.manifest.id)).resolves.toEqual({ id: firstPackage.manifest.id, version: '1.0.0' })
      expect(registry.permissionPreview(firstPackage.manifest.id)?.version).toBe('1.0.0')
      expect(() => registry.assertPermissionsGranted(firstPackage.manifest.id, ['project.read'])).not.toThrow()
      expect(JSON.parse(await readFile(join(root, 'installed', firstPackage.manifest.id, 'manifest.json'), 'utf8')).version).toBe('1.0.0')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('uninstalls only registered packages and preserves dependency protection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const { manifest, publicKey } = signedManifest()
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(manifest), 'utf8')
      const registry = new ExtensionRegistry()
      const store = new ExtensionPackageStore(join(root, 'installed'), registry, [{ keyId: 'key_fixture', publicKey }])
      await store.install(source)
      await expect(store.uninstall(manifest.id)).resolves.toBeUndefined()
      expect(registry.permissionPreview(manifest.id)).toBeNull()
      await expect(store.uninstall(manifest.id)).rejects.toThrow('扩展不存在')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a missing on-disk descriptor without removing the registry entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const { manifest, publicKey } = signedManifest('ext_missing_descriptor')
      const registry = new ExtensionRegistry()
      registry.registerPackageManifest(manifest, [{ keyId: 'key_fixture', publicKey }])
      const store = new ExtensionPackageStore(join(root, 'installed'), registry, [{ keyId: 'key_fixture', publicKey }])
      await expect(store.uninstall(manifest.id)).rejects.toThrow()
      expect(registry.permissionPreview(manifest.id)?.name).toBe(manifest.name)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects extension ids that could escape the installation root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const store = new ExtensionPackageStore(join(root, 'installed'), new ExtensionRegistry(), [])
      await expect(store.uninstall('../outside')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('requires explicit approval before installing a package with permissions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const permission = { permission: 'filesystem.read' as const, reason: '读取用户选择的文件' }
      const { manifest, publicKey } = signedManifest('ext_permission', [permission])
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(manifest), 'utf8')
      const store = new ExtensionPackageStore(join(root, 'installed'), new ExtensionRegistry(), [{ keyId: 'key_fixture', publicKey }])

      await expect(store.install(source)).rejects.toThrow('未获得用户批准')
      await expect(store.install(source, ['filesystem.read'])).resolves.toEqual({ id: manifest.id, version: manifest.version })
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('restores approved permissions on reload and revokes them on uninstall', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const permission = { permission: 'filesystem.read' as const, reason: '读取用户选择的文件' }
      const { manifest, publicKey } = signedManifest('ext_persisted_permission', [permission])
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(manifest), 'utf8')
      const firstRegistry = new ExtensionRegistry()
      const first = new ExtensionPackageStore(join(root, 'installed'), firstRegistry, [{ keyId: 'key_fixture', publicKey }])
      await first.install(source, ['filesystem.read'])
      expect(() => firstRegistry.assertPermissionsGranted(manifest.id, ['filesystem.read'])).not.toThrow()

      const secondRegistry = new ExtensionRegistry()
      const second = new ExtensionPackageStore(join(root, 'installed'), secondRegistry, [{ keyId: 'key_fixture', publicKey }])
      await second.load()
      expect(() => secondRegistry.assertPermissionsGranted(manifest.id, ['filesystem.read'])).not.toThrow()
      await second.uninstall(manifest.id)
      expect(secondRegistry.permissionPreview(manifest.id)).toBeNull()
      expect(() => secondRegistry.assertPermissionsGranted(manifest.id, ['filesystem.read'])).toThrow('未获得批准')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('loads an already-installed package signed by a retired key but blocks new installs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const { manifest, publicKey } = signedManifest('ext_retired_key')
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(manifest), 'utf8')
      const installed = new ExtensionPackageStore(join(root, 'installed'), new ExtensionRegistry(), [{ keyId: 'key_fixture', publicKey }])
      await installed.install(source)

      const retiredKeys = [{ keyId: 'key_fixture', publicKey, status: 'retired' as const }]
      const registry = new ExtensionRegistry()
      const restored = new ExtensionPackageStore(join(root, 'installed'), registry, retiredKeys)
      await expect(restored.load()).resolves.toEqual([{ id: manifest.id, version: manifest.version }])
      expect(registry.permissionPreview(manifest.id)).not.toBeNull()
      await expect(restored.install(source)).rejects.toThrow('签名密钥不受信任')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('restores the previous package and registry when replacement permission persistence fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const firstPackage = signedManifest('ext_atomic_replace', [], '1.0.0')
      const nextPackage = signedManifest('ext_atomic_replace', [], '2.0.0', firstPackage.privateKey)
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(firstPackage.manifest), 'utf8')
      const registry = new ExtensionRegistry()
      const keys = [{ keyId: 'key_fixture', publicKey: firstPackage.publicKey }]
      const installed = new ExtensionPackageStore(join(root, 'installed'), registry, keys)
      await installed.install(source)

      await writeFile(source, JSON.stringify(nextPackage.manifest), 'utf8')
      const failing = new ExtensionPackageStore(join(root, 'installed'), registry, keys, new FailingPermissionStore('grant', join(root, 'permissions.json')))
      await expect(failing.install(source)).rejects.toThrow('permission persistence failed')
      expect(registry.permissionPreview('ext_atomic_replace')?.version).toBe('1.0.0')
      expect(JSON.parse(await readFile(join(root, 'installed', 'ext_atomic_replace', 'manifest.json'), 'utf8')).version).toBe('1.0.0')
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('restores the package, registry, and grant when permission revocation fails during uninstall', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const permission = { permission: 'project.read' as const, reason: '读取项目' }
      const { manifest, publicKey } = signedManifest('ext_atomic_uninstall', [permission])
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(manifest), 'utf8')
      const registry = new ExtensionRegistry()
      const keys = [{ keyId: 'key_fixture', publicKey }]
      const installed = new ExtensionPackageStore(join(root, 'installed'), registry, keys)
      await installed.install(source, ['project.read'])
      const failing = new ExtensionPackageStore(join(root, 'installed'), registry, keys, new FailingPermissionStore('revoke', join(root, 'installed', 'permissions.json')))

      await expect(failing.uninstall(manifest.id)).rejects.toThrow('permission persistence failed')
      expect(registry.permissionPreview(manifest.id)).not.toBeNull()
      expect(() => registry.assertPermissionsGranted(manifest.id, ['project.read'])).not.toThrow()
      expect(JSON.parse(await readFile(join(root, 'installed', manifest.id, 'manifest.json'), 'utf8')).id).toBe(manifest.id)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('cleans the previous-version rollback artifacts when uninstalling an extension', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const firstPackage = signedManifest('ext_cleanup_rollback', [], '1.0.0')
      const nextPackage = signedManifest('ext_cleanup_rollback', [], '2.0.0', firstPackage.privateKey)
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(firstPackage.manifest), 'utf8')
      const registry = new ExtensionRegistry()
      const keys = [{ keyId: 'key_fixture', publicKey: firstPackage.publicKey }]
      const store = new ExtensionPackageStore(join(root, 'installed'), registry, keys)
      await store.install(source)
      await writeFile(source, JSON.stringify(nextPackage.manifest), 'utf8')
      await store.install(source)

      await store.uninstall(nextPackage.manifest.id)

      await expect(readFile(join(root, 'installed', '.ext_cleanup_rollback.rollback', 'manifest.json'), 'utf8')).rejects.toThrow()
      await expect(readFile(join(root, 'installed', '.ext_cleanup_rollback.rollback-grant.json'), 'utf8')).rejects.toThrow()
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('keeps uninstall committed when rollback metadata cleanup fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-extension-store-'))
    try {
      const firstPackage = signedManifest('ext_cleanup_failure', [], '1.0.0')
      const nextPackage = signedManifest('ext_cleanup_failure', [], '2.0.0', firstPackage.privateKey)
      const source = join(root, 'package.json')
      await writeFile(source, JSON.stringify(firstPackage.manifest), 'utf8')
      const registry = new ExtensionRegistry()
      const keys = [{ keyId: 'key_fixture', publicKey: firstPackage.publicKey }]
      const store = new ExtensionPackageStore(join(root, 'installed'), registry, keys)
      await store.install(source)
      await writeFile(source, JSON.stringify(nextPackage.manifest), 'utf8')
      await store.install(source)

      const rollbackGrantPath = join(root, 'installed', '.ext_cleanup_failure.rollback-grant.json')
      await rm(rollbackGrantPath, { force: true })
      await mkdir(rollbackGrantPath)

      await expect(store.uninstall(nextPackage.manifest.id)).resolves.toBeUndefined()
      expect(registry.permissionPreview(nextPackage.manifest.id)).toBeNull()
      await expect(readFile(join(root, 'installed', nextPackage.manifest.id, 'manifest.json'), 'utf8')).rejects.toThrow()
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
