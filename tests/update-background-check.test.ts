import { describe, expect, it, vi } from 'vitest'
import { scheduleBackgroundUpdateCheck } from '../src/main/services/update-background-check'

describe('background update check scheduling', () => {
  it('does not schedule a check when no update endpoint is configured', () => {
    const schedule = vi.fn()
    const service = { check: vi.fn(async () => ({ state: 'idle' as const })) }

    const dispose = scheduleBackgroundUpdateCheck(service, {
      enabled: false,
      schedule
    })

    dispose()
    expect(schedule).not.toHaveBeenCalled()
    expect(service.check).not.toHaveBeenCalled()
  })

  it('runs exactly one delayed check and can be disposed before startup', async () => {
    let task: (() => void) | undefined
    const clear = vi.fn()
    const service = { check: vi.fn(async () => ({ state: 'up_to_date' as const, reason: 'not-newer' as const })) }
    const schedule = vi.fn((callback: () => void, delay: number) => {
      expect(delay).toBe(10_000)
      task = callback
      return 1 as unknown as ReturnType<typeof setTimeout>
    })

    const dispose = scheduleBackgroundUpdateCheck(service, {
      enabled: true,
      schedule,
      clear
    })

    expect(schedule).toHaveBeenCalledTimes(1)
    dispose()
    expect(clear).toHaveBeenCalledTimes(1)
    task?.()
    await Promise.resolve()
    expect(service.check).not.toHaveBeenCalled()
  })

  it('does not leak a rejected background check as an unhandled rejection', async () => {
    const service = { check: vi.fn(async () => { throw new Error('offline') }) }
    const schedule = vi.fn((callback: () => void) => {
      callback()
      return 1 as unknown as ReturnType<typeof setTimeout>
    })

    scheduleBackgroundUpdateCheck(service, { enabled: true, schedule })
    await Promise.resolve()
    expect(service.check).toHaveBeenCalledTimes(1)
  })
})
