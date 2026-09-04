import { useState } from 'react'
import { FolderOpen, FolderPlus, History, Loader2, X } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import { BackupActions } from './BackupActions'

/** Welcome / project bootstrap screen (Sprint 1). */
export function Welcome() {
  const { recents, busy, notice, createProject, openProject, seedMockStory, removeRecent, setNotice } = useAppStore()
  const [title, setTitle] = useState('')

  const pick = async (): Promise<string | null> => {
    const r = await window.novelAPI.project.pickDirectory()
    return r.ok ? r.data : null
  }

  const onCreate = async () => {
    const dir = await pick()
    if (dir) await createProject(dir, title)
  }

  const onOpen = async () => {
    const dir = await pick()
    if (dir) await openProject(dir)
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-brand">
          <div className="brand-icon">N</div>
          <div>
            <b>Novel Studio</b>
            <small>AI Native 小说创作 IDE · 本地优先，数据保存在你自己的项目文件夹</small>
          </div>
        </div>

        {notice && (
          <div className="welcome-error">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)}><X size={13} /></button>
          </div>
        )}

        <div className="welcome-section">
          <label>创建新项目</label>
          <div className="welcome-create">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="作品名，例如：赛博长安"
              onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            />
            <button className="welcome-primary" disabled={busy || !title.trim()} onClick={onCreate}>
              {busy ? <Loader2 className="spin" size={15} /> : <FolderPlus size={15} />}
              选择空文件夹并创建
            </button>
          </div>
        </div>

        <div className="welcome-section">
          <label>打开已有项目</label>
          <button className="welcome-secondary" disabled={busy} onClick={onOpen}>
            <FolderOpen size={15} /> 选择项目文件夹（含 novel.yaml）
          </button>
        </div>

        <div className="welcome-section">
          <label>项目恢复</label>
          <BackupActions showRestore onNotice={setNotice} />
        </div>

        {recents.length > 0 && <div className="welcome-section"><button className="welcome-secondary" disabled={busy} onClick={() => void openProject(recents[0].path).then((ok) => ok && seedMockStory())}>载入小牛三章示例到最近项目</button></div>}

        {recents.length > 0 && (
          <div className="welcome-section">
            <label><History size={12} /> 最近项目</label>
            <div className="recent-list">
              {recents.map((r) => (
                <div className="recent-row" key={r.path}>
                  <button className="recent-open" disabled={busy} onClick={() => openProject(r.path)}>
                    <b>{r.title}</b>
                    <small>{r.path}</small>
                  </button>
                  <button className="recent-remove" title="从列表移除" onClick={() => removeRecent(r.path)}>
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
