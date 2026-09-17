import { describe, expect, it } from 'vitest'
import { DomainError, toAppError } from '../src/main/services/errors'

describe('IPC error serialization', () => {
  it('normalizes unknown failures to a redacted internal error', () => {
    expect(toAppError(new Error('authorization: Bearer abc123'))).toEqual({
      code: 'INTERNAL',
      message: 'authorization: [redacted]'
    })
    expect(toAppError({ reason: 'token=secret-value' })).toEqual({
      code: 'INTERNAL',
      message: '[object Object]'
    })
  })

  it('keeps domain error fields while redacting sensitive messages and details', () => {
    const error = toAppError(new DomainError('IO_ERROR', 'Bearer abc123', {
      retryable: true,
      details: {
        path: 'story/volumes.yaml',
        authorization: 'Bearer secret-token',
        nested: ['sk-test-key-12345678', 'safe']
      }
    }))

    expect(error).toEqual({
      code: 'IO_ERROR',
      message: 'Bearer [redacted]',
      retryable: true,
      details: {
        path: 'story/volumes.yaml',
        authorization: '[redacted]',
        nested: ['[redacted-key]', 'safe']
      }
    })
  })

  it('returns a serializable details tree for cyclic, deep, and bigint values', () => {
    const cyclic: Record<string, unknown> = { count: 1n }
    cyclic.self = cyclic
    let current: Record<string, unknown> = cyclic
    for (let index = 0; index < 10; index += 1) {
      const next: Record<string, unknown> = {}
      current.next = next
      current = next
    }

    const result = toAppError(new DomainError('DB_ERROR', 'schema failed', { details: cyclic }))

    expect(result.details).toEqual({
      count: '1',
      self: '[redacted]',
      next: {
        next: {
          next: {
            next: {
              next: {
                next: {
                  next: {
                    next: '[redacted]'
                  }
                }
              }
            }
          }
        }
      }
    })
    expect(() => structuredClone(result)).not.toThrow()
  })

  it('does not let hostile getters break error conversion', () => {
    const details = Object.defineProperty({}, 'message', {
      enumerable: true,
      get() {
        throw new Error('getter exploded')
      }
    })

    expect(() => toAppError(new DomainError('INTERNAL', 'failed', { details }))).not.toThrow()
  })

  it('does not throw when an unknown failure has a hostile string conversion', () => {
    const failure = {
      toString() {
        throw new Error('string conversion exploded')
      }
    }

    expect(() => toAppError(failure)).not.toThrow()
  })
})
