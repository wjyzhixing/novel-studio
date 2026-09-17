import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parse } from 'yaml'

const root = process.argv[2] ?? 'fixtures/projects'
const includeLong = process.argv.includes('--long')
const names = ['tiny-cn', 'conflict-cn', 'image-heavy', 'migration-v0', 'migration-v1', 'broken-project', ...(includeLong ? ['long-cn'] : [])]
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
  const profile = await inspectProfile(name, projectRoot, chapters)
  return { name, missing, schemaVersion: manifest?.schemaVersion ?? null, userVersion, chapterFiles: chapters.length, tableCount: tables.length, hasCoreTables: ['settings', 'documents'].every((table) => tables.includes(table)), migrationReady: (name === 'migration-v0' && userVersion === 0) || (name === 'migration-v1' && userVersion === 2), ...(profile ? { profile } : {}) }
}

async function inspectProfile(name, projectRoot, chapters) {
  if (name === 'tiny-cn') {
    const entities = (await readdir(join(projectRoot, 'characters'))).filter((file) => file.endsWith('.yaml'))
    return { chapterFiles: chapters.length, entityFiles: entities.length }
  }
  if (name === 'conflict-cn') {
    const content = await readFile(join(projectRoot, 'chapters/001-conflict.md'), 'utf8')
    const artifacts = parse(await readFile(join(projectRoot, 'story/artifacts.yaml'), 'utf8'))
    return { chapterFiles: chapters.length, hasInjuryConflict: content.includes('完好') && content.includes('重伤') && content.includes('左手'), artifactFiles: Array.isArray(artifacts?.artifacts) ? artifacts.artifacts.length : 0 }
  }
  if (name === 'image-heavy') {
    const entries = await readdir(join(projectRoot, 'assets/scenes'))
    const imageFiles = entries.filter((file) => file.endsWith('.svg'))
    const sidecarFiles = entries.filter((file) => file.endsWith('.yaml'))
    let validSidecars = 0
    for (const file of sidecarFiles) {
      const sidecar = parse(await readFile(join(projectRoot, 'assets/scenes', file), 'utf8'))
      if (sidecar?.assetId && sidecar.relPath && sidecar.mimeType?.startsWith('image/') && await exists(join(projectRoot, sidecar.relPath))) validSidecars += 1
    }
    return { imageFiles: imageFiles.length, sidecarFiles: sidecarFiles.length, validSidecars }
  }
  return undefined
}

const reports = []
for (const name of names) reports.push(await inspectProject(name))
const broken = reports.find((report) => report.name === 'broken-project')
if (broken && !broken.missing.includes('story/relations.yaml')) throw new Error('broken-project fixture 应缺少 story/relations.yaml')
const invalid = reports.filter((report) => report.missing.some((item) => item !== '.novel/project.db') && report.name !== 'broken-project')
if (invalid.length > 0) throw new Error(`fixture 缺少必要文件: ${invalid.map((report) => `${report.name}: ${report.missing.join(', ')}`).join('; ')}`)
const output = { root, projects: reports, note: 'migration-v0 的 user_version=0、migration-v1 的 user_version=2，均需由应用打开以执行最新 migrations' }
if (includeLong) {
  const longRoot = join(root, 'long-cn')
  const chapters = (await readdir(join(longRoot, 'chapters'))).filter((file) => file.endsWith('.md'))
  const entities = (await readdir(join(longRoot, 'characters'))).filter((file) => file.endsWith('.yaml'))
  const db = new DatabaseSync(join(longRoot, '.novel/project.db'))
  const factRows = Number(db.prepare('SELECT COUNT(*) AS count FROM facts').get().count)
  db.close()
  const long = {
    chapterFiles: chapters.length,
    entityFiles: entities.length,
    factRows,
    fourDigitChapterNames: chapters.length > 0 && chapters.every((file) => /^\d{4}-.+\.md$/u.test(file))
  }
  if (long.chapterFiles !== 1000 || long.entityFiles !== 1000 || long.factRows !== 100000 || !long.fourDigitChapterNames) throw new Error(`long-cn 规模不符合预期: ${JSON.stringify(long)}`)
  output.long = long
}
console.log(JSON.stringify(output, null, 2))
