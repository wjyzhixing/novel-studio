import { Archive, FolderOpen, Loader2, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useUiText } from '../lib/i18n'

export type BackupAction = 'create' | 'incremental' | 'repair' | 'project-export' | 'project-import'

type BackupActionsProps = {
  showRestore?: boolean
  onNotice: (message: string) => void
  action?: BackupAction | null
  onActionHandled?: () => void
  controls?: boolean
}

export function BackupActions({ showRestore = false, onNotice, action = null, onActionHandled, controls = true }: BackupActionsProps) {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  const [busy, setBusy] = useState(false)

  const create = async (projectArchive = false) => {
    try {
      const picked = await window.novelAPI.project.pickArchiveSave()
      if (!picked.ok || !picked.data) { if (!picked.ok) onNotice(formatUiText('backupPickLocationFailed', { error: picked.error.message })); return }
      setBusy(true)
      const result = await window.novelAPI.backup.createArchive(picked.data)
      onNotice(result.ok ? formatUiText(projectArchive ? 'projectArchiveExported' : 'backupCreated', { path: result.data }) : formatUiText(projectArchive ? 'projectArchiveExportFailed' : 'backupCreateFailed', { error: result.error.message }))
    } catch (error) { onNotice(formatUiText(projectArchive ? 'projectArchiveExportFailed' : 'backupCreateFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }

  const restore = async (projectArchive = false) => {
    try {
      const archive = await window.novelAPI.project.pickArchiveOpen()
      if (!archive.ok || !archive.data) { if (!archive.ok) onNotice(formatUiText('backupPickFailed', { error: archive.error.message })); return }
      const destination = await window.novelAPI.project.pickDirectory()
      if (!destination.ok || !destination.data) { if (!destination.ok) onNotice(formatUiText('backupPickDirectoryFailed', { error: destination.error.message })); return }
      setBusy(true)
      const result = await window.novelAPI.backup.restoreArchive(archive.data, destination.data)
      onNotice(result.ok ? formatUiText(projectArchive ? 'projectArchiveImported' : 'backupRestoreCompleted', { path: result.data }) : formatUiText(projectArchive ? 'projectArchiveImportFailed' : 'backupRestoreFailed', { error: result.error.message }))
    } catch (error) { onNotice(formatUiText(projectArchive ? 'projectArchiveImportFailed' : 'backupRestoreFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }

  const createIncremental = async () => {
    try {
      const base = await window.novelAPI.project.pickArchiveOpen()
      if (!base.ok || !base.data) { if (!base.ok) onNotice(formatUiText('backupIncrementalBaseFailed', { error: base.error.message })); return }
      const picked = await window.novelAPI.project.pickArchiveSave()
      if (!picked.ok || !picked.data) { if (!picked.ok) onNotice(formatUiText('backupIncrementalPickFailed', { error: picked.error.message })); return }
      setBusy(true)
      const result = await window.novelAPI.backup.createIncrementalArchive(picked.data, base.data)
      onNotice(result.ok ? formatUiText('backupIncrementalCreated', { path: result.data }) : formatUiText('backupIncrementalCreateFailed', { error: result.error.message }))
    } catch (error) { onNotice(formatUiText('backupIncrementalCreateFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }

  const restoreIncremental = async () => {
    try {
      const base = await window.novelAPI.project.pickArchiveOpen()
      if (!base.ok || !base.data) { if (!base.ok) onNotice(formatUiText('backupIncrementalBaseFailed', { error: base.error.message })); return }
      const increment = await window.novelAPI.project.pickArchiveOpen()
      if (!increment.ok || !increment.data) { if (!increment.ok) onNotice(formatUiText('backupIncrementalPickFailed', { error: increment.error.message })); return }
      const destination = await window.novelAPI.project.pickDirectory()
      if (!destination.ok || !destination.data) { if (!destination.ok) onNotice(formatUiText('backupPickDirectoryFailed', { error: destination.error.message })); return }
      setBusy(true)
      const result = await window.novelAPI.backup.restoreIncrementalArchive(base.data, increment.data, destination.data)
      onNotice(result.ok ? formatUiText('backupRestoreCompleted', { path: result.data }) : formatUiText('backupIncrementalRestoreFailed', { error: result.error.message }))
    } catch (error) { onNotice(formatUiText('backupIncrementalRestoreFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }

  const repair = async () => {
    try {
      setBusy(true)
      const result = await window.novelAPI.project.repairIndexes()
      const summary = result.ok ? formatUiText('backupRepairSummary', { documents: result.data.documents, entities: result.data.entities, relations: result.data.relations, embeddings: result.data.embeddingsRemoved ? formatUiText('backupEmbeddingsRemoved', { count: result.data.embeddingsRemoved }) : '' }) : ''
      onNotice(result.ok ? formatUiText('indexesRepaired', { summary }) : formatUiText('indexRepairFailed', { error: result.error.message }))
    } catch (error) { onNotice(formatUiText('indexRepairFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!action) return
    const run = action === 'project-export' ? () => create(true) : action === 'project-import' ? () => restore(true) : action === 'create' ? create : action === 'incremental' ? createIncremental : repair
    void run().finally(() => onActionHandled?.())
  }, [action])

  if (!controls) return null

  return <div className="backup-actions">
    <button disabled={busy} onClick={() => void create()}>{busy ? <Loader2 className="spin" size={14} /> : <Archive size={14} />} {uiText('backupCreate')}</button>
    {!showRestore && <button disabled={busy} onClick={() => void createIncremental()}><Archive size={14} /> {uiText('backupCreateIncremental')}</button>}
    {showRestore && <button disabled={busy} onClick={() => void restore()}><FolderOpen size={14} /> {uiText('backupRestore')}</button>}
    {showRestore && <button disabled={busy} onClick={() => void restoreIncremental()}><FolderOpen size={14} /> {uiText('backupRestoreIncremental')}</button>}
    {!showRestore && <button disabled={busy} onClick={() => void repair()}><Wrench size={14} /> {uiText('repairIndexes')}</button>}
  </div>
}
