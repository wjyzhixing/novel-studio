import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = ['saveDirty', 'saveSaving', 'saveSaved', 'saveFailed', 'modelUnconfigured', 'modelUnconfiguredShort', 'startupLoading', 'openProjectMenu', 'expandDirectoryActions', 'collapseDirectoryActions', 'closeProject', 'expandAgentPanel', 'collapseAgentPanel', 'adjustSidebarWidth', 'adjustRightPanelWidth', 'focusModeHint', 'languageChinese', 'languageEnglish', 'workflowWritebackConflict', 'projectMenuLabel', 'contextUsage']
const sameInBothLocales = new Set<UiTextKey>(['languageEnglish'])

describe('App shell i18n contract', () => {
  it('provides bilingual shell states and controls', () => {
    for (const key of keys) {
      expect(getUiText('zh-CN', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).toBeTruthy()
      if (!sameInBothLocales.has(key)) expect(getUiText('en-US', key), key).not.toBe(getUiText('zh-CN', key))
    }
  })

  it('routes shell-owned copy through locale keys', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    for (const literal of ['未保存', '保存中', '已保存', '保存失败', '未配置 Provider', '未配置模型', '启动中', '打开项目菜单', '展开目录操作区', '收起目录操作区', '创建备份', '创建增量备份', '修复索引', '关闭项目', '展开右侧 Agent 面板', '收起右侧 Agent 面板', '正在加载项目内容', '调整左侧栏宽度', '调整右侧栏宽度', '>Project<', 'Context Usage']) expect(source).not.toContain(literal)
    expect(source).toContain('useUiLocale()')
  })

  it('classifies English error notifications as errors too', async () => {
    const source = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    expect(source).toContain('/失败|错误|无效|拒绝|failed|error|invalid|rejected/i')
  })
})
