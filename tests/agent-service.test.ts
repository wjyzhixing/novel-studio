import { describe, expect, it } from 'vitest'
import { AgentService } from '../src/main/services/agent-service'
import type { PromptService } from '../src/main/services/prompt-service'
import { agentIdSchema } from '../src/shared/ai'

describe('AgentService', () => {
  it('returns an independent policy copy for each request', () => {
    const service = new AgentService()
    const first = service.policy('writer')
    first.tools.push('unsafe.test')

    expect(service.policy('writer').tools).not.toContain('unsafe.test')
    expect(first).toMatchObject({
      agentId: 'writer',
      contextRecipeId: 'chapter-writing',
      maxRetries: 1
    })
  })

  it('uses the fallback prompt when no project prompt service is configured', async () => {
    await expect(new AgentService().systemPrompt('writer')).resolves.toContain('小说 Writer')
  })

  it('supports the dedicated image prompt agent described by the blueprint', async () => {
    expect(agentIdSchema.safeParse('image-prompt').success).toBe(true)
    expect(new AgentService().policy('image-prompt')).toMatchObject({
      contextRecipeId: 'image-prompting',
      outputSchema: 'ImagePrompt@1'
    })
    await expect(new AgentService().systemPrompt('image-prompt')).resolves.toContain('Image Prompt')
  })

  it('uses a project prompt and falls back when that prompt is unavailable', async () => {
    const prompts = {
      read: async (name: string) => {
        if (name === 'agent-writer') return 'project writer prompt'
        throw new Error('missing')
      }
    }
    const service = new AgentService(prompts as unknown as PromptService)

    await expect(service.systemPrompt('writer')).resolves.toBe('project writer prompt')
    await expect(service.systemPrompt('logic-critic')).resolves.toContain('逻辑 Critic')
  })

  it('builds system and user messages with optional context', async () => {
    const messages = await new AgentService().messages('writer', '继续写这一段', {
      text: '已确认的章节上下文',
      manifest: { recipeId: 'chapter-writing' } as never
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: 'system' })
    expect(messages[0].content).toContain('已确认的章节上下文')
    expect(messages[1]).toEqual({ role: 'user', content: '继续写这一段' })
    await expect(new AgentService().messages('writer', '无上下文')).resolves.toEqual([
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: '无上下文' }
    ])
  })
})
