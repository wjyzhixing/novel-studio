import { createPublicKey, verify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { extensionManifestSigningPayload, extensionPackageManifestSchema, type ExtensionPackageManifest } from '../../shared/extensions'
import { DomainError } from './errors'

export interface TrustedExtensionKey {
  readonly keyId: string
  readonly publicKey: string
  /** Retired keys remain readable only for already-installed packages. */
  readonly status?: 'active' | 'retired'
}

const trustedExtensionKeysSchema = z.object({
  keys: z.array(z.object({ keyId: z.string().regex(/^key_[a-zA-Z0-9_-]+$/), publicKey: z.string().min(32).max(20_000), status: z.enum(['active', 'retired']).optional() })).max(100)
})

export function parseTrustedExtensionKeys(input: unknown): TrustedExtensionKey[] {
  const parsed = trustedExtensionKeysSchema.safeParse(input)
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED', '可信扩展公钥配置无效', { details: parsed.error.issues })
  const seen = new Set<string>()
  return parsed.data.keys.map(({ keyId, publicKey, status }) => {
    if (seen.has(keyId)) throw new DomainError('VALIDATION_FAILED', '可信扩展公钥不能重复')
    seen.add(keyId)
    try {
      const key = createPublicKey(publicKey)
      if (key.asymmetricKeyType !== 'ed25519') throw new Error('not ed25519')
    } catch {
      throw new DomainError('VALIDATION_FAILED', '可信扩展公钥配置无效')
    }
    return status ? { keyId, publicKey, status } : { keyId, publicKey }
  })
}

export async function readTrustedExtensionKeys(path: string): Promise<TrustedExtensionKey[]> {
  let raw: string
  try { raw = await readFile(path, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new DomainError('IO_ERROR', '无法读取可信扩展公钥配置')
  }
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new DomainError('VALIDATION_FAILED', '可信扩展公钥配置不是有效 JSON') }
  return parseTrustedExtensionKeys(value)
}

export function verifyExtensionPackageManifest(input: unknown, trustedKeys: readonly TrustedExtensionKey[], options: { allowRetired?: boolean } = {}): ExtensionPackageManifest {
  const parsed = extensionPackageManifestSchema.safeParse(input)
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED', '扩展包 manifest 无效', { details: parsed.error.issues })
  const trusted = trustedKeys.find((key) => key.keyId === parsed.data.signature.keyId && (options.allowRetired || key.status !== 'retired'))
  if (!trusted) throw new DomainError('VALIDATION_FAILED', '扩展签名密钥不受信任')
  let valid = false
  try {
    valid = verify(null, Buffer.from(extensionManifestSigningPayload(parsed.data)), trusted.publicKey, Buffer.from(parsed.data.signature.value, 'base64'))
  } catch {
    throw new DomainError('VALIDATION_FAILED', '扩展签名校验失败')
  }
  if (!valid) throw new DomainError('VALIDATION_FAILED', '扩展签名校验失败')
  return parsed.data
}
