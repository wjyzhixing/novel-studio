import { useState } from 'react'
import { FolderOpen, FolderPlus, History, Loader2, X } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { BackupActions } from './BackupActions'
import { useUiText } from '../lib/i18n'
import { AuthoringWizard } from './AuthoringWizard'

/** Welcome / project bootstrap screen (Sprint 1). */
export function Welcome() {
  const { recents, busy, notice, createProject, openProject, seedMockStory, removeRecent, setNotice } = useAppStore()
  const uiText = useUiText()
  const [title, setTitle] = useState('')
  const [wizardRoot, setWizardRoot] = useState<string | null>(null)

  const pick = async (): Promise<string | null> => {
    const r = await window.novelAPI.project.pickDirectory()
    return r.ok ? r.data : null
  }

  const onCreate = async () => {
    const dir = await pick()
    if (dir) setWizardRoot(dir)
  }

  const onOpen = async () => {
    const dir = await pick()
    if (dir) await openProject(dir)
  }

  return (
    <div className="welcome">
      {wizardRoot && <AuthoringWizard rootPath={wizardRoot} title={title.trim()} onCancel={() => setWizardRoot(null)} />}
      <div className="welcome-card">
        <div className="welcome-brand">
          <div className="brand-icon">N</div>
          <div>
            <b>Novel Studio</b>
            <small>{uiText('welcomeTagline')}</small>
          </div>
        </div>

        {notice && (
          <div className="welcome-error">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)}><X size={13} /></button>
          </div>
        )}

        <div className="welcome-section">
          <label>{uiText('createProject')}</label>
          <div className="welcome-create">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={uiText('projectNamePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            />
            <button className="welcome-primary" disabled={busy || !title.trim()} onClick={onCreate}>
              {busy ? <Loader2 className="spin" size={15} /> : <FolderPlus size={15} />}
              {uiText('createProject')}
            </button>
          </div>
        </div>

        <div className="welcome-section">
          <label>{uiText('openProject')}</label>
          <button className="welcome-secondary" disabled={busy} onClick={onOpen}>
            <FolderOpen size={15} /> {uiText('chooseProjectFolder')}
          </button>
        </div>

        <div className="welcome-section">
          <label>{uiText('projectRestore')}</label>
          <BackupActions showRestore onNotice={setNotice} />
        </div>

        {recents.length > 0 && <div className="welcome-section"><button className="welcome-secondary" disabled={busy} onClick={() => void openProject(recents[0].path).then((ok) => ok && seedMockStory())}>{uiText('loadSampleProject')}</button></div>}

        {recents.length > 0 && (
          <div className="welcome-section">
            <label><History size={12} /> {uiText('recentProjects')}</label>
            <div className="recent-list">
              {recents.map((r) => (
                <div className="recent-row" key={r.path}>
                  <button className="recent-open" disabled={busy} onClick={() => openProject(r.path)}>
                    <b>{r.title}</b>
                    <small>{r.path}</small>
                  </button>
                  <button className="recent-remove" title={uiText('removeFromRecentProjects')} aria-label={uiText('removeFromRecentProjects')} onClick={() => removeRecent(r.path)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
