import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { AiService } from '../src/main/services/ai-service'
import { MemorySecretStore } from '../src/main/services/secret-store'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { makeTempRoot } from './helpers'
import { RequestRateLimiter } from '../src/main/services/request-rate-limiter'
import { AgentService } from '../src/main/services/agent-service'
import type { ContextResult } from '../src/shared/context'

async function createAi(name = 'AI service test') {
  const root = await makeTempRoot()
  const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
  await project.create(join(root, 'novel'), name)
  return { root, project, secrets: new MemorySecretStore(), ai: undefined as AiService | undefined }
}

describe('AiService profiles and mock provider', () => {
  it('does not silently fall back to a deterministic mock in the normal service', async () => {
    const { project, secrets } = await createAi('AI mock boundary')
    const ai = new AiService(project, secrets)
    await expect(ai.chat('profile_mock', { messages: [{ role: 'user', content: 'fallback' }] })).rejects.toThrow('Provider profile 不存在')
  })

  it('persists non-secret profiles and keeps secrets in the secret store', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'AI test')
    const secrets = new MemorySecretStore()
    const ai = new AiService(project, secrets)
    const profile = { id: 'profile_mock_test', name: 'Mock', kind: 'mock' as const, model: 'mock-model', temperature: 0, maxOutputTokens: 100 }
    await ai.saveProfile(profile)
    await ai.setSecret(profile.id, 'not-in-project')
    expect(await ai.listProfiles()).toEqual([profile])
    expect(await ai.hasSecret(profile.id)).toBe(true)
    expect(project.database.getSetting('ai.providerProfiles')).not.toContain('not-in-project')
    await expect(ai.testProfile(profile.id)).resolves.toEqual([{ id: 'mock-model', displayName: 'Deterministic mock' }])
    await expect(ai.chat(profile.id, { messages: [{ role: 'user', content: 'hello' }] })).resolves.toMatchObject({ text: 'mock: hello' })
  })

  it('uses the provider structured contract for structured requests', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'AI structured test')
    const ai = new AiService(project, new MemorySecretStore())
    const profile = { id: 'profile_mock_structured', name: 'Mock', kind: 'mock' as const, model: 'mock-model', temperature: 0, maxOutputTokens: 100 }
    await ai.saveProfile(profile)

    await expect(ai.structured(profile.id, {
      request: { messages: [{ role: 'user', content: 'Memory Extractor' }] },
      parse: (value) => JSON.parse(value) as { facts: unknown[] }
    })).resolves.toMatchObject({ facts: [{ predicate: 'status.fixture' }] })
    const audit = await import('node:fs/promises').then(({ readFile }) => readFile(join(root, 'novel', '.novel/logs/ai-invocations.jsonl'), 'utf8'))
    expect(audit).toContain('"kind":"chat"')
    await expect(ai.structured(profile.id, {
      request: { messages: [{ role: 'user', content: 'invalid schema' }] },
      responseSchema: { name: 'not valid', schema: { type: 'object' } },
      parse: (value) => value
    })).rejects.toThrow('结构化输出 schema 无效')
  })

  it('selects, deletes profiles, and removes both text and image secrets', async () => {
    const { project, secrets } = await createAi('AI profile lifecycle')
    const ai = new AiService(project, secrets)
    const first = { id: 'profile_mock_first', name: 'First', kind: 'mock' as const, model: 'one', temperature: 0, maxOutputTokens: 100 }
    const second = { id: 'profile_mock_second', name: 'Second', kind: 'mock' as const, model: 'two', temperature: 0, maxOutputTokens: 100 }
    await ai.saveProfile(first)
    await ai.saveProfile(second)
    await ai.setSecret(first.id, 'secret')
    await ai.setImageSecret(first.id, 'image-secret')
    await ai.selectProfile(first.id)
    expect(project.getInfo()?.manifest.providerProfile).toBe(first.id)
    await ai.deleteProfile(first.id)
    expect(await ai.listProfiles()).toEqual([second])
    expect(await ai.hasSecret(first.id)).toBe(false)
    expect(await ai.hasImageSecret(first.id)).toBe(false)
    expect(project.getInfo()?.manifest.providerProfile).toBe(second.id)
    await ai.deleteProfile(second.id)
    expect(project.getInfo()?.manifest.providerProfile).toBeNull()
  })

  it('validates secrets, reports missing profiles, and calculates context budgets', async () => {
    const { project, secrets } = await createAi('AI validation')
    const ai = new AiService(project, secrets, undefined, undefined, { allowDeterministicMock: true })
    await expect(ai.setSecret('profile_missing', '  ')).rejects.toThrow('Secret 不能为空')
    await expect(ai.setImageSecret('profile_missing', '')).rejects.toThrow('Image API Key 不能为空')
    expect(() => ai.defaultProfileId()).toThrow('尚未配置 Provider')
    await expect(ai.testProfile('profile_missing')).rejects.toThrow('Provider profile 不存在')
    project.database.setSetting('ai.providerProfiles', '{bad json')
    await expect(ai.listProfiles()).rejects.toThrow('Provider profile 数据损坏')
    project.database.setSetting('ai.providerProfiles', '[]')

    const profile = { id: 'profile_mock_budget', name: 'Budget', kind: 'mock' as const, model: 'budget', contextWindow: 1000, temperature: 0, maxOutputTokens: 100 }
    await ai.saveProfile(profile)
    await ai.selectProfile(profile.id)
    expect(ai.defaultProfileId()).toBe(profile.id)
    await expect(ai.contextBudget(profile.id, 2000, 100)).resolves.toBe(644)
    await expect(ai.embed(profile.id, ['hello'])).resolves.toMatchObject({ model: 'budget', vectors: [expect.arrayContaining([expect.any(Number)])] })
    await expect(ai.testEmbedding(profile.id)).rejects.toThrow('请先配置 Embedding Model')
    await expect(ai.chat('profile_mock', { messages: [{ role: 'user', content: 'fallback' }], maxOutputTokens: 100 })).resolves.toMatchObject({ text: 'mock: fallback' })
  })

  it('streams mock output, passes agent context when available, and records an audit entry', async () => {
    const { root, project, secrets } = await createAi('AI streaming')
    const ai = new AiService(project, secrets)
    const profile = { id: 'profile_mock_stream', name: 'Stream', kind: 'mock' as const, model: 'stream', temperature: 0, maxOutputTokens: 100 }
    await ai.saveProfile(profile)
    const events: unknown[] = []
    await new Promise<void>(async (resolve) => {
      await ai.stream(profile.id, { messages: [{ role: 'user', content: 'write' }] }, (event) => {
        events.push(event)
        if (event.type === 'done') resolve()
      }, 'job-stream')
    })
    expect(events.at(-1)).toMatchObject({ type: 'done', result: { text: 'mock: write', model: 'stream' } })
    await new Promise((resolve) => setTimeout(resolve, 20))
    const audit = await import('node:fs/promises').then(({ readFile }) => readFile(join(root, 'novel', '.novel/logs/ai-invocations.jsonl'), 'utf8'))
    expect(audit).toContain('"kind":"stream"')
    expect(() => ai.cancelStream('job-stream')).not.toThrow()
  })

  it('compiles an agent stream and attaches the context manifest to the final event', async () => {
    const { project, secrets } = await createAi('AI agent streaming')
    const ai = new AiService(project, secrets, new AgentService())
    const profile = { id: 'profile_mock_agent_stream', name: 'Agent stream', kind: 'mock' as const, model: 'agent-stream', temperature: 0, maxOutputTokens: 100 }
    await ai.saveProfile(profile)
    const context = {
      text: '上下文片段',
      manifest: { recipeId: 'chapter-writing', budgetTokens: 100, totalTokens: 2, omittedSources: [], items: [], retrieval: {}, retrievalVersion: 1, generatedAt: '2026-01-01' }
    } as unknown as ContextResult
    const events: Array<{ type: string; result?: { context?: unknown; text?: string } }> = []

    await new Promise<void>(async (resolve) => {
      await ai.streamWithAgent(profile.id, { messages: [{ role: 'user', content: '继续写' }] }, 'writer', context, (event) => {
        events.push(event as typeof events[number])
        if (event.type === 'done') resolve()
      }, 'agent-job')
    })

    expect(events.at(-1)).toMatchObject({ type: 'done', result: { text: '雨声落在旧路上，人物继续向前。', context: context.manifest } })
  })

  it('limits costly AI requests in Main and exposes a retryable error', async () => {
    const { project, secrets } = await createAi('AI rate limit')
    const limiter = new RequestRateLimiter({ maxRequests: 1, windowMs: 60_000, now: () => 1_000 })
    const ai = new AiService(project, secrets, undefined, limiter)
    const profile = { id: 'profile_mock_rate', name: 'Rate', kind: 'mock' as const, model: 'rate', temperature: 0, maxOutputTokens: 100 }
    await ai.saveProfile(profile)

    await expect(ai.chat(profile.id, { messages: [{ role: 'user', content: 'first' }] })).resolves.toMatchObject({ text: 'mock: first' })
    await expect(ai.chat(profile.id, { messages: [{ role: 'user', content: 'second' }] })).rejects.toMatchObject({
      code: 'RATE_LIMITED', retryable: true, details: { retryAfterMs: 60_000 }
    })
  })
})
