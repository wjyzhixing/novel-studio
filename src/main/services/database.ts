import { DatabaseSync } from 'node:sqlite'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DomainError } from './errors'
import type { MigrationReport } from '../../shared/ipc'

/**
 * SQLite via Electron's built-in node:sqlite (no native module rebuild).
 * Blueprint §4/§7: DB is a rebuildable index/state layer — prose and key
 * settings always have a file source of truth.
 */

export interface Migration {
  version: number
  name: string
  up(db: DatabaseSync): void
}

/** Append-only migration list; never edit a shipped migration. */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS documents (
          id         TEXT PRIMARY KEY,
          kind       TEXT NOT NULL,
          rel_path   TEXT NOT NULL UNIQUE,
          title      TEXT NOT NULL DEFAULT '',
          hash       TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE INDEX IF NOT EXISTS idx_documents_kind ON documents(kind);
      `)
    }
  },
  {
    version: 2,
    name: 'chapter-word-count-and-fts',
    up(db) {
      db.exec(`
        ALTER TABLE documents ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0;
        CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
          rel_path UNINDEXED,
          title,
          content,
          tokenize='trigram'
        );
      `)
    }
  },
  {
    version: 3,
    name: 'story-bible-entities-and-timeline',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS entities (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          aliases_json TEXT NOT NULL DEFAULT '[]',
          fields_json TEXT NOT NULL DEFAULT '{}',
          notes TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind);
        CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
        CREATE TABLE IF NOT EXISTS timeline_events (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          at TEXT,
          description TEXT NOT NULL DEFAULT '',
          chapter_rel_path TEXT,
          entity_ids_json TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_timeline_at ON timeline_events(at);
      `)
    }
  },
  {
    version: 4,
    name: 'revisions-audit',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS revisions (
          id TEXT PRIMARY KEY,
          rel_path TEXT NOT NULL,
          actor TEXT NOT NULL,
          source TEXT NOT NULL,
          original TEXT NOT NULL,
          replacement TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_revisions_path ON revisions(rel_path, created_at);
      `)
    }
  },
  {
    version: 5,
    name: 'canon-facts-relations-proposals',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, predicate TEXT NOT NULL,
          object_json TEXT NOT NULL, valid_from TEXT, valid_to TEXT, confidence REAL NOT NULL,
          source_document_id TEXT NOT NULL, source_start INTEGER NOT NULL, source_end INTEGER NOT NULL,
          canonical INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_facts_subject_predicate ON facts(subject_id, predicate);
        CREATE TABLE IF NOT EXISTS relations (
          id TEXT PRIMARY KEY, from_id TEXT NOT NULL, relation_type TEXT NOT NULL,
          to_id TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS proposals (
          id TEXT PRIMARY KEY, type TEXT NOT NULL, payload_json TEXT NOT NULL,
          status TEXT NOT NULL, created_at TEXT NOT NULL, applied_at TEXT
        );
      `)
    }
  },
  {
    version: 6,
    name: 'workflow-runs-and-node-runs',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_runs (
          id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, status TEXT NOT NULL,
          state_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS node_runs (
          id TEXT PRIMARY KEY, run_id TEXT NOT NULL, node_id TEXT NOT NULL,
          status TEXT NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_node_runs_run ON node_runs(run_id);
      `)
    }
  },
  {
    version: 7,
    name: 'asset-provenance',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS assets (
          id TEXT PRIMARY KEY, rel_path TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
          provider TEXT NOT NULL, model TEXT NOT NULL, provenance_json TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at);
      `)
    }
  },
  {
    version: 8,
    name: 'proposal-applied-fact-reference',
    up(db) {
      db.exec('ALTER TABLE proposals ADD COLUMN applied_fact_id TEXT;')
    }
  },
  {
    version: 9,
    name: 'ai-suggestions',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_suggestions (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          profile_id TEXT NOT NULL,
          rel_path TEXT NOT NULL,
          original TEXT NOT NULL,
          suggested TEXT NOT NULL,
          prompt TEXT NOT NULL,
          selection TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_suggestions_path_status ON ai_suggestions(rel_path, status);
      `)
    }
  },
  {
    version: 10,
    name: 'proposal-workflow-reference',
    up(db) {
      db.exec('ALTER TABLE proposals ADD COLUMN workflow_run_id TEXT; CREATE INDEX IF NOT EXISTS idx_proposals_workflow_run ON proposals(workflow_run_id);')
    }
  },
  {
    version: 11,
    name: 'story-artifacts',
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS story_artifacts (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, fields_json TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_story_artifacts_kind ON story_artifacts(kind, updated_at);`)
    }
  },
  {
    version: 12,
    name: 'chapter-notes',
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS chapter_notes (rel_path TEXT PRIMARY KEY, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);`)
    }
  },
  {
    version: 13,
    name: 'persistent-jobs',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          ref_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status_updated ON jobs(status, updated_at);
      `)
    }
  },
  {
    version: 14,
    name: 'context-snapshots',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS context_snapshots (
          id TEXT PRIMARY KEY,
          rel_path TEXT NOT NULL,
          recipe_id TEXT NOT NULL,
          query TEXT NOT NULL DEFAULT '',
          request_hash TEXT NOT NULL,
          result_hash TEXT NOT NULL,
          total_tokens INTEGER NOT NULL,
          item_count INTEGER NOT NULL,
          file_path TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_context_snapshots_path_created
          ON context_snapshots(rel_path, created_at);
      `)
    }
  },
  {
    version: 15,
    name: 'timeline-event-structure',
    up(db) {
      db.exec('ALTER TABLE timeline_events ADD COLUMN location_id TEXT; ALTER TABLE timeline_events ADD COLUMN causes TEXT NOT NULL DEFAULT \'\'; ALTER TABLE timeline_events ADD COLUMN effects TEXT NOT NULL DEFAULT \'\';')
    }
  },
  {
    version: 16,
    name: 'foreshadowing-index',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS foreshadowing (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          setup TEXT NOT NULL,
          target TEXT NOT NULL,
          payoff_deadline TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL,
          evidence TEXT NOT NULL DEFAULT '',
          related_chapters_json TEXT NOT NULL DEFAULT '[]',
          notes TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_foreshadowing_status_updated ON foreshadowing(status, updated_at);
      `)
    }
  },
  {
    version: 17,
    name: 'embedding-index',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS embeddings (
          rel_path TEXT PRIMARY KEY,
          model TEXT NOT NULL,
          dimensions INTEGER NOT NULL,
          vector_json TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          preview TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_embeddings_model_hash ON embeddings(model, content_hash);
      `)
    }
  },
  {
    version: 18,
    name: 'context-snapshot-versions',
    up(db) {
      db.exec("ALTER TABLE context_snapshots ADD COLUMN format_version INTEGER NOT NULL DEFAULT 1; ALTER TABLE context_snapshots ADD COLUMN project_schema_version INTEGER NOT NULL DEFAULT 1; ALTER TABLE context_snapshots ADD COLUMN retrieval_version INTEGER NOT NULL DEFAULT 1;")
    }
  },
  {
    version: 19,
    name: 'chapter-scenes-index',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chapter_scenes (
          id TEXT PRIMARY KEY,
          chapter_rel_path TEXT NOT NULL,
          title TEXT NOT NULL,
          scene_order INTEGER NOT NULL,
          start_paragraph INTEGER NOT NULL,
          end_paragraph INTEGER NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(chapter_rel_path, id)
        );
        CREATE INDEX IF NOT EXISTS idx_chapter_scenes_path_order
          ON chapter_scenes(chapter_rel_path, scene_order);
      `)
    }
  }
]

