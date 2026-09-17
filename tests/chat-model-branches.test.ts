import { describe, expect, it } from 'vitest'
import { chatDraftTarget, chatMessageActions, classifyChatAction, classifyChatPrompt, parseStructuredCanonProposal } from '../src/renderer/src/lib/chat'
import { resolveOutputBudget } from '../src/shared/ai'

describe('chat model decision branches', () => {
  it('classifies prompt intents and exposes the matching action family', () => {
    expect(classifyChatPrompt('请生成一张图片')).toBe('image-proposal')
    expect(classifyChatPrompt('运行 workflow 流程')).toBe('workflow')
    expect(classifyChatPrompt('续写这一章')).toBe('draft')
    expect(classifyChatPrompt('检查世界观设定')).toBe('canon-proposal')
    expect(classifyChatPrompt('审核这段逻辑')).toBe('review')
    expect(classifyChatPrompt('分析并总结')).toBe('analysis')
    expect(classifyChatPrompt('你好')).toBe('explanation')

    expect(classifyChatAction('explanation')).toBe('read-only')
    expect(classifyChatAction('draft')).toBe('suggestion')
    expect(classifyChatAction('canon-proposal')).toBe('proposal')
    expect(classifyChatAction('workflow')).toBe('workflow')
    expect(chatMessageActions('draft')).toContain('预览 Diff')
    expect(chatMessageActions('canon-proposal')).toContain('提交 Canon 提案')
    expect(chatMessageActions('image-proposal')).toContain('打开插图工作室')
    expect(chatMessageActions('workflow')).toContain('打开 Workflow 详情')
  })

  it('resolves draft targets based on explicit actions and confirmed selection', () => {
    expect(chatDraftTarget('追加到章节', 'selected')).toBe('chapter')
    expect(chatDraftTarget('替换章节', 'selected')).toBe('chapter')
    expect(chatDraftTarget('应用到选区', 'selected')).toBe('selection')
    expect(chatDraftTarget('应用到选区', '  ')).toBe('missing-selection')
    expect(chatDraftTarget('继续', 'selected')).toBe('selection')
    expect(chatDraftTarget('继续', undefined)).toBe('chapter')
  })

  it('accepts only a valid structured Canon proposal and binds its source document', () => {
    const json = JSON.stringify({ subjectId: 'alice', predicate: 'status', object: 'ready', source: [3, 8] })
    expect(parseStructuredCanonProposal(json, 'chapters/001.md')).toMatchObject({
      subjectId: 'alice', source: { documentId: 'chapters/001.md', range: [3, 8] }
    })
    expect(parseStructuredCanonProposal(`\`\`\`json\n${json}\n\`\`\``, 'chapters/001.md')).not.toBeNull()
    expect(parseStructuredCanonProposal('plain text', 'chapters/001.md')).toBeNull()
    expect(parseStructuredCanonProposal('{bad json}', 'chapters/001.md')).toBeNull()
    expect(parseStructuredCanonProposal(json, '  ')).toBeNull()
  })

  it('uses the same safe budget calculation for output tokens', () => {
    expect(resolveOutputBudget(2_000, 1_000)).toBe(744)
    expect(resolveOutputBudget(2_000)).toBe(2_000)
  })
})
