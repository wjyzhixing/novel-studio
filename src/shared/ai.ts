import { z } from 'zod'
import type { Result } from './result'
import type { ContextManifest, ContextRequest } from './context'

export const providerKindSchema = z.enum(['openai-compatible', 'anthropic', 'gemini', 'mock'])
export type ProviderKind = z.infer<typeof providerKindSchema>
export const agentIdSchema = z.enum(['plot-planner', 'writer', 'character-critic', 'logic-critic', 'style-critic', 'rewrite', 'memory-extractor', 'visual-director', 'image-prompt'])
export type AgentId = z.infer<typeof agentIdSchema>
export interface AiStreamOptions { agentId?: AgentId; contextRequest?: ContextRequest }
export interface AgentPolicy { agentId: AgentId; temperature: number; maxOutputTokens: number; contextRecipeId: string; tools: string[]; outputSchema?: string; maxRetries: number }

const providerUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value)
  const localHttp = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  return (url.protocol === 'https:' || (url.protocol === 'http:' && localHttp)) && !url.username && !url.password && !url.search && !url.hash
}, 'Provider URL 必须使用 HTTPS（本机开发可用 localhost HTTP），且不能包含凭据或 query 参数')

export const providerProfileSchema = z.object({
  id: z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), name: z.string().min(1).max(100),
  kind: providerKindSchema, baseURL: providerUrlSchema.optional(), model: z.string().min(1).max(160), imageBaseURL: providerUrlSchema.optional(), imageModel: z.string().min(1).max(160).optional(),
  embeddingModel: z.string().min(1).max(160).optional(),
  contextWindow: z.number().int().positive().max(2_000_000).optional(),
  temperature: z.number().min(0).max(2).default(0.7), maxOutputTokens: z.number().int().positive().max(100_000).default(4096),
  inputTokenCostPerMillion: z.number().finite().min(0).max(1_000_000).optional(),
  outputTokenCostPerMillion: z.number().finite().min(0).max(1_000_000).optional()
})
export type ProviderProfile = z.infer<typeof providerProfileSchema>

export type ChatRole = 'system' | 'user' | 'assistant'
export interface ChatMessage { role: ChatRole; content: string }
export const responseSchemaSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,99}$/),
  schema: z.record(z.string(), z.unknown()),
  strict: z.boolean().optional()
}).superRefine((value, context) => {
  try {
    if (JSON.stringify(value.schema).length > 200_000) context.addIssue({ code: 'custom', message: 'response schema too large' })
  } catch {
    context.addIssue({ code: 'custom', message: 'response schema is not serializable' })
  }
})
export interface ResponseSchema { name: string; schema: Record<string, unknown>; strict?: boolean }
export interface ChatRequest { messages: ChatMessage[]; temperature?: number; maxOutputTokens?: number; responseSchema?: ResponseSchema }
export interface TokenUsage { inputTokens: number; outputTokens: number; totalTokens: number }
export interface ChatResult { text: string; model: string; requestId?: string; agentId?: AgentId; context?: ContextManifest; usage?: TokenUsage }
export interface StructuredRequest<T> { request: ChatRequest; responseSchema?: ResponseSchema; parse(text: string): T }
export type ChatEvent = { type: 'delta'; text: string } | { type: 'done'; result: ChatResult } | { type: 'error'; message: string }
export interface AiStreamEnvelope { jobId: string; event: ChatEvent }

export interface ModelInfo { id: string; displayName?: string; contextWindow?: number }
export const CONTEXT_SAFETY_MARGIN = 256
export function resolveContextBudget(requestedTokens: number, contextWindow?: number, reservedOutputTokens = 0): number {
  const requested = Math.max(1, Math.floor(requestedTokens))
  if (!contextWindow || contextWindow <= 0) return requested
  const available = Math.max(1, Math.floor(contextWindow) - Math.max(0, Math.floor(reservedOutputTokens)) - CONTEXT_SAFETY_MARGIN)
  return Math.min(requested, available)
}
export function resolveOutputBudget(requestedTokens: number, contextWindow?: number): number {
  return resolveContextBudget(requestedTokens, contextWindow)
}
export interface EmbeddingResult { vectors: number[][]; model: string; requestId?: string }
export interface LLMProvider {
  readonly profile: ProviderProfile
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult>
  embed(texts: string[], signal?: AbortSignal): Promise<EmbeddingResult>
  structured<T>(req: StructuredRequest<T>, signal?: AbortSignal): Promise<T>
  stream(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent>
}

export interface SecretStore { has(profileId: string): Promise<boolean>; set(profileId: string, secret: string): Promise<void>; get(profileId: string): Promise<string | null>; remove(profileId: string): Promise<void> }
export const imageSecretId = (profileId: string): string => `${profileId}:image`

export interface AiApiContract {
  listProfiles(): Promise<Result<ProviderProfile[]>>
  saveProfile(profile: ProviderProfile): Promise<Result<ProviderProfile>>
  selectProfile(id: string): Promise<Result<null>>
  deleteProfile(id: string): Promise<Result<null>>
  hasSecret(profileId: string): Promise<Result<boolean>>
  setSecret(profileId: string, secret: string): Promise<Result<null>>
  removeSecret(profileId: string): Promise<Result<null>>
  hasImageSecret(profileId: string): Promise<Result<boolean>>
  setImageSecret(profileId: string, secret: string): Promise<Result<null>>
  removeImageSecret(profileId: string): Promise<Result<null>>
  testProfile(profileId: string): Promise<Result<ModelInfo[]>>
  testEmbedding(profileId: string): Promise<Result<{ model: string; dimensions: number }>>
  chat(profileId: string, req: ChatRequest): Promise<Result<ChatResult>>
  stream(profileId: string, req: ChatRequest, onEvent: (event: ChatEvent) => void, options?: AiStreamOptions): Promise<() => void>
}
