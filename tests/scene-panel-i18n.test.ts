import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('scene panel i18n contract', () => {
  it('routes scene management copy through locale keys', async () => {
    const component = await readFile(new URL('../src/renderer/src/components/ScenePanel.tsx', import.meta.url), 'utf8')
    const i18n = await readFile(new URL('../src/renderer/src/lib/i18n.ts', import.meta.url), 'utf8')
    for (const key of ['sceneTitle', 'sceneCount', 'sceneParagraphCount', 'sceneCollapse', 'manageScenes', 'sceneList', 'sceneEmpty', 'sceneName', 'sceneStartParagraph', 'sceneEndParagraph', 'sceneSummary', 'saveScene', 'createScene', 'sceneDefaultName', 'deleteScene', 'renameScene', 'sceneDeleteConfirm', 'sceneDeleteHint', 'sceneParagraphRange', 'sceneSaveFailed', 'sceneCreateFailed', 'sceneDeleteFailed', 'sceneMoveFailed']) {
      expect(i18n).toContain(`${key}:`)
    }
    for (const literal of ['还没有场景。场景只保存结构信息，不会改动正文。', '管理场景', '名称', '起始段落', '结束段落', '摘要', '保存场景', '新建场景', '新场景', '删除场景']) {
      expect(component).not.toContain(literal)
    }
    expect(component).toContain("uiText('sceneTitle')")
  })
})