export class DatabaseService {
  private db: DatabaseSync
  private report: MigrationReport = { fromVersion: 0, toVersion: 0, applied: [], status: 'up_to_date' }

  constructor(file: string) {
    try {
      // node:sqlite does not create parent dirs itself
      this.db = new DatabaseSync(file) // dirname must exist
    } catch (e) {
      throw new DomainError('DB_ERROR', `无法打开数据库 ${file}: ${e instanceof Error ? e.message : String(e)}`)
    }
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.db.exec('PRAGMA busy_timeout = 5000;')
    this.migrate()
  }

  private migrate(): void {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
    let current = row?.user_version ?? 0
    const fromVersion = current
    const applied: Array<{ version: number; name: string }> = []
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue
      this.db.exec('BEGIN')
      try {
        migration.up(this.db)
        this.db.exec(`PRAGMA user_version = ${migration.version}`)
        this.db.exec('COMMIT')
        current = migration.version
        applied.push({ version: migration.version, name: migration.name })
      } catch (e) {
        this.db.exec('ROLLBACK')
        throw new DomainError('DB_ERROR', `迁移 v${migration.version}(${migration.name}) 失败: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    this.report = { fromVersion, toVersion: current, applied, status: applied.length > 0 ? 'migrated' : 'up_to_date' }
  }

  get migrationReport(): MigrationReport {
    return { ...this.report, applied: this.report.applied.map((migration) => ({ ...migration })) }
  }

  get raw(): DatabaseSync {
    return this.db
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value)
  }

  deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }

  async close(): Promise<void> {
    this.db.close()
  }
}

/** Open a database file, creating parent directories first. */
export async function openDatabase(file: string): Promise<DatabaseService> {
  await mkdir(dirname(file), { recursive: true })
  return new DatabaseService(file)
}
