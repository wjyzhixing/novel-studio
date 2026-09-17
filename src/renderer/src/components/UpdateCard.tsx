import { Check, Download, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react'
import type { UpdateStatus } from '../../../shared/update'
import { useUiText } from '../lib/i18n'

interface UpdateCardProps {
  status: UpdateStatus
  onCheck: () => void
  onDownload: () => void
  onInstall: () => void
  onCancel: () => void
}

const failureCopy: Record<Extract<UpdateStatus, { state: 'failed' }>['reason'], Parameters<ReturnType<typeof useUiText>>[0]> = {
  network: 'updateNetworkFailed',
  manifest: 'updateManifestInvalid',
  integrity: 'updateIntegrityFailed',
  destination: 'updateDestinationFailed',
  installation: 'updateInstallationFailed',
  'not-configured': 'updateNotConfigured'
}

export function UpdateCard({ status, onCheck, onDownload, onInstall, onCancel }: UpdateCardProps) {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  if (status.state === 'idle') return <section className="update-card"><div><b>{uiText('updateApp')}</b><small>{uiText('checkUpdateHint')}</small></div><button type="button" onClick={onCheck}><RefreshCw size={13} />{uiText('checkForUpdates')}</button></section>
  if (status.state === 'checking') return <section className="update-card" role="status" aria-live="polite"><div><b>{uiText('checkingUpdates')}</b><small>{uiText('readingUpdateManifest')}</small></div><Loader2 className="spin" size={15} /></section>
  if (status.state === 'up_to_date') return <section className="update-card"><div><b>{uiText('upToDate')}</b><small>{uiText('currentChannelNoUpdate')}</small></div><button type="button" onClick={onCheck}><RefreshCw size={13} />{uiText('checkAgain')}</button></section>
  if (status.state === 'available') return <section className="update-card update-card-available"><div><b>{formatUiText('newVersion', { version: status.manifest.version })}</b><small>{status.manifest.releaseNotes || uiText('releaseNotesFallback')}</small></div><button type="button" className="primary" onClick={onDownload}><Download size={13} />{uiText('downloadUpdate')}</button></section>
  if (status.state === 'downloading') {
    const percent = status.total > 0 ? Math.min(100, Math.round(status.downloaded / status.total * 100)) : 0
    return <section className="update-card" role="status" aria-live="polite"><div className="update-progress-copy"><b>{formatUiText('downloadingUpdate', { percent })}</b><small>{status.downloaded.toLocaleString()} / {status.total.toLocaleString()} bytes</small><progress max={status.total} value={status.downloaded} aria-label={uiText('updateDownloadProgress')} aria-valuenow={status.downloaded} /></div><button type="button" onClick={onCancel}><X size={13} />{uiText('cancel')}</button></section>
  }
  if (status.state === 'ready') return <section className="update-card update-card-ready" role="status"><div><b><Check size={14} />{uiText('updateDownloaded')}</b><small>{uiText('updateReadyHint')}</small></div><button type="button" className="primary" onClick={onInstall}><ExternalLink size={13} />{uiText('installUpdate')}</button></section>
  if (status.state === 'installing') return <section className="update-card update-card-ready" role="status" aria-live="polite"><div><b><Check size={14} />{uiText('updateInstallerLaunched')}</b><small>{uiText('updateInstallerLaunchedHint')}</small></div></section>
  if (status.state === 'install_failed') return <section className="update-card update-card-error" role="alert"><div><b>{uiText('updateFailed')}</b><small>{uiText('updateInstallationFailed')}</small></div><button type="button" className="primary" onClick={onInstall}><ExternalLink size={13} />{uiText('installUpdate')}</button></section>
  return <section className="update-card update-card-error" role="alert"><div><b>{uiText('updateFailed')}</b><small>{uiText(failureCopy[status.reason])}</small></div><button type="button" onClick={onCheck}><RefreshCw size={13} />{uiText('retry')}</button></section>
}
