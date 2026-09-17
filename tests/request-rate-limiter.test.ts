import { describe, expect, it } from 'vitest'
import { RequestRateLimiter } from '../src/main/services/request-rate-limiter'

describe('RequestRateLimiter', () => {
  it('allows a bounded burst and releases capacity after the window', () => {
    let now = 1_000
    const limiter = new RequestRateLimiter({ maxRequests: 2, windowMs: 1_000, now: () => now })

    expect(limiter.tryConsume('profile_a')).toEqual({ allowed: true })
    expect(limiter.tryConsume('profile_a')).toEqual({ allowed: true })
    expect(limiter.tryConsume('profile_a')).toEqual({ allowed: false, retryAfterMs: 1_000 })
    expect(limiter.tryConsume('profile_b')).toEqual({ allowed: true })

    now += 1_001
    expect(limiter.tryConsume('profile_a')).toEqual({ allowed: true })
  })
})
