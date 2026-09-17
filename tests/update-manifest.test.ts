import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { assessUpdate, updateEndpointSchema, updateManifestSchema, updateManifestSigningPayload, type UpdateManifest } from '../src/shared/update'
import { downloadAndVerifyArtifact, verifyArtifact, verifyUpdateManifestSignature } from '../src/main/services/update-verification'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const artifact = new TextEncoder().encode('Novel Studio release artifact')
const hash = createHash('sha512').update(artifact).digest('base64')

const manifest: UpdateManifest = {
  format: 'novel-studio.update-manifest',
  formatVersion: 1,
  channel: 'stable' as const,
  version: '1.2.0',
  minAppVersion: '1.0.0',
  platform: 'darwin' as const,
  arch: 'arm64' as const,
  artifactUrl: 'https://updates.example.test/novel-studio-1.2.0.dmg',
  sha512: hash,
  size: artifact.byteLength,
  releasedAt: '2026-09-04T00:00:00.000Z',
  releaseNotes: '稳定版更新',
  signature: { algorithm: 'ed25519', keyId: 'key_fixture', value: 'a'.repeat(128) }
}

describe('update manifest integrity contract', () => {
  it('requires a publisher signature on every update manifest', () => {
    const { signature: _signature, ...unsigned } = manifest
    expect(() => updateManifestSchema.parse(unsigned)).toThrow()
  })

  it('verifies publisher signatures and supports retired keys only for recovery', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const signed: UpdateManifest = { ...manifest, signature: { algorithm: 'ed25519', keyId: 'key_release', value: sign(null, Buffer.from(updateManifestSigningPayload(manifest)), privateKey).toString('base64') } }
    const key = { keyId: 'key_release', publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() }
    expect(verifyUpdateManifestSignature(signed, [key])).toBe(true)
    expect(verifyUpdateManifestSignature({ ...signed, version: '9.9.9' }, [key])).toBe(false)
    expect(verifyUpdateManifestSignature(signed, [{ ...key, status: 'retired' }])).toBe(false)
    expect(verifyUpdateManifestSignature(signed, [{ ...key, status: 'retired' }], { allowRetired: true })).toBe(true)
  })

  it('accepts HTTPS channel metadata and selects a compatible newer release', () => {
    expect(updateManifestSchema.parse(manifest).version).toBe('1.2.0')
    expect(assessUpdate(manifest, { currentVersion: '1.1.0', channel: 'stable', platform: 'darwin', arch: 'arm64' })).toEqual({ available: true, manifest })
  })

  it('rejects insecure or credential-bearing artifact URLs', () => {
    expect(() => updateManifestSchema.parse({ ...manifest, artifactUrl: 'http://updates.example.test/a.dmg' })).toThrow()
    expect(() => updateManifestSchema.parse({ ...manifest, artifactUrl: 'https://user:pass@updates.example.test/a.dmg' })).toThrow()
  })

  it('requires the manifest endpoint itself to be credential-free HTTPS', () => {
    expect(updateEndpointSchema.parse('https://updates.example.test/stable.json')).toContain('https://')
    expect(() => updateEndpointSchema.parse('http://updates.example.test/stable.json')).toThrow()
    expect(() => updateEndpointSchema.parse('https://user:pass@updates.example.test/stable.json')).toThrow()
  })

  it('does not offer beta releases to stable clients or incompatible platforms', () => {
    expect(assessUpdate({ ...manifest, channel: 'beta' }, { currentVersion: '1.1.0', channel: 'stable', platform: 'darwin', arch: 'arm64' })).toEqual({ available: false, reason: 'channel' })
    expect(assessUpdate({ ...manifest, platform: 'win32' }, { currentVersion: '1.1.0', channel: 'stable', platform: 'darwin', arch: 'arm64' })).toEqual({ available: false, reason: 'platform' })
    expect(assessUpdate({ ...manifest, minAppVersion: '2.0.0' }, { currentVersion: '1.1.0', channel: 'stable', platform: 'darwin', arch: 'arm64' })).toEqual({ available: false, reason: 'minimum-version' })
    expect(assessUpdate({ ...manifest, arch: 'universal', version: '1.3.0' }, { currentVersion: '1.1.0', channel: 'stable', platform: 'darwin', arch: 'x64' })).toEqual({ available: true, manifest: { ...manifest, arch: 'universal', version: '1.3.0' } })
    expect(assessUpdate({ ...manifest, version: '1.2.0-beta.2' }, { currentVersion: '1.2.0-beta.1', channel: 'beta', platform: 'darwin', arch: 'arm64' })).toEqual({ available: true, manifest: { ...manifest, version: '1.2.0-beta.2' } })
  })

  it('orders numeric and string prerelease identifiers according to SemVer precedence', () => {
    const betaClient = { currentVersion: '1.2.0-beta.1', channel: 'beta' as const, platform: 'darwin' as const, arch: 'arm64' as const }
    expect(assessUpdate({ ...manifest, version: '1.2.0-beta.1.1', channel: 'beta' }, betaClient).available).toBe(true)
    expect(assessUpdate({ ...manifest, version: '1.2.0-beta', channel: 'beta' }, betaClient)).toEqual({ available: false, reason: 'not-newer' })
    expect(assessUpdate({ ...manifest, version: '1.2.0-1', channel: 'beta' }, { ...betaClient, currentVersion: '1.2.0-alpha' }).available).toBe(false)
    expect(assessUpdate({ ...manifest, version: '1.2.0-alpha', channel: 'beta' }, { ...betaClient, currentVersion: '1.2.0-1' }).available).toBe(true)
    expect(assessUpdate({ ...manifest, version: '1.2.0-beta', channel: 'beta' }, { ...betaClient, currentVersion: '1.2.0-alpha' }).available).toBe(true)
  })

  it('verifies artifact bytes by both declared size and SHA-512', () => {
    expect(verifyArtifact(artifact, manifest)).toEqual({ ok: true })
    expect(verifyArtifact(new TextEncoder().encode('X'.repeat(artifact.byteLength)), manifest)).toEqual({ ok: false, reason: 'hash' })
    expect(verifyArtifact(artifact, { ...manifest, size: artifact.byteLength + 1 })).toEqual({ ok: false, reason: 'size' })
  })

  it('downloads only verified bytes and writes the artifact atomically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-'))
    const destination = join(root, 'Novel Studio.dmg')
    const response = new Response(artifact, { status: 200 })
    const result = await downloadAndVerifyArtifact(manifest, destination, async (_url, init) => {
      expect(init?.redirect).toBe('error')
      return response
    })
    expect(result).toEqual({ destination, bytes: artifact.byteLength })
    expect(new Uint8Array(await readFile(destination))).toEqual(artifact)
  })

  it('never replaces the destination when the downloaded hash is invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-'))
    const destination = join(root, 'Novel Studio.dmg')
    await (await import('node:fs/promises')).writeFile(destination, 'previous')
    await expect(downloadAndVerifyArtifact(manifest, destination, async () => new Response('tampered', { status: 200 }))).rejects.toThrow('完整性校验失败')
    expect(await readFile(destination, 'utf8')).toBe('previous')
  })

  it('stops oversized responses before integrity verification or replacement', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-'))
    const destination = join(root, 'Novel Studio.dmg')
    await expect(downloadAndVerifyArtifact(manifest, destination, async () => new Response(new Uint8Array(manifest.size + 1), { status: 200 }))).rejects.toThrow('超过声明大小')
    await expect(readFile(destination)).rejects.toThrow()
  })

  it('rejects non-success HTTP responses without writing an artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-'))
    const destination = join(root, 'Novel Studio.dmg')
    await expect(downloadAndVerifyArtifact(manifest, destination, async () => new Response('unavailable', { status: 503 }))).rejects.toThrow('HTTP 503')
    await expect(readFile(destination)).rejects.toThrow()
  })

  it('rejects an insecure manifest URL before calling the fetcher', async () => {
    let called = false
    await expect(downloadAndVerifyArtifact({ ...manifest, artifactUrl: 'http://updates.example.test/a.dmg' }, '/tmp/unused-update.dmg', async () => {
      called = true
      return new Response(artifact)
    })).rejects.toThrow('HTTPS')
    expect(called).toBe(false)
  })
})
