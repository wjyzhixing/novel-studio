import { describe, expect, it } from 'vitest'
import { chatDraftTarget, chatMessageActionIds, chatMessageActions, classifyChatAction, classifyChatPrompt, parseStructuredCanonProposal } from '../src/renderer/src/lib/chat'

describe('chat message action model', () => {
  it('keeps explanations read-only and turns drafts into explicit edit actions', () => {
    expect(classifyChatAction('explanation')).toBe('read-only')
    expect(classifyChatAction('analysis')).toBe('read-only')
    expect(classifyChatAction('draft')).toBe('suggestion')
    expect(chatMessageActions('draft')).toEqual(['复制', '引用', '预览 Diff', '应用到选区', '追加到章节', '替换章节', '继续生成', '重新生成', '拒绝'])
    expect(chatMessageActions('canon-proposal')).toContain('打开 Canon Review')
    expect(chatMessageActions('canon-proposal')).toContain('提交 Canon 提案')
  })

  it('never routes apply-to-selection to the chapter when selection is missing', () => {
    expect(chatDraftTarget('应用到选区', '林默抬头')).toBe('selection')
    expect(chatDraftTarget('应用到选区', '')).toBe('missing-selection')
    expect(chatDraftTarget('追加到章节', '')).toBe('chapter')
    expect(chatDraftTarget('替换章节', '林默抬头')).toBe('chapter')
  })

  it('exposes stable action ids independent of localized labels', () => {
    expect(chatMessageActionIds('draft')).toEqual(['copy', 'quote', 'preview-diff', 'apply-selection', 'append-chapter', 'replace-chapter', 'continue', 'regenerate', 'reject'])
  })

  it('classifies the same prompt consistently in both Chat surfaces', () => {
    expect(classifyChatPrompt('请改写这段文字')).toBe('draft')
    expect(classifyChatPrompt('润写并扩写这一段')).toBe('draft')
    expect(classifyChatPrompt('检查这一章的逻辑')).toBe('analysis')
    expect(classifyChatPrompt('补充世界观设定')).toBe('canon-proposal')
    expect(classifyChatPrompt('为这一段生成插图')).toBe('image-proposal')
    expect(classifyChatPrompt('查看 workflow 运行结果')).toBe('workflow')
    expect(classifyChatPrompt('请审核这段正文')).toBe('review')
    expect(classifyChatPrompt('这句话是什么意思？')).toBe('explanation')
    expect(classifyChatAction('review')).toBe('read-only')
    expect(chatMessageActions('draft')).toContain('替换章节')
    expect(chatMessageActions('workflow')).toContain('打开 Workflow 详情')
  })

  it('only accepts an explicitly structured Canon proposal with a safe source', () => {
    expect(parseStructuredCanonProposal('普通的世界观说明', 'chapters/001.md')).toBeNull()
    expect(parseStructuredCanonProposal('```json\n{"subjectId":"ent_luo","predicate":"role","object":"守门人"}\n```', 'chapters/001.md')).toEqual({
      subjectId: 'ent_luo', predicate: 'role', object: '守门人', validFrom: null, validTo: null, confidence: 1,
      source: { documentId: 'chapters/001.md', range: [0, 0] }
    })
    expect(parseStructuredCanonProposal('{"id":"fact_existing","subjectId":"ent_luo","predicate":"role","object":"守门人"}', 'chapters/001.md')).toMatchObject({ id: 'fact_existing', subjectId: 'ent_luo' })
  })
})
