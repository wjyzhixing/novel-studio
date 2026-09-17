import type { AgentId, AgentPolicy, ChatMessage } from '../../shared/ai'
import type { ContextResult } from '../../shared/context'
import type { PromptService } from './prompt-service'

const FALLBACK_PROMPTS: Record<AgentId, string> = {
  'plot-planner': '你是章节规划 Agent，输出目标、冲突、节拍和场景 beats。',
  writer: '你是小说 Writer，保持既有叙事视角、人物口吻和事实连续性。',
  'character-critic': '你是人物一致性 Critic，检查行为、口吻、目标和已知信息是否一致。',
  'logic-critic': '你是逻辑 Critic，检查因果、时间、空间和规则冲突。',
  'style-critic': '你是文风 Critic，检查重复、节奏、视角和表达质量。',
  rewrite: '你是 Rewrite Agent，只输出可替换正文，不解释，不添加 Markdown 代码围栏。',
  'memory-extractor': '你是 Memory Extractor，提取可审计的人物、关系、事件和事实，不擅自写入 Canon。',
  'visual-director': '你是 Visual Director，把章节内容整理成可执行的镜头、构图和画面提示词。',
  'image-prompt': '你是 Image Prompt Agent，把场景、角色视觉身份、地点和全书 Art Direction 编译成稳定、可执行的图片模型提示词。只输出结构化图片提示词，不生成图片。'
}

const DEFAULT_POLICIES: Record<AgentId, Omit<AgentPolicy, 'agentId'>> = {
  'plot-planner': { temperature: 0.5, maxOutputTokens: 1800, contextRecipeId: 'chapter-planning', tools: ['context.read'], outputSchema: 'PlanResult@1', maxRetries: 1 },
  writer: { temperature: 0.8, maxOutputTokens: 5000, contextRecipeId: 'chapter-writing', tools: ['context.read'], maxRetries: 1 },
  'character-critic': { temperature: 0.2, maxOutputTokens: 1800, contextRecipeId: 'chapter-review', tools: ['context.read', 'canon.read'], outputSchema: 'CriticResult@1', maxRetries: 1 },
  'logic-critic': { temperature: 0.2, maxOutputTokens: 1800, contextRecipeId: 'chapter-review', tools: ['context.read', 'canon.read'], outputSchema: 'CriticResult@1', maxRetries: 1 },
  'style-critic': { temperature: 0.4, maxOutputTokens: 1800, contextRecipeId: 'chapter-review', tools: ['context.read'], outputSchema: 'CriticResult@1', maxRetries: 1 },
  rewrite: { temperature: 0.7, maxOutputTokens: 5000, contextRecipeId: 'chapter-rewrite', tools: ['context.read', 'canon.read'], maxRetries: 1 },
  'memory-extractor': { temperature: 0.1, maxOutputTokens: 2500, contextRecipeId: 'memory-extraction', tools: ['context.read', 'canon.read'], outputSchema: 'MemoryExtraction@1', maxRetries: 2 },
  'visual-director': { temperature: 0.6, maxOutputTokens: 2200, contextRecipeId: 'visual-direction', tools: ['context.read', 'story.read'], outputSchema: 'SceneProposal@1', maxRetries: 1 },
  'image-prompt': { temperature: 0.5, maxOutputTokens: 1800, contextRecipeId: 'image-prompting', tools: ['context.read', 'story.read'], outputSchema: 'ImagePrompt@1', maxRetries: 1 }
}

export class AgentService {
  constructor(private readonly prompts?: PromptService) {}

  policy(agentId: AgentId): AgentPolicy { return { agentId, ...DEFAULT_POLICIES[agentId], tools: [...DEFAULT_POLICIES[agentId].tools] } }

  async systemPrompt(agentId: AgentId): Promise<string> {
    if (this.prompts) {
      try { return await this.prompts.read(`agent-${agentId}`) } catch { /* fallback keeps new projects usable */ }
    }
    return FALLBACK_PROMPTS[agentId]
  }

  async messages(agentId: AgentId, userPrompt: string, context?: ContextResult): Promise<ChatMessage[]> {
    const contextBlock = context?.text ? `\n\n以下是本次请求实际注入的上下文：\n${context.text}` : ''
    return [
      { role: 'system', content: `${await this.systemPrompt(agentId)}\n基于上下文回答；不确定时明确说明；不得擅自修改 Canon。${contextBlock}` },
      { role: 'user', content: userPrompt }
    ]
  }
}
