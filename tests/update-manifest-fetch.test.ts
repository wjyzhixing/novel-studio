import { describe, expect, it } from 'vitest'
import { fetchUpdateManifest, UpdateManifestFetchError } from '../src/main/services/update-manifest-fetch'

describe('update manifest fetching', () => {
  it('classifies invalid JSON as a manifest error', async () => {
    await expect(fetchUpdateManifest('https://updates.example.test/manifest.json', async () => new Response('{')))
      .rejects.toMatchObject({ kind: 'manifest' })
  })

  it('rejects a manifest response larger than the bounded limit', async () => {
    const response = new Response('{}', { headers: { 'content-length': '262145' } })
    await expect(fetchUpdateManifest('https://updates.example.test/manifest.json', async () => response))
      .rejects.toMatchObject({ kind: 'manifest' })
  })

  it('classifies transport failures as network errors', async () => {
    const failure = new UpdateManifestFetchError('network', 'offline')
    await expect(fetchUpdateManifest('https://updates.example.test/manifest.json', async () => { throw failure }))
      .rejects.toBe(failure)
  })

  it('rejects invalid endpoints before contacting the network', async () => {
    let called = false
    await expect(fetchUpdateManifest('http://updates.example.test/manifest.json', async () => {
      called = true
      return new Response('{}')
    })).rejects.toMatchObject({ kind: 'manifest' })
    expect(called).toBe(false)
  })

  it('bounds a response without a stream body', async () => {
    const oversized = 'x'.repeat(256 * 1024 + 1)
    const response = { ok: true, headers: new Headers(), body: null, text: async () => oversized } as unknown as Response
    await expect(fetchUpdateManifest('https://updates.example.test/manifest.json', async () => response))
      .rejects.toMatchObject({ kind: 'manifest' })
  })

  it('closes a streaming response when the manifest exceeds the bound', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(256 * 1024 + 1))
        controller.close()
      }
    })
    await expect(fetchUpdateManifest('https://updates.example.test/manifest.json', async () => new Response(stream)))
      .rejects.toMatchObject({ kind: 'manifest' })
  })

  it('forwards the caller abort signal to the manifest fetcher', async () => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | undefined
    const payload = JSON.stringify({ ok: true })
    await expect(fetchUpdateManifest('https://updates.example.test/manifest.json', async (_input, init) => {
      receivedSignal = init?.signal ?? undefined
      return new Response(payload)
    }, controller.signal)).resolves.toEqual({ ok: true })
    expect(receivedSignal).toBe(controller.signal)
  })
})
