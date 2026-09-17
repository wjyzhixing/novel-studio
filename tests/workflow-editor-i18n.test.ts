import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = [
  'workflowEditorTitle', 'workflowName', 'arrangeLayout', 'validate', 'importCommunityWorkflow',
  'exportCommunityWorkflow', 'save', 'properties', 'addBlock', 'selectBlock', 'variables',
  'variableName', 'variableType', 'variableDefault', 'deleteBlock', 'agentPolicyOverrides',
  'contextRecipe', 'selectNodeToEdit'
]

const dynamicKeys: UiTextKey[] = [
  'workflowLoadingFailed', 'workflowSaving', 'workflowSaved', 'workflowSaveFailed', 'workflowValidationPassed',
  'communityPickFailed', 'communityReadFailed', 'communityNoDependencies', 'communityDependenciesReady',
  'communityMissingDependencies', 'communityImportBlocked', 'communityImportConfirm', 'communityNoDescription', 'communityNoPrompts',
  'communityNoExtraPermissions', 'communityImportFailed', 'communityImportLoadedFailed', 'communityImported',
  'communityExportPickFailed', 'communityExported', 'communityExportFailed', 'workflowLayoutArranged',
  'nodeInputChapter', 'nodeLoadContext', 'nodeAiWriting', 'nodeAiReview', 'nodeHumanReview', 'nodeWriteChapter',
  'nodeExtractSettings', 'nodeImageProposal', 'nodeGenerateImage', 'nodeSelectImage', 'nodeInsertImage', 'nodeMergeInput'
]

describe('WorkflowEditor i18n contract', () => {
  it('provides bilingual editor UI copy', () => {
    for (const key of keys) {
      const zh = getUiText('zh-CN', key)
      const en = getUiText('en-US', key)
      expect(zh, key).not.toBe('')
      expect(en, key).not.toBe('')
      expect(en, key).not.toBe(zh)
    }
  })

  it('provides bilingual copy for dynamic feedback and node catalog labels', () => {
    for (const key of dynamicKeys) {
      const zh = getUiText('zh-CN', key)
      const en = getUiText('en-US', key)
      expect(zh, key).toBeTruthy()
      expect(en, key).toBeTruthy()
      expect(en, key).not.toBe(zh)
    }
  })

  it('uses locale keys for the editor shell and properties panel', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/WorkflowEditor.tsx', import.meta.url), 'utf8')
    for (const literal of ['<b>Workflow Editor</b>', 'aria-label="Workflow name"', '<h3>Properties</h3>', '<h4>Variables</h4>', '选择节点编辑属性', '加载失败：', '保存中…', 'DAG 校验通过', '选择 Community Workflow 失败：', '导入 Community Workflow“', 'Workflow 布局已整理', '当前章节输入', '加载 Context', 'AI 写作', '人工审核', '图片提案']) {
      expect(source).not.toContain(literal)
    }
  })
})
