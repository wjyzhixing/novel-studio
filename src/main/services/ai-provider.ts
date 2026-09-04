import type { ChatEvent, ChatMessage, ChatRequest, ChatResult, EmbeddingResult, LLMProvider, ModelInfo, ProviderProfile, StructuredRequest, TokenUsage } from '../../shared/ai'
import type { SecretStore } from '../../shared/ai'

export interface FetchLike { (input: string | URL, init?: RequestInit): Promise<Response> }

abstract class HttpProvider implements LLMProvider {
  abstract readonly profile: ProviderProfile
  constructor(protected readonly secretStore: SecretStore, protected readonly fetcher: FetchLike = fetch) {}
  protected async key() { return (await this.secretStore.get(this.profile.id)) ?? '' }
  abstract listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  abstract chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult>
  abstract embed(texts: string[], signal?: AbortSignal): Promise<EmbeddingResult>
  async structured<T>(req: StructuredRequest<T>, signal?: AbortSignal): Promise<T> { return req.parse((await this.chat(req.request, signal)).text) }
  abstract stream(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent>
}

export class OpenAICompatibleProvider extends HttpProvider {
  readonly profile: ProviderProfile
  constructor(profile: ProviderProfile, secretStore: SecretStore, fetcher?: FetchLike) { super(secretStore, fetcher); this.profile = profile }
  async listModels(signal?: AbortSignal) {
    const response = await this.fetcher(`${this.profile.baseURL ?? 'https://api.openai.com/v1'}/models`, { headers: this.headers(await this.key()), signal })
    if (!response.ok) throw new Error(`Provider 请求失败 (${response.status})`)
    const body = await response.json() as { data?: Array<{ id: string; display_name?: string; context_window?: number }> }
    return (body.data ?? []).map((model) => ({ id: model.id, displayName: model.display_name, contextWindow: validCount(model.context_window) }))
  }
  async chat(req: ChatRequest, signal?: AbortSignal) {
    const response = await this.fetcher(`${this.profile.baseURL ?? 'https://api.openai.com/v1'}/chat/completions`, { method: 'POST', headers: { ...this.headers(await this.key()), 'Content-Type': 'application/json' }, body: JSON.stringify(this.body(req, false)), signal })
    if (!response.ok) throw new Error(`Provider 请求失败 (${response.status})`)
    const body = await response.json() as { id?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }
    return { text: body.choices?.[0]?.message?.content ?? '', model: this.profile.model, requestId: body.id, usage: openAiUsage(body.usage) }
  }
  async embed(texts: string[], signal?: AbortSignal): Promise<EmbeddingResult> {
    if (texts.length === 0) return { vectors: [], model: this.profile.embeddingModel ?? this.profile.model }
    const model = this.profile.embeddingModel
    if (!model) throw new Error('Provider 未配置 embedding model')
    const response = await this.fetcher(`${this.profile.baseURL ?? 'https://api.openai.com/v1'}/embeddings`, { method: 'POST', headers: { ...this.headers(await this.key()), 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: texts }), signal })
    if (!response.ok) throw new Error(`Embedding Provider 请求失败 (${response.status})`)
    const body = await response.json() as { id?: string; model?: string; data?: Array<{ index?: number; embedding?: number[] }> }
    const vectors = (body.data ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((item) => item.embedding ?? [])
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0 || vector.some((value) => !Number.isFinite(value)))) throw new Error('Embedding Provider 返回向量无效')
    return { vectors, model: body.model ?? model, requestId: body.id }
  }
  async *stream(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent> {
    const response = await this.fetcher(`${this.profile.baseURL ?? 'https://api.openai.com/v1'}/chat/completions`, { method: 'POST', headers: { ...this.headers(await this.key()), 'Content-Type': 'application/json' }, body: JSON.stringify(this.body(req, true)), signal })
    if (!response.ok || !response.body) { yield { type: 'error', message: `Provider 请求失败 (${response.status})` }; return }
    let text = ''; let requestId: string | undefined; let usage: TokenUsage | undefined
    for await (const line of readSse(response.body)) {
      if (line === '[DONE]') { yield { type: 'done', result: { text, model: this.profile.model, requestId, usage } }; return }
      const item = JSON.parse(line) as { id?: string; choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }
      requestId = item.id ?? requestId
      usage = openAiUsage(item.usage) ?? usage
      const delta = item.choices?.[0]?.delta?.content ?? ''
      if (delta) { text += delta; yield { type: 'delta', text: delta } }
    }
    yield { type: 'done', result: { text, model: this.profile.model, requestId, usage } }
  }
  private headers(key: string) { return { Authorization: `Bearer ${key}` } }
  private body(req: ChatRequest, stream: boolean) { return { model: this.profile.model, messages: req.messages, temperature: req.temperature ?? this.profile.temperature, max_tokens: req.maxOutputTokens ?? this.profile.maxOutputTokens, stream } }
}

