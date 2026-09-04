type Task<T> = { run: () => Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void }

/** Small bounded-concurrency queue for Main-process work. It never mutates a
 * task result and keeps execution ordering FIFO for queued jobs. */
export class TaskQueue {
  private active = 0
  private pending: readonly Task<unknown>[] = []

  constructor(private readonly concurrency = 2) {}

  enqueue<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending = [...this.pending, { run, resolve: resolve as (value: unknown) => void, reject }]
      this.pump()
    })
  }

  get pendingCount(): number { return this.pending.length }
  get activeCount(): number { return this.active }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const [task, ...rest] = this.pending
      this.pending = rest
      this.active += 1
      void task.run().then(task.resolve, task.reject).finally(() => { this.active -= 1; this.pump() })
    }
  }
}
