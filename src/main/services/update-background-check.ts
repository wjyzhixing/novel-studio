type UpdateChecker = { check(): Promise<unknown> }
type Schedule = (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
type ClearSchedule = (timer: ReturnType<typeof setTimeout>) => void

const DEFAULT_DELAY_MS = 10_000

export function scheduleBackgroundUpdateCheck(
  service: UpdateChecker,
  options: {
    enabled: boolean
    delayMs?: number
    schedule?: Schedule
    clear?: ClearSchedule
  }
): () => void {
  if (!options.enabled) return () => undefined

  const schedule = options.schedule ?? setTimeout
  const clear = options.clear ?? clearTimeout
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  timer = schedule(() => {
    timer = null
    if (disposed) return
    // Startup checks are advisory. They must never become an unhandled
    // rejection or delay the renderer/main lifecycle.
    void Promise.resolve().then(() => service.check()).catch(() => undefined)
  }, options.delayMs ?? DEFAULT_DELAY_MS)

  return () => {
    disposed = true
    if (timer !== null) {
      clear(timer)
      timer = null
    }
  }
}
