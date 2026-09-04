import { describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleProvider } from '../src/main/services/ai-provider'
import { MemorySecretStore } from '../src/main/services/secret-store'
import type { ProviderProfile } from '../src/shared/ai'

const profile: ProviderProfile = {
  id: 'profile_test', name: 'Test', kind: 'openai-compatible',
  baseURL: 'https://example.test/v1', model: 'test-model', temperature: 0.2, maxOutputTokens: 100
}

describe('OpenAI-compatible provider', () => {
  it('sends profile settings and parses chat result without exposing secret', async () => {
    const secrets = new MemorySecretStore()
    await secrets.set(profile.id, 'secret-value')
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-value' })
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'test-model', temperature: 0.2 })
      return new Response(JSON.stringify({ id: 'req-1', choices: [{ message: { content: '你好' } }] }), { status: 200 })
    })
    const provider = new OpenAICompatibleProvider(profile, secrets, fetcher)
    await expect(provider.chat({ messages: [{ role: 'user', content: 'hi' }] })).resolves.toEqual({ text: '你好', model: 'test-model', requestId: 'req-1' })
  })

  it('emits deltas and a completed result from SSE', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"id":"r","choices":[{"delta":{"content":"你"}}]}\n\n'))
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n'))
        controller.close()
      }
    })
    const provider = new OpenAICompatibleProvider(profile, new MemorySecretStore(), vi.fn(async () => new Response(body, { status: 200 })))
    const events = []
    for await (const event of provider.stream({ messages: [{ role: 'user', content: 'hi' }] })) events.push(event)
    expect(events).toEqual([
      { type: 'delta', text: '你' }, { type: 'delta', text: '好' },
      { type: 'done', result: { text: '你好', model: 'test-model', requestId: 'r' } }
    ])
  })
})
