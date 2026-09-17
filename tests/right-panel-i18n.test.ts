import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const requiredKeys: UiTextKey[] = [
  'rightPanelAria', 'contextEmpty', 'contextInspector', 'contextSnapshots', 'replay',
  'replayCompatibility', 'replayDifferenceSummary', 'replayAddedCount', 'replayRemovedCount', 'replayChangedCount', 'replayTokenDelta', 'snapshotVersionSummary', 'workflowDescription', 'workflowLoading', 'workflowLatestRun',
  'workflowRecoveryUnavailable', 'workflowReviewPaused', 'workflowReviewPlaceholder',
  'workflowReviewHint', 'workflowImageHint', 'retryFailedNodes', 'rerunCurrentChapter',
  'selectionHintSelected', 'selectionHintEmpty', 'selectionPromptSelected', 'selectionPromptEmpty',
  'questionPlaceholder', 'cancelGeneration', 'sendQuestion', 'you', 'generating', 'quickActions',
  'cancel', 'suggestionPending', 'accept', 'reject', 'retry', 'multipleRegions', 'keepRegion',
  'workflowScope', 'inputChapter', 'runPath', 'writeBackTarget', 'workflowStatus', 'currentFlow',
  'loadingCurrentRun', 'notRunCurrentChapter', 'showNodesAfterRun', 'run', 'inputChapterShort',
  'wholeChapter', 'sameChapter', 'outlineFile', 'emptyOutline', 'editOutlineHint', 'records',
  'tokens', 'omitted', 'retrieval', 'selectionIncluded', 'selectionNotIncluded', 'candidates',
  'truncated', 'migratedRecomputed', 'versionMatches', 'strategy', 'replayDifferences', 'added',
  'removed', 'changed', 'characters', 'contextBuild', 'contextBuildFailed', 'contextChecked',
  'selectionVerified', 'selectionNotIncludedMessage', 'selectionVerificationFailed', 'workflowStarting',
  'workflowStartFailed', 'workflowCanceling', 'workflowCancelRequested', 'workflowCancelFailed',
  'workflowRetrying', 'workflowRetryFailed', 'workflowResumeFailed', 'workflowReviewReject',
  'workflowReviewEditApprove', 'workflowReviewApprove', 'currentNode', 'reviewRecoveryPending',
  'suggestionGenerating', 'suggestionApplied', 'suggestionApplyFailed', 'suggestionRejected',
  'suggestionRejectFailed', 'suggestionCancelUnavailable', 'suggestionCancelled', 'suggestionCancelFailed',
  'suggestionRetryFailed', 'suggestionRegionSwitched', 'suggestionRegionFailed', 'chatFailed',
  'settingsPrompt', 'chapterBehaviorPrompt', 'logicPrompt', 'polishPrompt', 'titlePrompt',
  'continueChapter', 'rewriteChapter', 'summarizeChapter', 'extractSettings', 'checkConflicts',
  'generateIllustration', 'summaryContextBuild', 'summaryContextFailed', 'chapterSummary', 'summaryFailed'
  , 'workflowExecutionFailed', 'contextReplayFailed', 'contextChanged', 'contextUnchanged'
  , 'canonProposalGenerated', 'chapterReadFailed', 'suggestionDiffStale', 'suggestionRegionSwitchFailed'
  , 'workflowNoCancellable', 'workflowHistoryPathMissing', 'workflowNoResumable', 'workflowRecoveryUnavailableMessage'
  , 'workflowAssetResuming', 'workflowRejecting', 'workflowSubmittingEdit', 'workflowApproving'
  , 'workflowWritebackSynced', 'imageWritebackSynced', 'currentChapterConversation', 'selectionExplainPrompt'
  , 'continueChapterPrompt', 'rewriteChapterPrompt', 'extractSettingsPrompt', 'checkConflictsPrompt', 'summaryPrompt'
  , 'chatMessageAuthor', 'chatKindExplanation', 'chatKindAnalysis', 'chatKindReview', 'chatKindDraft'
  , 'chatKindCanonProposal', 'chatKindImageProposal', 'chatKindWorkflow'
  , 'runtimeRun', 'runtimeInputChapter', 'runtimeUnknown', 'runtimeScene', 'runtimeWholeChapter', 'runtimeWriteBackTarget', 'runtimeSameChapter'
]

