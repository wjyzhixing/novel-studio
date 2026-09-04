import { randomBytes } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { CheckpointSummary } from '../../shared/checkpoint'
import type { ProjectService } from './project-service'
import { atomicWriteFile } from './atomic-fs'
import { DomainError } from './errors'

interface SnapshotEntry { path: string; data: string }
interface Snapshot extends CheckpointSummary { entries: SnapshotEntry[] }

const SNAPSHOT_ROOTS = ['novel.yaml', 'story', 'chapters', 'characters', 'world', 'workflows', 'prompts', 'assets']
const CHECKPOINT_ID = /^checkpoint_[a-zA-Z0-9_-]+$/

export class CheckpointService {
  constructor(private readonly project: ProjectService) {}

  async list(): Promise<CheckpointSummary[]> {
    const root = this.project.resolveInProject('.novel/checkpoints')
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    const snapshots: CheckpointSummary[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      try {
        const snapshot = JSON.parse(await readFile(join(root, entry.name), 'utf8')) as Snapshot
        if (CHECKPOINT_ID.test(snapshot.id) && typeof snapshot.name === 'string' && Array.isArray(snapshot.entries)) snapshots.push(summaryOf(snapshot))
      } catch { /* ignore an incomplete checkpoint; it cannot be restored */ }
    }
    return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async create(name: string): Promise<CheckpointSummary> {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 120) throw new DomainError('VALIDATION_FAILED', 'Checkpoint 名称不能为空且不能超过 120 个字符')
    const entries = await this.captureEntries()
    const snapshot: Snapshot = { id: `checkpoint_${randomBytes(10).toString('hex')}`, name: trimmed, createdAt: new Date().toISOString(), fileCount: entries.length, totalBytes: entries.reduce((sum, entry) => sum + Buffer.byteLength(entry.data, 'base64'), 0), entries }
    await atomicWriteFile(this.project.resolveInProject(`.novel/checkpoints/${snapshot.id}.json`), JSON.stringify(snapshot))
    return summaryOf(snapshot)
  }

  async restore(id: string): Promise<CheckpointSummary> {
    if (!CHECKPOINT_ID.test(id)) throw new DomainError('VALIDATION_FAILED', 'Checkpoint ID 不合法')
    const file = this.project.resolveInProject(`.novel/checkpoints/${id}.json`)
    let snapshot: Snapshot
    try { snapshot = JSON.parse(await readFile(file, 'utf8')) as Snapshot } catch { throw new DomainError('PROJECT_NOT_FOUND', `Checkpoint 不存在: ${id}`) }
    if (!Array.isArray(snapshot.entries) || snapshot.entries.some((entry) => !entry || typeof entry.path !== 'string' || typeof entry.data !== 'string' || !isSnapshotPath(entry.path))) throw new DomainError('INVALID_PROJECT', 'Checkpoint 内容损坏')
    for (const entry of snapshot.entries) {
      const target = this.project.resolveInProject(entry.path)
      await atomicWriteFile(target, Buffer.from(entry.data, 'base64'))
    }
    await this.project.repairIndexes()
    return summaryOf(snapshot)
  }

  private async captureEntries(): Promise<SnapshotEntry[]> {
    const root = this.project.getInfo()?.rootPath
    if (!root) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const files: string[] = []
    for (const item of SNAPSHOT_ROOTS) await collectFiles(join(root, item), root, files)
    const entries: SnapshotEntry[] = []
    for (const file of files.sort()) entries.push({ path: file, data: (await readFile(join(root, file))).toString('base64') })
    return entries
  }
}

async function collectFiles(path: string, root: string, output: string[]): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = join(path, entry.name)
    if (entry.isDirectory()) await collectFiles(full, root, output)
    else if (entry.isFile()) output.push(relative(root, full).split(sep).join('/'))
  }
}

function summaryOf(snapshot: Snapshot): CheckpointSummary { return { id: snapshot.id, name: snapshot.name, createdAt: snapshot.createdAt, fileCount: snapshot.entries.length, totalBytes: snapshot.entries.reduce((sum, entry) => sum + Buffer.byteLength(entry.data, 'base64'), 0) } }

function isSnapshotPath(path: string): boolean {
  return !path.startsWith('/') && !path.startsWith('\\') && !path.split('/').includes('..') && !path.startsWith('.novel/') && SNAPSHOT_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))
}
