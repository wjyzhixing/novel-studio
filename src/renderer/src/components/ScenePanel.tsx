import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/app-store'

function paragraphCount(markdown: string): number {
  return markdown.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).length
}

export function ScenePanel() {
  const scenes = useAppStore((state) => state.scenes)
  const selectedSceneId = useAppStore((state) => state.selectedSceneId)
  const editorMarkdown = useAppStore((state) => state.editorMarkdown)
  const sceneBusy = useAppStore((state) => state.sceneBusy)
  const sceneMessage = useAppStore((state) => state.sceneMessage)
  const selectScene = useAppStore((state) => state.selectScene)
  const createScene = useAppStore((state) => state.createScene)
  const updateScene = useAppStore((state) => state.updateScene)
  const deleteScene = useAppStore((state) => state.deleteScene)
  const reorderScenes = useAppStore((state) => state.reorderScenes)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('新场景')
  const [summary, setSummary] = useState('')
  const [startParagraph, setStartParagraph] = useState(0)
  const [endParagraph, setEndParagraph] = useState(0)
  const selected = scenes.find((scene) => scene.id === selectedSceneId) ?? null
  const paragraphTotal = paragraphCount(editorMarkdown)

  useEffect(() => {
    if (!selected) return
    setTitle(selected.title)
    setSummary(selected.summary)
    setStartParagraph(selected.startParagraph)
    setEndParagraph(selected.endParagraph)
  }, [selected])

  const create = async () => {
    const ok = await createScene({ title: title.trim() || '新场景', startParagraph: Math.max(0, Math.min(startParagraph, Math.max(0, paragraphTotal - 1))), endParagraph: Math.max(0, Math.min(endParagraph, Math.max(0, paragraphTotal - 1))), summary })
    if (ok) setOpen(true)
  }

  const save = () => selected && void updateScene({ id: selected.id, title: title.trim(), startParagraph, endParagraph, summary })
  const remove = () => selected && window.confirm(`确定删除场景“${selected.title}”吗？正文不会改变。`) && void deleteScene(selected.id)
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= scenes.length) return
    const ids = scenes.map((scene) => scene.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void reorderScenes(ids)
  }

  return <section className="scene-panel">
    <div className="scene-panel-header"><div><b>Scenes</b><small>{scenes.length} 个场景 · {paragraphTotal} 个段落</small></div><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? '收起' : '管理场景'}</button></div>
    {open && <div className="scene-panel-body">
      <div className="scene-list" role="list" aria-label="章节场景列表">
        {scenes.map((scene, index) => <div className={scene.id === selectedSceneId ? 'scene-row active' : 'scene-row'} role="listitem" key={scene.id}><button type="button" className="scene-select" onClick={() => selectScene(scene.id)}><span><strong>{scene.order + 1}. {scene.title}</strong><small>段落 {scene.startParagraph + 1}–{scene.endParagraph + 1}</small></span></button><div className="scene-reorder"><button type="button" aria-label={`上移 ${scene.title}`} onClick={() => move(index, -1)} disabled={sceneBusy || index === 0}><ArrowUp size={11} /></button><button type="button" aria-label={`下移 ${scene.title}`} onClick={() => move(index, 1)} disabled={sceneBusy || index === scenes.length - 1}><ArrowDown size={11} /></button></div></div>)}
        {scenes.length === 0 && <small className="scene-empty">还没有场景。场景只保存结构信息，不会改动正文。</small>}
      </div>
      <div className="scene-editor">
        <label>名称<input value={title} onChange={(event) => setTitle(event.target.value)} disabled={sceneBusy} maxLength={200} /></label>
        <div className="scene-range"><label>起始段落<input type="number" min={0} max={Math.max(0, paragraphTotal - 1)} value={startParagraph} onChange={(event) => setStartParagraph(Number(event.target.value))} disabled={sceneBusy} /></label><label>结束段落<input type="number" min={0} max={Math.max(0, paragraphTotal - 1)} value={endParagraph} onChange={(event) => setEndParagraph(Number(event.target.value))} disabled={sceneBusy} /></label></div>
        <label>摘要<textarea value={summary} onChange={(event) => setSummary(event.target.value)} disabled={sceneBusy} maxLength={20_000} /></label>
        <div className="scene-actions"><button type="button" className="primary" onClick={selected ? save : create} disabled={sceneBusy || paragraphTotal === 0}><Save size={13} />{selected ? '保存场景' : <><Plus size={13} />新建场景</>}</button>{selected && <button type="button" onClick={remove} disabled={sceneBusy} title="删除场景"><Trash2 size={13} />删除</button>}</div>
      </div>
      {sceneMessage && <div className="scene-message" role="status">{sceneMessage}</div>}
    </div>}
  </section>
}
