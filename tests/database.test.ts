import { describe, expect, it } from 'vitest'
import { DatabaseService, MIGRATIONS } from '../src/main/services/database'
import { makeTempRoot } from './helpers'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

describe('DatabaseService (node:sqlite)', () => {
  it('applies migrations exactly once and is idempotent', async () => {
    const root = await makeTempRoot()
    const file = join(root, 'project.db')

    const db1 = new DatabaseService(file)
    expect(db1.getSetting('k')).toBeNull()
    db1.setSetting('k', 'v')
    expect(db1.getSetting('k')).toBe('v')

    const row = db1.raw.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(row.user_version).toBeGreaterThanOrEqual(1)
    db1.close()

    // reopen: migrations are no-ops, data persists
    const db2 = new DatabaseService(file)
    expect(db2.getSetting('k')).toBe('v')
    db2.close()
  })

  it('runs in WAL mode', async () => {
    const root = await makeTempRoot()
    const db = new DatabaseService(join(root, 'wal.db'))
    const mode = db.raw.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    expect(mode.journal_mode).toBe('wal')
    db.close()
  })

  it('upgrades a v2 fixture through all current migrations', async () => {
    const root = await makeTempRoot(); const file = join(root, 'old.db')
    const old = new DatabaseSync(file)
    old.exec('CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE documents(id TEXT PRIMARY KEY, kind TEXT NOT NULL, rel_path TEXT UNIQUE, title TEXT NOT NULL, hash TEXT NOT NULL, updated_at TEXT NOT NULL, word_count INTEGER NOT NULL DEFAULT 0); CREATE VIRTUAL TABLE documents_fts USING fts5(rel_path UNINDEXED, title, content, tokenize="trigram"); PRAGMA user_version = 2;')
    old.close()
    const current = new DatabaseService(file)
    expect((current.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.at(-1)?.version)
    expect(current.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'assets'").get()).toBeTruthy()
    expect(current.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'jobs'").get()).toBeTruthy()
    current.close()
  })

  it('upgrades a pre-schema v0 fixture through the complete migration chain', async () => {
    const root = await makeTempRoot(); const file = join(root, 'pre-schema.db')
    const old = new DatabaseSync(file)
    old.exec('CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version = 0;')
    old.close()

    const current = new DatabaseService(file)
    expect((current.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.at(-1)?.version)
    expect(current.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'documents'").get()).toBeTruthy()
    expect(current.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'workflow_side_effects'").get()).toBeTruthy()
    current.close()
  })

  it('rolls back the whole migration batch when a later migration fails', async () => {
    const root = await makeTempRoot(); const file = join(root, 'failed-migration.db')
    const originalLength = MIGRATIONS.length
    const baseVersion = MIGRATIONS.at(-1)?.version ?? 0
    MIGRATIONS.push(
      { version: baseVersion + 1, name: 'partial-migration', up: (db) => { db.exec('CREATE TABLE partial_migration_marker(id TEXT)') } },
      { version: baseVersion + 2, name: 'failing-migration', up: () => { throw new Error('fixture migration failure') } }
    )
    try {
      expect(() => new DatabaseService(file)).toThrow(`迁移 v${baseVersion + 2}`)
    } finally {
      MIGRATIONS.splice(originalLength)
    }

    const reopened = new DatabaseService(file)
    expect((reopened.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(baseVersion)
    expect(reopened.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'partial_migration_marker'").get()).toBeUndefined()
    reopened.close()
  })

  it('closes the failed connection and reports that the migration was rolled back', async () => {
    const root = await makeTempRoot(); const file = join(root, 'failed-migration-reopen.db')
    const originalLength = MIGRATIONS.length
    const baseVersion = MIGRATIONS.at(-1)?.version ?? 0
    MIGRATIONS.push({
      version: baseVersion + 1,
      name: 'failing-reopen-migration',
      up: (db) => { db.exec('CREATE TABLE rollback_probe(id TEXT)'); throw new Error('fixture reopen failure') }
    })
    try {
      expect(() => new DatabaseService(file)).toThrow(/迁移已回滚/)
    } finally {
      MIGRATIONS.splice(originalLength)
    }

    const reopened = new DatabaseService(file)
    expect((reopened.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(baseVersion)
    expect(reopened.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'rollback_probe'").get()).toBeUndefined()
    reopened.close()
  })
})
