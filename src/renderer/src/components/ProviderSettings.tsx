import { useEffect, useState } from 'react'
import { CheckCircle2, ImageIcon, KeyRound, Plus, Save, Settings2, Trash2, Wifi } from 'lucide-react'
import type { ProviderKind, ProviderProfile } from '../../../shared/ai'

const kinds: Array<{ value: ProviderKind; label: string }> = [
  { value: 'openai-compatible', label: 'OpenAI-compatible' }, { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' }, { value: 'mock', label: 'Mock' }
]
const newProfile = (): ProviderProfile => ({ id: `profile_${crypto.randomUUID()}`, name: '新 Provider', kind: 'openai-compatible', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', embeddingModel: undefined, imageBaseURL: 'https://tokenrhythm.studio/v1', imageModel: 'qwen-image-2.0', temperature: 0.7, maxOutputTokens: 4096 })

export function ProviderSettings({ onClose, onProviderChange }: { onClose: () => void; onProviderChange?: (profile: ProviderProfile | null) => void }) {
  const [activeTab, setActiveTab] = useState<'connection' | 'models' | 'billing'>('connection')
  const [profiles, setProfiles] = useState<ProviderProfile[]>([])
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProviderProfile>(newProfile)
  const [secret, setSecret] = useState('')
  const [hasSecret, setHasSecret] = useState(false)
  const [imageSecret, setImageSecret] = useState('')
  const [hasImageSecret, setHasImageSecret] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const result = await window.novelAPI.ai.listProfiles()
      if (!result.ok) { setMessage(`读取 Provider 失败：${result.error.message}`); return }
      setProfiles(result.data)
      const info = await window.novelAPI.project.getInfo()
      const currentId = info.ok ? info.data?.manifest.providerProfile : null
      setCurrentProfileId(currentId ?? null)
      const selected = result.data.find((item) => item.id === currentId) ?? result.data[0]
      if (selected) { await select(selected); onProviderChange?.(selected) }
      else { setProfile(newProfile()); setSecret(''); setImageSecret(''); setHasSecret(false); setHasImageSecret(false); onProviderChange?.(null) }
    } catch (error) { setMessage(`读取 Provider 失败：${error instanceof Error ? error.message : String(error)}`) }
  }
  const select = async (value: ProviderProfile) => {
    setProfile(value); setSecret(''); setImageSecret(''); setMessage('')
    try {
      const [result, imageResult] = await Promise.all([window.novelAPI.ai.hasSecret(value.id), window.novelAPI.ai.hasImageSecret(value.id)])
      if (result.ok) setHasSecret(result.data); else setMessage(`读取文本 Key 状态失败：${result.error.message}`)
      if (imageResult.ok) setHasImageSecret(imageResult.data); else setMessage(`读取图片 Key 状态失败：${imageResult.error.message}`)
    } catch (error) { setMessage(`读取 Provider 密钥状态失败：${error instanceof Error ? error.message : String(error)}`) }
  }
  useEffect(() => { void load() }, [])
  const update = (patch: Partial<ProviderProfile>) => setProfile((value) => ({ ...value, ...patch }))
  const selectCurrent = async (value: ProviderProfile) => {
    setBusy(true); setMessage('切换 Provider 中…')
    try {
      const result = await window.novelAPI.ai.selectProfile(value.id)
      if (!result.ok) { setMessage(`切换失败：${result.error.message}`); return }
      setCurrentProfileId(value.id); await select(value); onProviderChange?.(value); setMessage(`已切换到 ${value.name}`)
    } catch (error) { setMessage(`切换失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }
  const remove = async (value: ProviderProfile) => {
    if (!window.confirm(`确定删除 Provider“${value.name}”吗？\n对应的 API Key 也会一并清除。`)) return
    setBusy(true); setMessage('删除 Provider 中…')
    try {
      const result = await window.novelAPI.ai.deleteProfile(value.id)
      if (!result.ok) { setMessage(`删除失败：${result.error.message}`); return }
      setMessage(`已删除 ${value.name}`); await load()
    } catch (error) { setMessage(`删除失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }
  const save = async () => {
    setBusy(true); setMessage('保存 Provider 配置中…')
    try {
      const result = await window.novelAPI.ai.saveProfile(profile)
      if (!result.ok) { setMessage(`保存失败：${result.error.message}`); return }
      if (secret) { const secretResult = await window.novelAPI.ai.setSecret(profile.id, secret); if (!secretResult.ok) { setMessage(`保存文本 Key 失败：${secretResult.error.message}`); return } }
      if (imageSecret) { const imageSecretResult = await window.novelAPI.ai.setImageSecret(profile.id, imageSecret); if (!imageSecretResult.ok) { setMessage(`保存图片 Key 失败：${imageSecretResult.error.message}`); return } }
      let becameDefault = false
      if (!currentProfileId) {
        const selectResult = await window.novelAPI.ai.selectProfile(profile.id)
        if (!selectResult.ok) { setMessage(`Provider 已保存，但设置默认 Provider 失败：${selectResult.error.message}`); return }
        setCurrentProfileId(profile.id)
        becameDefault = true
      }
      setHasSecret(hasSecret || Boolean(secret)); setHasImageSecret(hasImageSecret || Boolean(imageSecret)); setSecret(''); setImageSecret(''); onProviderChange?.(profile); setMessage(becameDefault ? 'Provider 配置已保存，并已设为默认 Provider' : 'Provider 配置已保存'); await load()
    } catch (error) { setMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`) }
    finally { setBusy(false) }
  }
  const comparableProfile = ({ contextWindow: _contextWindow, ...value }: ProviderProfile) => value
  const profileSaved = profiles.some((item) => JSON.stringify(comparableProfile(item)) === JSON.stringify(comparableProfile(profile)))
  const requireSavedProfile = () => {
    if (profileSaved) return true
    setMessage('当前配置尚未保存，请先点击“保存”，再测试连接。')
    return false
  }
  const test = async () => { if (!requireSavedProfile()) return; setBusy(true); setMessage('测试文本连接中…'); try { const result = await window.novelAPI.ai.testProfile(profile.id); if (result.ok) { const selectedModel = result.data.find((model) => model.id === profile.model); if (selectedModel?.contextWindow) update({ contextWindow: selectedModel.contextWindow }); setMessage(`文本连接成功：${result.data.map((model) => `${model.id}${model.contextWindow ? ` (${model.contextWindow} tokens)` : ''}`).join(', ') || 'Provider 已响应'}`) } else setMessage(`文本连接失败：${result.error.message}`) } catch (error) { setMessage(`文本连接失败：${error instanceof Error ? error.message : String(error)}`) } finally { setBusy(false) } }
  const testEmbedding = async () => { if (!requireSavedProfile()) return; setBusy(true); setMessage('测试 Embedding 连接中（不会保存向量）…'); try { const result = await window.novelAPI.ai.testEmbedding(profile.id); setMessage(result.ok ? `Embedding 连接成功：${result.data.model} / ${result.data.dimensions} 维` : `Embedding 连接失败：${result.error.message}`) } catch (error) { setMessage(`Embedding 连接失败：${error instanceof Error ? error.message : String(error)}`) } finally { setBusy(false) } }
  const testImage = async () => { if (!requireSavedProfile()) return; setBusy(true); setMessage('测试图片连接中（会生成 1 张测试图，不会保存）…'); try { const result = await window.novelAPI.image.testConnection(profile.id); setMessage(result.ok ? `图片连接成功：${result.data.provider} / ${result.data.model}` : `图片连接失败：${result.error.message}`) } catch (error) { setMessage(`图片连接失败：${error instanceof Error ? error.message : String(error)}`) } finally { setBusy(false) } }

  return <div className="settings-overlay" onClick={onClose}><section className="provider-settings" data-testid="provider-settings" onClick={(event) => event.stopPropagation()}>
    <header><Settings2 size={17} /><b>LLM Provider</b><button type="button" className="provider-close" aria-label="关闭 Provider 设置" title="关闭" onClick={(event) => { event.stopPropagation(); onClose() }}>×</button></header>
    <small className="provider-context-window-hint">测试文本连接后会自动识别并保存当前模型的 Context Window；未发现时使用固定预算。</small>
    <div className="provider-body"><aside>{profiles.map((item) => <div className={`provider-profile-item${item.id === profile.id ? ' active' : ''}`} key={item.id}><button type="button" disabled={busy} className="profile-select" onClick={() => void select(item)}><span>{item.name}</span><small>{item.model}</small></button><div className="profile-item-actions">{item.id === currentProfileId ? <span className="current-profile">当前</span> : <button type="button" disabled={busy} className="use-profile" onClick={() => void selectCurrent(item)}>使用</button>}<button type="button" disabled={busy} className="delete-profile" aria-label={`删除 ${item.name}`} title="删除 Provider" onClick={() => void remove(item)}><Trash2 size={13} /></button></div></div>)}<button type="button" disabled={busy} className="add-profile" onClick={() => { setProfile(newProfile()); setSecret(''); setImageSecret(''); setHasSecret(false); setHasImageSecret(false); setMessage('') }}><Plus size={13} /> 新建 profile</button></aside>
      <main data-tab={activeTab}><nav className="provider-tabs" role="tablist" aria-label="Provider 设置分类"><button type="button" role="tab" aria-selected={activeTab === 'connection'} className={activeTab === 'connection' ? 'active' : ''} onClick={() => setActiveTab('connection')}>基础配置</button><button type="button" role="tab" aria-selected={activeTab === 'models'} className={activeTab === 'models' ? 'active' : ''} onClick={() => setActiveTab('models')}>模型能力</button><button type="button" role="tab" aria-selected={activeTab === 'billing'} className={activeTab === 'billing' ? 'active' : ''} onClick={() => setActiveTab('billing')}>费用与密钥</button></nav>
        {activeTab === 'connection' && <div className="provider-tab-section" data-provider-section="connection"><label>名称<input disabled={busy} value={profile.name} onChange={(event) => update({ name: event.target.value })} /></label><label>协议<select disabled={busy} value={profile.kind} onChange={(event) => update({ kind: event.target.value as ProviderKind })}>{kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label></div>}
        {activeTab === 'models' && <div className="provider-tab-section" data-provider-section="models"><label>Text Base URL<input disabled={busy} value={profile.baseURL ?? ''} onChange={(event) => update({ baseURL: event.target.value || undefined })} /></label><label>Text Model<input disabled={busy} value={profile.model} onChange={(event) => update({ model: event.target.value })} /></label><label>Embedding Model<input disabled={busy} value={profile.embeddingModel ?? ''} onChange={(event) => update({ embeddingModel: event.target.value || undefined })} placeholder="可选，例如 text-embedding-3-small" /><small>配置后 Context 会建立本地语义索引；留空则使用 FTS。</small></label><label>Image Base URL<input disabled={busy} value={profile.imageBaseURL ?? ''} onChange={(event) => update({ imageBaseURL: event.target.value || undefined })} placeholder="例如 https://tokenrhythm.studio/v1" /></label><label>Image Model<input disabled={busy} value={profile.imageModel ?? ''} onChange={(event) => update({ imageModel: event.target.value || undefined })} placeholder="qwen-image-2.0" /></label></div>}
        {activeTab === 'billing' && <div className="provider-tab-section" data-provider-section="billing"><label>Input token price / 1M USD<input disabled={busy} type="number" min="0" step="0.000001" value={profile.inputTokenCostPerMillion ?? ''} onChange={(event) => update({ inputTokenCostPerMillion: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label>Output token price / 1M USD<input disabled={busy} type="number" min="0" step="0.000001" value={profile.outputTokenCostPerMillion ?? ''} onChange={(event) => update({ outputTokenCostPerMillion: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><small className="billing-note">留空单价则只统计 token，不计算费用。</small><label><span className="secret-label"><KeyRound size={12} /> Text API Key {hasSecret && <small><CheckCircle2 size={12} /> 已配置</small>}</span><input disabled={busy} type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={hasSecret ? '留空以保留现有 key' : '不会写入项目文件'} /></label><label><span className="secret-label"><KeyRound size={12} /> Image API Key {hasImageSecret && <small><CheckCircle2 size={12} /> 已配置</small>}</span><input disabled={busy} type="password" value={imageSecret} onChange={(event) => setImageSecret(event.target.value)} placeholder={hasImageSecret ? '留空以保留现有 key' : '独立加密存储'} /></label></div>}
        <div className="provider-actions"><button disabled={busy} className="primary" onClick={() => void save()}><Save size={14} /> 保存</button><button disabled={busy} onClick={() => void test()}><Wifi size={14} /> 测试文本连接</button><button disabled={busy} onClick={() => void testEmbedding()}><Wifi size={14} /> 测试 Embedding 连接</button><button disabled={busy} onClick={() => void testImage()}><ImageIcon size={14} /> 测试图片连接</button>{message && <span role="status">{message}</span>}</div></main>
    </div>
  </section></div>
}
