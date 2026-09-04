import { useEffect, useState } from 'react'
import { Check, ChevronDown, ImagePlus, Loader2, Plus, RefreshCw, Save, Star, WandSparkles, X } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import type { ImageResult, SceneProposal } from '../../../shared/image'

type PreviewableImage = ImageResult & { previewUrl?: string }

function proposalRows(scene: SceneProposal): Array<[string, string | undefined]> { return [['主体', scene.subject], ['镜头', scene.camera], ['构图', scene.composition], ['光线', scene.lighting]] }
function unavailableImage(assetId: string): string { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" rx="12" fill="#211c36"/><text x="28" y="168" fill="#c6b8ff" font-family="sans-serif" font-size="24">图片资产不可用</text><text x="28" y="208" fill="#8f86a8" font-family="monospace" font-size="15">${assetId}</text></svg>`)}` }

export function IllustrationStudio() {
  const activeRelPath = useAppStore((state) => state.activeRelPath)
  const selectedSceneId = useAppStore((state) => state.selectedSceneId)
  const project = useAppStore((state) => state.project)
  const [prompt, setPrompt] = useState(''); const [negativePrompt, setNegativePrompt] = useState(''); const [caption, setCaption] = useState('')
  const [artDirection, setArtDirection] = useState(''); const [artDirectionDraft, setArtDirectionDraft] = useState(''); const [artOpen, setArtOpen] = useState(false)
  const [variants, setVariants] = useState(4); const [assets, setAssets] = useState<PreviewableImage[]>([]); const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]); const [previewAsset, setPreviewAsset] = useState<PreviewableImage | null>(null); const [scene, setScene] = useState<SceneProposal | null>(null)
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [savingArt, setSavingArt] = useState(false)

  const previewUrl = (bytes: Uint8Array, mimeType: string): string => { const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); return URL.createObjectURL(new Blob([copy.buffer], { type: mimeType })) }

  useEffect(() => { const value = project?.manifest.artDirection ?? ''; setArtDirection(value); setArtDirectionDraft(value) }, [project])
  const reload = async (showMessage = false): Promise<boolean> => {
    setMessage(showMessage ? '正在刷新资产列表…' : '')
    try {
      const result = await window.novelAPI.image.listAssets()
      if (!result.ok) { setMessage(`刷新失败：${result.error.message}`); return false }
      const hydrated = await Promise.all(result.data.map(async (asset) => {
        try {
          const preview = await window.novelAPI.image.readAsset(asset.assetId)
          return preview.ok ? { ...asset, previewUrl: previewUrl(preview.data.bytes, preview.data.mimeType) } : asset
        } catch { return asset }
      }))
      setAssets(hydrated)
      if (showMessage) setMessage(`资产列表已刷新，共 ${hydrated.length} 个资产。`)
      return true
    } catch (error) {
      setMessage(`刷新失败：${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }
  useEffect(() => { void reload() }, [])
  const propose = async () => {
    if (!activeRelPath) { setMessage('请先在左侧 CHAPTERS 中打开一个章节'); return }
    setBusy(true); setMessage('正在从章节提取场景并编译视觉 Prompt…')
    try {
      const result = await window.novelAPI.image.proposeScene(activeRelPath, selectedSceneId ?? undefined)
      if (!result.ok) { setMessage(`场景提案失败：${result.error.message}`); return }
      setScene(result.data); setPrompt(result.data.suggestedPrompt); setNegativePrompt(result.data.negativePrompt); setCaption(result.data.title); setMessage('场景提案已生成。请检查视觉设定与 Prompt 后再生成图片。')
    } catch (error) { setMessage(`场景提案失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }
  const saveArtDirection = async () => {
    setSavingArt(true); setMessage('保存视觉设定中…')
    try {
      const result = await window.novelAPI.project.setArtDirection(artDirectionDraft)
      if (!result.ok) { setMessage(`保存视觉设定失败：${result.error.message}`); return }
      // Keep the app-level project snapshot in sync. Otherwise leaving and
      // re-entering Illustration Studio rehydrates the editor from the old
      // manifest value and appears to undo a successful save.
      useAppStore.setState({ project: result.data })
      setArtDirection(result.data.manifest.artDirection); setArtDirectionDraft(result.data.manifest.artDirection); setArtOpen(false); setMessage('Art Direction 已保存，后续场景提案会使用最新视觉设定。')
    } catch (error) { setMessage(`保存视觉设定失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setSavingArt(false) }
  }
  const generate = async () => { if (!prompt.trim()) { setMessage('请先生成场景提案或填写 Prompt'); return }; setBusy(true); setMessage(`正在生成 ${variants} 个变体…`); try { const result = await window.novelAPI.image.generate({ sceneId: scene?.id, prompt, negativePrompt, variants, references: [], aspectRatio: '16:9' }); if (!result.ok) { setMessage(`生成失败：${result.error.message}`); return }; if (result.data.length === 0) { setMessage('生成失败：Provider 没有返回图片结果'); return }; await reload(); setSelectedAssetId(result.data[0].assetId); setMessage(`已生成 ${result.data.length} 个变体，请选择一张插入。`) } catch (error) { setMessage(`生成失败：${error instanceof Error ? error.message : String(error)}`) } finally { setBusy(false) } }
  const insert = async () => {
    if (!activeRelPath) { setMessage('请先在左侧打开一个章节'); return }
    const asset = assets.find((item) => item.assetId === selectedAssetId)
    if (!asset) { setMessage('请先选择一张图片'); return }
    setBusy(true); setMessage('正在插入图片到当前章节…')
    try {
      const result = await window.novelAPI.image.insertIntoChapter(activeRelPath, asset.assetId, caption.trim() || scene?.title || 'Illustration')
      if (!result.ok) { setMessage(`插入失败：${result.error.message}`); return }
      try {
        await useAppStore.getState().openChapter(activeRelPath)
        setMessage('已插入当前章节，并保留 Asset 引用。')
      } catch (error) {
        setMessage(`图片已写入 Markdown，但编辑器刷新失败：${error instanceof Error ? error.message : String(error)}`)
      }
    } catch (error) { setMessage(`插入失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }
  const deleteAsset = async (asset: ImageResult) => {
    if (!window.confirm('删除后将移除本地图片、资产 YAML 和索引记录，确定继续吗？')) return
    setBusy(true); setMessage('正在删除图片资产…')
    try {
      const result = await window.novelAPI.image.deleteAsset(asset.assetId)
      if (!result.ok) { setMessage(`删除失败：${result.error.message}`); return }
      const refreshed = await reload()
      setFavoriteIds((ids) => ids.filter((id) => id !== asset.assetId))
      if (selectedAssetId === asset.assetId) setSelectedAssetId(null)
      setMessage(refreshed ? '图片资产已删除。' : '图片资产已删除，但列表刷新失败。')
    } catch (error) { setMessage(`删除失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }
  const selectedAsset = assets.find((item) => item.assetId === selectedAssetId)
  if (!activeRelPath) return <main className="illustration-shell illustration-empty-state"><ImagePlus size={28} /><h2>Illustration Studio</h2><p>请先在左侧 CHAPTERS 中打开一个章节。</p></main>
  return <main className="illustration-shell">
    <header><div><b>Illustration Studio</b><small>{activeRelPath} · Visual Consistency 工作台</small></div><button data-testid="illustration-propose" onClick={() => void propose()} disabled={busy}><WandSparkles size={14} /> 从当前章节提案</button></header>
    <div className="illustration-body">
      <section className="illustration-compose">
        <div className="studio-step"><span>01</span><div><b>Visual Setup</b><small>先确认全书风格，再提取当前章节镜头</small></div></div>
        <div className="art-direction-panel"><button className="studio-disclosure" onClick={() => setArtOpen((value) => !value)}><div><b>Art Direction</b><small>{artDirection || '尚未设置全书视觉风格'}</small></div>{artOpen ? <X size={14} /> : <ChevronDown size={14} />}</button>{artOpen && <div className="art-direction-editor"><textarea value={artDirectionDraft} onChange={(event) => setArtDirectionDraft(event.target.value)} placeholder="例如：儿童绘本，柔和水彩，深蓝与月光金为主色，梦幻、安静，不出现文字和水印" /><div><button onClick={() => { setArtDirectionDraft(artDirection); setArtOpen(false) }}>取消</button><button className="primary" onClick={() => void saveArtDirection()} disabled={savingArt}>{savingArt ? <Loader2 className="spin" size={14} /> : <Save size={14} />} 保存视觉设定</button></div></div>}</div>
        <div className="studio-step"><span>02</span><div><b>Scene Proposal</b><small>从当前章节提取值得插图的场景</small></div></div>
        {scene && <div className="scene-proposal"><b>{scene.title}</b><p>{scene.description}</p>{proposalRows(scene).map(([label, value]) => value && <div className="proposal-row" key={label}><span>{label}</span><em>{value}</em></div>)}{(scene.visualAnchors ?? []).length > 0 && <div className="visual-chips">{scene.visualAnchors?.map((item) => <span key={item}>{item}</span>)}</div>}</div>}
        <label>Compiled Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="点击“从当前章节提案”，或手动描述镜头、角色和场景" /></label><label>Negative Prompt<textarea className="negative-prompt" value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} /></label><label>插入图注<input className="caption-input" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="例如：月亮草原上的小牛" /></label>
        <div className="generation-options"><label>变体数量<select value={variants} onChange={(event) => setVariants(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} 张</option>)}</select></label><span>Image Model：当前项目图片 Provider</span></div><button data-testid="illustration-generate" className="primary generate-button" onClick={() => void generate()} disabled={busy || !prompt.trim()}>{busy ? <Loader2 className="spin" size={15} /> : <ImagePlus size={15} />} {busy ? '生成中…' : 'Generate Variants'}</button>{message && <p className="image-message" role="status">{message}</p>}
      </section>
      <section className="asset-library"><div className="studio-step"><span>03</span><div><b>Review & Insert</b><small>查看 provenance，选择并插入章节</small></div><button data-testid="illustration-refresh" className="icon-action" onClick={() => void reload(true)} title="刷新资产"><RefreshCw size={14} /></button></div><div className="asset-grid">{assets.map((asset) => <article className={`asset-card ${selectedAssetId === asset.assetId ? 'selected' : ''}`} key={asset.assetId}><button className="asset-select" onClick={() => setSelectedAssetId(asset.assetId)}><div className="asset-preview" title={asset.prompt}>{asset.previewUrl ? <img src={asset.previewUrl} alt={asset.prompt} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = unavailableImage(asset.assetId); event.currentTarget.alt = `图片资产不可用：${asset.assetId}` }} /> : <span>{asset.mimeType.replace('image/', '').toUpperCase()}</span>}{selectedAssetId === asset.assetId && <i><Check size={14} /></i>}</div><div className="asset-meta"><div className="asset-id-row"><b title={asset.assetId}>ID · {asset.assetId.slice(-8)}</b><span>{asset.mimeType.replace('image/', '').toUpperCase()}</span></div><small className="asset-details" title={`${asset.provider} / ${asset.model}`}>{asset.provider} · {asset.model}</small></div></button><div className="asset-card-actions"><button onClick={() => setFavoriteIds((ids) => ids.includes(asset.assetId) ? ids.filter((id) => id !== asset.assetId) : [...ids, asset.assetId])} title="收藏"><Star size={13} fill={favoriteIds.includes(asset.assetId) ? 'currentColor' : 'none'} /><span>收藏</span></button><button onClick={() => setPreviewAsset(asset)} title="查看大图">查看</button><button data-testid="illustration-delete" onClick={() => void deleteAsset(asset)} title="删除图片">删除</button></div></article>)}</div>{assets.length === 0 && <div className="asset-empty">还没有图片。先生成场景变体，结果会显示在这里。</div>}{selectedAsset && <div className="asset-provenance"><b>Asset provenance</b><span>{selectedAsset.provider} · {selectedAsset.model}</span><span>{selectedAsset.seed === undefined ? 'seed 未返回' : `seed ${selectedAsset.seed}`} · {selectedAsset.createdAt}</span><small>{selectedAsset.relPath}</small></div>}<label className="retry-label">需要换一批？<button onClick={() => void generate()} disabled={busy || !prompt.trim()}><RefreshCw size={13} /> 重新生成</button></label><button data-testid="illustration-insert" className="insert-asset-button" onClick={() => void insert()} disabled={!selectedAssetId || busy}><Plus size={14} /> 插入选中的图片</button></section>
    </div>
    {previewAsset && <div className="asset-preview-modal" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setPreviewAsset(null)}><div onClick={(event) => event.stopPropagation()}><button onClick={() => setPreviewAsset(null)} aria-label="关闭预览"><X size={16} /></button>{previewAsset.previewUrl && <img src={previewAsset.previewUrl} alt={previewAsset.prompt} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = unavailableImage(previewAsset.assetId); event.currentTarget.alt = `图片资产不可用：${previewAsset.assetId}` }} />}<small>{previewAsset.prompt}</small></div></div>}
  </main>
}
