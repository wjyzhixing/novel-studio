import { describe, expect, it, vi } from 'vitest'
import { AnthropicProvider, GeminiProvider, MockProvider, OpenAICompatibleProvider, providerFor } from '../src/main/services/ai-provider'
import { MemorySecretStore } from '../src/main/services/secret-store'
import type { ProviderProfile } from '../src/shared/ai'

const profile: ProviderProfile = {
  id: 'profile_test', name: 'Test', kind: 'openai-compatible',
  baseURL: 'https://example.test/v1', model: 'test-model', temperature: 0.2, maxOutputTokens: 100
}

describe('OpenAI-compatible provider', () => {
  it('lists models and preserves only valid context windows', async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe('https://example.test/v1/models')
      return new Response(JSON.stringify({ data: [
        { id: 'one', display_name: 'One', context_window: 4096 },
        { id: 'two', context_window: -1 },
        { id: 'three', context_window: 'bad' }
      ] }))
    })
    const provider = new OpenAICompatibleProvider(profile, new MemorySecretStore(), fetcher)
    await expect(provider.listModels()).resolves.toEqual([
      { id: 'one', displayName: 'One', contextWindow: 4096 },
      { id: 'two', contextWindow: undefined },
      { id: 'three', contextWindow: undefined }
    ])
  })

  it('reports HTTP failures and handles empty embedding requests locally', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 503 }))
    const provider = new OpenAICompatibleProvider(profile, new MemorySecretStore(), fetcher)
    await expect(provider.listModels()).rejects.toThrow('Provider 请求失败 (503)')
    await expect(provider.chat({ messages: [] })).rejects.toThrow('Provider 请求失败 (503)')
    await expect(provider.embed([])).resolves.toEqual({ vectors: [], model: 'test-model' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('validates embedding configuration and response ordering', async () => {
    const noEmbedding = new OpenAICompatibleProvider(profile, new MemorySecretStore(), vi.fn())
    await expect(noEmbedding.embed(['a'])).rejects.toThrow('未配置 embedding model')
    const embeddingProfile = { ...profile, embeddingModel: 'embed-model' }
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'embed-model', input: ['a', 'b'] })
      return new Response(JSON.stringify({ id: 'embed-1', model: 'actual-embed', data: [
        { index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }
      ] }))
    })
    const provider = new OpenAICompatibleProvider(embeddingProfile, new MemorySecretStore(), fetcher)
    await expect(provider.embed(['a', 'b'])).resolves.toEqual({ vectors: [[1, 0], [0, 1]], model: 'actual-embed', requestId: 'embed-1' })
  })

  it('rejects malformed embedding vectors and parses structured output', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [NaN] }] })))
    const provider = new OpenAICompatibleProvider({ ...profile, embeddingModel: 'embed-model' }, new MemorySecretStore(), fetcher)
    await expect(provider.embed(['a'])).rejects.toThrow('返回向量无效')
    const chatProvider = new OpenAICompatibleProvider(profile, new MemorySecretStore(), vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }))))
    await expect(chatProvider.structured({ request: { messages: [{ role: 'user', content: 'json' }] }, parse: JSON.parse })).resolves.toEqual({ ok: true })
  })

  it('passes a native JSON schema to OpenAI-compatible structured output', async () => {
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'story_fact', strict: true, schema: { type: 'object' } } })
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }))
    })
    const provider = new OpenAICompatibleProvider(profile, new MemorySecretStore(), fetcher)
    await expect(provider.structured({ request: { messages: [{ role: 'user', content: 'json' }] }, responseSchema: { name: 'story_fact', schema: { type: 'object' } }, parse: JSON.parse })).resolves.toEqual({ ok: true })
  })

  it('sends profile settings and parses chat result without exposing secret', async () => {
    const secrets = new MemorySecretStore()
    await secrets.set(profile.id, 'secret-value')
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret-value' })
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'test-model', temperature: 0.2 })
      expect(JSON.parse(String(init?.body)).response_format).toBeUndefined()
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

function sseResponse(lines: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines.join('\n') + '\n'))
      controller.close()
    }
  })
  return new Response(body, { status })
}

describe('Anthropic provider', () => {
  const anthropicProfile = { ...profile, kind: 'anthropic' as const, baseURL: 'https://anthropic.example/v1', model: 'claude-test' }

  it('lists models, chats with system instructions, and rejects embedding', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'claude-1', display_name: 'Claude 1' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'a1', content: [{ text: 'A' }, { text: 'I' }], usage: { input_tokens: 2, output_tokens: 3 } })))
    const provider = new AnthropicProvider(anthropicProfile, new MemorySecretStore(), fetcher)
    await expect(provider.listModels()).resolves.toEqual([{ id: 'claude-1', displayName: 'Claude 1' }])
    await expect(provider.chat({ messages: [{ role: 'system', content: 'rules' }, { role: 'user', content: 'hi' }] })).resolves.toMatchObject({ text: 'AI', requestId: 'a1', usage: { totalTokens: 5 } })
    await expect(provider.embed(['hi'])).rejects.toThrow('不支持 Embedding')
  })

  it('streams deltas, ignores non-json events, and reports HTTP errors', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(sseResponse(['data: not-json', 'data: {"message":{"id":"a2"},"delta":{"text":"Hi"}}']))
      .mockResolvedValueOnce(new Response('bad', { status: 429 }))
    const provider = new AnthropicProvider(anthropicProfile, new MemorySecretStore(), fetcher)
    const events = []
    for await (const event of provider.stream({ messages: [{ role: 'user', content: 'hi' }] })) events.push(event)
    expect(events).toEqual([{ type: 'delta', text: 'Hi' }, { type: 'done', result: { text: 'Hi', model: 'claude-test', requestId: 'a2' } }])
    const errorEvents = []
    for await (const event of provider.stream({ messages: [] })) errorEvents.push(event)
    expect(errorEvents).toEqual([{ type: 'error', message: 'Anthropic Provider 请求失败 (429)' }])
  })

  it('passes a native JSON schema to Anthropic structured output', async () => {
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, any>
      expect(body.output_config).toEqual({ format: { type: 'json_schema', schema: { type: 'object' } } })
      return new Response(JSON.stringify({ content: [{ text: '{"ok":true}' }] }))
    })
    const provider = new AnthropicProvider(anthropicProfile, new MemorySecretStore(), fetcher)
    await expect(provider.structured({ request: { messages: [{ role: 'user', content: 'json' }] }, responseSchema: { name: 'story_fact', schema: { type: 'object' } }, parse: JSON.parse })).resolves.toEqual({ ok: true })
  })
})

