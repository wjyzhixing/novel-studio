import { Download, FileUp, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ExportFormat } from '../../../shared/chapter'
import type { ExtensionRegistrySnapshot } from '../../../shared/extensions'
import { useAppStore } from '../store/app-store'
import { useUiText } from '../lib/i18n'

const formats: Array<{ value: ExportFormat; label: string }> = [
  { value: 'markdown', label: 'MD' },
  { value: 'plain', label: 'TXT' },
  { value: 'html', label: 'HTML' }
]

export type ImportExportAction = 'import' | ExportFormat

export function ImportExportActions({ onNotice, action, onActionHandled, controls = true }: { onNotice: (message: string) => void; action?: ImportExportAction | null; onActionHandled?: () => void; controls?: boolean }) {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  const [busy, setBusy] = useState(false)
  const [cleanImageMetadata, setCleanImageMetadata] = useState(true)
  const [extensions, setExtensions] = useState<ExtensionRegistrySnapshot>({ manifests: [], providers: [], workflowNodes: [], importers: [], exporters: [] })
  useEffect(() => { void window.novelAPI.extensions.list().then((result) => { if (result.ok) setExtensions(result.data) }) }, [])
  const importerExtensions = useMemo(() => [...new Set(extensions.importers.flatMap((importer) => importer.extensions))], [extensions.importers])
  const availableFormats = useMemo(() => [...formats, ...extensions.exporters.map((exporter) => ({ value: exporter.format, label: exporter.label }))], [extensions.exporters])
  const importChapter = async () => {
    try {
      const picked = await window.novelAPI.project.pickTextImport(importerExtensions)
      if (!picked.ok || !picked.data) { if (!picked.ok) onNotice(formatUiText('importPickFailed', { error: picked.error.message })); return }
      setBusy(true)
      const result = await window.novelAPI.chapter.importFile(picked.data)
      if (result.ok) { await useAppStore.getState().loadChapters(); await useAppStore.getState().openChapter(result.data.relPath) }
      onNotice(result.ok ? formatUiText('importedChapter', { title: result.data.title }) : formatUiText('importFailed', { error: result.error.message }))
    } catch (error) { onNotice(formatUiText('importFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }
  const exportChapters = async (format: ExportFormat) => {
    try {
      const picked = await window.novelAPI.project.pickExportSave(format)
      if (!picked.ok || !picked.data) { if (!picked.ok) onNotice(formatUiText('exportPickFailed', { error: picked.error.message })); return }
      setBusy(true)
      const result = await window.novelAPI.chapter.exportAll(format, picked.data, { cleanImageMetadata })
      onNotice(result.ok ? formatUiText('exportedChapters', { count: result.data.chapterCount, destination: result.data.destination }) : formatUiText('exportedFailed', { error: result.error.message }))
    } catch (error) { onNotice(formatUiText('exportedFailed', { error: error instanceof Error ? error.message : String(error) })) }
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
    <button disabled={busy} onClick={() => void importChapter()} title={uiText('importMarkdownTitle')}>{busy ? <Loader2 className="spin" size={14} /> : <FileUp size={14} />} {uiText('importChapter')}</button>
    <span className="import-export-label"><Download size={13} /> {uiText('exportChapters')}</span>
    <label className="export-metadata-toggle" title={uiText('cleanImageMetadataHint')}><input type="checkbox" checked={cleanImageMetadata} onChange={(event) => setCleanImageMetadata(event.target.checked)} /> {uiText('cleanImageMetadata')}</label>
    {availableFormats.map((format) => <button key={format.value} disabled={busy} onClick={() => void exportChapters(format.value)} title={formatUiText('exportAllTitle', { format: format.value })}>{format.label}</button>)}
  </div>
}
