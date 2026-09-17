import { z } from 'zod'
import type { Result } from './result'

export const entityKinds = ['character', 'place', 'org', 'item'] as const
export const entityKindSchema = z.enum(entityKinds)
export type EntityKind = z.infer<typeof entityKindSchema>
export const storyArtifactKinds = ['plot', 'foreshadowing', 'lore', 'note'] as const
export const storyArtifactKindSchema = z.enum(storyArtifactKinds)
export type StoryArtifactKind = z.infer<typeof storyArtifactKindSchema>
export const foreshadowingStatuses = ['planned', 'planted', 'echoed', 'resolved', 'abandoned'] as const
export type ForeshadowingStatus = typeof foreshadowingStatuses[number]
export const foreshadowingEvidenceSchema = z.object({
  chapterRelPath: z.string().startsWith('chapters/').max(500),
  quote: z.string().max(100_000),
  note: z.string().max(20_000).default('')
})
export type ForeshadowingEvidence = z.infer<typeof foreshadowingEvidenceSchema>

export const entityInputSchema = z.object({
  id: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/).optional(),
  kind: entityKindSchema,
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().max(500_000).default('')
})

export type EntityInput = z.input<typeof entityInputSchema>

export interface StoryEntity {
  id: string
  kind: EntityKind
  name: string
  aliases: string[]
  fields: Record<string, unknown>
  notes: string
  updatedAt: string
}

export interface TimelineEvent {
  id: string
  title: string
  at: string | null
  description: string
  chapterRelPath: string | null
  entityIds: string[]
  locationId: string | null
  causes: string
  effects: string
  updatedAt: string
}

export const storyRelationInputSchema = z.object({
  id: z.string().regex(/^rel_[a-zA-Z0-9_-]+$/).optional(),
  fromId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  relationType: z.string().trim().min(1).max(120),
  toId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
  metadata: z.record(z.string(), z.unknown()).default({})
}).refine((value) => value.fromId !== value.toId, { message: '关系两端不能是同一实体' })
export type StoryRelationInput = z.input<typeof storyRelationInputSchema>
export interface StoryRelation { id: string; fromId: string; relationType: string; toId: string; metadata: Record<string, unknown>; createdAt: string }

export const timelineEventInputSchema = z.object({
  id: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/).optional(),
  title: z.string().trim().min(1).max(160),
  at: z.string().trim().max(100).nullable().default(null),
  description: z.string().max(500_000).default(''),
  chapterRelPath: z.string().startsWith('chapters/').nullable().default(null),
  entityIds: z.array(z.string().regex(/^ent_[a-zA-Z0-9_-]+$/)).max(100).default([]),
  locationId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/).nullable().default(null),
  causes: z.string().max(100_000).default(''),
  effects: z.string().max(100_000).default('')
})

export type TimelineEventInput = z.input<typeof timelineEventInputSchema>

export const storyArtifactInputSchema = z.object({
  id: z.string().regex(/^art_[a-zA-Z0-9_-]+$/).optional(), kind: storyArtifactKindSchema,
  title: z.string().trim().min(1).max(200), fields: z.record(z.string(), z.unknown()).default({}), notes: z.string().max(500_000).default('')
}).superRefine((value, ctx) => validateArtifactFields(value.kind, value.fields, ctx))
export type StoryArtifactInput = z.input<typeof storyArtifactInputSchema>
export interface StoryArtifact { id: string; kind: StoryArtifactKind; title: string; fields: Record<string, unknown>; notes: string; updatedAt: string }
export type StorySearchResultKind = 'entity' | 'timeline' | 'artifact' | 'relation' | 'document'
export interface StorySearchResult {
  id: string
  title: string
  kind: StorySearchResultKind
  type: EntityKind | StoryArtifactKind | 'timeline' | 'relation' | 'document'
  hint: string
  relPath?: string
}
export interface ForeshadowingRecord {
  id: string
  title: string
  setup: string
  target: string
  payoffDeadline: string
  status: ForeshadowingStatus
  evidence: string
  evidenceItems: ForeshadowingEvidence[]
  relatedChapters: string[]
  notes: string
  updatedAt: string
}

export interface StoryApiContract {
  listEntities(kind?: EntityKind): Promise<Result<StoryEntity[]>>
  getEntity(id: string): Promise<Result<StoryEntity>>
  saveEntity(input: EntityInput): Promise<Result<StoryEntity>>
  deleteEntity(id: string): Promise<Result<null>>
  listTimeline(): Promise<Result<TimelineEvent[]>>
  saveTimelineEvent(input: TimelineEventInput): Promise<Result<TimelineEvent>>
  deleteTimelineEvent(id: string): Promise<Result<null>>
  listRelations(): Promise<Result<StoryRelation[]>>
  saveRelation(input: StoryRelationInput): Promise<Result<StoryRelation>>
  deleteRelation(id: string): Promise<Result<null>>
  search(query: string): Promise<Result<StoryEntity[]>>
  searchAll(query: string): Promise<Result<StorySearchResult[]>>
  listArtifacts(kind?: StoryArtifactKind): Promise<Result<StoryArtifact[]>>
  saveArtifact(input: StoryArtifactInput): Promise<Result<StoryArtifact>>
  deleteArtifact(id: string): Promise<Result<null>>
  listForeshadowing(status?: ForeshadowingStatus): Promise<Result<ForeshadowingRecord[]>>
}

function validateArtifactFields(kind: StoryArtifactKind, fields: Record<string, unknown>, ctx: z.RefinementCtx): void {
  const stringField = (key: string, required = false): void => {
    const value = fields[key]
    if (value === undefined || value === '') {
      if (required) ctx.addIssue({ code: 'custom', path: ['fields', key], message: `${key} 不能为空` })
      return
    }
    if (typeof value !== 'string') ctx.addIssue({ code: 'custom', path: ['fields', key], message: `${key} 必须是字符串` })
  }
  if (kind === 'foreshadowing') {
    stringField('setup', true)
    stringField('target', true)
    stringField('payoffDeadline')
    stringField('evidence')
    const evidenceItems = fields.evidenceItems
    if (evidenceItems !== undefined) {
      if (!Array.isArray(evidenceItems)) ctx.addIssue({ code: 'custom', path: ['fields', 'evidenceItems'], message: '证据条目必须是数组' })
      else evidenceItems.forEach((item, index) => {
        const parsed = foreshadowingEvidenceSchema.safeParse(item)
        if (!parsed.success) ctx.addIssue({ code: 'custom', path: ['fields', 'evidenceItems', index], message: '证据条目必须包含章节、摘录和说明' })
      })
    }
    const status = fields.status
    if (status !== undefined && (!foreshadowingStatuses.includes(status as ForeshadowingStatus))) ctx.addIssue({ code: 'custom', path: ['fields', 'status'], message: '伏笔状态必须是 planned/planted/echoed/resolved/abandoned' })
  }
  if (kind === 'lore') {
    stringField('scope', true)
    stringField('rule', true)
    stringField('exceptions')
    stringField('source')
  }
  if (kind === 'plot') {
    stringField('status')
    stringField('setup')
    stringField('payoff')
    const priority = fields.priority
    if (priority !== undefined && typeof priority !== 'string' && (typeof priority !== 'number' || !Number.isFinite(priority))) ctx.addIssue({ code: 'custom', path: ['fields', 'priority'], message: '优先级必须是字符串或有限数字' })
  }
}
