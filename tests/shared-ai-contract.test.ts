import { describe, expect, it } from 'vitest'
import { providerProfileSchema, responseSchemaSchema, resolveContextBudget, resolveOutputBudget } from '../src/shared/ai'

const profile = { id: 'profile_contract', name: 'Contract', kind: 'openai-compatible' as const, model: 'model-1' }

describe('shared AI contracts', () => {
  it('accepts HTTPS and local development HTTP provider URLs', () => {
    expect(providerProfileSchema.safeParse({ ...profile, baseURL: 'https://provider.example/v1' }).success).toBe(true)
    expect(providerProfileSchema.safeParse({ ...profile, baseURL: 'http://127.0.0.1:3000/v1' }).success).toBe(true)
    expect(providerProfileSchema.safeParse({ ...profile, baseURL: 'http://localhost:3000/v1' }).success).toBe(true)
  })

  it('rejects insecure remote HTTP and URLs carrying credentials or query data', () => {
    for (const baseURL of ['http://provider.example/v1', 'https://user:pass@provider.example/v1', 'https://provider.example/v1?token=secret', 'https://provider.example/v1#fragment']) {
      expect(providerProfileSchema.safeParse({ ...profile, baseURL }).success).toBe(false)
    }
  })

  it('keeps requested context within the model window and reserved output budget', () => {
    expect(resolveContextBudget(2_000, 1_000, 100)).toBe(644)
    expect(resolveContextBudget(2_000, 1_000, 10_000)).toBe(1)
    expect(resolveContextBudget(2_000)).toBe(2_000)
    expect(resolveOutputBudget(2_000, 1_000)).toBe(744)
  })

  it('accepts bounded native response schemas and rejects unsafe schema metadata', () => {
    expect(responseSchemaSchema.safeParse({ name: 'memory_extraction', schema: { type: 'object' }, strict: true }).success).toBe(true)
    expect(responseSchemaSchema.safeParse({ name: '', schema: { type: 'object' } }).success).toBe(false)
    expect(responseSchemaSchema.safeParse({ name: 'bad name', schema: { type: 'object' } }).success).toBe(false)
    expect(responseSchemaSchema.safeParse({ name: 'valid', schema: [] }).success).toBe(false)
    expect(responseSchemaSchema.safeParse({ name: 'large', schema: { description: 'x'.repeat(200_001) } }).success).toBe(false)
  })
})
