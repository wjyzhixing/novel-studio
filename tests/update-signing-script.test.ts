import { generateKeyPairSync } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyUpdateManifestSignature } from '../src/main/services/update-verification'
import { makeTempRoot } from './helpers'

const execFile = promisify(execFileCallback)

describe('update manifest signing command', () => {
  it('signs an unsigned manifest with an external private key without printing key material', async () => {
    const root = await makeTempRoot('novel-update-signing-')
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const input = join(root, 'unsigned.json')
    const output = join(root, 'signed.json')
    const keyPath = join(root, 'release-key.pem')
    await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }))
    await writeFile(input, JSON.stringify({
      format: 'novel-studio.update-manifest', formatVersion: 1, channel: 'stable', version: '1.3.0', minAppVersion: '1.0.0',
      platform: 'darwin', arch: 'arm64', artifactUrl: 'https://updates.example.test/novel-studio.dmg', sha512: 'a'.repeat(128), size: 10,
      releasedAt: '2026-09-12T00:00:00.000Z', releaseNotes: '修复稳定性问题'
    }), 'utf8')

    const result = await execFile(process.execPath, ['scripts/sign-update-manifest.mjs', '--input', input, '--output', output, '--key', keyPath, '--key-id', 'key_release'], { cwd: process.cwd() })
    const signed = JSON.parse(await readFile(output, 'utf8'))
    expect(result.stdout).toContain('signed.json')
    expect(result.stdout).not.toContain('PRIVATE')
    expect(verifyUpdateManifestSignature(signed, [{ keyId: 'key_release', publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() }])).toBe(true)
  })
})
