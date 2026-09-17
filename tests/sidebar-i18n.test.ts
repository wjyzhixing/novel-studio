import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('sidebar i18n contract', () => {
  it('routes chapter and volume management copy through locale keys', async () => {
    const component = await readFile(new URL('../src/renderer/src/components/Sidebar.tsx', import.meta.url), 'utf8')
    const i18n = await readFile(new URL('../src/renderer/src/lib/i18n.ts', import.meta.url), 'utf8')
    for (const key of ['projectNotOpen', 'chapterTitle', 'chapterMenu', 'editChapterTitle', 'chapterVolume', 'unassignedVolume', 'volumeNamePlaceholder', 'chapterTitlePlaceholder', 'rename', 'delete', 'renameVolume', 'deleteVolume', 'volumeDeleteConfirm', 'chapterDeleteConfirm', 'createChapter', 'createVolume', 'workflowEditor', 'graphStudio', 'illustrationStudio', 'editVolumeTitle']) {
      expect(i18n).toContain(`${key}:`)
    }
    for (const literal of ['卷名称，回车创建', '章节标题，回车创建', '未分卷', '重命名', '双击编辑章节标题', '设置所属卷', '双击或点击改名编辑卷名']) {
      expect(component).not.toContain(literal)
    }
    expect(component).toContain("uiText('chapterTitle')")
  })
})
