import { Download, FileUp, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ExportFormat } from '../../../shared/chapter'
import { useAppStore } from '../store/app-store'

const formats: Array<{ value: ExportFormat; label: string }> = [
  { value: 'markdown', label: 'MD' },
  { value: 'plain', label: 'TXT' },
  { value: 'html', label: 'HTML' }
]

export type ImportExportAction = 'import' | ExportFormat

export function ImportExportActions({ onNotice, action, onActionHandled, controls = true }: { onNotice: (message: string) => void; action?: ImportExportAction | null; onActionHandled?: () => void; controls?: boolean }) {
  const [busy, setBusy] = useState(false)
  const importChapter = async () => {
    try {
      const picked = await window.novelAPI.project.pickTextImport()
      if (!picked.ok || !picked.data) { if (!picked.ok) onNotice(`选择导入文件失败：${picked.error.message}`); return }
      setBusy(true)
      const result = await window.novelAPI.chapter.importFile(picked.data)
      if (result.ok) { await useAppStore.getState().loadChapters(); await useAppStore.getState().openChapter(result.data.relPath) }
      onNotice(result.ok ? `已导入章节：${result.data.title}` : `导入失败：${result.error.message}`)
    } catch (error) { onNotice(`导入失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }
  const exportChapters = async (format: ExportFormat) => {
    try {
      const picked = await window.novelAPI.project.pickExportSave(format)
      if (!picked.ok || !picked.data) { if (!picked.ok) onNotice(`选择导出位置失败：${picked.error.message}`); return }
      setBusy(true)
      const result = await window.novelAPI.chapter.exportAll(format, picked.data)
      onNotice(result.ok ? `已导出 ${result.data.chapterCount} 个章节：${result.data.destination}` : `导出失败：${result.error.message}`)
    } catch (error) { onNotice(`导出失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (!action) return
    if (action === 'import') void importChapter()
    else void exportChapters(action)
    onActionHandled?.()
  }, [action])
  if (!controls) return null
  return <div className="import-export-actions">
    <button disabled={busy} onClick={() => void importChapter()} title="导入 Markdown/TXT 章节">{busy ? <Loader2 className="spin" size={14} /> : <FileUp size={14} />} 导入</button>
    <span className="import-export-label"><Download size={13} /> 导出</span>
    {formats.map((format) => <button key={format.value} disabled={busy} onClick={() => void exportChapters(format.value)} title={`导出全部章节为 ${format.value}`}>{format.label}</button>)}
  </div>
}
