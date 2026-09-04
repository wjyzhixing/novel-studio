import { factInputSchema, type FactInput } from '../../../shared/canon'

export type ChatMessageKind = 'explanation' | 'analysis' | 'review' | 'draft' | 'canon-proposal' | 'image-proposal' | 'workflow'
export type ChatDraftTarget = 'selection' | 'chapter' | 'missing-selection'

export function classifyChatPrompt(prompt: string): ChatMessageKind {
  if (/插图|图片|image/i.test(prompt)) return 'image-proposal'
  if (/workflow|流程|运行节点/i.test(prompt)) return 'workflow'
  if (/改写|润写|扩写|缩写|续写|翻译/.test(prompt)) return 'draft'
  if (/设定|canon|世界观/i.test(prompt)) return 'canon-proposal'
  if (/审核|审查|评审|审阅/.test(prompt)) return 'review'
  if (/检查|分析|逻辑|总结/.test(prompt)) return 'analysis'
  return 'explanation'
}

export function chatDraftTarget(action: string, selection: string | null | undefined): ChatDraftTarget {
  if (action === '追加到章节') return 'chapter'
  if (action === '替换章节') return 'chapter'
  if (action === '应用到选区') return selection?.trim() ? 'selection' : 'missing-selection'
  return selection?.trim() ? 'selection' : 'chapter'
}

export function classifyChatAction(kind: ChatMessageKind): 'read-only' | 'suggestion' | 'proposal' | 'workflow' {
  if (kind === 'explanation' || kind === 'analysis' || kind === 'review') return 'read-only'
  if (kind === 'draft') return 'suggestion'
  if (kind === 'workflow') return 'workflow'
  return 'proposal'
}

export function chatMessageActions(kind: ChatMessageKind): string[] {
  if (kind === 'explanation' || kind === 'analysis' || kind === 'review') return ['复制', '引用', '追问', '继续生成', '重新生成', '保存为 Note']
  if (kind === 'draft') return ['复制', '引用', '预览 Diff', '应用到选区', '追加到章节', '替换章节', '继续生成', '重新生成', '拒绝']
  if (kind === 'canon-proposal') return ['复制', '继续生成', '重新生成', '提交 Canon 提案', '打开 Canon Review', '拒绝']
  if (kind === 'image-proposal') return ['复制', '继续生成', '重新生成', '打开插图工作室']
  return ['复制', '打开 Workflow 详情', '重试失败节点']
}

/**
 * Chat text is untrusted. Only an explicit JSON object can cross the Canon
 * proposal boundary; prose, Markdown lists and reviewer instructions remain
 * ordinary read-only chat content.
 */
export function parseStructuredCanonProposal(content: string, sourceDocumentId: string): FactInput | null {
  if (!sourceDocumentId.trim() || content.length > 20_000) return null
  const match = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = match?.[1] ?? (content.trim().startsWith('{') && content.trim().endsWith('}') ? content.trim() : null)
  if (!candidate) return null
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>
    const result = factInputSchema.safeParse({
      subjectId: parsed.subjectId,
      predicate: parsed.predicate,
      object: parsed.object,
      validFrom: parsed.validFrom ?? null,
      validTo: parsed.validTo ?? null,
      confidence: parsed.confidence ?? 1,
      // The active chapter is authoritative; do not trust an AI-provided path.
      source: { documentId: sourceDocumentId, range: Array.isArray(parsed.source) ? parsed.source : [0, 0] }
    })
    return result.success ? result.data : null
  } catch {
    return null
  }
}
