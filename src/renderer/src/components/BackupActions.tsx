import { Archive, FolderOpen, Loader2, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'

export type BackupAction = 'create' | 'incremental' | 'repair'

type BackupActionsProps = {
  showRestore?: boolean
  onNotice: (message: string) => void
  action?: BackupAction | null
  onActionHandled?: () => void
  controls?: boolean
}

export function BackupActions({ showRestore = false, onNotice, action = null, onActionHandled, controls = true }: BackupActionsProps) {
  const [busy, setBusy] = useState(false)

  const create = async () => {
    try {
      const picked = await window.novelAPI.project.pickArchiveSave()
      if (!picked.ok || !picked.data) { if (!picked.ok) onNotice(`选择备份位置失败：${picked.error.message}`); return }
      setBusy(true)
      const result = await window.novelAPI.backup.createArchive(picked.data)
      onNotice(result.ok ? `备份已创建：${result.data}` : `备份失败：${result.error.message}`)
    } catch (error) { onNotice(`备份失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }

  const restore = async () => {
    try {
      const archive = await window.novelAPI.project.pickArchiveOpen()
      if (!archive.ok || !archive.data) { if (!archive.ok) onNotice(`选择备份失败：${archive.error.message}`); return }
      const destination = await window.novelAPI.project.pickDirectory()
      if (!destination.ok || !destination.data) { if (!destination.ok) onNotice(`选择恢复目录失败：${destination.error.message}`); return }
      setBusy(true)
      const result = await window.novelAPI.backup.restoreArchive(archive.data, destination.data)
      onNotice(result.ok ? `恢复完成，请打开项目：${result.data}` : `恢复失败：${result.error.message}`)
    } catch (error) { onNotice(`恢复失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }

  const createIncremental = async () => {
    try {
      const base = await window.novelAPI.project.pickArchiveOpen()
      if (!base.ok || !base.data) { if (!base.ok) onNotice(`选择全量基准失败：${base.error.message}`); return }
      const picked = await window.novelAPI.project.pickArchiveSave()
      if (!picked.ok || !picked.data) { if (!picked.ok) onNotice(`选择增量备份位置失败：${picked.error.message}`); return }
      setBusy(true)
      const result = await window.novelAPI.backup.createIncrementalArchive(picked.data, base.data)
      onNotice(result.ok ? `增量备份已创建：${result.data}` : `增量备份失败：${result.error.message}`)
    } catch (error) { onNotice(`增量备份失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }

  const restoreIncremental = async () => {
    try {
      const base = await window.novelAPI.project.pickArchiveOpen()
      if (!base.ok || !base.data) { if (!base.ok) onNotice(`选择全量基准失败：${base.error.message}`); return }
      const increment = await window.novelAPI.project.pickArchiveOpen()
      if (!increment.ok || !increment.data) { if (!increment.ok) onNotice(`选择增量备份失败：${increment.error.message}`); return }
      const destination = await window.novelAPI.project.pickDirectory()
      if (!destination.ok || !destination.data) { if (!destination.ok) onNotice(`选择恢复目录失败：${destination.error.message}`); return }
      setBusy(true)
      const result = await window.novelAPI.backup.restoreIncrementalArchive(base.data, increment.data, destination.data)
      onNotice(result.ok ? `增量恢复完成，请打开项目：${result.data}` : `增量恢复失败：${result.error.message}`)
    } catch (error) { onNotice(`增量恢复失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }

  const repair = async () => {
    try {
      setBusy(true)
      const result = await window.novelAPI.project.repairIndexes()
      onNotice(result.ok ? `索引已修复：${result.data.documents} 章、${result.data.entities} 个实体、${result.data.relations} 条关系${result.data.embeddingsRemoved ? `；清理 Embedding ${result.data.embeddingsRemoved} 条` : ''}${result.data.restoredSources.length ? `；恢复源文件：${result.data.restoredSources.join('、')}` : ''}` : `索引修复失败：${result.error.message}`)
    } catch (error) { onNotice(`索引修复失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!action) return
    const run = action === 'create' ? create : action === 'incremental' ? createIncremental : repair
    void run().finally(() => onActionHandled?.())
  }, [action])

  if (!controls) return null

  return <div className="backup-actions">
    <button disabled={busy} onClick={() => void create()}>{busy ? <Loader2 className="spin" size={14} /> : <Archive size={14} />} 创建备份</button>
    {!showRestore && <button disabled={busy} onClick={() => void createIncremental()}><Archive size={14} /> 创建增量</button>}
    {showRestore && <button disabled={busy} onClick={() => void restore()}><FolderOpen size={14} /> 从备份恢复</button>}
    {showRestore && <button disabled={busy} onClick={() => void restoreIncremental()}><FolderOpen size={14} /> 恢复增量</button>}
    {!showRestore && <button disabled={busy} onClick={() => void repair()}><Wrench size={14} /> 修复索引</button>}
  </div>
}
