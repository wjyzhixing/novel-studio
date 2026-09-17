import { CanonReview } from './CanonReview'
import { ChevronDown, ChevronUp, Maximize2, Minimize2, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import type { Revision } from '../../../shared/revision'
import { foreshadowingStatuses } from '../../../shared/story'
import type { ForeshadowingRecord, ForeshadowingStatus } from '../../../shared/story'
import { DeveloperPanel } from './DeveloperPanel'
import { buildParagraphDiff } from '../../../shared/diff'
import { buildForeshadowingDashboard } from '../lib/foreshadowing-dashboard'
import { useUiText } from '../lib/i18n'

export function BottomPanel({ collapsed, maximized, onToggleCollapsed, onToggleMaximized, onResize }: { collapsed: boolean; maximized: boolean; onToggleCollapsed: () => void; onToggleMaximized: () => void; onResize: (delta: number) => void }) {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), uiText(key))
  const foreshadowingStatusLabel = (status: ForeshadowingStatus): string => uiText(({ planned: 'foreshadowingStatusPlanned', planted: 'foreshadowingStatusPlanted', echoed: 'foreshadowingStatusEchoed', resolved: 'foreshadowingStatusResolved', abandoned: 'foreshadowingStatusAbandoned' } as const)[status])
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
  const foreshadowingDashboard = useMemo(() => buildForeshadowingDashboard(foreshadowing), [foreshadowing])
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
      if (!result.ok) { setRevisions([]); setSelectedRevisionId(null); setRevisionMessage(formatUiText('revisionReadFailed', { error: result.error.message })); return }
      setRevisions(result.data)
      setSelectedRevisionId(result.data[0]?.id ?? null)
    }).catch((error) => { if (current) { setRevisions([]); setSelectedRevisionId(null); setRevisionMessage(formatUiText('revisionReadFailed', { error: error instanceof Error ? error.message : String(error) })) } })
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
      setNotesMessage(result.ok ? uiText('saved') : formatUiText('notesSaveFailed', { error: result.error.message }))
    } catch (error) { setNotesMessage(formatUiText('notesSaveFailed', { error: error instanceof Error ? error.message : String(error) })) }
  }
  const revertRevision = async (revision: Revision) => {
    try {
      const result = await window.novelAPI.revision.revert(revision.id)
      if (!result.ok) { setRevisionMessage(formatUiText('revisionReadFailed', { error: result.error.message })); return }
      setRevisionMessage(uiText('revisionReverted'))
      await useAppStore.getState().openChapter(result.data.relPath)
      const refreshed = await window.novelAPI.revision.list(result.data.relPath)
      if (refreshed.ok) { setRevisions(refreshed.data); setSelectedRevisionId(refreshed.data[0]?.id ?? null) }
      else setRevisionMessage(formatUiText('revisionRefreshFailed', { error: refreshed.error.message }))
    } catch (error) { setRevisionMessage(formatUiText('revisionReadFailed', { error: error instanceof Error ? error.message : String(error) })) }
  }
  const selectedRevision = revisions.find((revision) => revision.id === selectedRevisionId) ?? revisions[0]
  const paragraphDiff = selectedRevision ? buildParagraphDiff(selectedRevision.original, selectedRevision.replacement) : []
  const selectedRevisionChapterExists = Boolean(selectedRevision && chapters.some((chapter) => chapter.relPath === selectedRevision.relPath))
  const tabs = ['Notes', 'Outline', 'Canon Check', 'Foreshadowing', 'Diff', 'Developer', 'AI Chat']
  const tabLabels: Record<string, string> = {
    Notes: uiText('notes'), Outline: uiText('outline'), 'Canon Check': uiText('canonCheck'),
    Foreshadowing: uiText('foreshadowing'), Diff: uiText('diff'), Developer: uiText('developer'), 'AI Chat': uiText('aiChat'),
  }
  const tabKey = (tab: string) => tab.toLowerCase().replace(/\s+/g, '-')
  const moveTab = (index: number) => {
    const nextIndex = (index + tabs.length) % tabs.length
    const nextTab = tabs[nextIndex]
    setActiveTab(nextTab)
    requestAnimationFrame(() => document.getElementById(`bottom-tab-${tabKey(nextTab)}`)?.focus())
  }
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); moveTab(index + 1) }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); moveTab(index - 1) }
    if (event.key === 'Home') { event.preventDefault(); moveTab(0) }
    if (event.key === 'End') { event.preventDefault(); moveTab(tabs.length - 1) }
  }
  const activeTabKey = tabKey(activeTab)
  return (
    <section className={`bottom-panel${collapsed ? ' collapsed' : ''}`}>
      {!collapsed && <div className="bottom-resize-handle" role="separator" aria-orientation="horizontal" aria-label={uiText('adjustBottomPanel')} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragging = 'true' }} onPointerMove={(event) => { if (event.currentTarget.dataset.dragging === 'true') onResize(-event.movementY) }} onPointerUp={(event) => { delete event.currentTarget.dataset.dragging }} />}
      <div className="bottom-tabs"><div className="bottom-tab-list" role="tablist" aria-label={uiText('bottomWorkspace')}>{tabs.map((tab, index) => <button type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`bottom-panel-${tabKey(tab)}`} tabIndex={activeTab === tab ? 0 : -1} id={`bottom-tab-${tabKey(tab)}`} data-testid={tab === 'Canon Check' ? 'canon-check-tab' : undefined} key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)} onKeyDown={(event) => onTabKeyDown(event, index)}>{tabLabels[tab]}</button>)}</div><div className="bottom-panel-actions"><button type="button" title={maximized ? uiText('collapseBottomPanel') : uiText('expandBottomPanel')} aria-label={maximized ? uiText('collapseBottomPanel') : uiText('expandBottomPanel')} onClick={onToggleMaximized}>{maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button><button type="button" title={collapsed ? uiText('expandBottomPanel') : uiText('collapseBottomPanel')} aria-label={collapsed ? uiText('expandBottomPanel') : uiText('collapseBottomPanel')} onClick={onToggleCollapsed}>{collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button></div></div>
      {!collapsed && <div id={`bottom-panel-${activeTabKey}`} className="bottom-content" role="tabpanel" aria-labelledby={`bottom-tab-${activeTabKey}`} tabIndex={0}>
        {activeTab === 'Notes' && <div className="bottom-tool-panel"><h3>{uiText('notes')}</h3><textarea value={notes} onChange={(event) => { setNotes(event.target.value); setNotesMessage(uiText('unsaved')) }} placeholder={uiText('notesPlaceholder')} /><div className="story-form-actions"><button onClick={() => void saveNotes()} disabled={!activeRelPath}><Save size={13} /> {uiText('saveNote')}</button>{notesMessage && <span role="status">{notesMessage}</span>}</div></div>}
        {activeTab === 'Outline' && <div className="bottom-tool-panel"><h3>{uiText('outline')}</h3><p>{uiText('outlineHint')}</p></div>}
        {activeTab === 'AI Chat' && <div className="bottom-tool-panel"><h3>{uiText('aiChat')}</h3><p>{uiText('aiChatHint')}</p><button type="button" onClick={() => window.dispatchEvent(new Event('novel:open-chat'))}>{uiText('openChat')}</button><button type="button" onClick={() => setActiveTab('Canon Check')}>{uiText('viewCheck')}</button></div>}
        {activeTab === 'Canon Check' && <CanonReview />}
        {activeTab === 'Foreshadowing' && <div className="bottom-tool-panel"><div className="foreshadow-dashboard-head"><div><h3>{uiText('foreshadowing')}</h3><small>{formatUiText('foreshadowingSummary', { total: foreshadowingDashboard.total, resolved: foreshadowingDashboard.resolvedPercent, evidence: foreshadowingDashboard.evidencePercent })}</small></div><select aria-label={uiText('filterForeshadowing')} value={foreshadowingStatus} onChange={(event) => setForeshadowingStatus(event.target.value as ForeshadowingStatus | '')}><option value="">{uiText('allForeshadowingStatuses')}</option>{foreshadowingStatuses.map((status) => <option key={status} value={status}>{foreshadowingStatusLabel(status)}</option>)}</select></div>{foreshadowingDashboard.total > 0 && <div className="foreshadow-dashboard-stats" aria-label={uiText('foreshadowingLifecycle')}>{foreshadowingStatuses.map((status) => <button type="button" className={foreshadowingStatus === status ? 'active' : ''} key={status} onClick={() => setForeshadowingStatus(status)}><b>{foreshadowingDashboard.statusCounts[status]}</b><small>{foreshadowingStatusLabel(status)}</small></button>)}</div>}{foreshadowingDashboard.missingEvidenceIds.length > 0 && <div className="foreshadow-dashboard-warning" role="status">{formatUiText('missingForeshadowingEvidence', { count: foreshadowingDashboard.missingEvidenceIds.length })}</div>}{foreshadowing.length === 0 ? <p>{uiText('noMatchingForeshadowing')}</p> : foreshadowing.map((item) => <div className="foreshadow-item" key={item.id}><b>{item.title}</b><small>{foreshadowingStatusLabel(item.status)}{item.payoffDeadline ? <> · {formatUiText('foreshadowingPayoffDeadline', { date: item.payoffDeadline })}</> : ''}{item.evidence ? <> · {formatUiText('foreshadowingLegacyEvidence', { evidence: item.evidence })}</> : ''}</small>{item.evidenceItems.map((evidence, index) => <div className="foreshadow-evidence" key={`${item.id}-evidence-${index}`}><small>{evidence.quote}</small><button type="button" onClick={() => useAppStore.getState().openChapter(evidence.chapterRelPath)}>{formatUiText('evidenceChapter', { path: evidence.chapterRelPath })}</button>{evidence.note && <small>{evidence.note}</small>}</div>)}{item.relatedChapters.length > 0 && <small>{uiText('relatedChapters')}{item.relatedChapters.map((relPath) => <button type="button" key={relPath} onClick={() => useAppStore.getState().openChapter(relPath)}>{relPath}</button>)}</small>}</div>)}</div>}
        {activeTab === 'Diff' && <div className="diff-card">
          <div className="diff-title">{formatUiText('diffTitle', { history: activeRelPath ? uiText('diffChapterHistory') : uiText('diffProjectHistory') })}</div>
          {revisionMessage && <p className="revision-message">{revisionMessage}</p>}
          {revisions.length > 0 ? <>
            <div className="revision-history" role="list" aria-label={uiText('revisionHistoryAria')}>
              {revisions.map((revision) => <button type="button" role="listitem" className={revision.id === selectedRevision?.id ? 'active' : ''} key={revision.id} onClick={() => setSelectedRevisionId(revision.id)}>
                <b>{revision.source}</b><small>{revision.actor} · {new Date(revision.createdAt).toLocaleString()}</small><em>{revision.relPath}</em>
              </button>)}
            </div>
            {selectedRevision && <><div className="revision-diff-blocks" aria-label={uiText('revisionDiffAria')}>{paragraphDiff.map((paragraph, index) => <article className={`revision-diff-block ${paragraph.kind}`} key={`${selectedRevision.id}-${index}`}><header><small>{formatUiText('revisionParagraph', { index: index + 1, status: paragraph.kind === 'equal' ? uiText('revisionUnchanged') : paragraph.kind === 'changed' ? uiText('revisionModified') : paragraph.kind === 'added' ? uiText('revisionAdded') : uiText('revisionRemoved') })}</small></header><div className="revision-diff-columns"><div className="revision-diff-side"><div className="revision-diff-side-header"><span>{uiText('revisionOriginal')}</span>{paragraph.kind === 'removed' && <b>{uiText('revisionRemoved')}</b>}</div><p>{paragraph.kind !== 'added' && paragraph.segments.map((segment, segmentIndex) => segment.kind === 'remove' ? <del key={`old-${segmentIndex}`}>{segment.text}</del> : segment.kind === 'equal' ? <span key={`old-${segmentIndex}`}>{segment.text}</span> : null)}</p></div><div className="revision-diff-side"><div className="revision-diff-side-header"><span>{uiText('revisionRevised')}</span>{paragraph.kind === 'added' && <b>{uiText('revisionAdded')}</b>}</div><p>{paragraph.kind !== 'removed' && paragraph.segments.map((segment, segmentIndex) => segment.kind === 'remove' ? null : segment.kind === 'add' ? <ins key={`new-${segmentIndex}`}>{segment.text}</ins> : <span key={`new-${segmentIndex}`}>{segment.text}</span>)}</p></div></div></article>)}</div>{selectedRevisionChapterExists ? <button type="button" onClick={() => void revertRevision(selectedRevision)}>{uiText('revertRevision')}</button> : <p className="revision-message">{uiText('revisionUnavailable')}</p>}</>}
          </> : <p>{activeRelPath ? uiText('noChapterRevisions') : uiText('noProjectRevisions')}</p>}
        </div>}
        {activeTab === 'Developer' && <DeveloperPanel />}
      </div>}
    </section>
  )
}
