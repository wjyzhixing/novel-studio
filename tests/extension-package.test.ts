import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ExtensionRegistry } from '../src/main/services/extension-registry'
import { extensionManifestSigningPayload, extensionPackageManifestSchema, type ExtensionPackageManifest } from '../src/shared/extensions'
import { parseTrustedExtensionKeys, readTrustedExtensionKeys, verifyExtensionPackageManifest } from '../src/main/services/extension-package'

function signedManifest(): { manifest: ExtensionPackageManifest; publicKey: string; privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'] } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const unsigned = {
    id: 'ext_signed_importer',
    name: 'Signed Importer',
    version: '1.0.0',
    permissions: [{ permission: 'filesystem.read' as const, reason: '读取用户选择的导入文件' }],
    dependencies: []
  }
  const signature = sign(null, Buffer.from(extensionManifestSigningPayload(unsigned)), privateKey).toString('base64')
  return {
    manifest: { ...unsigned, signature: { algorithm: 'ed25519', keyId: 'key_fixture', value: signature } },
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey
  }
}

describe('signed extension package manifests', () => {
  it('accepts only a validated public-key trust configuration', () => {
    const { publicKey } = signedManifest()
    expect(parseTrustedExtensionKeys({ keys: [{ keyId: 'key_fixture', publicKey }] })).toEqual([{ keyId: 'key_fixture', publicKey }])
    expect(() => parseTrustedExtensionKeys({ keys: [{ keyId: 'key_fixture', publicKey: 'not-a-key' }] })).toThrow('可信扩展公钥配置无效')
    expect(() => parseTrustedExtensionKeys({ keys: [{ keyId: 'key_fixture', publicKey }, { keyId: 'key_fixture', publicKey }] })).toThrow('可信扩展公钥不能重复')
  })

  it('preserves retired status when loading trust configuration from disk data', () => {
    const { publicKey } = signedManifest()
    expect(parseTrustedExtensionKeys({ keys: [{ keyId: 'key_fixture', publicKey, status: 'retired' }] })).toEqual([{ keyId: 'key_fixture', publicKey, status: 'retired' }])
  })

  it('loads a bundled trust configuration and treats a missing file as empty trust', async () => {
    const { publicKey } = signedManifest()
    const root = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp('/tmp/novel-trust-'))
    try {
      const path = `${root}/trusted.json`
      await (await import('node:fs/promises')).writeFile(path, JSON.stringify({ keys: [{ keyId: 'key_fixture', publicKey }] }), 'utf8')
      await expect(readTrustedExtensionKeys(path)).resolves.toEqual([{ keyId: 'key_fixture', publicKey }])
      await expect(readTrustedExtensionKeys(`${root}/missing.json`)).resolves.toEqual([])
    } finally {
      await (await import('node:fs/promises')).rm(root, { recursive: true, force: true })
    }
  })

  it('accepts a valid Ed25519 signature and registers only the verified manifest', () => {
    const { manifest, publicKey } = signedManifest()
    const registry = new ExtensionRegistry()
    expect(() => registry.registerPackageManifest(manifest, [{ keyId: 'key_fixture', publicKey }])).not.toThrow()
    expect(registry.permissionPreview(manifest.id)?.permissions).toEqual(['filesystem.read'])
  })

  it('rejects tampered manifests and unknown signing keys', () => {
    const { manifest, publicKey } = signedManifest()
    expect(() => verifyExtensionPackageManifest({ ...manifest, name: 'Tampered' }, [{ keyId: 'key_fixture', publicKey }])).toThrow('签名校验失败')
    expect(() => verifyExtensionPackageManifest(manifest, [{ keyId: 'other_key', publicKey }])).toThrow('签名密钥不受信任')
  })

  it('allows retired keys only for restoring existing packages, never for new verification', () => {
    const { manifest, publicKey } = signedManifest()
    const retired = [{ keyId: 'key_fixture', publicKey, status: 'retired' as const }]
    expect(() => verifyExtensionPackageManifest(manifest, retired)).toThrow('签名密钥不受信任')
    expect(() => verifyExtensionPackageManifest(manifest, retired, { allowRetired: true })).not.toThrow()
  })

  it('maps malformed trusted keys to a safe validation error', () => {
    const { manifest } = signedManifest()
    expect(() => verifyExtensionPackageManifest(manifest, [{ keyId: 'key_fixture', publicKey: 'not-a-public-key' }])).toThrow('扩展签名校验失败')
  })

  it('rejects duplicate or malformed dependencies before any registration', () => {
    expect(() => extensionPackageManifestSchema.parse({
      id: 'ext_invalid', name: 'Invalid', version: '1.0.0', permissions: [],
      dependencies: [{ id: 'ext_dep', version: '^1.0.0' }, { id: 'ext_dep', version: '^1.0.0' }],
      signature: { algorithm: 'ed25519', keyId: 'key_fixture', value: 'c2ln' }
    })).toThrow()
  })

  it('blocks installation when a declared dependency is not registered', () => {
    const { manifest, publicKey, privateKey } = signedManifest()
    const dependent = { ...manifest, id: 'ext_dependent', dependencies: [{ id: 'ext_missing', version: '^1.0.0' }] }
    const signature = sign(null, Buffer.from(extensionManifestSigningPayload(dependent)), privateKey).toString('base64')
    expect(() => new ExtensionRegistry().registerPackageManifest({ ...dependent, signature: { ...manifest.signature, value: signature } }, [{ keyId: 'key_fixture', publicKey }])).toThrow()
  })

  it('protects dependents from uninstall and preserves the previous version on failed replacement', () => {
    const { manifest, publicKey, privateKey } = signedManifest()
    const registry = new ExtensionRegistry()
    registry.registerPackageManifest(manifest, [{ keyId: 'key_fixture', publicKey }])
    expect(() => registry.registerPackageManifest({ ...manifest, name: 'Tampered', signature: { ...manifest.signature, value: `${manifest.signature.value.slice(0, -2)}AA` } }, [{ keyId: 'key_fixture', publicKey }])).toThrow('签名校验失败')
    expect(registry.permissionPreview(manifest.id)?.name).toBe('Signed Importer')
    const dependent = { ...manifest, id: 'ext_dependent', dependencies: [{ id: manifest.id, version: '^1.0.0' }] }
    const dependentSignature = sign(null, Buffer.from(extensionManifestSigningPayload(dependent)), privateKey).toString('base64')
    registry.registerPackageManifest({ ...dependent, signature: { ...manifest.signature, value: dependentSignature } }, [{ keyId: 'key_fixture', publicKey }])
    expect(() => registry.uninstallManifest(manifest.id)).toThrow('仍被其他扩展依赖')
    registry.uninstallManifest(dependent.id)
    expect(() => registry.uninstallManifest(manifest.id)).not.toThrow()
    expect(registry.permissionPreview(manifest.id)).toBeNull()
  })
})
