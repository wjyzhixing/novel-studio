import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { UpdateService } from '../src/main/services/update-service'
import { UpdateManifestFetchError } from '../src/main/services/update-manifest-fetch'
import { updateManifestSigningPayload, type UpdateManifest, type UpdateManifestUnsigned } from '../src/shared/update'

const bytes = new TextEncoder().encode('verified Novel Studio update')
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const unsignedManifest: UpdateManifestUnsigned = {
  format: 'novel-studio.update-manifest', formatVersion: 1, channel: 'stable',
  version: '1.2.0', minAppVersion: '1.0.0', platform: 'darwin', arch: 'arm64',
  artifactUrl: 'https://updates.example.test/novel-studio.dmg',
  sha512: createHash('sha512').update(bytes).digest('base64'), size: bytes.byteLength,
  releasedAt: '2026-09-09T00:00:00.000Z', releaseNotes: '修复稳定性问题'
}
const makeManifest = (overrides: Partial<UpdateManifestUnsigned> = {}): UpdateManifest => {
  const unsigned = { ...unsignedManifest, ...overrides }
  return { ...unsigned, signature: { algorithm: 'ed25519', keyId: 'key_fixture', value: sign(null, Buffer.from(updateManifestSigningPayload(unsigned)), privateKey).toString('base64') } }
}
const manifest = makeManifest()
const trustedKeys = [{ keyId: 'key_fixture', publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() }]

const client = { currentVersion: '1.1.0', channel: 'stable' as const, platform: 'darwin' as const, arch: 'arm64' as const }

