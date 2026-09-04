import { randomBytes } from 'node:crypto'
import type { AiEditRequest, AiEditTextRequest, AiSuggestion } from '../../shared/ai-edit'
import type { AiService } from './ai-service'
import type { ChapterService } from './chapter-service'
import { DomainError } from './errors'
import type { RevisionService } from './revision-service'
import type { PromptService } from './prompt-service'
import type { ContextService } from './context-service'
import type { AgentService } from './agent-service'

export class AiEditService {
  private readonly suggestions = new Map<string, AiSuggestion>()
  private readonly jobs = new Map<string, AbortController>()
  constructor(private readonly chapters: ChapterService, private readonly ai: AiService, private readonly revisions: RevisionService, private readonly prompts?: PromptService, private readonly context?: ContextService, private readonly agents?: AgentService) {}

  async listPending(relPath?: string): Promise<AiSuggestion[]> {
    const rows = (relPath
      ? this.chapters.database.prepare("SELECT * FROM ai_suggestions WHERE status = 'pending' AND rel_path = ? ORDER BY created_at DESC").all(relPath)
      : this.chapters.database.prepare("SELECT * FROM ai_suggestions WHERE status = 'pending' ORDER BY created_at DESC").all()) as unknown as SuggestionRow[]
    return rows.map(toSuggestion)
  }

  async run(request: AiEditRequest): Promise<AiSuggestion> {
    const requestId = request.requestId ?? `job_${randomBytes(10).toString('hex')}`
    const controller = new AbortController()
    this.jobs.set(requestId, controller)
    try {
      const chapter = await this.chapters.read(request.relPath)
      const selection = request.selection ?? null
      if (selection && !chapter.markdown.includes(selection)) throw new DomainError('VALIDATION_FAILED', '选区已不在当前章节中，请重新选择')
      const context = this.context ? await this.context.build({ relPath: request.relPath, selection, query: request.prompt, recipe: { id: 'ai-edit', maxTokens: 5000, includeSelection: true, entityLimit: 30, semanticLimit: 8 } }) : undefined
      const requestedAgent = request.prompt.includes('提取设定') ? 'memory-extractor' : request.prompt.includes('逻辑') || request.prompt.includes('冲突') ? 'logic-critic' : 'rewrite'
      const messages = this.agents
        ? await this.agents.messages(requestedAgent, `${request.prompt}\n\n${selection ?? chapter.markdown}`, context)
        : this.prompts
          ? [{ role: 'system' as const, content: await this.prompts.read('ai-edit') }, { role: 'user' as const, content: `${request.prompt}\n\n${selection ?? chapter.markdown}` }]
          : [{ role: 'user' as const, content: `${request.prompt}\n\n${selection ?? chapter.markdown}` }]
      const result = await this.ai.chat(request.profileId, { messages }, controller.signal)
      if (controller.signal.aborted) throw new DomainError('CANCELED', 'AI 生成已取消')
    const suggested = selection
      ? request.prompt.includes('续写')
        ? chapter.markdown.replace(selection, `${selection}\n\n${result.text.trim()}`)
        : chapter.markdown.replace(selection, result.text)
      : request.prompt.includes('续写')
        ? `${chapter.markdown.trimEnd()}\n\n${result.text.trim()}`
        : result.text
    const suggestion: AiSuggestion = { id: `sug_${randomBytes(10).toString('hex')}`, requestId, profileId: request.profileId, relPath: request.relPath, original: chapter.markdown, suggested, prompt: request.prompt, selection, status: 'pending', createdAt: new Date().toISOString() }
    this.suggestions.set(suggestion.id, suggestion)
    this.persist(suggestion)
    return suggestion
    } finally { this.jobs.delete(requestId) }
  }

