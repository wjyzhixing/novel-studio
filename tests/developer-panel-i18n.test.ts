import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = ['developerInspector', 'developerInspectorHint', 'exportDiagnostics', 'loading', 'refresh', 'diagnosticPickFailed', 'diagnosticsExported', 'diagnosticsExportFailed', 'jobsLoadFailed', 'backgroundJobsLoadFailed', 'extensionListLoadFailed', 'extensionTrustLoadFailed', 'telemetryLoadFailed', 'jobCancelRequested', 'jobCancelFailed', 'jobRetryMissingPath', 'jobRetryQueued', 'jobRetryFailed', 'telemetryEnabled', 'telemetryDisabled', 'telemetryUpdateFailed', 'extensionPermissionsFailed', 'trustedPublisherMissing', 'extensionPickFailed', 'extensionInstalled', 'extensionInstallFailed', 'extensionUninstallConfirm', 'extensionUninstalled', 'extensionUninstallFailed', 'extensionRollbackConfirm', 'extensionRolledBack', 'extensionRollbackFailed', 'telemetryTitle', 'telemetryHint', 'telemetryEnabledLabel', 'telemetryRevoke', 'telemetryDisabledLabel', 'telemetryEnable', 'extensionsPermissions', 'install', 'trustConfigured', 'trustMissing', 'noExtensions', 'viewPermissions', 'uninstall', 'rollback', 'noExtraPermissions', 'filterJobs', 'filterRuns', 'allStatuses', 'jobsLoading', 'noMatchingJobs', 'noRuns', 'noMatchingRuns', 'noChapter', 'createdAt', 'nodes', 'metadataTrace', 'traceHint', 'selectRunHint', 'jobs', 'runs', 'attempts', 'cancel', 'retry', 'input', 'output', 'log', 'noSelectedRun', 'extensionsHint', 'previewCharacters', 'previewArray', 'previewFirstItem', 'previewContext', 'previewObject', 'previewUndefined', 'diagnosticProfile', 'diagnosticModel', 'diagnosticRequest', 'diagnosticInputTokens', 'diagnosticOutputTokens', 'diagnosticTotalTokens', 'diagnosticCost', 'diagnosticEstimated', 'diagnosticContext', 'diagnosticErrorCategory']

describe('Developer panel i18n contract', () => {
  it('provides bilingual inspector copy and feedback', () => {
    for (const key of keys) {
      const zh = getUiText('zh-CN', key)
      const en = getUiText('en-US', key)
      expect(zh, key).toBeTruthy()
      expect(en, key).toBeTruthy()
      if (!['developerInspector', 'telemetryTitle', 'nodes', 'metadataTrace', 'diagnosticProfile', 'diagnosticModel', 'diagnosticRequest', 'diagnosticContext'].includes(key)) expect(en, key).not.toBe(zh)
    }
  })

  it('does not hardcode inspector feedback and top-level labels', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/DeveloperPanel.tsx', import.meta.url), 'utf8')
    for (const literal of ['Developer / Workflow Inspector', '导出诊断包', '读取中…', '实体加载失败', '任务已请求取消：', '任务已重新排队：', 'Telemetry 已开启', '扩展已安装：', '确定卸载扩展', 'Telemetry 设置', '扩展与权限', '<h3>Jobs</h3>', '<h3>Runs</h3>', '<h3>Nodes</h3>', '正在读取后台任务…', '暂无符合条件的后台任务', '选择一个 Run 查看节点详情', 'metadata trace', ' 字符：', '数组 ', '对象：', 'Context · recipe=', 'Profile ', 'Model ', 'Request ', 'Input tokens ', 'Output tokens ', 'Total tokens ', 'Cost ', 'Context ', 'Error category ']) expect(source).not.toContain(literal)
    expect(source).toContain("uiText('jobs')")
    expect(source).toContain("uiText('metadataTrace')")
  })
})
