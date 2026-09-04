import { CanonReview } from './CanonReview'
import { ChevronDown, ChevronUp, Maximize2, Minimize2, Save } from 'lucide-react'
import { useState } from 'react'
import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import type { Revision } from '../../../shared/revision'
import { foreshadowingStatuses } from '../../../shared/story'
import type { ForeshadowingRecord, ForeshadowingStatus } from '../../../shared/story'
import { DeveloperPanel } from './DeveloperPanel'
import { buildParagraphDiff } from '../../../shared/diff'

export function BottomPanel({ collapsed, maximized, onToggleCollapsed, onToggleMaximized, onResize }: { collapsed: boolean; maximized: boolean; onToggleCollapsed: () => void; onToggleMaximized: () => void; onResize: (delta: number) => void }) {
  const [activeTab, setActiveTab] = useState('Canon Check')
  const [notes, setNotes] = useState('')
  const [notesMessage, setNotesMessage] = useState('')
  const activeRelPath = useAppStore((state) => state.activeRelPath)
  const chapters = useAppStore((state) => state.chapters)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [revisionMessage, setRevisionMessage] = useState('')
  const [foreshadowing, setForeshadowing] = useState<ForeshadowingRecord[]>([])
  const [foreshadowingStatus, setForeshadowingStatus] = useState<ForeshadowingStatus | ''>('')
  useEffect(() => {
    const openCanonReview = () => setActiveTab('Canon Check')
    window.addEventListener('novel:open-canon-review', openCanonReview)
    return () => window.removeEventListener('novel:open-canon-review', openCanonReview)
  }, [])
  useEffect(() => {
    if (activeTab !== 'Diff') return
    let current = true
    setRevisionMessage('')
    void window.novelAPI.revision.list(activeRelPath ?? undefined).then((result) => {
      if (!current) return
      if (!result.ok) { setRevisions([]); setSelectedRevisionId(null); setRevisionMessage(`读取 Revision 失败：${result.error.message}`); return }
      setRevisions(result.data)
      setSelectedRevisionId(result.data[0]?.id ?? null)
    }).catch((error) => { if (current) { setRevisions([]); setSelectedRevisionId(null); setRevisionMessage(`读取 Revision 失败：${error instanceof Error ? error.message : String(error)}`) } })
    return () => { current = false }
  }, [activeRelPath, activeTab])
  useEffect(() => {
    if (activeTab !== 'Foreshadowing') return
    let current = true
    void window.novelAPI.story.listForeshadowing(foreshadowingStatus || undefined).then((result) => { if (current) setForeshadowing(result.ok ? result.data : []) })
    return () => { current = false }
  }, [activeRelPath, activeTab, foreshadowingStatus])
  useEffect(() => {
    if (activeTab !== 'Notes') return
    let current = true
    setNotes('')
    setNotesMessage('')
    if (activeRelPath) void window.novelAPI.chapter.readNote(activeRelPath).then((result) => { if (current) setNotes(result.ok ? result.data : '') })
    return () => { current = false }
  }, [activeRelPath, activeTab])
  const saveNotes = async () => {
    if (!activeRelPath) return
    try {
      const result = await window.novelAPI.chapter.saveNote(activeRelPath, notes)
      setNotesMessage(result.ok ? '已保存' : `保存失败：${result.error.message}`)
    } catch (error) { setNotesMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`) }
  }
  const revertRevision = async (revision: Revision) => {
    try {
      const result = await window.novelAPI.revision.revert(revision.id)
      if (!result.ok) { setRevisionMessage(`回退失败：${result.error.message}`); return }
      setRevisionMessage('已回退并创建逆向 Revision')
      await useAppStore.getState().openChapter(result.data.relPath)
      const refreshed = await window.novelAPI.revision.list(result.data.relPath)
      if (refreshed.ok) { setRevisions(refreshed.data); setSelectedRevisionId(refreshed.data[0]?.id ?? null) }
      else setRevisionMessage(`回退成功，但刷新历史失败：${refreshed.error.message}`)
    } catch (error) { setRevisionMessage(`回退失败：${error instanceof Error ? error.message : String(error)}`) }
  }
  const selectedRevision = revisions.find((revision) => revision.id === selectedRevisionId) ?? revisions[0]
  const paragraphDiff = selectedRevision ? buildParagraphDiff(selectedRevision.original, selectedRevision.replacement) : []
  const selectedRevisionChapterExists = Boolean(selectedRevision && chapters.some((chapter) => chapter.relPath === selectedRevision.relPath))
  const tabs = ['Notes', 'Outline', 'Canon Check', 'Foreshadowing', 'Diff', 'Developer', 'AI Chat']
  return (
    <section className={`bottom-panel${collapsed ? ' collapsed' : ''}`}>
      {!collapsed && <div className="bottom-resize-handle" role="separator" aria-orientation="horizontal" aria-label="调整底部面板高度" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragging = 'true' }} onPointerMove={(event) => { if (event.currentTarget.dataset.dragging === 'true') onResize(-event.movementY) }} onPointerUp={(event) => { delete event.currentTarget.dataset.dragging }} />}
      <div className="bottom-tabs"><div className="bottom-tab-list">{tabs.map((tab) => <button type="button" data-testid={tab === 'Canon Check' ? 'canon-check-tab' : undefined} key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div><div className="bottom-panel-actions"><button type="button" title={maximized ? '恢复底部面板高度' : '放大底部面板'} aria-label={maximized ? '恢复底部面板高度' : '放大底部面板'} onClick={onToggleMaximized}>{maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button><button type="button" title={collapsed ? '展开底部面板' : '收起底部面板'} aria-label={collapsed ? '展开底部面板' : '收起底部面板'} onClick={onToggleCollapsed}>{collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button></div></div>
      {!collapsed && <div className="bottom-content">
        {activeTab === 'Notes' && <div className="bottom-tool-panel"><h3>Notes</h3><textarea value={notes} onChange={(event) => { setNotes(event.target.value); setNotesMessage('未保存') }} placeholder="记录本章写作笔记…" /><div className="story-form-actions"><button onClick={() => void saveNotes()} disabled={!activeRelPath}><Save size={13} /> 保存笔记</button>{notesMessage && <span role="status">{notesMessage}</span>}</div></div>}
        {activeTab === 'Outline' && <div className="bottom-tool-panel"><h3>Outline</h3><p>项目大纲请在右侧 Outline 面板查看，来源为 story/outline.md。</p></div>}
        {activeTab === 'AI Chat' && <div className="bottom-tool-panel"><h3>AI Chat</h3><p>在独立 Chat 工作区进行长对话；右侧 Agent 面板保留快速提问。</p><button type="button" onClick={() => window.dispatchEvent(new Event('novel:open-chat'))}>打开独立 Chat</button><button onClick={() => setActiveTab('Canon Check')}>查看当前检查结果</button></div>}
        {activeTab === 'Canon Check' && <CanonReview />}
        {activeTab === 'Foreshadowing' && <div className="bottom-tool-panel"><h3>Foreshadowing <select aria-label="筛选伏笔状态" value={foreshadowingStatus} onChange={(event) => setForeshadowingStatus(event.target.value as ForeshadowingStatus | '')}><option value="">全部状态</option>{foreshadowingStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></h3>{foreshadowing.length === 0 ? <p>暂无符合条件的伏笔。可在 Story Bible → Foreshadowing 中创建。</p> : foreshadowing.map((item) => <div className="foreshadow-item" key={item.id}><b>{item.title}</b><small>{item.status}{item.payoffDeadline ? ` · 回收期限：${item.payoffDeadline}` : ''}{item.evidence ? ` · 旧版证据：${item.evidence}` : ''}</small>{item.evidenceItems.map((evidence, index) => <div className="foreshadow-evidence" key={`${item.id}-evidence-${index}`}><small>{evidence.quote}</small><button type="button" onClick={() => useAppStore.getState().openChapter(evidence.chapterRelPath)}>证据章节：{evidence.chapterRelPath}</button>{evidence.note && <small>{evidence.note}</small>}</div>)}{item.relatedChapters.length > 0 && <small>章节：{item.relatedChapters.map((relPath) => <button type="button" key={relPath} onClick={() => useAppStore.getState().openChapter(relPath)}>{relPath}</button>)}</small>}</div>)}</div>}
        {activeTab === 'Diff' && <div className="diff-card">
          <div className="diff-title">Diff（{activeRelPath ? '本章历史' : '项目历史'}）</div>
          {revisionMessage && <p className="revision-message">{revisionMessage}</p>}
          {revisions.length > 0 ? <>
            <div className="revision-history" role="list" aria-label="Revision 历史">
              {revisions.map((revision) => <button type="button" role="listitem" className={revision.id === selectedRevision?.id ? 'active' : ''} key={revision.id} onClick={() => setSelectedRevisionId(revision.id)}>
                <b>{revision.source}</b><small>{revision.actor} · {new Date(revision.createdAt).toLocaleString()}</small><em>{revision.relPath}</em>
              </button>)}
            </div>
            {selectedRevision && <><div className="revision-diff-blocks" aria-label="逐段 Revision Diff">{paragraphDiff.map((paragraph, index) => <article className={`revision-diff-block ${paragraph.kind}`} key={`${selectedRevision.id}-${index}`}><header><small>第 {index + 1} 段 · {paragraph.kind === 'equal' ? '未变化' : paragraph.kind === 'changed' ? '已修改' : paragraph.kind === 'added' ? '新增' : '删除'}</small></header><div className="revision-diff-columns"><div className="revision-diff-side"><div className="revision-diff-side-header"><span>原文</span>{paragraph.kind === 'removed' && <b>删除</b>}</div><p>{paragraph.kind !== 'added' && paragraph.segments.map((segment, segmentIndex) => segment.kind === 'remove' ? <del key={`old-${segmentIndex}`}>{segment.text}</del> : segment.kind === 'equal' ? <span key={`old-${segmentIndex}`}>{segment.text}</span> : null)}</p></div><div className="revision-diff-side"><div className="revision-diff-side-header"><span>修改后</span>{paragraph.kind === 'added' && <b>新增</b>}</div><p>{paragraph.kind !== 'removed' && paragraph.segments.map((segment, segmentIndex) => segment.kind === 'remove' ? null : segment.kind === 'add' ? <ins key={`new-${segmentIndex}`}>{segment.text}</ins> : <span key={`new-${segmentIndex}`}>{segment.text}</span>)}</p></div></div></article>)}</div>{selectedRevisionChapterExists ? <button type="button" onClick={() => void revertRevision(selectedRevision)}>回退此 Revision</button> : <p className="revision-message">正文已删除或路径不可用；历史仍保留，但当前不能回退。</p>}</>}
          </> : <p>{activeRelPath ? '当前章节暂无 Revision 记录。' : '项目暂无 Revision 记录。'}</p>}
        </div>}
        {activeTab === 'Developer' && <DeveloperPanel />}
      </div>}
    </section>
  )
}
