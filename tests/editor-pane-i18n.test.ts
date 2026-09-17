import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = [
  'editorEmpty', 'editorSceneFallback', 'editorToolbarAria', 'editorHeading1',
  'editorHeading2', 'editorBold', 'editorItalic', 'editorBulletList',
  'editorTaskList', 'editorBlockquote', 'editorClearSelectionHighlight',
  'editorUndo', 'editorRedo', 'editorWordCount', 'assetUnavailable',
  'assetUnavailableWithId', 'assetMissingWithId', 'aiChangePreview',
  'confirmChange', 'editorCancel'
]

describe('EditorPane i18n contract', () => {
  it('provides bilingual editor labels and states', () => {
    for (const key of keys) {
      expect(getUiText('zh-CN', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).not.toBe(getUiText('zh-CN', key))
    }
  })

  it('routes editor-owned UI copy through locale keys', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/EditorPane.tsx', import.meta.url), 'utf8')
    for (const literal of ['图片资产不可用', 'Asset 缺失', '从左侧选择一个章节', '正文格式工具栏', '一级标题', '二级标题', '加粗', '斜体', '无序列表', '任务列表', '引用', '清除选区高亮', '撤销', '重做', ' 字', 'AI 修改已预览', '确认修改']) expect(source).not.toContain(literal)
    expect(source).toContain('useUiText()')
  })
})
