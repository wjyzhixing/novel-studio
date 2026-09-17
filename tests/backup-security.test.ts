import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { mkdir, readFile, readdir, symlink, unlink, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { BackupService } from '../src/main/services/backup-service'
import { MIGRATIONS } from '../src/main/services/database'
import { makeTempRoot } from './helpers'

const run = promisify(execFile)

describe('BackupService', () => {
  it('backs up and restores a project without userData secrets', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Backup test'); const backup = new BackupService(project)
    await readFile(join(root, 'novel/novel.yaml'), 'utf8')
    const archive = await backup.createArchive(join(root, 'backup.zip')); expect(await readFile(archive).then(() => true)).toBe(true)
    const destination = join(root, 'restored'); const { mkdir } = await import('node:fs/promises'); await mkdir(destination)
    await backup.restoreArchive(archive, destination); expect(await readFile(join(destination, 'novel.yaml'), 'utf8')).toContain('Backup test')
  })

  it('does not retain stale entries when overwriting an existing archive', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const projectRoot = join(root, 'novel'); await project.create(projectRoot, 'Fresh archive')
    const backup = new BackupService(project); const archive = join(root, 'overwrite.zip')
    await backup.createArchive(archive)
    await writeFile(join(root, 'stale.txt'), 'stale', 'utf8')
    await run('zip', ['-q', archive, '-j', join(root, 'stale.txt')])
    await backup.createArchive(archive)
    const destination = join(root, 'overwrite-restored'); await mkdir(destination)
    await backup.restoreArchive(archive, destination)
    await expect(readFile(join(destination, 'stale.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await project.close()
  })

  it('restores a legacy v2 database archive and migrates it on open', async () => {
    const root = await makeTempRoot()
    const fixtureRoot = join(root, 'fixtures')
    await run(process.execPath, ['scripts/generate-fixtures.mjs', fixtureRoot], { cwd: process.cwd() })
    const legacyProject = join(fixtureRoot, 'migration-v1')
    const legacyArchive = join(root, 'migration-v1.zip')
    await run('zip', ['-rq', legacyArchive, '.'], { cwd: legacyProject })

    const restoreRoot = join(root, 'restored-legacy')
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const backup = new BackupService(project)
    await (await import('node:fs/promises')).mkdir(restoreRoot)
    await backup.restoreArchive(legacyArchive, restoreRoot)
    const restored = await project.open(restoreRoot)
    const version = (project.database.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version

    expect(restored.manifest.title).toBe('Migration v1')
    expect(version).toBe(MIGRATIONS.at(-1)?.version)
    expect(project.database.migrationReport.fromVersion).toBe(2)
    expect(project.database.migrationReport.status).toBe('migrated')
    await project.close()
  })

  it('restores incremental additions and deletions against the matching full archive', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const projectRoot = join(root, 'novel')
    await project.create(projectRoot, '增量兼容')
    const backup = new BackupService(project)
    const fullArchive = join(root, 'full.zip')
    const incrementalArchive = join(root, 'incremental.zip')
    await backup.createArchive(fullArchive)
    await unlink(join(projectRoot, 'chapters/001-第一章.md'))
    await writeFile(join(projectRoot, 'chapters/002-新增.md'), '# 新增章节\n\n增量内容\n', 'utf8')
    await backup.createIncrementalArchive(incrementalArchive, fullArchive)

    const restoreRoot = join(root, 'restored-incremental')
    await (await import('node:fs/promises')).mkdir(restoreRoot)
    await backup.restoreIncrementalArchive(fullArchive, incrementalArchive, restoreRoot)
    await expect(readFile(join(restoreRoot, 'chapters/001-第一章.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(restoreRoot, 'chapters/002-新增.md'), 'utf8')).resolves.toContain('增量内容')
    await project.close()
  })

  it('does not retain stale entries when overwriting an incremental archive', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const projectRoot = join(root, 'novel'); await project.create(projectRoot, 'Fresh incremental')
    const backup = new BackupService(project); const fullArchive = join(root, 'base.zip'); const incrementalArchive = join(root, 'overwrite-incremental.zip')
    await backup.createArchive(fullArchive)
    await backup.createIncrementalArchive(incrementalArchive, fullArchive)
    await writeFile(join(root, 'stale.txt'), 'stale', 'utf8')
    await run('zip', ['-q', incrementalArchive, '-j', join(root, 'stale.txt')])
    await backup.createIncrementalArchive(incrementalArchive, fullArchive)
    const destination = join(root, 'incremental-restored'); await mkdir(destination)
    await backup.restoreIncrementalArchive(fullArchive, incrementalArchive, destination)
    await expect(readFile(join(destination, 'stale.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await project.close()
  })

  it('rejects incremental archives written inside the project directory', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const projectRoot = join(root, 'novel'); await project.create(projectRoot, 'Safe incremental path')
    const backup = new BackupService(project); const fullArchive = join(root, 'safe-base.zip')
    await backup.createArchive(fullArchive)
    await expect(backup.createIncrementalArchive(join(projectRoot, 'unsafe.zip'), fullArchive)).rejects.toThrow('备份文件不能放在项目目录内')
    await project.close()
  })

  it('leaves an empty destination when restored project validation fails', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const projectRoot = join(root, 'novel')
    await project.create(projectRoot, '原始项目')
    const backup = new BackupService(project)
    const archive = join(root, 'invalid-restore.zip')
    await backup.createArchive(archive)

    await writeFile(join(projectRoot, 'novel.yaml'), 'title: [invalid\n', 'utf8')
    await run('zip', ['-q', archive, 'novel.yaml'], { cwd: projectRoot })
    const destination = join(root, 'invalid-restored')
    await mkdir(destination)

    await expect(backup.restoreArchive(archive, destination)).rejects.toThrow('备份恢复后项目校验失败')
    await expect(readdir(destination)).resolves.toEqual([])
    await project.close()
  })

  it('rejects an archive whose content no longer matches its backup manifest', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const projectRoot = join(root, 'novel')
    await project.create(projectRoot, '完整性项目')
    const backup = new BackupService(project)
    const archive = join(root, 'tampered.zip')
    await backup.createArchive(archive)

    await writeFile(join(projectRoot, 'chapters/001-第一章.md'), '# 被篡改的章节\n', 'utf8')
    await run('zip', ['-q', archive, 'chapters/001-第一章.md'], { cwd: projectRoot })
    const destination = join(root, 'tampered-restored')
    await mkdir(destination)

    await expect(backup.restoreArchive(archive, destination)).rejects.toThrow('备份文件校验失败')
    await expect(readdir(destination)).resolves.toEqual([])
    await project.close()
  })

  it('rejects undeclared files in a manifest-backed archive', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const projectRoot = join(root, 'novel')
    await project.create(projectRoot, '额外文件项目')
    const backup = new BackupService(project)
    const archive = join(root, 'extra-file.zip')
    await backup.createArchive(archive)

    await writeFile(join(projectRoot, 'unexpected.txt'), '不应被恢复', 'utf8')
    await run('zip', ['-q', archive, 'unexpected.txt'], { cwd: projectRoot })
    const destination = join(root, 'extra-file-restored')
    await mkdir(destination)

    await expect(backup.restoreArchive(archive, destination)).rejects.toThrow('备份包含未声明文件')
    await expect(readdir(destination)).resolves.toEqual([])
    await project.close()
  })

  it('reports malformed backup manifests as a project validation error', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const projectRoot = join(root, 'novel')
    await project.create(projectRoot, '损坏 manifest 项目')
    const backup = new BackupService(project)
    const archive = join(root, 'malformed-manifest.zip')
    await backup.createArchive(archive)
    const malformed = join(root, 'backup-manifest.json')
    await writeFile(malformed, '{not-json', 'utf8')
    await run('zip', ['-q', archive, '-j', malformed])

    const destination = join(root, 'malformed-restored')
    await mkdir(destination)
    await expect(backup.restoreArchive(archive, destination)).rejects.toThrow('备份 manifest JSON 无效')
    await expect(readdir(destination)).resolves.toEqual([])
    await project.close()
  })

  it('rejects symbolic links before extracting a backup archive', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    const projectRoot = join(root, 'novel')
    await project.create(projectRoot, '符号链接项目')
    const backup = new BackupService(project)
    const archive = join(root, 'symlink.zip')
    await backup.createArchive(archive)
    await symlink('/etc/hosts', join(projectRoot, 'outside-link'))
    await run('zip', ['-q', '-y', archive, 'outside-link'], { cwd: projectRoot })

    const destination = join(root, 'symlink-restored')
    await mkdir(destination)
    await expect(backup.restoreArchive(archive, destination)).rejects.toThrow('备份不支持符号链接')
    await expect(readdir(destination)).resolves.toEqual([])
    await project.close()
  })
})
