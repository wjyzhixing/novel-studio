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
})
