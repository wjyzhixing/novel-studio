import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ImageIcon, KeyRound, Plus, Save, Settings2, Trash2, Wifi } from 'lucide-react'
import type { ProviderKind, ProviderProfile } from '../../../shared/ai'
import { useUiText } from '../lib/i18n'
import { useGlobalMessage } from '../lib/global-notification'

const kinds: Array<{ value: ProviderKind; label: string }> = [
  { value: 'openai-compatible', label: 'OpenAI-compatible' }, { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' }, { value: 'mock', label: 'Mock' }
]
const newProfile = (name: string): ProviderProfile => ({ id: `profile_${crypto.randomUUID()}`, name, kind: 'openai-compatible', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', embeddingModel: undefined, imageBaseURL: 'https://tokenrhythm.studio/v1', imageModel: 'qwen-image-2.0', temperature: 0.7, maxOutputTokens: 4096 })

export function ProviderSettings({ onClose, onProviderChange }: { onClose: () => void; onProviderChange?: (profile: ProviderProfile | null) => void }) {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  const dialogRef = useRef<HTMLElement | null>(null)
  const [activeTab, setActiveTab] = useState<'connection' | 'models' | 'billing'>('connection')
  const [profiles, setProfiles] = useState<ProviderProfile[]>([])
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProviderProfile>(() => newProfile(uiText('providerDefaultName')))
  const [secret, setSecret] = useState('')
  const [hasSecret, setHasSecret] = useState(false)
  const [imageSecret, setImageSecret] = useState('')
  const [hasImageSecret, setHasImageSecret] = useState(false)
  const [message, setMessage] = useGlobalMessage()
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const result = await window.novelAPI.ai.listProfiles()
      if (!result.ok) { setMessage(formatUiText('providerLoadingFailed', { error: result.error.message })); return }
      setProfiles(result.data)
      const info = await window.novelAPI.project.getInfo()
      const currentId = info.ok ? info.data?.manifest.providerProfile : null
      setCurrentProfileId(currentId ?? null)
      const selected = result.data.find((item) => item.id === currentId) ?? result.data[0]
      if (selected) { await select(selected); onProviderChange?.(selected) }
      else { setProfile(newProfile(uiText('providerDefaultName'))); setSecret(''); setImageSecret(''); setHasSecret(false); setHasImageSecret(false); onProviderChange?.(null) }
    } catch (error) { setMessage(formatUiText('providerLoadingFailed', { error: error instanceof Error ? error.message : String(error) })) }
  }
  const select = async (value: ProviderProfile) => {
    setProfile(value); setSecret(''); setImageSecret(''); setMessage('')
    try {
      const [result, imageResult] = await Promise.all([window.novelAPI.ai.hasSecret(value.id), window.novelAPI.ai.hasImageSecret(value.id)])
      if (result.ok) setHasSecret(result.data); else setMessage(formatUiText('providerSecretStatusFailed', { error: result.error.message }))
      if (imageResult.ok) setHasImageSecret(imageResult.data); else setMessage(formatUiText('providerSecretStatusFailed', { error: imageResult.error.message }))
    } catch (error) { setMessage(formatUiText('providerSecretStatusFailed', { error: error instanceof Error ? error.message : String(error) })) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const getFocusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
    const focusFrame = window.requestAnimationFrame(() => getFocusable()[0]?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
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
  }, [onClose])
  const update = (patch: Partial<ProviderProfile>) => setProfile((value) => ({ ...value, ...patch }))
  const selectCurrent = async (value: ProviderProfile) => {
    setBusy(true); setMessage(uiText('providerSwitching'))
    try {
      const result = await window.novelAPI.ai.selectProfile(value.id)
      if (!result.ok) { setMessage(formatUiText('providerSwitchFailed', { error: result.error.message })); return }
      setCurrentProfileId(value.id); await select(value); onProviderChange?.(value); setMessage(formatUiText('providerSwitched', { name: value.name }))
    } catch (error) { setMessage(formatUiText('providerSwitchFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }
  const remove = async (value: ProviderProfile) => {
    if (!window.confirm(formatUiText('providerDeleteConfirm', { name: value.name }))) return
    setBusy(true); setMessage(uiText('providerDeleting'))
    try {
      const result = await window.novelAPI.ai.deleteProfile(value.id)
      if (!result.ok) { setMessage(formatUiText('providerDeleteFailed', { error: result.error.message })); return }
      setMessage(formatUiText('providerDeleted', { name: value.name })); await load()
    } catch (error) { setMessage(formatUiText('providerDeleteFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }
  const save = async () => {
    setBusy(true); setMessage(uiText('providerSaving'))
    try {
      const result = await window.novelAPI.ai.saveProfile(profile)
      if (!result.ok) { setMessage(formatUiText('providerSaveFailed', { error: result.error.message })); return }
      if (secret) { const secretResult = await window.novelAPI.ai.setSecret(profile.id, secret); if (!secretResult.ok) { setMessage(formatUiText('providerSecretSaveFailed', { error: secretResult.error.message })); return } }
      if (imageSecret) { const imageSecretResult = await window.novelAPI.ai.setImageSecret(profile.id, imageSecret); if (!imageSecretResult.ok) { setMessage(formatUiText('providerImageSecretSaveFailed', { error: imageSecretResult.error.message })); return } }
      let becameDefault = false
      if (!currentProfileId) {
        const selectResult = await window.novelAPI.ai.selectProfile(profile.id)
        if (!selectResult.ok) { setMessage(formatUiText('providerDefaultFailed', { error: selectResult.error.message })); return }
        setCurrentProfileId(profile.id)
        becameDefault = true
      }
      setHasSecret(hasSecret || Boolean(secret)); setHasImageSecret(hasImageSecret || Boolean(imageSecret)); setSecret(''); setImageSecret(''); onProviderChange?.(profile); setMessage(becameDefault ? uiText('providerSavedDefault') : uiText('providerSaved')); await load()
    } catch (error) { setMessage(formatUiText('providerSaveFailed', { error: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }
  const comparableProfile = ({ contextWindow: _contextWindow, ...value }: ProviderProfile) => value
  const profileSaved = profiles.some((item) => JSON.stringify(comparableProfile(item)) === JSON.stringify(comparableProfile(profile)))
  const requireSavedProfile = () => {
    if (profileSaved) return true
    setMessage(uiText('providerUnsavedTestBlocked'))
    return false
  }
  const test = async () => { if (!requireSavedProfile()) return; setBusy(true); setMessage(uiText('providerTestingText')); try { const result = await window.novelAPI.ai.testProfile(profile.id); if (result.ok) { const selectedModel = result.data.find((model) => model.id === profile.model); if (selectedModel?.contextWindow) update({ contextWindow: selectedModel.contextWindow }); setMessage(formatUiText('providerTextSuccess', { models: result.data.map((model) => `${model.id}${model.contextWindow ? ` (${model.contextWindow} tokens)` : ''}`).join(', ') || uiText('providerTextResponse') })) } else setMessage(formatUiText('providerTextFailed', { error: result.error.message })) } catch (error) { setMessage(formatUiText('providerTextFailed', { error: error instanceof Error ? error.message : String(error) })) } finally { setBusy(false) } }
  const testEmbedding = async () => { if (!requireSavedProfile()) return; setBusy(true); setMessage(uiText('providerTestingEmbedding')); try { const result = await window.novelAPI.ai.testEmbedding(profile.id); setMessage(result.ok ? formatUiText('providerEmbeddingSuccess', { model: result.data.model, dimensions: result.data.dimensions }) : formatUiText('providerEmbeddingFailed', { error: result.error.message })) } catch (error) { setMessage(formatUiText('providerEmbeddingFailed', { error: error instanceof Error ? error.message : String(error) })) } finally { setBusy(false) } }
  const testImage = async () => { if (!requireSavedProfile()) return; setBusy(true); setMessage(uiText('providerTestingImage')); try { const result = await window.novelAPI.image.testConnection(profile.id); setMessage(result.ok ? formatUiText('providerImageSuccess', { provider: result.data.provider, model: result.data.model }) : formatUiText('providerImageFailed', { error: result.error.message })) } catch (error) { setMessage(formatUiText('providerImageFailed', { error: error instanceof Error ? error.message : String(error) })) } finally { setBusy(false) } }

  return <div className="settings-overlay" onClick={onClose}><section ref={dialogRef} className="provider-settings" data-testid="provider-settings" role="dialog" aria-modal="true" aria-label={uiText('providerSettings')} onClick={(event) => event.stopPropagation()}>
    <header><Settings2 size={17} /><b>LLM Provider</b><button type="button" className="provider-close" aria-label={uiText('providerClose')} title={uiText('cancel')} onClick={(event) => { event.stopPropagation(); onClose() }}>×</button></header>
    <small className="provider-context-window-hint">{uiText('providerHint')}</small>
    <div className="provider-body"><aside>{profiles.map((item) => <div className={`provider-profile-item${item.id === profile.id ? ' active' : ''}`} key={item.id}><button type="button" disabled={busy} className="profile-select" onClick={() => void select(item)}><span>{item.name}</span><small>{item.model}</small></button><div className="profile-item-actions">{item.id === currentProfileId ? <span className="current-profile">{uiText('providerCurrent')}</span> : <button type="button" disabled={busy} className="use-profile" onClick={() => void selectCurrent(item)}>{uiText('providerUse')}</button>}<button type="button" disabled={busy} className="delete-profile" aria-label={formatUiText('providerDeleteProfile', { name: item.name })} title={formatUiText('providerDeleteProfile', { name: item.name })} onClick={() => void remove(item)}><Trash2 size={13} /></button></div></div>)}<button type="button" disabled={busy} className="add-profile" onClick={() => { setProfile(newProfile(uiText('providerDefaultName'))); setSecret(''); setImageSecret(''); setHasSecret(false); setHasImageSecret(false); setMessage('') }}><Plus size={13} /> {uiText('providerNewProfile')}</button></aside>
      <main data-tab={activeTab}><nav className="provider-tabs" role="tablist" aria-label={uiText('providerSettings')}><button type="button" role="tab" aria-selected={activeTab === 'connection'} className={activeTab === 'connection' ? 'active' : ''} onClick={() => setActiveTab('connection')}>{uiText('providerConnectionTab')}</button><button type="button" role="tab" aria-selected={activeTab === 'models'} className={activeTab === 'models' ? 'active' : ''} onClick={() => setActiveTab('models')}>{uiText('providerModelsTab')}</button><button type="button" role="tab" aria-selected={activeTab === 'billing'} className={activeTab === 'billing' ? 'active' : ''} onClick={() => setActiveTab('billing')}>{uiText('providerBillingTab')}</button></nav>
        {activeTab === 'connection' && <div className="provider-tab-section" data-provider-section="connection"><label>{uiText('providerName')}<input disabled={busy} value={profile.name} onChange={(event) => update({ name: event.target.value })} /></label><label>{uiText('providerProtocol')}<select disabled={busy} value={profile.kind} onChange={(event) => update({ kind: event.target.value as ProviderKind })}>{kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label></div>}
        {activeTab === 'models' && <div className="provider-tab-section" data-provider-section="models"><label>{uiText('providerTextBaseUrl')}<input disabled={busy} value={profile.baseURL ?? ''} onChange={(event) => update({ baseURL: event.target.value || undefined })} /></label><label>{uiText('providerTextModel')}<input disabled={busy} value={profile.model} onChange={(event) => update({ model: event.target.value })} /></label><label>{uiText('providerEmbeddingModel')}<input disabled={busy} value={profile.embeddingModel ?? ''} onChange={(event) => update({ embeddingModel: event.target.value || undefined })} placeholder={uiText('providerEmbeddingPlaceholder')} /><small>{uiText('providerEmbeddingHint')}</small></label><label>{uiText('providerImageBaseUrl')}<input disabled={busy} value={profile.imageBaseURL ?? ''} onChange={(event) => update({ imageBaseURL: event.target.value || undefined })} placeholder="https://tokenrhythm.studio/v1" /></label><label>{uiText('providerImageModel')}<input disabled={busy} value={profile.imageModel ?? ''} onChange={(event) => update({ imageModel: event.target.value || undefined })} placeholder={uiText('providerImageModelPlaceholder')} /></label></div>}
        {activeTab === 'billing' && <div className="provider-tab-section" data-provider-section="billing"><label>{uiText('providerInputPrice')}<input disabled={busy} type="number" min="0" step="0.000001" value={profile.inputTokenCostPerMillion ?? ''} onChange={(event) => update({ inputTokenCostPerMillion: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label>{uiText('providerOutputPrice')}<input disabled={busy} type="number" min="0" step="0.000001" value={profile.outputTokenCostPerMillion ?? ''} onChange={(event) => update({ outputTokenCostPerMillion: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><small className="billing-note">{uiText('providerBillingHint')}</small><label><span className="secret-label"><KeyRound size={12} /> {uiText('providerTextApiKey')} {hasSecret && <small><CheckCircle2 size={12} /> {uiText('providerConfigured')}</small>}</span><input disabled={busy} type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={hasSecret ? uiText('providerKeepExistingKey') : uiText('providerSecretNotProjectFile')} /></label><label><span className="secret-label"><KeyRound size={12} /> {uiText('providerImageApiKey')} {hasImageSecret && <small><CheckCircle2 size={12} /> {uiText('providerConfigured')}</small>}</span><input disabled={busy} type="password" value={imageSecret} onChange={(event) => setImageSecret(event.target.value)} placeholder={hasImageSecret ? uiText('providerKeepExistingKey') : uiText('providerSecretEncrypted')} /></label></div>}
        <div className="provider-actions"><button disabled={busy} className="primary" onClick={() => void save()}><Save size={14} /> {uiText('providerSave')}</button><button disabled={busy} onClick={() => void test()}><Wifi size={14} /> {uiText('providerTestText')}</button><button disabled={busy} onClick={() => void testEmbedding()}><Wifi size={14} /> {uiText('providerTestEmbedding')}</button><button disabled={busy} onClick={() => void testImage()}><ImageIcon size={14} /> {uiText('providerTestImage')}</button>{message && <span role="status">{message}</span>}</div></main>
    </div>
  </section></div>
}
