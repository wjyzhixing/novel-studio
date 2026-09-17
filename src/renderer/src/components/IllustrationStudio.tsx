import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ImagePlus, Loader2, Plus, RefreshCw, Save, Star, WandSparkles, X } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { useUiText } from '../lib/i18n'
import { useGlobalMessage } from '../lib/global-notification'
import { limitImageReferences, toggleImageReference } from '../lib/image-reference-model'
import { favoriteStorageKey, readFavorites, writeFavorites } from '../lib/image-favorites'
import type { ImageResult, SceneProposal } from '../../../shared/image'
import '../styles/illustration-studio.css'

type PreviewableImage = ImageResult & { previewUrl?: string }

function proposalRows(scene: SceneProposal, labels: [string, string, string, string]): Array<[string, string | undefined]> { return [[labels[0], scene.subject], [labels[1], scene.camera], [labels[2], scene.composition], [labels[3], scene.lighting]] }
function unavailableImage(assetId: string, unavailableLabel: string): string { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" rx="12" fill="#211c36"/><text x="28" y="168" fill="#c6b8ff" font-family="sans-serif" font-size="24">${unavailableLabel}</text><text x="28" y="208" fill="#8f86a8" font-family="monospace" font-size="15">${assetId}</text></svg>`)}` }

export function IllustrationStudio() {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  const proposalLabels: [string, string, string, string] = [uiText('proposalSubject'), uiText('proposalCamera'), uiText('proposalComposition'), uiText('proposalLighting')]
  const previewRef = useRef<HTMLDivElement | null>(null)
  const activeRelPath = useAppStore((state) => state.activeRelPath)
  const selectedSceneId = useAppStore((state) => state.selectedSceneId)
  const project = useAppStore((state) => state.project)
  const [prompt, setPrompt] = useState(''); const [negativePrompt, setNegativePrompt] = useState(''); const [caption, setCaption] = useState('')
  const [artDirection, setArtDirection] = useState(''); const [artDirectionDraft, setArtDirectionDraft] = useState(''); const [artOpen, setArtOpen] = useState(false)
  const [variants, setVariants] = useState(4); const [assets, setAssets] = useState<PreviewableImage[]>([]); const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null); const [referenceAssetIds, setReferenceAssetIds] = useState<string[]>([])
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]); const [previewAsset, setPreviewAsset] = useState<PreviewableImage | null>(null); const [scene, setScene] = useState<SceneProposal | null>(null)
  const skipFavoritePersistRef = useRef(false)
  const [message, setMessage] = useGlobalMessage(); const [busy, setBusy] = useState(false); const [savingArt, setSavingArt] = useState(false)

  useEffect(() => {
    if (!previewAsset) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const getFocusable = () => Array.from(previewRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
    const focusFrame = window.requestAnimationFrame(() => getFocusable()[0]?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPreviewAsset(null); return }
      if (event.key === 'Tab') {
        const focusable = getFocusable()
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [previewAsset])

  const previewUrl = (bytes: Uint8Array, mimeType: string): string => { const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); return URL.createObjectURL(new Blob([copy.buffer], { type: mimeType })) }

  useEffect(() => { const value = project?.manifest.artDirection ?? ''; setArtDirection(value); setArtDirectionDraft(value) }, [project])
  useEffect(() => { const rootPath = project?.rootPath; if (!rootPath || typeof localStorage === 'undefined') return; skipFavoritePersistRef.current = true; setFavoriteIds(readFavorites(localStorage, favoriteStorageKey(rootPath))) }, [project?.rootPath])
  useEffect(() => { const rootPath = project?.rootPath; if (!rootPath || typeof localStorage === 'undefined') return; if (skipFavoritePersistRef.current) { skipFavoritePersistRef.current = false; return }; writeFavorites(localStorage, favoriteStorageKey(rootPath), favoriteIds) }, [favoriteIds, project?.rootPath])
  const reload = async (showMessage = false): Promise<boolean> => {
    setMessage(showMessage ? uiText('refreshingAssets') : '')
    try {
      const result = await window.novelAPI.image.listAssets()
      if (!result.ok) { setMessage(formatUiText('refreshAssetsFailed', { error: result.error.message })); return false }
      const hydrated = await Promise.all(result.data.map(async (asset) => {
        try {
          const preview = await window.novelAPI.image.readAsset(asset.assetId)
          return preview.ok ? { ...asset, previewUrl: previewUrl(preview.data.bytes, preview.data.mimeType) } : asset
        } catch { return asset }
      }))
      setAssets(hydrated)
      setReferenceAssetIds((ids) => ids.filter((id) => hydrated.some((asset) => asset.assetId === id)))
      if (showMessage) setMessage(formatUiText('assetsRefreshed', { count: hydrated.length }))
      return true
    } catch (error) {
      setMessage(formatUiText('refreshAssetsFailed', { error: error instanceof Error ? error.message : String(error) }))
      return false
    }
  }
  useEffect(() => { void reload() }, [])
  const propose = async () => {
    if (!activeRelPath) { setMessage(uiText('chapterRequiredForIllustration')); return }
    setBusy(true); setMessage(uiText('sceneProposalGenerating'))
    try {
      const result = await window.novelAPI.image.proposeScene(activeRelPath, selectedSceneId ?? undefined)
      if (!result.ok) { setMessage(formatUiText('sceneProposalFailed', { error: result.error.message })); return }
      setScene(result.data); setPrompt(result.data.suggestedPrompt); setNegativePrompt(result.data.negativePrompt); setCaption(result.data.title); setMessage(uiText('sceneProposalGenerated'))
    } catch (error) { setMessage(formatUiText('sceneProposalFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }
  const saveArtDirection = async () => {
    setSavingArt(true); setMessage(uiText('artDirectionSaving'))
    try {
      const result = await window.novelAPI.project.setArtDirection(artDirectionDraft)
      if (!result.ok) { setMessage(formatUiText('artDirectionSaveFailed', { error: result.error.message })); return }
      // Keep the app-level project snapshot in sync. Otherwise leaving and
      // re-entering Illustration Studio rehydrates the editor from the old
      // manifest value and appears to undo a successful save.
      useAppStore.setState({ project: result.data })
      setArtDirection(result.data.manifest.artDirection); setArtDirectionDraft(result.data.manifest.artDirection); setArtOpen(false); setMessage(uiText('artDirectionSaved'))
    } catch (error) { setMessage(formatUiText('artDirectionSaveFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setSavingArt(false) }
  }
  const toggleReference = (assetId: string) => { if (!referenceAssetIds.includes(assetId) && referenceAssetIds.length >= 20) { setMessage(uiText('referenceLimitReached')); return }; setReferenceAssetIds((ids) => limitImageReferences(toggleImageReference(ids, assetId))) }
  const generate = async () => { if (!prompt.trim()) { setMessage(uiText('promptRequired')); return }; setBusy(true); setMessage(formatUiText('generating', {})); try { const result = await window.novelAPI.image.generate({ sceneId: scene?.id, prompt, negativePrompt, variants, references: referenceAssetIds, aspectRatio: '16:9' }); if (!result.ok) { setMessage(formatUiText('generationFailed', { error: result.error.message })); return }; if (result.data.length === 0) { setMessage(uiText('providerNoImages')); return }; await reload(); setSelectedAssetId(result.data[0].assetId); setMessage(formatUiText('variantsGenerated', { count: result.data.length })) } catch (error) { setMessage(formatUiText('generationFailed', { error: error instanceof Error ? error.message : String(error) })) } finally { setBusy(false) } }
  const insert = async () => {
    if (!activeRelPath) { setMessage(uiText('chapterRequiredForInsert')); return }
    const asset = assets.find((item) => item.assetId === selectedAssetId)
    if (!asset) { setMessage(uiText('imageRequired')); return }
    setBusy(true); setMessage(uiText('insertingImage'))
    try {
      const result = await window.novelAPI.image.insertIntoChapter(activeRelPath, asset.assetId, caption.trim() || scene?.title || 'Illustration')
      if (!result.ok) { setMessage(formatUiText('insertFailed', { error: result.error.message })); return }
      try {
        await useAppStore.getState().openChapter(activeRelPath)
        setMessage(uiText('imageInserted'))
      } catch (error) {
        setMessage(formatUiText('editorRefreshFailed', { error: error instanceof Error ? error.message : String(error) }))
      }
    } catch (error) { setMessage(formatUiText('insertFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }
  const deleteAsset = async (asset: ImageResult) => {
    if (!window.confirm(uiText('deleteAssetConfirm'))) return
    setBusy(true); setMessage(uiText('deletingAsset'))
    try {
      const result = await window.novelAPI.image.deleteAsset(asset.assetId)
      if (!result.ok) { setMessage(formatUiText('deleteFailed', { error: result.error.message })); return }
      const refreshed = await reload()
      setFavoriteIds((ids) => ids.filter((id) => id !== asset.assetId)); setReferenceAssetIds((ids) => ids.filter((id) => id !== asset.assetId))
      if (selectedAssetId === asset.assetId) setSelectedAssetId(null)
      setMessage(refreshed ? uiText('assetDeleted') : uiText('assetDeletedRefreshFailed'))
    } catch (error) { setMessage(formatUiText('deleteFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }
  const selectedAsset = assets.find((item) => item.assetId === selectedAssetId)
  if (!activeRelPath) return <main className="illustration-shell illustration-empty-state"><ImagePlus size={28} /><h2>{uiText('illustrationStudio')}</h2><p>{uiText('illustrationEmptyHint')}</p></main>
  return <main className="illustration-shell">
    <header><div><b>{uiText('illustrationStudio')}</b><small>{activeRelPath} · {uiText('visualConsistency')}</small></div><button data-testid="illustration-propose" onClick={() => void propose()} disabled={busy}><WandSparkles size={14} /> {uiText('proposeFromChapter')}</button></header>
    <div className="illustration-body">
      <section className="illustration-compose">
        <div className="studio-step"><span>01</span><div><b>{uiText('visualSetup')}</b><small>{uiText('visualSetupHint')}</small></div></div>
        <div className="art-direction-panel"><button className="studio-disclosure" onClick={() => setArtOpen((value) => !value)}><div><b>{uiText('artDirection')}</b><small>{artDirection || uiText('artDirectionUnset')}</small></div>{artOpen ? <X size={14} /> : <ChevronDown size={14} />}</button>{artOpen && <div className="art-direction-editor"><textarea value={artDirectionDraft} onChange={(event) => setArtDirectionDraft(event.target.value)} placeholder={uiText('artDirectionPlaceholder')} /><div><button onClick={() => { setArtDirectionDraft(artDirection); setArtOpen(false) }}>{uiText('cancel')}</button><button className="primary" onClick={() => void saveArtDirection()} disabled={savingArt}>{savingArt ? <Loader2 className="spin" size={14} /> : <Save size={14} />} {uiText('saveArtDirection')}</button></div></div>}</div>
        <div className="studio-step"><span>02</span><div><b>{uiText('sceneProposal')}</b><small>{uiText('sceneProposalHint')}</small></div></div>
        {scene && <div className="scene-proposal"><b>{scene.title}</b><p>{scene.description}</p>{proposalRows(scene, proposalLabels).map(([label, value]) => value && <div className="proposal-row" key={label}><span>{label}</span><em>{value}</em></div>)}{(scene.visualAnchors ?? []).length > 0 && <div className="visual-chips">{scene.visualAnchors?.map((item) => <span key={item}>{item}</span>)}</div>}</div>}
        <label>{uiText('compiledPrompt')}<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={uiText('compiledPromptPlaceholder')} /></label><label>{uiText('negativePrompt')}<textarea className="negative-prompt" value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} /></label><label>{uiText('illustrationCaption')}<input className="caption-input" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder={uiText('captionPlaceholder')} /></label>
        <section className="visual-bible-panel" aria-labelledby="visual-bible-title"><div className="visual-bible-heading"><div><b id="visual-bible-title">{uiText('visualBible')}</b><small>{uiText('referenceImagesHint')}</small></div><span>{formatUiText('referencesSelected', { count: referenceAssetIds.length })}</span></div><div className="visual-bible-strip">{referenceAssetIds.length === 0 ? <span className="visual-bible-empty">{uiText('referenceImages')}</span> : referenceAssetIds.map((id) => { const asset = assets.find((item) => item.assetId === id); return <button key={id} className="reference-chip" onClick={() => toggleReference(id)} title={uiText('removeReference')}><span>{asset ? asset.assetId.slice(-8) : id}</span><X size={11} /></button> })}</div><div className="reference-asset-list">{assets.map((asset) => <button key={asset.assetId} className={referenceAssetIds.includes(asset.assetId) ? 'reference-asset active' : 'reference-asset'} onClick={() => toggleReference(asset.assetId)} aria-pressed={referenceAssetIds.includes(asset.assetId)} title={referenceAssetIds.includes(asset.assetId) ? uiText('removeReference') : uiText('useAsReference')}><span>{asset.previewUrl ? <img src={asset.previewUrl} alt="" /> : <ImagePlus size={12} />}</span><b>{asset.assetId.slice(-8)}</b></button>)}</div></section><div className="generation-options"><label>{uiText('variants')}<select value={variants} onChange={(event) => setVariants(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} {uiText('variantsUnit')}</option>)}</select></label><span>{uiText('imageModel')}</span></div><button data-testid="illustration-generate" className="primary generate-button" onClick={() => void generate()} disabled={busy || !prompt.trim()}>{busy ? <Loader2 className="spin" size={15} /> : <ImagePlus size={15} />} {busy ? uiText('generating') : uiText('generateVariants')}</button>{message && <p className="image-message" role="status">{message}</p>}
      </section>
      <section className="asset-library"><div className="studio-step"><span>03</span><div><b>{uiText('reviewInsert')}</b><small>{uiText('reviewInsertHint')}</small></div><button data-testid="illustration-refresh" className="icon-action" onClick={() => void reload(true)} title={uiText('refreshAssets')}><RefreshCw size={14} /></button></div><div className="asset-grid">{assets.map((asset) => <article className={`asset-card ${selectedAssetId === asset.assetId ? 'selected' : ''}`} key={asset.assetId}><button className="asset-select" onClick={() => setSelectedAssetId(asset.assetId)}><div className="asset-preview" title={asset.prompt}>{asset.previewUrl ? <img src={asset.previewUrl} alt={asset.prompt} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = unavailableImage(asset.assetId, uiText('imageUnavailable')); event.currentTarget.alt = `${uiText('imageUnavailable')}：${asset.assetId}` }} /> : <span>{asset.mimeType.replace('image/', '').toUpperCase()}</span>}{selectedAssetId === asset.assetId && <i><Check size={14} /></i>}</div><div className="asset-meta"><div className="asset-id-row"><b title={asset.assetId}>ID · {asset.assetId.slice(-8)}</b><span>{asset.mimeType.replace('image/', '').toUpperCase()}</span></div><small className="asset-details" title={`${asset.provider} / ${asset.model}`}>{asset.provider} · {asset.model}</small></div></button><div className="asset-card-actions"><button onClick={() => setFavoriteIds((ids) => ids.includes(asset.assetId) ? ids.filter((id) => id !== asset.assetId) : [...ids, asset.assetId])} title={uiText('favorite')}><Star size={13} fill={favoriteIds.includes(asset.assetId) ? 'currentColor' : 'none'} /><span>{uiText('favorite')}</span></button><button onClick={() => setPreviewAsset(asset)} title={uiText('previewImage')}>{uiText('previewImage')}</button><button data-testid="illustration-delete" onClick={() => void deleteAsset(asset)} title={uiText('deleteImage')}>{uiText('deleteImage')}</button></div></article>)}</div>{assets.length === 0 && <div className="asset-empty">{uiText('noIllustrationsYet')}</div>}{selectedAsset && <div className="asset-provenance"><b>{uiText('assetProvenance')}</b><span>{selectedAsset.provider} · {selectedAsset.model}</span><span>{selectedAsset.seed === undefined ? uiText('seedUnavailable') : `seed ${selectedAsset.seed}`} · {selectedAsset.createdAt}</span><small>{selectedAsset.relPath}</small></div>}<label className="retry-label">{uiText('retryIllustration')}<button onClick={() => void generate()} disabled={busy || !prompt.trim()}><RefreshCw size={13} /> {uiText('generate')}</button></label><button data-testid="illustration-insert" className="insert-asset-button" onClick={() => void insert()} disabled={!selectedAssetId || busy}><Plus size={14} /> {uiText('insertSelectedImage')}</button></section>
    </div>
    {previewAsset && <div ref={previewRef} className="asset-preview-modal" role="dialog" aria-modal="true" aria-label={uiText('previewImage')} onClick={() => setPreviewAsset(null)}><div onClick={(event) => event.stopPropagation()}><button onClick={() => setPreviewAsset(null)} aria-label={uiText('closePreview')}><X size={16} /></button>{previewAsset.previewUrl && <img src={previewAsset.previewUrl} alt={previewAsset.prompt} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = unavailableImage(previewAsset.assetId, uiText('imageUnavailable')); event.currentTarget.alt = `${uiText('imageUnavailable')}：${previewAsset.assetId}` }} />}<small>{previewAsset.prompt}</small></div></div>}
  </main>
}
