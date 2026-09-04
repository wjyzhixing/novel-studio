import { appendFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolveContextBudget, resolveOutputBudget, type ChatEvent, type ChatRequest, type ChatResult, type EmbeddingResult, type ModelInfo, type ProviderProfile, type StructuredRequest } from '../../shared/ai'
import { imageSecretId } from '../../shared/ai'
import { providerProfileSchema } from '../../shared/ai'
import type { ProjectService } from './project-service'
import type { SecretStore } from '../../shared/ai'
import { providerFor } from './ai-provider'
import { DomainError } from './errors'
import type { AgentService } from './agent-service'
import type { ContextResult } from '../../shared/context'

export class AiService {
  private readonly streams = new Map<string, () => void>()
  constructor(private readonly project: ProjectService, private readonly secrets: SecretStore, private readonly agents?: AgentService) {}
  private get db() { return this.project.database.raw }

  async listProfiles(): Promise<ProviderProfile[]> {
    const raw = this.project.database.getSetting('ai.providerProfiles')
    if (!raw) return []
    try { return JSON.parse(raw) as ProviderProfile[] } catch { throw new DomainError('DB_ERROR', 'Provider profile 数据损坏') }
  }
  async saveProfile(profile: ProviderProfile): Promise<ProviderProfile> {
    const value = providerProfileSchema.parse(profile)
    const profiles = (await this.listProfiles()).filter((item) => item.id !== value.id)
    profiles.push(value)
    this.project.database.setSetting('ai.providerProfiles', JSON.stringify(profiles))
    // Saving configuration must not silently change the project's default.
    // The UI explicitly selects the first saved profile only when no default
    // exists, or the user clicks "使用" for an existing profile.
    return value
  }
  async selectProfile(id: string): Promise<null> {
    const profile = (await this.listProfiles()).find((item) => item.id === id)
    if (!profile) throw new DomainError('PROJECT_NOT_FOUND', 'Provider 不存在或已被删除')
    await this.project.setProviderProfile(profile.id)
    return null
  }
  async deleteProfile(id: string): Promise<null> {
    const profiles = await this.listProfiles()
    const remaining = profiles.filter((item) => item.id !== id)
    this.project.database.setSetting('ai.providerProfiles', JSON.stringify(remaining))
    await this.secrets.remove(id)
    await this.secrets.remove(imageSecretId(id))
    if (this.project.getInfo()?.manifest.providerProfile === id) await this.project.setProviderProfile(remaining[0]?.id ?? null)
    return null
  }
  async hasSecret(profileId: string) { return this.secrets.has(profileId) }
  async setSecret(profileId: string, secret: string): Promise<null> { if (!secret.trim()) throw new DomainError('VALIDATION_FAILED', 'Secret 不能为空'); await this.secrets.set(profileId, secret); return null }
  async removeSecret(profileId: string): Promise<null> { await this.secrets.remove(profileId); return null }
  async hasImageSecret(profileId: string) { return this.secrets.has(imageSecretId(profileId)) }
  async setImageSecret(profileId: string, secret: string): Promise<null> { if (!secret.trim()) throw new DomainError('VALIDATION_FAILED', 'Image API Key 不能为空'); await this.secrets.set(imageSecretId(profileId), secret); return null }
  async removeImageSecret(profileId: string): Promise<null> { await this.secrets.remove(imageSecretId(profileId)); return null }
  async testProfile(profileId: string): Promise<ModelInfo[]> { return (await this.provider(profileId)).listModels() }
  async contextBudget(profileId: string, requestedTokens: number, reservedOutputTokens = 0): Promise<number> {
    const profile = (await this.listProfiles()).find((item) => item.id === profileId)
    if (!profile) await this.provider(profileId)
    return resolveContextBudget(requestedTokens, profile?.contextWindow, reservedOutputTokens)
  }
  async testEmbedding(profileId: string): Promise<{ model: string; dimensions: number }> {
    const provider = await this.provider(profileId)
    if (!provider.profile.embeddingModel) throw new DomainError('VALIDATION_FAILED', '请先配置 Embedding Model')
    const result = await provider.embed(['Novel Studio embedding connection test'])
    const dimensions = result.vectors[0]?.length ?? 0
    if (!dimensions) throw new DomainError('INTERNAL', 'Embedding Provider 未返回有效向量')
    return { model: result.model, dimensions }
  }
  async embed(profileId: string, texts: string[], signal?: AbortSignal): Promise<EmbeddingResult> {
    if (texts.some((text) => text.length > 2_000_000)) throw new DomainError('VALIDATION_FAILED', 'Embedding 文本不能超过 2MB')
    return (await this.provider(profileId)).embed(texts, signal)
  }
  async chat(profileId: string, request: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
    const normalizedRequest = await this.normalizeRequest(profileId, request)
    const started = performance.now(); const startedAt = new Date().toISOString()
    try {
      const result = await (await this.provider(profileId)).chat(normalizedRequest, signal)
      await this.recordAudit({ id: `ai_${randomUUID()}`, kind: 'chat', profileId, model: result.model, requestId: result.requestId, messageCount: normalizedRequest.messages.length, inputChars: normalizedRequest.messages.reduce((sum, message) => sum + message.content.length, 0), usage: result.usage, outcome: 'succeeded', startedAt, durationMs: Math.round(performance.now() - started) })
      return result
    } catch (error) {
      await this.recordAudit({ id: `ai_${randomUUID()}`, kind: 'chat', profileId, messageCount: normalizedRequest.messages.length, inputChars: normalizedRequest.messages.reduce((sum, message) => sum + message.content.length, 0), outcome: signal?.aborted ? 'cancelled' : 'failed', errorCategory: signal?.aborted ? 'cancelled' : 'provider', startedAt, durationMs: Math.round(performance.now() - started) })
      throw error
    }
  }
  async structured<T>(profileId: string, request: StructuredRequest<T>, signal?: AbortSignal): Promise<T> {
    const provider = await this.provider(profileId)
    const normalizedRequest = await this.normalizeRequest(profileId, request.request)
    return provider.structured({ ...request, request: normalizedRequest }, signal)
  }
  defaultProfileId(): string {
    const profileId = this.project.getInfo()?.manifest.providerProfile
    if (!profileId) throw new DomainError('VALIDATION_FAILED', '尚未配置 Provider，请先打开 Provider 设置')
    return profileId
  }
  async stream(profileId: string, request: ChatRequest, onEvent: (event: ChatEvent) => void, jobId?: string, auditContext?: { agentId?: string; contextRecipeId?: string }): Promise<() => void> {
    const normalizedRequest = await this.normalizeRequest(profileId, request)
    const controller = new AbortController()
    const started = performance.now(); const startedAt = new Date().toISOString(); let recorded = false
    const record = (event: ChatEvent, outcome: 'succeeded' | 'failed' | 'cancelled') => {
      if (recorded) return
      recorded = true
      const result = event.type === 'done' ? event.result : undefined
      void this.recordAudit({ id: `ai_${randomUUID()}`, kind: 'stream', profileId, model: result?.model, requestId: result?.requestId, agentId: auditContext?.agentId, contextRecipeId: auditContext?.contextRecipeId, messageCount: normalizedRequest.messages.length, inputChars: normalizedRequest.messages.reduce((sum, message) => sum + message.content.length, 0), usage: result?.usage, outcome, startedAt, durationMs: Math.round(performance.now() - started) })
    }
    const cancel = () => controller.abort()
    if (jobId) this.streams.set(jobId, cancel)
    void (async () => {
      try {
        for await (const event of (await this.provider(profileId)).stream(normalizedRequest, controller.signal)) { if (event.type === 'done') record(event, 'succeeded'); if (event.type === 'error') record(event, controller.signal.aborted ? 'cancelled' : 'failed'); onEvent(event) }
      } catch (error) {
        record({ type: 'error', message: error instanceof Error ? error.message : String(error) }, controller.signal.aborted ? 'cancelled' : 'failed')
        onEvent({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      } finally { if (jobId) this.streams.delete(jobId) }
    })()
    return cancel
  }
  async streamWithAgent(profileId: string, request: ChatRequest, agentId: import('../../shared/ai').AgentId, context: ContextResult | undefined, onEvent: (event: ChatEvent) => void, jobId?: string): Promise<() => void> {
    let messages = request.messages
    if (this.agents) {
      const compiled = await this.agents.messages(agentId, request.messages.at(-1)?.content ?? '', context)
      messages = [compiled[0], ...request.messages.slice(0, -1), compiled[1]]
    }
    return this.stream(profileId, { ...request, messages }, (event) => {
      if (event.type === 'done' && context) onEvent({ ...event, result: { ...event.result, context: context.manifest } })
      else onEvent(event)
    }, jobId, { agentId, contextRecipeId: context?.manifest.recipeId })
  }
  cancelStream(jobId: string): void { this.streams.get(jobId)?.() }
  private async provider(profileId: string) {
    const profiles = await this.listProfiles()
    const configured = profiles.find((item) => item.id === profileId)
    const profile = configured ?? (profileId === 'profile_mock'
      ? { id: 'profile_mock', name: 'Deterministic Mock', kind: 'mock' as const, model: 'mock-model', temperature: 0, maxOutputTokens: 4096 }
      : undefined)
    if (!profile) throw new DomainError('PROJECT_NOT_FOUND', `Provider profile 不存在: ${profileId}`)
    return providerFor(profile, this.secrets)
  }

  private async normalizeRequest(profileId: string, request: ChatRequest): Promise<ChatRequest> {
    if (request.maxOutputTokens === undefined) return request
    const profiles = await this.listProfiles()
    const profile = profiles.find((item) => item.id === profileId)
    if (!profile) { await this.provider(profileId); return request }
    if (!profile.contextWindow) return request
    return { ...request, maxOutputTokens: resolveOutputBudget(request.maxOutputTokens, profile.contextWindow) }
  }

  private async recordAudit(record: Omit<import('../../shared/diagnostics').AiInvocationAudit, 'durationMs'> & { durationMs: number }): Promise<void> {
    const root = this.project.getInfo()?.rootPath
    if (!root) return
    try { await appendFile(`${root}/.novel/logs/ai-invocations.jsonl`, `${JSON.stringify(record)}\n`, 'utf8') } catch { /* audit failure must not change the AI result */ }
  }
}
