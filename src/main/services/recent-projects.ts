import { readFile } from 'node:fs/promises'
import { atomicWriteFile } from './atomic-fs'
import type { RecentProject } from '../../shared/ipc'

const MAX_RECENTS = 10

/**
 * Recents live in the app userData dir (NOT inside any project) as plain JSON.
 * Corrupt/missing file is tolerated — recents are convenience data only.
 */
export class RecentProjectsStore {
  constructor(private readonly file: string) {}

  async list(): Promise<RecentProject[]> {
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter(
          (it): it is RecentProject =>
            !!it && typeof it === 'object' && typeof (it as RecentProject).path === 'string'
        )
        .slice(0, MAX_RECENTS)
    } catch {
      return []
    }
  }

  async record(path: string, title: string): Promise<void> {
    const rest = (await this.list()).filter((it) => it.path !== path)
    const next = [{ path, title, lastOpenedAt: new Date().toISOString() }, ...rest].slice(0, MAX_RECENTS)
    await atomicWriteFile(this.file, JSON.stringify(next, null, 2))
  }

  async remove(path: string): Promise<void> {
    const next = (await this.list()).filter((it) => it.path !== path)
    await atomicWriteFile(this.file, JSON.stringify(next, null, 2))
  }
}
