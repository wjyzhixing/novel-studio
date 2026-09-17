import { updateEndpointSchema } from '../../shared/update'

const MAX_MANIFEST_BYTES = 256 * 1024
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class UpdateManifestFetchError extends Error {
  constructor(public readonly kind: 'network' | 'manifest' | 'configuration', message: string) {
    super(message)
    this.name = 'UpdateManifestFetchError'
  }
}

export async function fetchUpdateManifest(endpoint: string, fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<unknown> {
  try {
    updateEndpointSchema.parse(endpoint)
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
    const response = await fetcher(endpoint, { redirect: 'error', signal })
    if (!response.ok) throw new UpdateManifestFetchError('network', `读取更新清单失败：HTTP ${response.status}`)
    const contentLength = response.headers.get('content-length')
    if (contentLength && Number.isSafeInteger(Number(contentLength)) && Number(contentLength) > MAX_MANIFEST_BYTES) {
      throw new UpdateManifestFetchError('manifest', '更新清单超过允许大小')
    }
    const text = await readBoundedText(response, signal)
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new UpdateManifestFetchError('manifest', '更新清单 JSON 格式无效')
    }
  } catch (error) {
    if (error instanceof UpdateManifestFetchError) throw error
    if (error instanceof Error && error.name === 'ZodError') throw new UpdateManifestFetchError('manifest', '更新清单地址无效')
    throw new UpdateManifestFetchError('network', '读取更新清单失败')
  }
}

async function readBoundedText(response: Response, signal?: AbortSignal): Promise<string> {
  if (!response.body) {
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_MANIFEST_BYTES) throw new UpdateManifestFetchError('manifest', '更新清单超过允许大小')
    return text
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_MANIFEST_BYTES) throw new UpdateManifestFetchError('manifest', '更新清单超过允许大小')
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}
