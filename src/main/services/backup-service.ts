import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { relative, resolve, sep } from 'node:path'
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
    const parsed = backupManifestSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) throw new DomainError('INVALID_PROJECT', '备份 manifest schema 无效')
    return parsed.data
  }

  private async validateArchiveEntries(archive: string): Promise<void> {
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
    if (archive === root || archive.startsWith(`${root}/`)) throw new DomainError('PATH_DENIED', '备份文件不能放在项目目录内')
    const manifest = await this.projectManifest('full')
    await run('zip', ['-rq', archive, '.'], { cwd: root })
    await this.withManifestFile(manifest, (manifestPath) => run('zip', ['-q', archive, '-j', manifestPath]).then(() => archive))
    return archive
  }

  async createIncrementalArchive(destination: string, baseArchive: string): Promise<string> {
    const archive = resolve(destination)
    const base = await this.archiveManifest(resolve(baseArchive))
    if (base.kind !== 'full') throw new DomainError('VALIDATION_FAILED', '增量备份的基准必须是全量备份')
    const manifest = await this.projectManifest('incremental', createHash('sha256').update(JSON.stringify(base)).digest('hex'), base.files)
    const root = this.project.getInfo()?.rootPath
    if (!root) throw new DomainError('NO_PROJECT_OPEN', '当前没有打开的项目')
    await this.withManifestFile(manifest, async (manifestPath) => {
      await run('zip', ['-q', archive, '-j', manifestPath])
      if (manifest.changed.length) await run('zip', ['-q', archive, ...manifest.changed], { cwd: root })
      return archive
    })
    return archive
  }
  async restoreArchive(archive: string, destination: string): Promise<string> {
    const entries = await readdir(destination).catch(() => { throw new DomainError('PROJECT_NOT_FOUND', '恢复目标目录不存在') })
    if (entries.length) throw new DomainError('DIR_NOT_EMPTY', '恢复目标目录必须为空')
    await this.extractArchive(archive, destination)
    await this.removeManifest(destination)
    await this.validateRestoredProject(destination)
    return destination
  }

  async restoreIncrementalArchive(baseArchive: string, incrementalArchive: string, destination: string): Promise<string> {
    const entries = await readdir(destination).catch(() => { throw new DomainError('PROJECT_NOT_FOUND', '恢复目标目录不存在') })
    if (entries.length) throw new DomainError('DIR_NOT_EMPTY', '恢复目标目录必须为空')
    const base = await this.archiveManifest(resolve(baseArchive))
    const increment = await this.archiveManifest(resolve(incrementalArchive))
    const expectedBaseHash = createHash('sha256').update(JSON.stringify(base)).digest('hex')
    if (base.kind !== 'full' || increment.kind !== 'incremental' || increment.baseManifestHash !== expectedBaseHash) throw new DomainError('INVALID_PROJECT', '增量备份与全量基准不匹配')
    await this.extractArchive(baseArchive, destination)
    await this.extractArchive(incrementalArchive, destination)
    for (const relPath of increment.deleted) {
      this.assertSafeRelativePath(relPath)
      const target = resolve(destination, relPath)
      if (target !== destination && !target.startsWith(`${destination}/`)) throw new DomainError('PATH_DENIED', `增量删除路径不安全: ${relPath}`)
      await unlink(target).catch(() => undefined)
    }
    await this.removeManifest(destination)
    await this.validateRestoredProject(destination)
    return destination
  }
}
