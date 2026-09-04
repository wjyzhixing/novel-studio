import { z } from 'zod'

/**
 * Blueprint §6/§34: novel.yaml manifest, schemaVersion-gated.
 * The file is the source of truth; SQLite is only an index/state layer.
 */
export const NOVEL_SCHEMA_VERSION = 1

export const novelManifestSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(200),
  language: z.string().min(2).max(20).default('zh-CN'),
  createdAt: z.string().min(1),
  schemaVersion: z.number().int().min(1),
  defaultWorkflow: z.string().nullable().default(null),
  artDirection: z.string().default(''),
  providerProfile: z.string().nullable().default(null)
})

export type NovelManifest = z.infer<typeof novelManifestSchema>

export function makeManifest(title: string, language: string): NovelManifest {
  return {
    projectId: `proj_${crypto.randomUUID()}`,
    title,
    language,
    createdAt: new Date().toISOString(),
    schemaVersion: NOVEL_SCHEMA_VERSION,
    defaultWorkflow: 'flow_builtin_novel',
    artDirection: '',
    providerProfile: null
  }
}

/** All fixed paths inside a project folder (blueprint §6 layout). */
export const PROJECT_PATHS = {
  manifest: 'novel.yaml',
  db: '.novel/project.db',
  dirs: [
    'chapters',
    'story',
    'characters',
    'world/places',
    'world/organizations',
    'world/items',
    'world/lore',
    'workflows',
    'prompts',
    'assets/characters',
    'assets/scenes',
    'assets/covers',
    '.novel/cache',
    '.novel/checkpoints',
    '.novel/revisions',
    '.novel/logs'
  ]
} as const

export const GITIGNORE_CONTENT = '.novel/\n.DS_Store\nnode_modules/\n'
