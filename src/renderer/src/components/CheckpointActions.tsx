import { Check, History, Loader2, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CheckpointSummary } from '../../../shared/checkpoint'
import { useUiText } from '../lib/i18n'

export function CheckpointActions({ onNotice }: { onNotice: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [items, setItems] = useState<CheckpointSummary[]>([])
  const [busy, setBusy] = useState(false)
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))

  const load = async () => {
    try {
      const result = await window.novelAPI.checkpoint.list()
      if (result.ok) setItems(result.data)
      else onNotice(formatUiText('checkpointReadFailed', { error: result.error.message }))
    } catch (error) { onNotice(formatUiText('checkpointReadFailed', { error: error instanceof Error ? error.message : String(error) })) }
  }
  useEffect(() => { if (open) void load() }, [open])

  const create = async () => {
    if (!name.trim()) { onNotice(uiText('checkpointNameRequired')); return }
    try {
      setBusy(true)
      const result = await window.novelAPI.checkpoint.create(name)
      if (!result.ok) { onNotice(formatUiText('checkpointCreateFailed', { error: result.error.message })); return }
      setName(''); await load(); onNotice(formatUiText('checkpointCreated', { name: result.data.name }))
    } catch (error) { onNotice(formatUiText('checkpointCreateFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }
  const restore = async (item: CheckpointSummary) => {
    if (!window.confirm(formatUiText('checkpointRestoreConfirm', { name: item.name }))) return
    try {
      setBusy(true)
      const result = await window.novelAPI.checkpoint.restore(item.id)
      if (!result.ok) { onNotice(formatUiText('checkpointRestoreFailed', { error: result.error.message })); return }
      onNotice(formatUiText('checkpointRestored', { name: result.data.name }))
    } catch (error) { onNotice(formatUiText('checkpointRestoreFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }

  return <div className="checkpoint-actions"><button disabled={busy} onClick={() => setOpen((value) => !value)} title={uiText('checkpointCreateOrRestore')}>{busy ? <Loader2 className="spin" size={14} /> : <History size={14} />} Checkpoint</button>{open && <div className="checkpoint-popover"><div className="checkpoint-create"><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void create()} placeholder={uiText('checkpointNamePlaceholder')} /><button onClick={() => void create()} disabled={busy}><Check size={13} /> {uiText('checkpointCreate')}</button></div><div className="checkpoint-list">{items.length === 0 ? <small>{uiText('checkpointEmpty')}</small> : items.map((item) => <div className="checkpoint-item" key={item.id}><div><b>{item.name}</b><small>{new Date(item.createdAt).toLocaleString()} · {formatUiText('checkpointFileCount', { count: item.fileCount })}</small></div><button onClick={() => void restore(item)} disabled={busy} title={uiText('checkpointRestoreTitle')}><RotateCcw size={13} /></button></div>)}</div></div>}</div>
}