describe('Gemini provider and factory', () => {
  const geminiProfile = { ...profile, kind: 'gemini' as const, baseURL: 'https://gemini.example/v1beta', model: 'gemini-test' }

  it('lists models, maps chat roles, parses usage, and rejects embedding', async () => {
    const secrets = new MemorySecretStore()
    await secrets.set(geminiProfile.id, 'secret-value')
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'models/gemini-1', displayName: 'Gemini 1', inputTokenLimit: 8192 }, { displayName: 'missing' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ responseId: 'g1', candidates: [{ content: { parts: [{ text: 'G' }, { text: '!' }] } }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 } })))
    const provider = new GeminiProvider(geminiProfile, secrets, fetcher)
    await expect(provider.listModels()).resolves.toEqual([{ id: 'gemini-1', displayName: 'Gemini 1', contextWindow: 8192 }])
    await expect(provider.chat({ messages: [{ role: 'system', content: 'rules' }, { role: 'assistant', content: 'old' }, { role: 'user', content: 'hi' }] })).resolves.toMatchObject({ text: 'G!', requestId: 'g1', usage: { totalTokens: 5 } })
    for (const call of fetcher.mock.calls) {
      expect(String(call[0])).not.toContain('key=')
      expect(call[1]?.headers).toMatchObject({ 'x-goog-api-key': 'secret-value' })
    }
    const chatBody = JSON.parse(String(fetcher.mock.calls[1][1]?.body))
    expect(chatBody.contents).toEqual([{ role: 'model', parts: [{ text: 'old' }] }, { role: 'user', parts: [{ text: 'hi' }] }])
    await expect(provider.embed(['hi'])).rejects.toThrow('不支持 Embedding')
  })

  it('streams Gemini content and exposes the provider factory', async () => {
    const secrets = new MemorySecretStore()
    await secrets.set(geminiProfile.id, 'secret-value')
    const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).not.toContain('key=')
      expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'secret-value' })
      return sseResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"G"}]}}]}',
      'data: {"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}'
      ])
    })
    const provider = new GeminiProvider(geminiProfile, secrets, fetcher)
    const events = []
    for await (const event of provider.stream({ messages: [{ role: 'user', content: 'hi' }] })) events.push(event)
    expect(events).toEqual([{ type: 'delta', text: 'G' }, { type: 'done', result: { text: 'G', model: 'gemini-test', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } }])
    expect(providerFor(geminiProfile, new MemorySecretStore())).toBeInstanceOf(GeminiProvider)
    expect(providerFor({ ...profile, kind: 'anthropic' }, new MemorySecretStore())).toBeInstanceOf(AnthropicProvider)
    expect(providerFor({ ...profile, kind: 'mock' }, new MemorySecretStore()).profile.kind).toBe('mock')
    expect(providerFor(profile, new MemorySecretStore())).toBeInstanceOf(OpenAICompatibleProvider)
  })

  it('passes a native JSON schema to Gemini structured output', async () => {
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, any>
      expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: { type: 'object' } })
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }))
    })
    const provider = new GeminiProvider(geminiProfile, new MemorySecretStore(), fetcher)
    await expect(provider.structured({ request: { messages: [{ role: 'user', content: 'json' }] }, responseSchema: { name: 'story_fact', schema: { type: 'object' } }, parse: JSON.parse })).resolves.toEqual({ ok: true })
  })
})

describe('deterministic mock provider', () => {
  it('returns substantive prose for Writer and Rewrite agent prompts', async () => {
    const provider = new MockProvider({ id: 'profile_fixture', name: 'Fixture', kind: 'mock', model: 'fixture-model', temperature: 0, maxOutputTokens: 100 })
    const request = {
      messages: [
        { role: 'system' as const, content: '你是小说 Writer，输出正文。' },
        { role: 'user' as const, content: '{"value":{"in":{"markdown":"# 第一章\\n\\n原始正文"}}}' }
      ]
    }

    await expect(provider.chat(request)).resolves.toMatchObject({
      text: expect.stringMatching(/。$/)
    })
    await expect(provider.chat({
      ...request,
      messages: [{ role: 'system' as const, content: '你是 Rewrite Agent，只输出可替换正文。' }, request.messages[1]]
    })).resolves.toMatchObject({
      text: expect.stringMatching(/。$/)
    })
  })
})
