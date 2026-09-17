import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MemorySecretStore, SafeStorageSecretStore, type SafeStorageBackend } from '../src/main/services/secret-store'
import { makeTempRoot } from './helpers'

function createBackend(available = true): SafeStorageBackend {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(value, 'utf8'),
    decryptString: (value) => value.toString('utf8')
  }
}

describe('secret stores', () => {
  it('persists encrypted payloads outside the project and reloads them', async () => {
    const root = await makeTempRoot()
    const storageFile = join(root, 'provider-secrets.json')
    const first = new SafeStorageSecretStore(createBackend(), storageFile)

    expect(await first.has('profile-a')).toBe(false)
    await first.set('profile-a', 'api-secret')
    expect(await first.has('profile-a')).toBe(true)
    expect(await first.get('profile-a')).toBe('api-secret')
    expect(JSON.parse(await readFile(storageFile, 'utf8'))).toEqual({ 'profile-a': Buffer.from('api-secret').toString('base64') })

    const reloaded = new SafeStorageSecretStore(createBackend(), storageFile)
    expect(await reloaded.get('profile-a')).toBe('api-secret')
    await reloaded.remove('profile-a')
    expect(await reloaded.get('profile-a')).toBeNull()
    expect(JSON.parse(await readFile(storageFile, 'utf8'))).toEqual({})
  })

  it('does not persist a secret when OS encryption is unavailable', async () => {
    const root = await makeTempRoot()
    const storageFile = join(root, 'provider-secrets.json')
    const store = new SafeStorageSecretStore(createBackend(false), storageFile)

    await expect(store.set('profile-a', 'api-secret')).rejects.toThrow('OS 安全存储不可用')
    expect(await store.has('profile-a')).toBe(false)
    await expect(readFile(storageFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('treats missing or malformed storage as an empty store', async () => {
    const root = await makeTempRoot()
    const storageFile = join(root, 'provider-secrets.json')
    await writeFile(storageFile, '{not-json')
    const store = new SafeStorageSecretStore(createBackend(), storageFile)

    expect(await store.get('profile-a')).toBeNull()
    await store.set('profile-b', 'secret-b')
    expect(await store.get('profile-b')).toBe('secret-b')
  })

  it('provides the in-memory contract for tests without persistence', async () => {
    const store = new MemorySecretStore()
    await store.set('profile-a', 'secret-a')
    expect(await store.has('profile-a')).toBe(true)
    expect(await store.get('profile-a')).toBe('secret-a')
    await store.remove('profile-a')
    expect(await store.has('profile-a')).toBe(false)
    expect(await store.get('missing')).toBeNull()
  })
})