describe('UpdateService orchestration', () => {
  it('returns a compatible update and keeps the selected manifest for download', async () => {
    const service = new UpdateService(client, async () => manifest, fetch, undefined, trustedKeys)
    await expect(service.check()).resolves.toEqual({ state: 'available', manifest })
  })

  it('emits checking/network failure states and requires a destination when no root is configured', async () => {
    const events: string[] = []
    const service = new UpdateService(client, async () => { throw new Error('offline') }, fetch, undefined, trustedKeys)
    const unsubscribe = service.onEvent((event) => events.push(event.state))
    await expect(service.check()).resolves.toEqual({ state: 'failed', reason: 'network' })
    unsubscribe()
    expect(events).toEqual(['checking', 'failed'])
    const noRoot = new UpdateService(client, async () => manifest, fetch, undefined, trustedKeys)
    await noRoot.check()
    await expect(noRoot.download()).resolves.toEqual({ state: 'failed', reason: 'destination' })
    expect(noRoot.cancel()).toEqual({ state: 'idle', reason: 'cancelled' })
  })

  it('returns up_to_date when the manifest is older than the current app', async () => {
    const service = new UpdateService(client, async () => makeManifest({ version: '1.0.0' }), fetch, undefined, trustedKeys)
    await expect(service.check()).resolves.toEqual({ state: 'up_to_date', reason: 'not-newer' })
  })

  it.each([
    ['channel', { channel: 'beta' as const }, { ...client, channel: 'stable' as const }],
    ['platform', { platform: 'win32' as const }, client],
    ['minimum-version', { minAppVersion: '2.0.0' }, client]
  ] as const)('reports up_to_date for an incompatible %s manifest', async (reason, overrides, currentClient) => {
    const events: string[] = []
    const service = new UpdateService(currentClient, async () => makeManifest(overrides), fetch, undefined, trustedKeys)
    service.onEvent((event) => events.push(event.state))

    await expect(service.check()).resolves.toEqual({ state: 'up_to_date', reason })
    expect(events).toEqual(['checking', 'up_to_date'])
    await expect(service.download()).resolves.toEqual({ state: 'failed', reason: 'manifest' })
  })

  it('cancels an in-flight download before replacing it with a newer check result', async () => {
    let currentManifest = manifest
    const events: string[] = []
    let resolveResponse!: (response: Response) => void
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve })
    const service = new UpdateService(client, async () => currentManifest, async (_url, init) => {
      init?.signal?.addEventListener('abort', () => resolveResponse(new Response(bytes)))
      return response
    }, undefined, trustedKeys)
    service.onEvent((event) => events.push(event.state))
    await service.check()
    const download = service.download('/tmp/stale-update.dmg')
    currentManifest = makeManifest({ version: '1.0.0' })

    await expect(service.check()).resolves.toEqual({ state: 'up_to_date', reason: 'not-newer' })
    await expect(download).resolves.toEqual({ state: 'idle', reason: 'cancelled' })
    expect(events.at(-1)).toBe('up_to_date')
  })

  it('ignores a stale manifest result when a newer check finishes first', async () => {
    let resolveFirst!: (value: unknown) => void
    let resolveSecond!: (value: unknown) => void
    let calls = 0
    const first = new Promise<unknown>((resolve) => { resolveFirst = resolve })
    const second = new Promise<unknown>((resolve) => { resolveSecond = resolve })
    const service = new UpdateService(client, () => {
      calls += 1
      return calls === 1 ? first : second
    }, fetch, undefined, trustedKeys)
    const events: string[] = []
    service.onEvent((event) => events.push(event.state))

    const staleCheck = service.check()
    const currentCheck = service.check()
    resolveSecond(makeManifest({ version: '1.0.0' }))
    await expect(currentCheck).resolves.toEqual({ state: 'up_to_date', reason: 'not-newer' })
    resolveFirst(manifest)

    await expect(staleCheck).resolves.toEqual({ state: 'idle', reason: 'cancelled' })
    await expect(service.download()).resolves.toEqual({ state: 'failed', reason: 'manifest' })
    expect(events).toEqual(['checking', 'checking', 'up_to_date'])
  })

  it('aborts the previous manifest request when a newer check starts', async () => {
    let firstSignal!: AbortSignal
    const service = new UpdateService(client, (signal) => {
      if (!firstSignal) {
        firstSignal = signal as AbortSignal
        return new Promise<unknown>((_, reject) => firstSignal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }))
      }
      return Promise.resolve(makeManifest({ version: '1.0.0' }))
    }, fetch, undefined, trustedKeys)

    const staleCheck = service.check()
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    const currentCheck = service.check()
    await expect(currentCheck).resolves.toEqual({ state: 'up_to_date', reason: 'not-newer' })
    await expect(staleCheck).resolves.toEqual({ state: 'idle', reason: 'cancelled' })
    expect(firstSignal.aborted).toBe(true)
  })

  it('fails a manifest check when the request exceeds its timeout', async () => {
    const service = new UpdateService(client, (signal) => new Promise<unknown>((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }), fetch, undefined, trustedKeys, undefined, 5)
    const events: string[] = []
    service.onEvent((event) => events.push(event.state))

    await expect(service.check()).resolves.toEqual({ state: 'failed', reason: 'network' })
    expect(events).toEqual(['checking', 'failed'])
  })

  it('keeps a delayed manifest result as a timeout failure even if the fetcher ignores abort', async () => {
    const service = new UpdateService(client, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return manifest
    }, fetch, undefined, trustedKeys, undefined, 5)

    await expect(service.check()).resolves.toEqual({ state: 'failed', reason: 'network' })
  })

  it('reports malformed manifest data without retaining a stale update', async () => {
    const service = new UpdateService(client, async () => ({ version: 'not-semver' }), fetch, undefined, trustedKeys)
    await expect(service.check()).resolves.toEqual({ state: 'failed', reason: 'manifest' })
    await expect(service.download()).resolves.toEqual({ state: 'failed', reason: 'manifest' })
  })

  it('keeps a malformed fetched manifest distinct from a network failure', async () => {
    const service = new UpdateService(client, async () => { throw new UpdateManifestFetchError('manifest', 'invalid JSON') }, fetch, undefined, trustedKeys)
    await expect(service.check()).resolves.toEqual({ state: 'failed', reason: 'manifest' })
  })

  it('reports a missing update endpoint separately from a network failure', async () => {
    const service = new UpdateService(client, async () => {
      throw new UpdateManifestFetchError('configuration', '未配置更新源')
    }, fetch, undefined, trustedKeys)

    await expect(service.check()).resolves.toEqual({ state: 'failed', reason: 'not-configured' })
  })

  it('reports bounded download progress and returns ready after verification', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-service-'))
    const events: Array<{ state: string; downloaded?: number; total?: number }> = []
    const service = new UpdateService(client, async () => manifest, async () => new Response(bytes), undefined, trustedKeys)
    service.onEvent((event) => events.push(event))
    await service.check()
    await expect(service.download(join(root, 'Novel Studio.dmg'))).resolves.toEqual({ state: 'ready', destination: join(root, 'Novel Studio.dmg'), bytes: bytes.byteLength })
    expect(events.map((event) => event.state).slice(0, 3)).toEqual(['checking', 'available', 'downloading'])
    expect(events.at(-1)?.state).toBe('ready')
    expect(events.some((event) => event.downloaded === bytes.byteLength && event.total === bytes.byteLength)).toBe(true)
  })

  it('uses a platform-safe default staging filename when no destination is supplied', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-default-destination-'))
    const service = new UpdateService(client, async () => manifest, async () => new Response(bytes), root, trustedKeys)
    await service.check()

    await expect(service.download()).resolves.toEqual({ state: 'ready', destination: join(root, 'Novel-Studio-1.2.0.dmg'), bytes: bytes.byteLength })
  })

  it('classifies a non-integrity download failure as a staging failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-download-failure-'))
    const service = new UpdateService(client, async () => manifest, async () => new Response('offline', { status: 503 }), root, trustedKeys)
    await service.check()

    await expect(service.download()).resolves.toEqual({ state: 'failed', reason: 'destination' })
  })

  it('cancels an active download and does not leave a destination artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-cancel-'))
    let resolveResponse!: (response: Response) => void
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve })
    const service = new UpdateService(client, async () => manifest, async (_url, init) => {
      init?.signal?.addEventListener('abort', () => resolveResponse(new Response(bytes)))
      return response
    }, undefined, trustedKeys)
    await service.check()
    const destination = join(root, 'cancelled.dmg')
    const download = service.download(destination)
    service.cancel()
    await expect(download).resolves.toEqual({ state: 'idle', reason: 'cancelled' })
    await expect(readFile(destination)).rejects.toThrow()
  })

  it('returns a failed state and preserves an existing destination after hash failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-failed-'))
    const destination = join(root, 'Novel Studio.dmg')
    const service = new UpdateService(client, async () => manifest, async () => new Response('tampered'), undefined, trustedKeys)
    await service.check()
    await expect(service.download(destination)).resolves.toEqual({ state: 'failed', reason: 'integrity' })
    await expect(readFile(destination)).rejects.toThrow()
  })

  it('rejects a download destination outside the configured update staging directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-boundary-'))
    let fetchCalls = 0
    const service = new UpdateService(client, async () => manifest, async () => {
      fetchCalls += 1
      return new Response(bytes)
    }, root, trustedKeys)
    await service.check()

    await expect(service.download(join(root, '..', 'outside.dmg'))).resolves.toEqual({ state: 'failed', reason: 'destination' })
    expect(fetchCalls).toBe(0)
  })

  it('installs only the artifact produced by a completed download', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-install-'))
    const destination = join(root, 'Novel Studio.dmg')
    const installed: string[] = []
    const service = new UpdateService(client, async () => manifest, async () => new Response(bytes), undefined, trustedKeys, async (path) => {
      installed.push(path)
      return ''
    })

    await expect(service.install()).resolves.toEqual({ state: 'failed', reason: 'installation' })
    await service.check()
    await service.download(destination)
    await expect(service.install()).resolves.toEqual({ state: 'installing', destination, bytes: bytes.byteLength })
    expect(installed).toEqual([destination])
  })

  it('reports installer failures without exposing an arbitrary renderer path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-install-failed-'))
    const destination = join(root, 'Novel Studio.dmg')
    const service = new UpdateService(client, async () => manifest, async () => new Response(bytes), undefined, trustedKeys, async () => '无法打开安装器')
    await service.check()
    await service.download(destination)
    await expect(service.install()).resolves.toEqual({ state: 'install_failed', destination, bytes: bytes.byteLength })
  })

  it('keeps a verified artifact available so a failed installation can be retried', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-install-retry-'))
    const destination = join(root, 'Novel Studio.dmg')
    let attempts = 0
    const service = new UpdateService(client, async () => manifest, async () => new Response(bytes), undefined, trustedKeys, async () => {
      attempts += 1
      return attempts === 1 ? '安装器暂时不可用' : ''
    })
    await service.check()
    await service.download(destination)

    await expect(service.install()).resolves.toEqual({ state: 'install_failed', destination, bytes: bytes.byteLength })
    await expect(readFile(destination)).resolves.toEqual(Buffer.from(bytes))
    await expect(service.install()).resolves.toEqual({ state: 'installing', destination, bytes: bytes.byteLength })
    expect(attempts).toBe(2)
  })

  it('refuses to install when the verified staging artifact is no longer present', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-studio-update-missing-artifact-'))
    const destination = join(root, 'Novel Studio.dmg')
    let installerCalls = 0
    const service = new UpdateService(client, async () => manifest, async () => new Response(bytes), root, trustedKeys, async () => {
      installerCalls += 1
      return ''
    })
    await service.check()
    await service.download(destination)
    await unlink(destination)

    await expect(service.install()).resolves.toEqual({ state: 'failed', reason: 'installation' })
    expect(installerCalls).toBe(0)
  })
})
