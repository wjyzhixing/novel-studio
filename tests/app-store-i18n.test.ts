import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText } from '../src/renderer/src/lib/i18n'

describe('app store lifecycle i18n contract', () => {
  it('defines bilingual lifecycle feedback', () => {
    for (const key of ['preloadBridgeMissing', 'startupFailed', 'recentProjectsLoadFailed', 'recentProjectRemoveFailed', 'projectNameRequired', 'projectCreateFailed', 'projectOpenFailed', 'projectCloseFailed', 'mockStoryLoadFailed', 'chapterListFailed', 'volumeListFailed', 'chapterOpenFailed', 'chapterCreateFailed', 'chapterRenameFailed', 'chapterRenamed', 'chapterMoveFailed', 'chapterOrderSaved', 'chapterDeleteFailed', 'chapterDeleted', 'suggestionApplyFailed', 'saveFailed', 'sceneLoadFailed', 'sceneCreateFailed', 'sceneCreated', 'sceneSaveFailed', 'sceneSaved', 'sceneDeleteFailed', 'sceneDeleted', 'sceneOrderFailed', 'sceneOrderSaved', 'volumeCreateFailed', 'volumeCreated', 'volumeSaveFailed', 'volumeSaved', 'volumeDeleteFailed', 'volumeDeleted', 'volumeAssignFailed', 'volumeAssigned', 'volumeUnassignFailed', 'volumeUnassigned', 'volumeOrderFailed', 'volumeOrderSaved'] as const) {
      expect(getUiText('zh-CN', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).not.toBe(getUiText('zh-CN', key))
    }
  })

  it('does not hardcode lifecycle feedback in the store', async () => {
    const source = await readFile(new URL('../src/renderer/src/store/app-store.ts', import.meta.url), 'utf8')
    for (const literal of ['preload 桥未加载', '启动失败:', '请填写项目名并选择一个空文件夹', '创建失败:', '打开失败:', '关闭项目失败', '载入示例失败:', '读取最近项目失败', '移除最近项目失败', '读取章节失败', '读取卷失败', '打开章节失败', '新建章节失败', '重命名章节失败', '章节已重命名', '移动章节失败', '章节顺序已保存', '删除章节失败', '章节已删除', '应用建议失败', '保存失败', '读取场景失败', '创建场景失败', '场景已创建', '保存场景失败', '场景已保存', '删除场景失败', '场景已删除', '排序场景失败', '场景顺序已保存', '创建卷失败', '已创建卷', '保存卷失败', '卷信息已保存', '删除卷失败', '卷已删除', '归入卷失败', '章节已归入卷', '移出卷失败', '章节已移出卷', '卷排序失败', '卷顺序已保存']) expect(source).not.toContain(literal)
    expect(source).toContain('localizedStoreText')
  })
})
