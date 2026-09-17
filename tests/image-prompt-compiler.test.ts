import { describe, expect, it } from 'vitest'
import { compileImagePrompt } from '../src/main/services/image-prompt-compiler'
import type { StoryEntity } from '../src/shared/story'

const entity = (fields: Record<string, unknown>): StoryEntity => ({ id: 'ent_lan', kind: 'character', name: '岚', aliases: [], fields, notes: '', updatedAt: '2026-01-01' })

describe('image prompt compiler', () => {
  it('builds a stable prompt with optional scene direction and anchors', () => {
    const result = compileImagePrompt({
      title: '雨夜', description: '街灯下等待', artDirection: 'cinematic', entities: [entity({ visualIdentity: '短黑发' })],
      subject: '一名旅人', camera: 'close-up', composition: 'centered', lighting: 'blue hour', visualAnchors: ['旧车站']
    })

    expect(result.prompt).toContain('Scene: 雨夜')
    expect(result.prompt).toContain('Subject: 一名旅人')
    expect(result.prompt).toContain('Visual anchor: 旧车站')
    expect(result.visualContext).toEqual(['character 岚: 短黑发'])
    expect(result.negativePrompt).toContain('watermark')
  })

  it('uses appearance when visual identity is absent and serializes structured identity', () => {
    const result = compileImagePrompt({ title: '场景', description: '', artDirection: '', entities: [entity({ appearance: '白衣' }), entity({ visualIdentity: { hair: 'silver' } })] })

    expect(result.visualContext).toEqual(['character 岚: 白衣', 'character 岚: {"hair":"silver"}'])
    expect(result.prompt).not.toContain('Subject:')
    expect(result.prompt).not.toContain('Art direction:')
  })

  it('omits empty anchors and entities without visual context', () => {
    const result = compileImagePrompt({ title: '无', description: '描述', artDirection: '', entities: [entity({ visualIdentity: '' }), entity({})], visualAnchors: ['', '  ', '构图'] })

    expect(result.prompt).toBe('Scene: 无\n描述\nVisual anchor: 构图')
    expect(result.visualContext).toEqual([])
  })
})
