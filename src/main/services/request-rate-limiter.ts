export interface RequestRateLimiterOptions {
  maxRequests: number
  windowMs: number
  now?: () => number
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterMs: number }

/** Main-owned sliding-window limiter for costly external requests. */
export class RequestRateLimiter {
  private readonly requests = new Map<string, number[]>()
  private readonly now: () => number

  constructor(private readonly options: RequestRateLimiterOptions) {
    if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1) throw new Error('maxRequests must be a positive integer')
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) throw new Error('windowMs must be positive')
    this.now = options.now ?? Date.now
  }

  tryConsume(key: string): RateLimitDecision {
    const current = this.now()
    const cutoff = current - this.options.windowMs
    const active = (this.requests.get(key) ?? []).filter((timestamp) => timestamp > cutoff)
    if (active.length >= this.options.maxRequests) {
      const oldest = active[0] ?? current
      return { allowed: false, retryAfterMs: Math.max(1, oldest + this.options.windowMs - current) }
    }
    this.requests.set(key, [...active, current])
    return { allowed: true }
  }
}
