import { createHash, verify } from 'node:crypto'
import { updateManifestSigningPayload, type UpdateManifest } from '../../shared/update'
import { atomicWriteFile } from './atomic-fs'

export interface TrustedUpdateKey {
  readonly keyId: string
  readonly publicKey: string
  readonly status?: 'active' | 'retired'
}

export function verifyUpdateManifestSignature(manifest: UpdateManifest, trustedKeys: readonly TrustedUpdateKey[], options: { allowRetired?: boolean } = {}): boolean {
  const trusted = trustedKeys.find((key) => key.keyId === manifest.signature.keyId && (options.allowRetired || key.status !== 'retired'))
  if (!trusted) return false
  try {
    return verify(null, Buffer.from(updateManifestSigningPayload(manifest)), trusted.publicKey, Buffer.from(manifest.signature.value, 'base64'))
  } catch { return false }
}

export function verifyArtifact(bytes: Uint8Array, manifest: UpdateManifest): { ok: true } | { ok: false; reason: 'size' | 'hash' } {
  if (bytes.byteLength !== manifest.size) return { ok: false, reason: 'size' }
  const actual = createHash('sha512').update(bytes).digest()
  const expected = /^[A-Fa-f0-9]{128}$/.test(manifest.sha512)
    ? Buffer.from(manifest.sha512, 'hex')
    : Buffer.from(manifest.sha512, 'base64')
  return expected.length === actual.length && actual.equals(expected) ? { ok: true } : { ok: false, reason: 'hash' }
}

export async function downloadAndVerifyArtifact(
  manifest: UpdateManifest,
  destination: string,
  fetcher: typeof fetch = fetch,
  options: { signal?: AbortSignal; onProgress?: (downloaded: number, total: number) => void } = {}
): Promise<{ destination: string; bytes: number }> {
  const url = new URL(manifest.artifactUrl)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('更新工件地址必须使用不带凭据的 HTTPS')
  if (options.signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
  const response = await fetcher(manifest.artifactUrl, { redirect: 'error', signal: options.signal })
  if (!response.ok) throw new Error(`下载更新工件失败：HTTP ${response.status}`)
  const bytes = await readBoundedResponse(response, manifest.size, options)
  const verification = verifyArtifact(bytes, manifest)
  if (!verification.ok) throw new Error(`更新工件完整性校验失败：${verification.reason}`)
  await atomicWriteFile(destination, bytes)
  return { destination, bytes: bytes.byteLength }
}

async function readBoundedResponse(response: Response, declaredSize: number, options: { signal?: AbortSignal; onProgress?: (downloaded: number, total: number) => void }): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number.isSafeInteger(Number(contentLength)) && Number(contentLength) > declaredSize) {
    throw new Error(`下载工件超过声明大小：${contentLength} bytes`)
  }
  if (!response.body) {
    if (options.signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
    const bytes = new Uint8Array(await response.arrayBuffer())
    options.onProgress?.(bytes.byteLength, declaredSize)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (options.signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
      const next = await reader.read()
      if (next.done) break
      const chunk = next.value
      total += chunk.byteLength
      if (total > declaredSize) throw new Error(`下载工件超过声明大小：${declaredSize} bytes`)
      chunks.push(chunk)
      options.onProgress?.(total, declaredSize)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}
