import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { AiService } from '../src/main/services/ai-service'
import { MemorySecretStore } from '../src/main/services/secret-store'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { makeTempRoot } from './helpers'

describe('AiService profiles and mock provider', () => {
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
  })
})
