import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ExtensionPermissionStore } from '../src/main/services/extension-permission-store'
import { makeTempRoot } from './helpers'

describe('ExtensionPermissionStore', () => {
  it('persists grants and restores them across store instances', async () => {
    const root = await makeTempRoot()
    const path = join(root, 'extension-permissions.json')
    const first = new ExtensionPermissionStore(path)
    await first.grant({ extensionId: 'ext_demo', version: '1.0.0', permissions: ['project.read'] })

    const second = new ExtensionPermissionStore(path)
    await expect(second.list()).resolves.toEqual([{ extensionId: 'ext_demo', version: '1.0.0', permissions: ['project.read'] }])
    expect(await readFile(path, 'utf8')).not.toContain('secret')
  })

  it('revokes one extension without mutating grants for another extension', async () => {
    const root = await makeTempRoot()
    const store = new ExtensionPermissionStore(join(root, 'permissions.json'))
    await store.grant({ extensionId: 'ext_a', version: '1.0.0', permissions: ['project.read'] })
    await store.grant({ extensionId: 'ext_b', version: '1.0.0', permissions: ['network.request'] })
    await store.revoke('ext_a')
    await expect(store.list()).resolves.toEqual([{ extensionId: 'ext_b', version: '1.0.0', permissions: ['network.request'] }])
  })

  it('fails closed when the persisted file is malformed', async () => {
    const root = await makeTempRoot()
    const path = join(root, 'permissions.json')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path, '{broken', 'utf8')
    await expect(new ExtensionPermissionStore(path).list()).resolves.toEqual([])
  })
})
