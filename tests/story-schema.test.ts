import { describe, expect, it } from 'vitest'
import {
  entityInputSchema,
  foreshadowingEvidenceSchema,
  storyArtifactInputSchema,
  storyRelationInputSchema,
  timelineEventInputSchema
} from '../src/shared/story'

describe('Story Bible input schemas', () => {
  it('normalizes entity, timeline, and relation defaults', () => {
    expect(entityInputSchema.parse({ kind: 'character', name: '  林默  ' })).toMatchObject({ name: '林默', aliases: [], fields: {}, notes: '' })
    expect(timelineEventInputSchema.parse({ title: '事件' })).toMatchObject({ at: null, chapterRelPath: null, entityIds: [], locationId: null, causes: '', effects: '' })
    expect(storyRelationInputSchema.parse({ fromId: 'ent_a', relationType: '朋友', toId: 'ent_b' })).toMatchObject({ metadata: {} })
    expect(foreshadowingEvidenceSchema.parse({ chapterRelPath: 'chapters/001-a.md', quote: '线索' })).toEqual({ chapterRelPath: 'chapters/001-a.md', quote: '线索', note: '' })
  })

  it('validates required artifact fields for lore, plot, and foreshadowing', () => {
    expect(storyArtifactInputSchema.safeParse({ kind: 'lore', title: '规则', fields: { scope: '世界', rule: '有代价' } }).success).toBe(true)
    expect(storyArtifactInputSchema.safeParse({ kind: 'plot', title: '主线', fields: { priority: 2 } }).success).toBe(true)
    expect(storyArtifactInputSchema.safeParse({ kind: 'foreshadowing', title: '伏笔', fields: { setup: '出现', target: '回收', status: 'resolved' } }).success).toBe(true)
    expect(storyArtifactInputSchema.safeParse({ kind: 'lore', title: '缺规则', fields: { scope: '世界' } }).success).toBe(false)
    expect(storyArtifactInputSchema.safeParse({ kind: 'foreshadowing', title: '缺目标', fields: { setup: '出现' } }).success).toBe(false)
    expect(storyArtifactInputSchema.safeParse({ kind: 'plot', title: '坏优先级', fields: { priority: true } }).success).toBe(false)
  })

  it('rejects malformed evidence, statuses, and invalid relation endpoints', () => {
    expect(storyArtifactInputSchema.safeParse({ kind: 'foreshadowing', title: '坏状态', fields: { setup: 'a', target: 'b', status: 'unknown' } }).success).toBe(false)
    expect(storyArtifactInputSchema.safeParse({ kind: 'foreshadowing', title: '坏证据', fields: { setup: 'a', target: 'b', evidenceItems: [{ chapterRelPath: 'world/lore.md', quote: 'x' }] } }).success).toBe(false)
    expect(storyArtifactInputSchema.safeParse({ kind: 'foreshadowing', title: '非数组', fields: { setup: 'a', target: 'b', evidenceItems: 'bad' } }).success).toBe(false)
    expect(storyRelationInputSchema.safeParse({ fromId: 'ent_same', relationType: '自指', toId: 'ent_same' }).success).toBe(false)
    expect(timelineEventInputSchema.safeParse({ title: '坏实体', entityIds: ['not-an-entity'] }).success).toBe(false)
  })
})
