import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('welcome i18n contract', () => {
  it('routes welcome project bootstrap copy through locale keys', async () => {
    const component = await readFile(new URL('../src/renderer/src/components/Welcome.tsx', import.meta.url), 'utf8')
    const i18n = await readFile(new URL('../src/renderer/src/lib/i18n.ts', import.meta.url), 'utf8')

    for (const key of ['welcomeTagline', 'projectNamePlaceholder', 'chooseProjectFolder', 'loadSampleProject', 'removeFromRecentProjects']) {
      expect(i18n).toContain(`${key}:`)
      expect(component).toContain(`uiText('${key}')`)
    }

    for (const literal of ['AI Native 小说创作 IDE', '作品名，例如：赛博长安', '选择项目文件夹（含 novel.yaml）', '载入小牛三章示例到最近项目', '从列表移除']) {
      expect(component).not.toContain(literal)
    }
  })
})