  async createFromText(request: AiEditTextRequest): Promise<AiSuggestion> {
    const chapter = await this.chapters.read(request.relPath)
    const selection = request.selection ?? null
    if (selection && !chapter.markdown.includes(selection)) throw new DomainError('VALIDATION_FAILED', '选区已不在当前章节中，请重新选择')
    if (!request.suggested.trim()) throw new DomainError('VALIDATION_FAILED', 'Suggestion 内容不能为空')
    const suggestion: AiSuggestion = { id: `sug_${randomBytes(10).toString('hex')}`, requestId: `chat_${randomBytes(10).toString('hex')}`, profileId: request.profileId, relPath: request.relPath, original: chapter.markdown, suggested: request.suggested, prompt: request.prompt, selection, status: 'pending', createdAt: new Date().toISOString() }
    this.suggestions.set(suggestion.id, suggestion)
    this.persist(suggestion)
    return suggestion
  }

  async accept(id: string): Promise<{ relPath: string; markdown: string; revisionId: string }> {
    const suggestion = this.pending(id)
    const chapter = await this.chapters.read(suggestion.relPath)
    if (chapter.markdown !== suggestion.original) {
      const stale = { ...suggestion, status: 'stale' as const }
      this.suggestions.set(id, stale)
      this.updateStatus(id, 'stale')
      throw new DomainError('VALIDATION_FAILED', '章节内容已变化，当前 Suggestion 已过期，请重新生成')
    }
    const revision = await this.revisions.create({ relPath: suggestion.relPath, actor: 'agent', source: `ai-suggestion:${suggestion.id}`, original: suggestion.original, replacement: suggestion.suggested })
    await this.chapters.save(suggestion.relPath, suggestion.suggested)
    this.suggestions.set(id, { ...suggestion, status: 'accepted' })
    this.updateStatus(id, 'accepted')
    return { relPath: suggestion.relPath, markdown: suggestion.suggested, revisionId: revision.id }
  }

  async reject(id: string): Promise<null> { const suggestion = this.pending(id); this.suggestions.set(id, { ...suggestion, status: 'rejected' }); this.updateStatus(id, 'rejected'); return null }
  async cancel(requestId: string): Promise<null> { const job = this.jobs.get(requestId); if (job) job.abort(); else throw new DomainError('PROJECT_NOT_FOUND', `AI job 不存在: ${requestId}`); return null }
  async retry(id: string): Promise<AiSuggestion> { const suggestion = this.suggestions.get(id); if (!suggestion) throw new DomainError('PROJECT_NOT_FOUND', `Suggestion 不存在: ${id}`); return this.run({ requestId: `job_${randomBytes(10).toString('hex')}`, profileId: suggestion.profileId, relPath: suggestion.relPath, prompt: suggestion.prompt, selection: suggestion.selection }) }
  private pending(id: string): AiSuggestion {
    const value = this.suggestions.get(id) ?? this.load(id)
    if (!value || value.status !== 'pending') throw new DomainError('PROJECT_NOT_FOUND', `Suggestion 不存在或已处理: ${id}`)
    this.suggestions.set(id, value)
    return value
  }

  private load(id: string): AiSuggestion | null {
    const row = this.chapters.database.prepare('SELECT * FROM ai_suggestions WHERE id = ?').get(id) as unknown as SuggestionRow | undefined
    return row ? toSuggestion(row) : null
  }

  private persist(suggestion: AiSuggestion): void {
    this.chapters.database.prepare('INSERT INTO ai_suggestions(id, request_id, profile_id, rel_path, original, suggested, prompt, selection, status, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(suggestion.id, suggestion.requestId, suggestion.profileId, suggestion.relPath, suggestion.original, suggestion.suggested, suggestion.prompt, suggestion.selection, suggestion.status, suggestion.createdAt)
  }

  private updateStatus(id: string, status: AiSuggestion['status']): void {
    this.chapters.database.prepare('UPDATE ai_suggestions SET status = ? WHERE id = ?').run(status, id)
  }
}

interface SuggestionRow { id: string; request_id: string; profile_id: string; rel_path: string; original: string; suggested: string; prompt: string; selection: string | null; status: AiSuggestion['status']; created_at: string }
const toSuggestion = (row: SuggestionRow): AiSuggestion => ({ id: row.id, requestId: row.request_id, profileId: row.profile_id, relPath: row.rel_path, original: row.original, suggested: row.suggested, prompt: row.prompt, selection: row.selection, status: row.status, createdAt: row.created_at })
