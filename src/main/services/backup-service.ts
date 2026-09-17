import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parse } from 'yaml'
import { backupManifestSchema, type BackupManifest } from '../../shared/backup'
import { novelManifestSchema } from '../../shared/project-schema'
import type { ProjectService } from './project-service'
import { DomainError } from './errors'

const run = promisify(execFile)

/** Project archive service. Provider secrets are outside the project and are never included. */
export class BackupService {
  constructor(private readonly project: ProjectService) {}

  private async projectManifest(kind: BackupManifest['kind'], baseManifestHash?: string, baseFiles?: Record<string, string>): Promise<BackupManifest> {
    const root = this.project.getInfo()?.rootPath
    if (!root) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const files: Record<string, string> = {}
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const fullPath = resolve(directory, entry.name)
        if (entry.isDirectory()) await visit(fullPath)
        else if (entry.isFile()) {
          const relPath = relative(root, fullPath).split(sep).join('/')
          files[relPath] = createHash('sha256').update(await readFile(fullPath)).digest('hex')
        }
      }
    }
    await visit(root)
    const changed = kind === 'full' ? Object.keys(files).sort() : Object.keys(files).filter((path) => files[path] !== baseFiles?.[path]).sort()
    const deleted = kind === 'full' ? [] : Object.keys(baseFiles ?? {}).filter((path) => files[path] === undefined).sort()
    return { version: 1, kind, createdAt: new Date().toISOString(), files, changed, deleted, ...(baseManifestHash ? { baseManifestHash } : {}) }
  }

  private async withManifestFile<T>(manifest: BackupManifest, callback: (manifestPath: string) => Promise<T>): Promise<T> {
    const directory = await mkdtemp(resolve(tmpdir(), 'novel-studio-backup-'))
    const manifestPath = resolve(directory, 'backup-manifest.json')
    try {
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      return await callback(manifestPath)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  private async archiveManifest(archive: string): Promise<BackupManifest> {
    let raw: string
    try { raw = (await run('unzip', ['-p', archive, 'backup-manifest.json'])).stdout } catch { throw new DomainError('INVALID_PROJECT', '备份缺少 backup-manifest.json，请先创建新的全量备份') }
    let value: unknown
    try { value = JSON.parse(raw) } catch { throw new DomainError('INVALID_PROJECT', '备份 manifest JSON 无效') }
    const parsed = backupManifestSchema.safeParse(value)
    if (!parsed.success) throw new DomainError('INVALID_PROJECT', '备份 manifest schema 无效')
    return parsed.data
  }

  private async tryArchiveManifest(archive: string): Promise<BackupManifest | undefined> {
    try { return await this.archiveManifest(archive) } catch (error) {
      if (error instanceof DomainError && error.message.includes('缺少 backup-manifest.json')) return undefined
      throw error
    }
  }

  private async validateArchiveEntries(archive: string): Promise<void> {
    const details = await run('unzip', ['-Z', '-l', resolve(archive)])
    const symlink = details.stdout.split(/\r?\n/).find((entry) => /^\s*l[rwx-]{9}\s/.test(entry))
    if (symlink) throw new DomainError('PATH_DENIED', '备份不支持符号链接')
    const listing = await run('unzip', ['-Z1', resolve(archive)])
    const unsafe = listing.stdout.split(/\r?\n/).filter(Boolean).find((entry) => entry.startsWith('/') || entry.startsWith('\\') || entry.split(/[\\/]/).includes('..'))
    if (unsafe) throw new DomainError('PATH_DENIED', `备份包含不安全路径: ${unsafe}`)
  }

  private async extractArchive(archive: string, destination: string): Promise<void> {
    await this.validateArchiveEntries(archive)
    await run('unzip', ['-q', '-o', resolve(archive), '-d', destination])
  }

  private async removeManifest(destination: string): Promise<void> {
    await unlink(resolve(destination, 'backup-manifest.json')).catch(() => undefined)
  }

  private assertSafeRelativePath(relPath: string): void {
    if (!relPath || relPath.startsWith('/') || relPath.startsWith('\\') || relPath.split(/[\\/]/).includes('..')) throw new DomainError('PATH_DENIED', `备份路径不安全: ${relPath}`)
  }

  private async validateRestoredProject(destination: string): Promise<void> {
    try {
      const manifest = novelManifestSchema.parse(parse(await readFile(resolve(destination, 'novel.yaml'), 'utf8')))
      if (!manifest.projectId) throw new Error('缺少 projectId')
    } catch (error) {
      throw new DomainError('INVALID_PROJECT', `备份恢复后项目校验失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async createArchive(destination: string): Promise<string> {
    const root = this.project.getInfo()?.rootPath
    if (!root) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    const archive = resolve(destination)
    await this.assertArchiveDestination(root, archive)
    const manifest = await this.projectManifest('full')
    const temporary = `${archive}.${randomUUID()}.tmp`
    try {
      await run('zip', ['-rq', temporary, '.'], { cwd: root })
      await this.withManifestFile(manifest, (manifestPath) => run('zip', ['-q', temporary, '-j', manifestPath]).then(() => temporary))
      await this.replaceArchive(temporary, archive)
    } finally { await unlink(temporary).catch(() => undefined) }
    return archive
  }

  private async replaceArchive(temporary: string, archive: string): Promise<void> {
    try { await rename(temporary, archive) } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST' && code !== 'EPERM') throw error
      await unlink(archive)
      await rename(temporary, archive)
    }
  }

  private async assertArchiveDestination(root: string, archive: string): Promise<void> {
    const canonicalArchive = await canonicalPath(archive)
    if (canonicalArchive === root || canonicalArchive.startsWith(`${root}${sep}`)) throw new DomainError('PATH_DENIED', '备份文件不能放在项目目录内')
  }

  async createIncrementalArchive(destination: string, baseArchive: string): Promise<string> {
    const archive = resolve(destination)
    const root = this.project.getInfo()?.rootPath
    if (!root) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    await this.assertArchiveDestination(root, archive)
    if (archive === resolve(baseArchive)) throw new DomainError('VALIDATION_FAILED', '增量备份不能覆盖全量基准')
    const base = await this.archiveManifest(resolve(baseArchive))
    if (base.kind !== 'full') throw new DomainError('VALIDATION_FAILED', '增量备份的基准必须是全量备份')
    const manifest = await this.projectManifest('incremental', createHash('sha256').update(JSON.stringify(base)).digest('hex'), base.files)
    const temporary = `${archive}.${randomUUID()}.tmp`
    try {
      await this.withManifestFile(manifest, async (manifestPath) => {
        await run('zip', ['-q', temporary, '-j', manifestPath])
        if (manifest.changed.length) await run('zip', ['-q', temporary, ...manifest.changed], { cwd: root })
        return temporary
      })
      await this.replaceArchive(temporary, archive)
    } finally { await unlink(temporary).catch(() => undefined) }
    return archive
  }
  async restoreArchive(archive: string, destination: string): Promise<string> {
    const entries = await readdir(destination).catch(() => { throw new DomainError('PROJECT_NOT_FOUND', '恢复目标目录不存在') })
    if (entries.length) throw new DomainError('DIR_NOT_EMPTY', '恢复目标目录必须为空')
    const manifest = await this.tryArchiveManifest(resolve(archive))
    if (manifest && manifest.kind !== 'full') throw new DomainError('VALIDATION_FAILED', '全量恢复必须使用全量备份')
    await this.restoreIntoStaging(destination, async (staging) => {
      await this.extractArchive(archive, staging)
      await this.removeManifest(staging)
      await this.validateRestoredProject(staging)
      if (manifest) await this.validateRestoredFiles(staging, manifest)
    })
    return destination
  }

  async restoreIncrementalArchive(baseArchive: string, incrementalArchive: string, destination: string): Promise<string> {
    const entries = await readdir(destination).catch(() => { throw new DomainError('PROJECT_NOT_FOUND', '恢复目标目录不存在') })
    if (entries.length) throw new DomainError('DIR_NOT_EMPTY', '恢复目标目录必须为空')
    const base = await this.archiveManifest(resolve(baseArchive))
    const increment = await this.archiveManifest(resolve(incrementalArchive))
    const expectedBaseHash = createHash('sha256').update(JSON.stringify(base)).digest('hex')
    if (base.kind !== 'full' || increment.kind !== 'incremental' || increment.baseManifestHash !== expectedBaseHash) throw new DomainError('INVALID_PROJECT', '增量备份与全量基准不匹配')
    await this.restoreIntoStaging(destination, async (staging) => {
      await this.extractArchive(baseArchive, staging)
      await this.extractArchive(incrementalArchive, staging)
      for (const relPath of increment.deleted) {
        this.assertSafeRelativePath(relPath)
        const target = resolve(staging, relPath)
        if (target !== staging && !target.startsWith(`${staging}/`)) throw new DomainError('PATH_DENIED', `增量删除路径不安全: ${relPath}`)
        await unlink(target).catch(() => undefined)
      }
      await this.removeManifest(staging)
      await this.validateRestoredProject(staging)
      await this.validateRestoredFiles(staging, increment)
    })
    return destination
  }

  private async restoreIntoStaging(destination: string, prepare: (staging: string) => Promise<void>): Promise<void> {
    const staging = await mkdtemp(join(dirname(destination), `.novel-studio-restore-${randomUUID()}-`))
    try {
      await prepare(staging)
      const quarantine = `${destination}.${randomUUID()}.previous`
      await rename(destination, quarantine)
      try {
        await rename(staging, destination)
        await rm(quarantine, { recursive: true, force: true }).catch(() => undefined)
      } catch (error) {
        await rm(destination, { recursive: true, force: true }).catch(() => undefined)
        if (await pathExists(quarantine)) await rename(quarantine, destination).catch(() => undefined)
        throw error
      }
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }

  private async validateRestoredFiles(destination: string, manifest: BackupManifest): Promise<void> {
    const declared = new Set(Object.keys(manifest.files))
    const actual = new Set<string>()
    const collect = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const fullPath = resolve(directory, entry.name)
        const relPath = relative(destination, fullPath).split(sep).join('/')
        if (entry.isDirectory()) await collect(fullPath)
        else if (entry.isFile()) actual.add(relPath)
      }
    }
    await collect(destination)
    for (const relPath of actual) {
      if (!declared.has(relPath)) throw new DomainError('INVALID_PROJECT', `备份包含未声明文件: ${relPath}`)
    }
    for (const [relPath, expectedHash] of Object.entries(manifest.files)) {
      this.assertSafeRelativePath(relPath)
      const target = resolve(destination, relPath)
      if (target !== destination && !target.startsWith(`${destination}/`)) throw new DomainError('PATH_DENIED', `备份路径不安全: ${relPath}`)
      let actualHash: string
      try { actualHash = createHash('sha256').update(await readFile(target)).digest('hex') } catch { throw new DomainError('INVALID_PROJECT', `备份文件校验失败: ${relPath}`) }
      if (actualHash !== expectedHash) throw new DomainError('INVALID_PROJECT', `备份文件校验失败: ${relPath}`)
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

async function canonicalPath(path: string): Promise<string> {
  const pending: string[] = [basename(path)]
  let current = dirname(path)
  while (true) {
    try { return resolve(await realpath(current), ...pending.reverse()) } catch {
      const parent = dirname(current)
      if (parent === current) return resolve(path)
      pending.push(basename(current)); current = parent
    }
  }
}