export class AnthropicProvider extends HttpProvider {
  readonly profile: ProviderProfile
  constructor(profile: ProviderProfile, secretStore: SecretStore, fetcher?: FetchLike) { super(secretStore, fetcher); this.profile = profile }
  async listModels(signal?: AbortSignal) {
    const response = await this.fetcher(`${this.baseURL()}/models`, { headers: { 'x-api-key': await this.key(), 'anthropic-version': '2023-06-01' }, signal })
    if (!response.ok) throw new Error(`Anthropic Provider 请求失败 (${response.status})`)
    const body = await response.json() as { data?: Array<{ id: string; display_name?: string }> }
    return (body.data ?? []).map((model) => ({ id: model.id, displayName: model.display_name }))
  }
  async chat(req: ChatRequest, signal?: AbortSignal) {
    const system = req.messages.find((message) => message.role === 'system')?.content
    const messages = req.messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role, content: message.content }))
    const response = await this.fetcher(`${this.baseURL()}/messages`, { method: 'POST', headers: { 'x-api-key': await this.key(), 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.profile.model, system, messages, max_tokens: req.maxOutputTokens ?? this.profile.maxOutputTokens, temperature: req.temperature ?? this.profile.temperature }), signal })
    if (!response.ok) throw new Error(`Anthropic Provider 请求失败 (${response.status})`)
    const body = await response.json() as { id?: string; content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }
    return { text: body.content?.map((item) => item.text ?? '').join('') ?? '', model: this.profile.model, requestId: body.id, usage: anthropicUsage(body.usage) }
  }
  async embed(): Promise<EmbeddingResult> { throw new Error('Anthropic Provider 不支持 Embedding') }
  async *stream(req: ChatRequest, signal?: AbortSignal) {
    const system = req.messages.find((message) => message.role === 'system')?.content
    const messages = req.messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role, content: message.content }))
    const response = await this.fetcher(`${this.baseURL()}/messages`, { method: 'POST', headers: { 'x-api-key': await this.key(), 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.profile.model, system, messages, max_tokens: req.maxOutputTokens ?? this.profile.maxOutputTokens, temperature: req.temperature ?? this.profile.temperature, stream: true }), signal })
    if (!response.ok || !response.body) { yield { type: 'error' as const, message: `Anthropic Provider 请求失败 (${response.status})` }; return }
    let text = ''; let requestId: string | undefined; let usage: TokenUsage | undefined
    for await (const line of readSse(response.body)) {
      try { const item = JSON.parse(line) as { type?: string; message?: { id?: string }; delta?: { text?: string }; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }; requestId = item.message?.id ?? requestId; usage = anthropicUsage(item.usage) ?? usage; const delta = item.delta?.text ?? ''; if (delta) { text += delta; yield { type: 'delta' as const, text: delta } } } catch { /* ignore non-JSON SSE comments */ }
    }
    yield { type: 'done' as const, result: { text, model: this.profile.model, requestId, usage } }
  }
  private baseURL() { return (this.profile.baseURL ?? 'https://api.anthropic.com/v1').replace(/\/$/, '') }
}

