import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('bottom panel i18n contract', () => {
  it('routes bottom workspace copy and feedback through locale keys', async () => {
    const component = await readFile(new URL('../src/renderer/src/components/BottomPanel.tsx', import.meta.url), 'utf8')
    const i18n = await readFile(new URL('../src/renderer/src/lib/i18n.ts', import.meta.url), 'utf8')

    for (const key of [
      'adjustBottomPanel', 'expandBottomPanel', 'collapseBottomPanel', 'bottomWorkspace',
      'notesPlaceholder', 'outlineHint', 'aiChatHint', 'foreshadowingSummary', 'filterForeshadowing',
      'allForeshadowingStatuses', 'foreshadowingLifecycle', 'missingForeshadowingEvidence',
      'noMatchingForeshadowing', 'evidenceChapter', 'relatedChapters', 'foreshadowingPayoffDeadline',
      'foreshadowingLegacyEvidence', 'foreshadowingStatusPlanned', 'foreshadowingStatusPlanted',
      'foreshadowingStatusEchoed', 'foreshadowingStatusResolved', 'foreshadowingStatusAbandoned', 'diffChapterHistory',
      'diffProjectHistory', 'revisionReadFailed', 'revisionReverted', 'revisionRefreshFailed',
      'noChapterRevisions', 'noProjectRevisions', 'revertRevision', 'revisionUnavailable', 'diffTitle',
      'revisionHistoryAria', 'revisionDiffAria', 'revisionParagraph', 'revisionUnchanged',
      'revisionModified', 'revisionAdded', 'revisionRemoved', 'revisionOriginal', 'revisionRevised',
    ]) expect(i18n).toContain(`${key}:`)

    for (const literal of ['调整底部面板高度', '放大底部面板', '收起底部面板', '记录本章写作笔记…', '项目大纲请在右侧 Outline 面板查看', '回收期限：', '旧版证据：']) {
      expect(component).not.toContain(literal)
    }
    for (const literal of ['Diff（', 'Revision 历史', '逐段 Revision Diff', '原文', '修改后', '回退此 Revision', '正文已删除或路径不可用']) {
      expect(component).not.toContain(literal)
    }
    expect(component).toContain("formatUiText('revisionReadFailed'")
    expect(component).toContain("formatUiText('foreshadowingSummary'")
  })
})
