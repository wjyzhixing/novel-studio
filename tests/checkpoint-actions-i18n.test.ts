import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = [
  'checkpointCreateOrRestore', 'checkpointCreate', 'checkpointNamePlaceholder',
  'checkpointEmpty', 'checkpointRestoreTitle', 'checkpointRestoreConfirm', 'checkpointFileCount', 'checkpointReadFailed',
  'checkpointNameRequired', 'checkpointCreateFailed', 'checkpointCreated',
  'checkpointRestoreFailed', 'checkpointRestored'
]

describe('CheckpointActions i18n contract', () => {
  it('provides bilingual checkpoint labels and feedback', () => {
    for (const key of keys) {
      expect(getUiText('zh-CN', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).not.toBe(getUiText('zh-CN', key))
    }
  })

  it('routes checkpoint UI copy through locale keys', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/CheckpointActions.tsx', import.meta.url), 'utf8')
    for (const literal of ['读取 Checkpoint 失败：', '请输入 Checkpoint 名称', '创建 Checkpoint 失败：', 'Checkpoint 已创建：', '会覆盖项目内容文件', '恢复 Checkpoint 失败：', 'Checkpoint 已恢复：', '创建或恢复命名检查点', '暂无命名 Checkpoint', '例如：第一卷定稿']) expect(source).not.toContain(literal)
    expect(source).toContain('useUiText()')
  })
})
