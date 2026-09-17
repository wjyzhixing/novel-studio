import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UpdateCard } from '../src/renderer/src/components/UpdateCard'
import type { UpdateManifest, UpdateStatus } from '../src/shared/update'

const manifest: UpdateManifest = {
  format: 'novel-studio.update-manifest', formatVersion: 1, channel: 'stable', version: '1.2.0', minAppVersion: '1.0.0', platform: 'darwin', arch: 'arm64', artifactUrl: 'https://updates.example.test/a.dmg', sha512: 'a'.repeat(128), size: 100, releasedAt: '2026-09-09T00:00:00.000Z', releaseNotes: '修复编辑器稳定性', signature: { algorithm: 'ed25519', keyId: 'key_fixture', value: 'a'.repeat(128) }
}

const render = (status: UpdateStatus) => renderToStaticMarkup(<UpdateCard status={status} onCheck={() => undefined} onDownload={() => undefined} onInstall={() => undefined} onCancel={() => undefined} />)

describe('UpdateCard component contract', () => {
  it('offers download for an available update and keeps release notes readable', () => {
    const markup = render({ state: 'available', manifest })
    expect(markup).toContain('发现新版本 1.2.0')
    expect(markup).toContain('修复编辑器稳定性')
    expect(markup).toContain('下载更新')
  })

  it('shows progress and a cancel action while downloading', () => {
    const markup = render({ state: 'downloading', downloaded: 50, total: 100 })
    expect(markup).toContain('下载中 50%')
    expect(markup).toContain('取消')
    expect(markup).toContain('aria-valuenow="50"')
  })

  it('offers retry after a failed update operation', () => {
    const markup = render({ state: 'failed', reason: 'integrity' })
    expect(markup).toContain('更新失败')
    expect(markup).toContain('重试')
  })

  it('explains when update checks are unavailable because no endpoint is configured', () => {
    const markup = render({ state: 'failed', reason: 'not-configured' })
    expect(markup).toContain('未配置更新源')
    expect(markup).not.toContain('网络错误')
  })

  it('offers installation after the artifact is ready', () => {
    const markup = render({ state: 'ready', destination: '/tmp/Novel Studio.dmg', bytes: 100 })
    expect(markup).toContain('安装更新')
  })

  it('offers installation retry when the installer fails but the artifact remains verified', () => {
    const markup = render({ state: 'install_failed', destination: '/tmp/Novel Studio.dmg', bytes: 100 })
    expect(markup).toContain('安装更新')
    expect(markup).not.toContain('重试')
  })

  it('reports that the platform installer was launched after a successful handoff', () => {
    const markup = render({ state: 'installing', destination: '/tmp/Novel Studio.dmg', bytes: 100 })
    expect(markup).toContain('安装器已启动')
    expect(markup).not.toContain('安装更新')
  })
})
