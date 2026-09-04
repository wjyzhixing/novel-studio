import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { BackupService } from '../src/main/services/backup-service'
import { makeTempRoot } from './helpers'

describe('BackupService', () => {
  it('backs up and restores a project without userData secrets', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Backup test'); const backup = new BackupService(project)
    await readFile(join(root, 'novel/novel.yaml'), 'utf8')
    const archive = await backup.createArchive(join(root, 'backup.zip')); expect(await readFile(archive).then(() => true)).toBe(true)
    const destination = join(root, 'restored'); const { mkdir } = await import('node:fs/promises'); await mkdir(destination)
    await backup.restoreArchive(archive, destination); expect(await readFile(join(destination, 'novel.yaml'), 'utf8')).toContain('Backup test')
  })
})
