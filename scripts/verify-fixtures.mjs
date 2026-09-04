import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parse } from 'yaml'

const root = process.argv[2] ?? 'fixtures/projects'
const names = ['tiny-cn', 'conflict-cn', 'image-heavy', 'migration-v1', 'broken-project']
const requiredDirs = ['chapters', 'story', 'characters', 'world/places', 'world/organizations', 'world/items', 'assets/scenes']

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function inspectProject(name) {
  const projectRoot = join(root, name)
  const missing = []
  for (const dir of requiredDirs) if (!await exists(join(projectRoot, dir))) missing.push(dir)
  if (!await exists(join(projectRoot, 'novel.yaml'))) missing.push('novel.yaml')
  for (const file of ['story/premise.md', 'story/outline.md', 'story/timeline.yaml', 'story/artifacts.yaml', 'story/relations.yaml']) {
    if (!await exists(join(projectRoot, file))) missing.push(file)
  }
  const manifest = await exists(join(projectRoot, 'novel.yaml')) ? parse(await readFile(join(projectRoot, 'novel.yaml'), 'utf8')) : null
  const dbPath = join(projectRoot, '.novel/project.db')
  let userVersion = null
  let tables = []
  if (await exists(dbPath)) {
    const db = new DatabaseSync(dbPath)
    userVersion = db.prepare('PRAGMA user_version').get().user_version
    tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name)
    db.close()
  } else missing.push('.novel/project.db')
  const chapters = await exists(join(projectRoot, 'chapters')) ? (await readdir(join(projectRoot, 'chapters'))).filter((file) => file.endsWith('.md')) : []
  return { name, missing, schemaVersion: manifest?.schemaVersion ?? null, userVersion, chapterFiles: chapters.length, tableCount: tables.length, hasCoreTables: ['settings', 'documents'].every((table) => tables.includes(table)), migrationReady: name === 'migration-v1' && userVersion === 2 }
}

const reports = []
for (const name of names) reports.push(await inspectProject(name))
const broken = reports.find((report) => report.name === 'broken-project')
if (broken && !broken.missing.includes('story/relations.yaml')) throw new Error('broken-project fixture 应缺少 story/relations.yaml')
const invalid = reports.filter((report) => report.missing.some((item) => item !== '.novel/project.db') && report.name !== 'broken-project')
if (invalid.length > 0) throw new Error(`fixture 缺少必要文件: ${invalid.map((report) => `${report.name}: ${report.missing.join(', ')}`).join('; ')}`)
console.log(JSON.stringify({ root, projects: reports, note: 'migration-v1 的 user_version=2，需由应用打开以执行 v3+ migrations' }, null, 2))
