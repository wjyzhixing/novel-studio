import { useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, Loader2, Sparkles } from 'lucide-react'
import { useUiText } from '../lib/i18n'
import { useAppStore } from '../store/app-store'

function chapterDefaults(count: number): string {
  return Array.from({ length: count }, (_, index) => `第${index + 1}章`).join('\n')
}

export function AuthoringWizard({ rootPath, title, onCancel }: { rootPath: string; title: string; onCancel: () => void }) {
  const uiText = useUiText()
  const createProject = useAppStore((state) => state.createProject)
  const setNotice = useAppStore((state) => state.setNotice)
  const [genre, setGenre] = useState('')
  const [premise, setPremise] = useState('')
  const [targetWordCount, setTargetWordCount] = useState('40000')
  const [chapterCount, setChapterCount] = useState('14')
  const [volumeTitles, setVolumeTitles] = useState('第一卷, 第二卷')
  const [chapterTitles, setChapterTitles] = useState(() => chapterDefaults(14))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const count = useMemo(() => Math.max(1, Math.min(14, Number.parseInt(chapterCount, 10) || 1)), [chapterCount])

  const updateCount = (value: string) => {
    setChapterCount(value)
    const next = Math.max(1, Math.min(14, Number.parseInt(value, 10) || 1))
    const current = chapterTitles.split('\n').map((item) => item.trim()).filter(Boolean)
    setChapterTitles([...current.slice(0, next), ...Array.from({ length: Math.max(0, next - current.length) }, (_, index) => `第${current.length + index + 1}章`)].join('\n'))
  }

  const submit = async () => {
    const titles = chapterTitles.split('\n').map((item) => item.trim()).filter(Boolean)
    const volumes = volumeTitles.split(',').map((item) => item.trim()).filter(Boolean)
    const words = Number.parseInt(targetWordCount, 10)
    if (!genre.trim() || !premise.trim() || !Number.isInteger(words) || words < 1 || count < 1 || count > 14 || titles.length !== count || volumes.length === 0) {
      setError(uiText('authoringWizardValidation'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await createProject(rootPath, title)
      if (!created) return
      const result = await window.novelAPI.authoring.initialize({ genre: genre.trim(), premise: premise.trim(), targetWordCount: words, chapterCount: count, volumeTitles: volumes, chapterTitles: titles })
      if (!result.ok) { setError(result.error.message); setNotice(uiText('authoringInitializeFailed').replace('{error}', result.error.message)); return }
      await Promise.all([useAppStore.getState().loadChapters(), useAppStore.getState().loadVolumes()])
      window.dispatchEvent(new Event('novel:open-authoring'))
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
      setNotice(uiText('authoringInitializeFailed').replace('{error}', message))
    } finally { setBusy(false) }
  }

  return <div className="authoring-wizard-backdrop"><section className="authoring-wizard" role="dialog" aria-modal="true" aria-labelledby="authoring-wizard-title">
    <header><div className="authoring-wizard-icon"><BookOpen size={18} /></div><div><h1 id="authoring-wizard-title">{uiText('authoringWizardTitle')}</h1><p>{uiText('authoringWizardHint')}</p></div></header>
    {error && <div className="authoring-wizard-error" role="alert">{error}</div>}
    <div className="authoring-wizard-grid"><label>{uiText('authoringGenre')}<input value={genre} onChange={(event) => setGenre(event.target.value)} autoFocus /></label><label>{uiText('authoringTargetWordCount')}<input type="number" min="1" value={targetWordCount} onChange={(event) => setTargetWordCount(event.target.value)} /></label><label>{uiText('authoringChapterCount')}<input type="number" min="1" max="14" value={chapterCount} onChange={(event) => updateCount(event.target.value)} /></label><label>{uiText('authoringVolumeTitles')}<input value={volumeTitles} onChange={(event) => setVolumeTitles(event.target.value)} /></label></div>
    <label>{uiText('authoringPremise')}<textarea rows={4} value={premise} onChange={(event) => setPremise(event.target.value)} placeholder="例如：一个人为了找回失踪的父亲，必须重新面对一桩被掩埋十五年的事故。" /></label>
    <label>{uiText('authoringChapterTitles')}<textarea rows={8} value={chapterTitles} onChange={(event) => setChapterTitles(event.target.value)} /></label>
    <footer><button type="button" onClick={onCancel} disabled={busy}><ArrowLeft size={14} /> {uiText('authoringWizardCancel')}</button><button type="button" className="primary" onClick={() => void submit()} disabled={busy}>{busy ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />} {uiText('authoringWizardStart')}</button></footer>
  </section></div>
}
