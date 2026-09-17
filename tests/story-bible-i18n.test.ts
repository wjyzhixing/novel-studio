import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = [
  'storyBible', 'storyEntityTypes', 'storyNewEntity', 'storyEditEntity', 'storyCreateEntity', 'storySearch',
  'storyNoEntities', 'storyCharacter', 'storyPlace', 'storyOrg', 'storyItem', 'storyNewEvent',
  'storyRelatedEntity', 'storySort', 'storyEventTitle', 'storyTime', 'storyLocation',
  'storyRelatedChapter', 'storyParticipants', 'storyCauses', 'storyEffects', 'storyDescription',
  'storyNoMatchingEvents', 'storyEvidence', 'storyAddEvidence', 'storyRemoveEvidence', 'storyPlot',
  'storyForeshadowing', 'storyLore', 'storyNote', 'storyNewArtifact', 'storyNoEntries',
  'storyEditArtifact', 'storyTitle', 'storyNotes', 'storyDelete', 'storySave', 'storyLoadEntityFailed',
  'storyLoadTimelineFailed', 'storyLoadEntriesFailed', 'storyLoadFailed', 'storySaveEntityFailed',
  'storySaveArtifactFailed', 'storySaveTimelineFailed', 'storyDeleteTimelineFailed',
  'storyDeleteEntityFailed', 'storyDeleteArtifactFailed', 'storyOperationFailed', 'storyEvidenceRequired',
  'storySaved', 'storyDeleted', 'storyEntityName', 'storyAliases', 'storyRoleType', 'storyVisualIdentity', 'storyExampleName', 'storyAliasesPlaceholder', 'storyRolePlaceholder',
  'storyVisualIdentityCharacterPlaceholder', 'storyVisualIdentityPlacePlaceholder', 'storyVisualIdentityHint',
  'storyFieldPlaceholder', 'storyCharacterStatusPlaceholder', 'storyNotesPlaceholder', 'storyTimelineMini',
  'storyNoTimeline', 'storyOpenChapter', 'storyEvidenceChapter', 'storyEvidenceQuote', 'storyEvidenceQuotePlaceholder',
  'storyEvidenceNote', 'storyEvidenceNotePlaceholder', 'storySelectChapterOption', 'storyFieldPriority',
  'storyFieldSetup', 'storyFieldPayoff', 'storyFieldRelatedChapters', 'storyFieldSetupContent',
  'storyFieldTargetPayoff', 'storyFieldPayoffDeadline', 'storyFieldScope', 'storyFieldRule',
  'storyFieldExceptions', 'storyFieldSource', 'storyFieldRelatedChaptersComma', 'storyForeshadowingChapters'
]

describe('StoryBible i18n contract', () => {
  it('provides bilingual copy for the entity shell', () => {
    for (const key of keys) {
      expect(getUiText('zh-CN', key), key).not.toBe('')
      expect(getUiText('en-US', key), key).not.toBe('')
      if (!['storyBible', 'storyNotes'].includes(key)) expect(getUiText('en-US', key), key).not.toBe(getUiText('zh-CN', key))
    }
  })

  it('uses locale keys for the main entity shell labels', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/StoryBible.tsx', import.meta.url), 'utf8')
    for (const literal of ['placeholder="搜索名称或 alias"', '>暂无实体<', "selected ? '编辑实体' : '新建实体'", '＋ 新建{sectionTitles[section]}', '>暂无条目<', '<label>标题<input', '读取实体失败：', '保存故事条目失败：', '删除时间线失败：', '每条证据都需要选择章节', "setNotice('已保存')", "setNotice('已删除')"]) {
      expect(source).not.toContain(literal)
    }
  })

  it('routes entity, timeline, and artifact form copy through locale keys', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/StoryBible.tsx', import.meta.url), 'utf8')
    for (const literal of [
      '<label>名称<input', '<label>Aliases<input', '<label>角色 / 类型<input', '<label>Visual Identity<textarea',
      '会被 Illustration Studio 自动加入 Prompt', 'placeholder="自由文本设定"', 'placeholder="逗号分隔"',
      'placeholder="例如：林默"', 'placeholder="例如：protagonist"', 'placeholder="例如：存活；当前位置；伤势"',
      '<label>章节<select', '选择章节</option>', '<label>原文摘录<textarea', '粘贴能够证明伏笔状态的原文',
      '<label>说明<textarea', '说明这段文字如何证明埋设、回响或回收', '>打开章节<', '<h3>Timeline</h3>',
      '暂无时间线事件</small>', '当前模块暂无可用数据。', '未定时间', '无关联实体',
      "label: '人物'", "['appearance', '外貌']", "['setup', '铺垫']"
    ]) expect(source).not.toContain(literal)
  })

  it('renders one Story Bible editor tab instead of duplicating the header', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/StoryBible.tsx', import.meta.url), 'utf8')
    expect(source.match(/<div className="editor-tab">/g)?.length).toBe(1)
  })

  it('exposes entity kind navigation and selections with standard state semantics', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/StoryBible.tsx', import.meta.url), 'utf8')
    expect(source).toContain('role="tablist"')
    expect(source).toContain('role="tab"')
    expect(source).toContain('aria-selected={entry.value === kind}')
    expect(source).toContain('aria-pressed={selected?.id === entity.id}')
    expect(source).toContain('aria-pressed={selectedId === point.event.id}')
    expect(source).toContain("event.key === 'ArrowRight'")
    expect(source).toContain("event.key === 'ArrowLeft'")
    expect(source).toContain("event.key === 'Home'")
    expect(source).toContain("event.key === 'End'")
    expect(source).toContain('tabIndex={entry.value === kind ? 0 : -1}')
  })
})
