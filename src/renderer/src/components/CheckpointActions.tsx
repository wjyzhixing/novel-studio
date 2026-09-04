import { Check, History, Loader2, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CheckpointSummary } from '../../../shared/checkpoint'

export function CheckpointActions({ onNotice }: { onNotice: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [items, setItems] = useState<CheckpointSummary[]>([])
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const result = await window.novelAPI.checkpoint.list()
      if (result.ok) setItems(result.data)
      else onNotice(`读取 Checkpoint 失败：${result.error.message}`)
    } catch (error) { onNotice(`读取 Checkpoint 失败：${error instanceof Error ? error.message : String(error)}`) }
  }
  useEffect(() => { if (open) void load() }, [open])

  const create = async () => {
    if (!name.trim()) { onNotice('请输入 Checkpoint 名称'); return }
    try {
      setBusy(true)
      const result = await window.novelAPI.checkpoint.create(name)
      if (!result.ok) { onNotice(`创建 Checkpoint 失败：${result.error.message}`); return }
      setName(''); await load(); onNotice(`Checkpoint 已创建：${result.data.name}`)
    } catch (error) { onNotice(`创建 Checkpoint 失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }
  const restore = async (item: CheckpointSummary) => {
    if (!window.confirm(`恢复“${item.name}”会覆盖项目内容文件，确定继续吗？`)) return
    try {
      setBusy(true)
      const result = await window.novelAPI.checkpoint.restore(item.id)
      if (!result.ok) { onNotice(`恢复 Checkpoint 失败：${result.error.message}`); return }
      onNotice(`Checkpoint 已恢复：${result.data.name}。请重新打开当前章节。`)
    } catch (error) { onNotice(`恢复 Checkpoint 失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }

  return <div className="checkpoint-actions"><button disabled={busy} onClick={() => setOpen((value) => !value)} title="创建或恢复命名检查点">{busy ? <Loader2 className="spin" size={14} /> : <History size={14} />} Checkpoint</button>{open && <div className="checkpoint-popover"><div className="checkpoint-create"><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void create()} placeholder="例如：第一卷定稿" /><button onClick={() => void create()} disabled={busy}><Check size={13} /> 创建</button></div><div className="checkpoint-list">{items.length === 0 ? <small>暂无命名 Checkpoint</small> : items.map((item) => <div className="checkpoint-item" key={item.id}><div><b>{item.name}</b><small>{new Date(item.createdAt).toLocaleString()} · {item.fileCount} 个文件</small></div><button onClick={() => void restore(item)} disabled={busy} title="恢复此 Checkpoint"><RotateCcw size={13} /></button></div>)}</div></div>}</div>
}
