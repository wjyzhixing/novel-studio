import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = [
  'currentChapterConversation', 'newConversationTitle', 'followUpPrompt', 'continuePrompt', 'agentNoteHeading',
  'chatBack', 'standaloneChat', 'newConversation', 'renameConversation', 'archiveConversation',
  'recentMessages', 'startWritingConversation', 'chatEmptyHint', 'contextSources', 'items',
  'rejectedDraft', 'projectScope', 'noProject', 'chapterScope', 'sceneScope', 'noSelection',
  'wholeChapterContext', 'selectionScope', 'selectionDisabled', 'chatInput', 'stopGeneration',
  'send', 'currentContext', 'chapter', 'selection', 'wholeChapterSelection', 'contextAfterSend'
]

const actionKeys: UiTextKey[] = [
  'chatActionCopy', 'chatActionQuote', 'chatActionFollowUp', 'chatActionContinue', 'chatActionRegenerate',
  'chatActionSaveNote', 'chatActionPreviewDiff', 'chatActionApplySelection', 'chatActionAppendChapter',
  'chatActionReplaceChapter', 'chatActionReject', 'chatActionSubmitCanon', 'chatActionOpenCanonReview',
  'chatActionOpenIllustration', 'chatActionOpenWorkflow', 'chatActionRetryFailedNodes', 'chatCopied',
  'chatConversationCreated', 'chatConversationArchived', 'chatQuoted', 'chatFollowUpReady', 'chatSourceMissing', 'chatNoteChapterRequired', 'chatNoteReadFailed',
  'chatNoteSaved', 'chatNoteSaveFailed', 'chatCanonReviewOpened', 'chatCanonProposalInvalid',
  'chatCanonSubmitFailed', 'chatCanonSubmitted', 'chatIllustrationOpened', 'chatWorkflowOpened',
  'chatRetryWorkflowOpened', 'chatNoChapter', 'chatDiffSelectionMissing', 'chatChapterReadFailed',
  'chatSelectionChanged', 'chatDiffCreated', 'chatDiffFailed', 'chatActionRecorded', 'chatDraftRejected'
]

describe('ChatWorkspace i18n contract', () => {
  it('provides bilingual UI copy for the independent chat workspace', () => {
    for (const key of keys) {
      expect(getUiText('zh-CN', key), key).not.toBe('')
      expect(getUiText('en-US', key), key).not.toBe('')
      expect(getUiText('en-US', key), key).not.toBe(getUiText('zh-CN', key))
    }
  })

  it('provides bilingual labels and feedback for message actions', () => {
    for (const key of actionKeys) {
      const zh = getUiText('zh-CN', key)
      const en = getUiText('en-US', key)
      expect(zh, key).toBeTruthy()
      expect(en, key).toBeTruthy()
      expect(en, key).not.toBe(zh)
    }
  })

  it('does not hardcode the independent workspace shell labels', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ChatWorkspace.tsx', import.meta.url), 'utf8')
    for (const literal of ['aria-label="返回编辑器"', '>新建对话<', '>开始一场写作对话<', '>当前上下文<', 'placeholder="向 Agent 提问，⌘/Ctrl + Enter 发送…"', "setNotice('已复制回答')", "setNotice('已引用回答到输入框，可继续追问')", "setNotice('已拒绝该草稿，正文未修改')", '保存 Note 失败：', '生成 Diff 失败：']) {
      expect(source).not.toContain(literal)
    }
  })

  it('does not expose internal message kinds or hardcoded session shortcuts', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ChatWorkspace.tsx', import.meta.url), 'utf8')
    for (const literal of ['>改</button>', '>归</button>', 'Agent · ${message.kind ?? \'explanation\'}']) {
      expect(source).not.toContain(literal)
    }
    for (const key of ['renameConversationShort', 'archiveConversationShort', 'chatKindExplanation', 'chatKindAnalysis', 'chatKindReview', 'chatKindDraft', 'chatKindCanonProposal', 'chatKindImageProposal', 'chatKindWorkflow'] as UiTextKey[]) {
      expect(source).toContain(key)
      expect(getUiText('zh-CN', key)).not.toBe(getUiText('en-US', key))
    }
  })

  it('does not hardcode localized session titles or shortcut prompts', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ChatWorkspace.tsx', import.meta.url), 'utf8')
    for (const literal of ["createChatSession(scope, '当前章节对话')", "createChatSession(scope, '新对话')", "setPrompt('基于刚才的回答继续说明：')", "send('请继续上一个回答"] ) {
      expect(source).not.toContain(literal)
    }
  })

  it('dispatches message actions by stable ids instead of localized labels', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ChatWorkspace.tsx', import.meta.url), 'utf8')
    expect(source).toContain('chatMessageActionIds')
    expect(source).toContain("actionId === 'apply-selection'")
    expect(source).not.toContain("actionId === '应用到选区'")
  })
})
