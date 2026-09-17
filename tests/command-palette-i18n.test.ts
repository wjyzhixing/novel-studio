import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('command palette i18n contract', () => {
  it('routes palette copy and project-operation feedback through locale keys', async () => {
    const component = await readFile(new URL('../src/renderer/src/components/CommandPalette.tsx', import.meta.url), 'utf8')
    const i18n = await readFile(new URL('../src/renderer/src/lib/i18n.ts', import.meta.url), 'utf8')
    for (const key of ['commandDialog', 'newChapterTitlePlaceholder', 'commandSearchPlaceholder', 'paletteOptions', 'searching', 'searchFailed', 'actionsGroup', 'chaptersGroup', 'entitiesGroup', 'searchResultsGroup', 'noMatchingResults', 'choose', 'confirm', 'close', 'indexRepairSummary', 'indexRepairDetails', 'indexRepairEmbeddingsRemoved', 'indexRepairRestoredSources', 'indexRepairFailed', 'integrityPassed', 'integrityWarnings', 'integrityCheckFailed']) {
      expect(i18n).toContain(`${key}:`)
    }
    for (const literal of ['命令面板', '输入新章节标题，回车创建', '输入命令或搜索章节…', '正在搜索…', '搜索失败：', '无匹配结果', '操作', '章节', 'Story Bible 实体', '搜索结果', ' 章、', ' 个实体、', '个故事条目', '恢复源文件：']) {
      expect(component).not.toContain(literal)
    }
    expect(component).toContain("uiText('commandDialog')")
  })

  it('uses locale keys for action labels and searches localized copy', async () => {
    const registry = await readFile(new URL('../src/renderer/src/commands/action-registry.ts', import.meta.url), 'utf8')
    const component = await readFile(new URL('../src/renderer/src/components/CommandPalette.tsx', import.meta.url), 'utf8')
    for (const key of ['labelKey', 'hintKey', 'localizedText']) expect(registry).toContain(key)
    expect(component).toContain("uiText(definition.labelKey)")
    expect(component).toContain("uiText(definition.hintKey)")
  })
})
