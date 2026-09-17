import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const outputRoot = process.argv[2] ?? 'fixtures/projects'
const now = new Date().toISOString()
const dirs = ['chapters', 'story', 'characters', 'world/places', 'world/organizations', 'world/items', 'world/lore', 'workflows', 'prompts', 'assets/characters', 'assets/scenes', 'assets/covers', '.novel/cache', '.novel/revisions', '.novel/logs']
const lines = (...values) => values.join('\n') + '\n'
const manifest = (title, schemaVersion = 1) => lines(`projectId: proj_fixture_${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, `title: ${title}`, 'language: zh-CN', `createdAt: ${now}`, `schemaVersion: ${schemaVersion}`, 'defaultWorkflow: flow_builtin_novel', "artDirection: ''", 'providerProfile: null')
const chapter = (index, title = `第${index}章`) => lines(`# ${title}`, '', `这是 fixture 第 ${index} 章，用于验证本地 Markdown 索引与长篇加载。`, '', '人物在雨夜沿着旧路前进，留下可检索的连续内容。')
const entity = (id, name) => lines(`id: ${id}`, `name: ${name}`, 'aliases: []', 'role: supporting', 'notes: fixture entity')
const workflowNode = (id, type, label, inputType = 'any', outputType = 'any') => ({ id, type, label, position: { x: 0, y: 0 }, inputs: id === 'chapter-input' ? [] : [{ id: 'in', type: inputType, required: true }], outputs: [{ id: 'out', type: outputType, required: false }], config: {} })
const fixtureWorkflow = () => {
  const nodes = [workflowNode('chapter-input', 'input.chapter', 'Chapter Input', 'none', 'chapter'), workflowNode('review', 'human.review', 'Review'), workflowNode('image-propose', 'image.propose', 'Image Proposal'), workflowNode('image-generate', 'image.generate', 'Generate Illustration'), workflowNode('image-select', 'image.select', 'Select Illustration'), workflowNode('image-insert', 'image.insert', 'Insert Illustration')]
  const edges = [['chapter-input', 'review'], ['review', 'image-propose'], ['image-propose', 'image-generate'], ['image-generate', 'image-select'], ['image-select', 'image-insert']].map(([source, target], index) => ({ id: `edge-${index}-${source}-${target}`, source, sourcePort: 'out', target, targetPort: 'in' }))
  return { schemaVersion: 1, id: 'flow_builtin_novel', name: 'Fixture Novel Flow', cyclePolicy: 'reject', nodes, edges, variables: [] }
}

async function makeProject(name, title = name) {
  const root = join(outputRoot, name)
  await rm(root, { recursive: true, force: true })
  await Promise.all(dirs.map((dir) => mkdir(join(root, dir), { recursive: true })))
  await writeFile(join(root, 'novel.yaml'), manifest(title))
  await writeFile(join(root, 'story/premise.md'), lines('# Fixture', '', '用于本地数据流核验。'))
  await writeFile(join(root, 'story/outline.md'), lines('# Outline', '', '- fixture outline'))
  await writeFile(join(root, 'story/timeline.yaml'), 'events: []\n')
  await writeFile(join(root, 'story/artifacts.yaml'), 'artifacts: []\n')
  await writeFile(join(root, 'story/relations.yaml'), 'relations: []\n')
  await writeFile(join(root, 'workflows/flow_builtin_novel.novelflow.json'), JSON.stringify(fixtureWorkflow(), null, 2) + '\n')
  return root
}

async function tiny() {
  const root = await makeProject('tiny-cn', 'Tiny CN')
  for (let i = 1; i <= 3; i++) await writeFile(join(root, 'chapters', `${String(i).padStart(3, '0')}-fixture.md`), chapter(i))
  await writeFile(join(root, 'characters/ent_lan.yaml'), entity('ent_lan', '林默'))
  await writeFile(join(root, 'characters/ent_su.yaml'), entity('ent_su', '苏璃'))
}

async function conflict() {
  const root = await makeProject('conflict-cn', 'Conflict CN')
  await writeFile(join(root, 'chapters/001-conflict.md'), lines('# 冲突章节', '', '林默的左手在本章同时被记录为完好和重伤。'))
  await writeFile(join(root, 'characters/ent_lan.yaml'), entity('ent_lan', '林默'))
  await writeFile(join(root, 'story/artifacts.yaml'), lines('artifacts:', '  - id: art_conflict', '    kind: foreshadowing', '    title: 未回收伏笔', '    fields:', '      status: planted'))
}

async function imageHeavy() {
  const root = await makeProject('image-heavy', 'Image Heavy')
  await writeFile(join(root, 'chapters/001-image.md'), chapter(1, '图片资产章节'))
  for (let i = 1; i <= 30; i++) {
    const id = String(i).padStart(3, '0')
    const file = `asset_fixture_${id}.svg`
    await writeFile(join(root, 'assets/scenes', file), `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#${(0x321000 + i * 97).toString(16).slice(-6)}"/></svg>`)
    await writeFile(join(root, 'assets/scenes', `asset_fixture_${id}.yaml`), lines(`assetId: asset_fixture_${id}`, `relPath: assets/scenes/${file}`, 'mimeType: image/svg+xml', 'provider: fixture', 'model: fixture-image', `createdAt: ${now}`))
  }
}

async function migrationV1() {
  const root = await makeProject('migration-v1', 'Migration v1')
  const db = new DatabaseSync(join(root, '.novel/project.db'))
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE documents (id TEXT PRIMARY KEY, kind TEXT NOT NULL, rel_path TEXT NOT NULL UNIQUE, title TEXT NOT NULL DEFAULT '', hash TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT ''); ALTER TABLE documents ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0; CREATE VIRTUAL TABLE documents_fts USING fts5(rel_path UNINDEXED, title, content, tokenize='trigram'); PRAGMA user_version = 2;")
  db.close()
}

async function migrationV0() {
  const root = await makeProject('migration-v0', 'Migration v0')
  const db = new DatabaseSync(join(root, '.novel/project.db'))
  // A pre-schema database has only the settings table and the default
  // user_version. Opening it must apply the complete migration chain.
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version = 0;')
  db.close()
}

async function broken() {
  const root = await makeProject('broken-project', 'Broken Project')
  await writeFile(join(root, 'chapters/001-broken.md'), chapter(1, '缺索引项目'))
  await writeFile(join(root, 'characters/ent_orphan.yaml'), entity('ent_orphan', '孤立实体'))
  await rm(join(root, 'story/relations.yaml'), { force: true })
}

async function longProject() {
  const root = await makeProject('long-cn', 'Long CN')
  for (let i = 1; i <= 1000; i++) {
    await writeFile(join(root, 'chapters', `${String(i).padStart(4, '0')}-long.md`), chapter(i, `长篇第${i}章`))
    await writeFile(join(root, 'characters', `ent_${i}.yaml`), entity(`ent_${i}`, `实体${i}`))
  }
  const db = new DatabaseSync(join(root, '.novel/project.db'))
  // Keep the preloaded facts but let the application run the complete
  // migration chain; setting v5 here would skip creation of proposals and
  // make later ALTER migrations fail on an intentionally partial database.
  db.exec('CREATE TABLE facts (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, predicate TEXT NOT NULL, object_json TEXT NOT NULL, valid_from TEXT, valid_to TEXT, confidence REAL NOT NULL, source_document_id TEXT NOT NULL, source_start INTEGER NOT NULL, source_end INTEGER NOT NULL, canonical INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL); CREATE INDEX idx_facts_subject_predicate ON facts(subject_id, predicate); PRAGMA user_version = 0;')
  const insert = db.prepare('INSERT INTO facts(id, subject_id, predicate, object_json, valid_from, valid_to, confidence, source_document_id, source_start, source_end, canonical, created_at) VALUES(?, ?, ?, ?, NULL, NULL, 1, ?, 0, 1, 1, ?)')
  db.exec('BEGIN')
  for (let i = 0; i < 100_000; i++) insert.run(`fact_${i}`, `ent_${(i % 1000) + 1}`, 'status.value', JSON.stringify(i), `ch_${i % 1000}`, now)
  db.exec('COMMIT')
  db.close()
}

await mkdir(outputRoot, { recursive: true })
await tiny(); await conflict(); await imageHeavy(); await migrationV0(); await migrationV1(); await broken()
if (process.argv.includes('--long')) await longProject()
console.log(`fixtures generated at ${outputRoot}${process.argv.includes('--long') ? ' (including long-cn)' : ''}`)
