import { z } from 'zod'
import type { MemoryExtraction } from '../../shared/memory'
import { memoryExtractionSchema } from '../../shared/memory'
import type { CanonProposal } from '../../shared/canon'
import type { AiService } from './ai-service'
import type { AgentService } from './agent-service'
import type { CanonService } from './canon-service'
import type { ChapterService } from './chapter-service'
import type { ContextService } from './context-service'
import { DomainError } from './errors'

export class MemoryService {
  constructor(private readonly chapters: ChapterService, private readonly context: ContextService, private readonly ai: AiService, private readonly agents: AgentService, private readonly canon: CanonService) {}

  async extractFromChapter(profileId: string, relPath: string, workflowRunId?: string): Promise<CanonProposal[]> {
    const chapter = await this.chapters.read(relPath)
    if (workflowRunId) {
      const existing = (await this.canon.listProposals()).filter((proposal) => {
        if (proposal.workflowRunId !== workflowRunId || proposal.type !== 'fact.add') return false
        const payload = proposal.payload
        return 'source' in payload && payload.source.documentId === relPath
      })
      if (existing.length > 0) return existing
    }
    const context = await this.context.build({ relPath, selection: null, query: '', recipe: { id: 'memory-extraction', maxTokens: 7000, includeSelection: false, entityLimit: 100, semanticLimit: 10 } })
    const prompt = `${chapter.markdown}\n\n请从本章提取可进入 Canon 审核的事实。只返回 JSON，不要 Markdown 围栏：{"facts":[{"subjectId":"ent_x","predicate":"status.alive","object":true,"validFrom":null,"validTo":null,"confidence":0.9,"range":[0,10]}]}。subjectId 必须使用上下文中已有实体 ID；range 是本章字符范围。无法确认的内容不要输出。\n\n实体和上下文：\n${context.text}`
    const messages = await this.agents.messages('memory-extractor', prompt, context)
    const extraction = await this.ai.structured(profileId, { request: { messages }, responseSchema: MEMORY_EXTRACTION_RESPONSE_SCHEMA, parse: parseExtraction })
    const proposals: CanonProposal[] = []
    for (const fact of extraction.facts) {
      const range: [number, number] = [Math.min(fact.range[0], chapter.markdown.length), Math.min(fact.range[1], chapter.markdown.length)]
      if (range[1] < range[0]) throw new DomainError('VALIDATION_FAILED', 'Memory Extractor 返回了反向来源范围')
      proposals.push(await this.canon.proposeFact({ subjectId: fact.subjectId, predicate: fact.predicate, object: fact.object, validFrom: fact.validFrom, validTo: fact.validTo, confidence: fact.confidence, source: { documentId: relPath, range } }, workflowRunId))
    }
    return proposals
  }
}

const MEMORY_EXTRACTION_RESPONSE_SCHEMA = { name: 'memory_extraction', schema: z.toJSONSchema(memoryExtractionSchema) }

function parseExtraction(text: string): MemoryExtraction {
  const candidate = extractFirstJsonObject(text)
  if (!candidate) throw new DomainError('VALIDATION_FAILED', 'Memory Extractor 未返回结构化 JSON')
  try { return memoryExtractionSchema.parse(JSON.parse(candidate)) } catch (error) { throw new DomainError('VALIDATION_FAILED', `Memory Extractor 输出格式无效: ${error instanceof Error ? error.message : String(error)}`) }
}

/** Extract one complete JSON object while tolerating prose or trailing output. */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') { quoted = true; continue }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return null
}