describe('RightPanel i18n contract', () => {
  it('labels recency candidates in the Context Inspector without breaking legacy counts', () => {
    expect(getUiText('zh-CN', 'candidates')).toContain('P/S/R/M')
    expect(getUiText('en-US', 'candidates')).toContain('P/S/R/M')
  })

  it('passes a zero recency count when rendering legacy context manifests', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/RightPanel.tsx', import.meta.url), 'utf8')
    expect(source).toContain("key === 'candidates' ? { ...values, recency: values.recency ?? 0 }")
  })

  it('defines distinct Chinese and English copy for the right workspace UI', () => {
    for (const key of requiredKeys) {
      const zh = getUiText('zh-CN', key)
      const en = getUiText('en-US', key)
      expect(zh, key).not.toBe('')
      expect(en, key).not.toBe('')
      if (!['contextInspector', 'contextSnapshots', 'tokens', 'chatMessageAuthor'].includes(key)) expect(en, key).not.toBe(zh)
    }
  })

  it('uses translated copy for fixed RightPanel labels and statuses', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/RightPanel.tsx', import.meta.url), 'utf8')

    expect(source).toContain("useUiText()")
    for (const literal of [
      '右侧工具面板', '发送问题或点击', 'Context Inspector', 'Context Snapshots', '人工审核暂停', 'Retry failed nodes', 'Quick Actions', '项目大纲 · story/outline.md', '工作流运行上下文',
      'Workflow 执行失败', 'Context 回放失败', 'Context 已变化', 'Context 未变化', '已生成 ${result.data.length} 条 Canon Proposal',
      '读取章节失败', '当前章节已变化，不能拆分旧 Diff', '切换局部 Diff 失败', '当前没有可取消的 Workflow', '历史 Workflow Run 缺少章节路径',
      '正在重试 Workflow 失败节点', '当前没有可恢复的 Workflow', '该旧 Workflow Run 无法自动恢复', '已选择图片，正在恢复 Workflow', '<b>Run ', 'Input chapter:', "'Unknown'", 'Scene:', 'Whole chapter', 'Write-back target:', 'same chapter',
      '正在拒绝本次草稿', '正在提交修改后的草稿', '正在提交审核通过', '图片已插入，正文已同步更新', '审核通过，正文已同步更新',
      'Resume Workflow 失败', '正在构建总结所需的 Context', '总结所需 Context 构建失败', '章节摘要：', '总结失败：'
    ]) {
      expect(source).not.toContain(literal)
    }
  })

  it('does not hardcode RightPanel session titles or agent prompts', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/RightPanel.tsx', import.meta.url), 'utf8')
    for (const literal of [
      "createChatSession(chatScope, '当前章节对话')",
      "setPrompt('针对选区输入自定义操作：')",
      "'解释下面选中的文字，只返回解释，不要改写正文。'",
      "'续写当前章节，保持现有叙事视角和语气。'",
      "'改写当前章节，使表达更准确紧凑。'",
      "'提取当前章节中的结构化设定。'",
      "'检查当前章节的逻辑问题并给出修订文本。'",
      "Agent · ${item.kind ?? 'explanation'}",
      "总结以下 Context，只返回摘要，不要改写原文：",
      '仅保留第 ${region.id.replace(\'region-\', \'\')} 个修改区域'
    ]) {
      expect(source).not.toContain(literal)
    }
    expect(source).toContain('actionId')
    expect(source).toContain("uiText('selectionRewritePrompt')")
    expect(source).toContain("formatUiText('suggestionRegionPrompt'")
  })
})