export class GeminiProvider extends HttpProvider {
  readonly profile: ProviderProfile
  constructor(profile: ProviderProfile, secretStore: SecretStore, fetcher?: FetchLike) { super(secretStore, fetcher); this.profile = profile }
  async listModels(signal?: AbortSignal) {
    const response = await this.fetcher(`${this.baseURL()}/models?key=${encodeURIComponent(await this.key())}`, { headers: { 'Content-Type': 'application/json' }, signal })
    if (!response.ok) throw new Error(`Gemini Provider 请求失败 (${response.status})`)
    const body = await response.json() as { models?: Array<{ name?: string; displayName?: string; inputTokenLimit?: number }> }
    return (body.models ?? []).flatMap((model) => {
      const id = model.name?.replace(/^models\//, '')
      return id ? [{ id, displayName: model.displayName, contextWindow: validCount(model.inputTokenLimit) }] : []
    })
  }
  async chat(req: ChatRequest, signal?: AbortSignal) {
    const system = req.messages.find((message) => message.role === 'system')?.content
    const contents = req.messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }))
    const response = await this.fetcher(`${this.baseURL()}/models/${encodeURIComponent(this.profile.model)}:generateContent?key=${encodeURIComponent(await this.key())}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig: { temperature: req.temperature ?? this.profile.temperature, maxOutputTokens: req.maxOutputTokens ?? this.profile.maxOutputTokens } }), signal })
    if (!response.ok) throw new Error(`Gemini Provider 请求失败 (${response.status})`)
    const body = await response.json() as { responseId?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }
    return { text: body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '', model: this.profile.model, requestId: body.responseId, usage: geminiUsage(body.usageMetadata) }
  }
  async embed(): Promise<EmbeddingResult> { throw new Error('Gemini Provider 不支持 Embedding') }
  async *stream(req: ChatRequest, signal?: AbortSignal) {
    const system = req.messages.find((message) => message.role === 'system')?.content
    const contents = req.messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }))
    const response = await this.fetcher(`${this.baseURL()}/models/${encodeURIComponent(this.profile.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(await this.key())}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig: { temperature: req.temperature ?? this.profile.temperature, maxOutputTokens: req.maxOutputTokens ?? this.profile.maxOutputTokens } }), signal })
    if (!response.ok || !response.body) { yield { type: 'error' as const, message: `Gemini Provider 请求失败 (${response.status})` }; return }
    let text = ''; let usage: TokenUsage | undefined
    for await (const line of readSse(response.body)) {
      try { const item = JSON.parse(line) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }; usage = geminiUsage(item.usageMetadata) ?? usage; const delta = item.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''; if (delta) { text += delta; yield { type: 'delta' as const, text: delta } } } catch { /* ignore non-JSON SSE comments */ }
    }
    yield { type: 'done' as const, result: { text, model: this.profile.model, usage } }
  }
  private baseURL() { return (this.profile.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '') }
}
export class MockProvider implements LLMProvider {
  constructor(readonly profile: ProviderProfile) {}
  async listModels() { return [{ id: profileModel(this.profile), displayName: 'Deterministic mock' }] }
  async chat(req: ChatRequest) { const text = `mock: ${req.messages.at(-1)?.content ?? ''}`; return { text, model: profileModel(this.profile), requestId: 'mock-request', usage: { inputTokens: estimateTokens(req.messages.map((message) => message.content).join('')), outputTokens: estimateTokens(text), totalTokens: estimateTokens(req.messages.map((message) => message.content).join('')) + estimateTokens(text) } } }
  async embed(texts: string[]): Promise<EmbeddingResult> { return { vectors: texts.map(deterministicEmbedding), model: profileModel(this.profile), requestId: 'mock-embedding-request' } }
  async structured<T>(req: StructuredRequest<T>) {
    const input = req.request.messages.map((message) => message.content).join('\n')
    const subjectId = input.match(/ent_[a-zA-Z0-9_-]+/)?.[0] ?? 'ent_fixture'
    const text = /提取|memory.extract|Memory Extractor|Canon/i.test(input)
      ? JSON.stringify({ facts: [{ subjectId, predicate: 'status.fixture', object: true, validFrom: null, validTo: null, confidence: 1, range: [0, 1] }] })
      : (await this.chat(req.request)).text
    return req.parse(text)
  }
  async *stream(req: ChatRequest): AsyncIterable<ChatEvent> {
    const result = await this.chat(req)
    for (const text of result.text) yield { type: 'delta', text }
    yield { type: 'done', result }
  }
}

export function providerFor(profile: ProviderProfile, secrets: SecretStore, fetcher?: FetchLike): LLMProvider {
  if (profile.kind === 'anthropic') return new AnthropicProvider(profile, secrets, fetcher)
  if (profile.kind === 'gemini') return new GeminiProvider(profile, secrets, fetcher)
  if (profile.kind === 'mock') return new MockProvider(profile)
  return new OpenAICompatibleProvider(profile, secrets, fetcher)
}

function profileModel(profile: ProviderProfile): string { return profile.model }
function validCount(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined }
function usage(input: unknown, output: unknown, total: unknown): TokenUsage | undefined { const inputTokens = validCount(input); const outputTokens = validCount(output); const totalTokens = validCount(total) ?? (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined); return inputTokens !== undefined && outputTokens !== undefined && totalTokens !== undefined ? { inputTokens, outputTokens, totalTokens } : undefined }
function openAiUsage(value: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined): TokenUsage | undefined { return value ? usage(value.prompt_tokens, value.completion_tokens, value.total_tokens) : undefined }
function anthropicUsage(value: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined): TokenUsage | undefined { return value ? usage(value.input_tokens, value.output_tokens, value.total_tokens) : undefined }
function geminiUsage(value: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined): TokenUsage | undefined { return value ? usage(value.promptTokenCount, value.candidatesTokenCount, value.totalTokenCount) : undefined }
function estimateTokens(value: string): number { return Math.max(1, Math.ceil(value.length / 4)) }

function deterministicEmbedding(value: string): number[] {
  const vector = new Array<number>(16).fill(0)
  for (const [index, character] of Array.from(value).entries()) vector[index % vector.length] += character.codePointAt(0) ?? 0
  const magnitude = Math.hypot(...vector) || 1
  return vector.map((item) => item / magnitude)
}

async function* readSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder(); let buffer = ''
  const reader = body.getReader()
  while (true) {
    const next = await reader.read()
    if (next.done) break
    buffer += decoder.decode(next.value, { stream: true })
    const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
    for (const line of lines) if (line.startsWith('data:')) yield line.slice(5).trim()
  }
  if (buffer.startsWith('data:')) yield buffer.slice(5).trim()
}
