import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = [
  'backupCreate', 'backupCreateIncremental', 'backupRestore', 'backupRestoreIncremental', 'repairIndexes',
  'backupPickLocationFailed', 'backupCreated', 'backupCreateFailed', 'backupPickFailed', 'backupRestoreCompleted',
  'backupRestoreFailed', 'backupPickDirectoryFailed', 'backupIncrementalBaseFailed', 'backupIncrementalPickFailed',
  'backupIncrementalCreated', 'backupIncrementalCreateFailed', 'backupIncrementalRestoreFailed', 'backupEmbeddingsRemoved', 'backupRepairSummary', 'indexesRepaired',
  'indexRepairFailed', 'importChapter', 'importMarkdownTitle', 'exportChapters', 'cleanImageMetadata', 'cleanImageMetadataHint', 'exportAllTitle', 'exportedChapters',
  'importPickFailed', 'importedChapter', 'importFailed', 'exportPickFailed', 'exportedFailed'
]

describe('backup and import/export i18n contract', () => {
  it('provides bilingual operation labels and feedback', () => {
    for (const key of keys) {
      expect(getUiText('zh-CN', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).not.toBe(getUiText('zh-CN', key))
    }
  })

  it('routes backup and import/export UI copy through locale keys', async () => {
    const backup = await readFile(new URL('../src/renderer/src/components/BackupActions.tsx', import.meta.url), 'utf8')
    const io = await readFile(new URL('../src/renderer/src/components/ImportExportActions.tsx', import.meta.url), 'utf8')
    for (const literal of ['选择备份位置失败：', '备份已创建：', '备份失败：', '从备份恢复', '创建增量', '修复索引', '导入 Markdown/TXT 章节', '>导入<']) expect(backup + io).not.toContain(literal)
    expect(backup).toContain('useUiText()')
    expect(io).toContain('useUiText()')
  })
})
