import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { useUiText } from '../lib/i18n'

function paragraphCount(markdown: string): number {
  return markdown.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).length
}

export function ScenePanel() {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), uiText(key))
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
  const [title, setTitle] = useState(() => uiText('sceneDefaultName'))
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
    const ok = await createScene({ title: title.trim() || uiText('createScene'), startParagraph: Math.max(0, Math.min(startParagraph, Math.max(0, paragraphTotal - 1))), endParagraph: Math.max(0, Math.min(endParagraph, Math.max(0, paragraphTotal - 1))), summary })
    if (ok) setOpen(true)
  }

  const save = () => selected && void updateScene({ id: selected.id, title: title.trim(), startParagraph, endParagraph, summary })
  const remove = () => selected && window.confirm(formatUiText('sceneDeleteConfirm', { name: selected.title })) && void deleteScene(selected.id)
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= scenes.length) return
    const ids = scenes.map((scene) => scene.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void reorderScenes(ids)
  }

  return <section className="scene-panel">
    <div className="scene-panel-header"><div><b>{uiText('sceneTitle')}</b><small>{formatUiText('sceneCount', { count: scenes.length })} · {formatUiText('sceneParagraphCount', { count: paragraphTotal })}</small></div><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? uiText('sceneCollapse') : uiText('manageScenes')}</button></div>
    {open && <div className="scene-panel-body">
      <div className="scene-list" role="list" aria-label={uiText('sceneList')}>
        {scenes.map((scene, index) => <div className={scene.id === selectedSceneId ? 'scene-row active' : 'scene-row'} role="listitem" key={scene.id}><button type="button" className="scene-select" onClick={() => selectScene(scene.id)}><span><strong>{scene.order + 1}. {scene.title}</strong><small>{formatUiText('sceneParagraphRange', { start: scene.startParagraph + 1, end: scene.endParagraph + 1 })}</small></span></button><div className="scene-reorder"><button type="button" aria-label={`↑ ${scene.title}`} onClick={() => move(index, -1)} disabled={sceneBusy || index === 0}><ArrowUp size={11} /></button><button type="button" aria-label={`↓ ${scene.title}`} onClick={() => move(index, 1)} disabled={sceneBusy || index === scenes.length - 1}><ArrowDown size={11} /></button></div></div>)}
        {scenes.length === 0 && <small className="scene-empty">{uiText('sceneEmpty')}</small>}
      </div>
      <div className="scene-editor">
        <label>{uiText('sceneName')}<input value={title} onChange={(event) => setTitle(event.target.value)} disabled={sceneBusy} maxLength={200} /></label>
        <div className="scene-range"><label>{uiText('sceneStartParagraph')}<input type="number" min={0} max={Math.max(0, paragraphTotal - 1)} value={startParagraph} onChange={(event) => setStartParagraph(Number(event.target.value))} disabled={sceneBusy} /></label><label>{uiText('sceneEndParagraph')}<input type="number" min={0} max={Math.max(0, paragraphTotal - 1)} value={endParagraph} onChange={(event) => setEndParagraph(Number(event.target.value))} disabled={sceneBusy} /></label></div>
        <label>{uiText('sceneSummary')}<textarea value={summary} onChange={(event) => setSummary(event.target.value)} disabled={sceneBusy} maxLength={20_000} /></label>
        <div className="scene-actions"><button type="button" className="primary" onClick={selected ? save : create} disabled={sceneBusy || paragraphTotal === 0}><Save size={13} />{selected ? uiText('saveScene') : <><Plus size={13} />{uiText('createScene')}</>}</button>{selected && <button type="button" onClick={remove} disabled={sceneBusy} title={uiText('sceneDeleteHint')}><Trash2 size={13} />{uiText('deleteScene')}</button>}</div>
      </div>
      {sceneMessage && <div className="scene-message" role="status">{sceneMessage}</div>}
    </div>}
  </section>
}
