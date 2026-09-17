import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('update card i18n contract', () => {
  it('routes update states and failure reasons through locale keys', async () => {
    const component = await readFile(new URL('../src/renderer/src/components/UpdateCard.tsx', import.meta.url), 'utf8')
    const i18n = await readFile(new URL('../src/renderer/src/lib/i18n.ts', import.meta.url), 'utf8')
    for (const key of ['updateApp', 'installUpdate', 'updateInstallationFailed', 'updateInstallerLaunched', 'updateInstallerLaunchedHint', 'checkForUpdates', 'checkingUpdates', 'readingUpdateManifest', 'upToDate', 'checkAgain', 'newVersion', 'releaseNotesFallback', 'downloadUpdate', 'downloadingUpdate', 'updateDownloadProgress', 'cancel', 'updateDownloaded', 'updateReadyHint', 'updateFailed', 'retry', 'updateNetworkFailed', 'updateManifestInvalid', 'updateIntegrityFailed', 'updateDestinationFailed', 'updateNotConfigured']) expect(i18n).toContain(`${key}:`)
    for (const literal of ['应用更新', '检查 Novel Studio 是否有新版本', '正在检查更新…', '正在读取受信更新清单', '更新失败', '工件完整性校验失败']) expect(component).not.toContain(literal)
    expect(component).toContain("uiText('updateApp')")
  })
})
