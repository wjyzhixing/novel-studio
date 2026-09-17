import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { FileText, FolderX, Plus, Wrench } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import type { StoryEntity, StorySearchResult } from '../../../shared/story'
import { commandActionDefinitions, matchesCommandAction, type CommandActionId } from '../commands/action-registry'
import { useUiText } from '../lib/i18n'

interface Props { open: boolean; onClose: () => void; onOpenWorkflow?: () => void; onOpenImages?: () => void; onOpenSettings?: () => void; onOpenHealth?: () => void; onOpenEntity?: (entity: StoryEntity) => void; onOpenStoryResult?: (result: StorySearchResult) => void }

interface Item { id: string; label: string; hint?: string; kind: 'action' | 'chapter' | 'search' | 'entity'; action: () => void }

export function CommandPalette({ open, onClose, onOpenWorkflow, onOpenImages, onOpenSettings, onOpenHealth, onOpenEntity, onOpenStoryResult }: Props) {
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  const chapters = useAppStore((s) => s.chapters)
  const openChapter = useAppStore((s) => s.openChapter)
  const createChapter = useAppStore((s) => s.createChapter)
  const closeProject = useAppStore((s) => s.closeProject)
  const setNotice = useAppStore((s) => s.setNotice)
  const formatIndexRepairSummary = (data: { documents: number; entities: number; timeline: number; artifacts: number; assets: number; embeddingsRemoved?: number; restoredSources: string[] }): string => {
    const details = formatUiText('indexRepairDetails', { documents: data.documents, entities: data.entities, timeline: data.timeline, artifacts: data.artifacts, assets: data.assets })
    const embeddings = data.embeddingsRemoved ? formatUiText('indexRepairEmbeddingsRemoved', { count: data.embeddingsRemoved }) : ''
    const restored = data.restoredSources.length ? formatUiText('indexRepairRestoredSources', { files: data.restoredSources.join('、') }) : ''
    return `${details}${embeddings}${restored}`
  }

  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'menu' | 'title'>('menu')
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState(0)
  const [storyHits, setStoryHits] = useState<StorySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Live search via IPC whenever the query is non-empty.
  useEffect(() => {
    if (!open || mode !== 'menu') return
    const q = query.trim()
    if (!q) { setStoryHits([]); setSearchError(null); setSearching(false); return }
    let cancelled = false
    setSearching(true); setSearchError(null)
    void window.novelAPI.story.searchAll(q).then((storyResult) => {
      if (cancelled) return
      if (storyResult.ok) setStoryHits(storyResult.data)
      else setSearchError(storyResult.error.message)
    }).catch((error: unknown) => {
      if (!cancelled) setSearchError(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (!cancelled) setSearching(false)
    })
    return () => { cancelled = true }
  }, [open, query, mode])

  // Reset state when opened / closed.
  useEffect(() => {
    if (open) {
      setQuery(''); setMode('menu'); setTitle(''); setSelected(0); setStoryHits([]); setSearching(false); setSearchError(null)
    }
  }, [open])

  // Global keyboard: Cmd+K handled by App; here handle Escape + navigation.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    let frame = 0
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'Tab') {
        const dialog = dialogRef.current
        if (!dialog) return
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
        if (focusable.length === 0) { event.preventDefault(); return }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    frame = window.requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])')
      firstFocusable?.focus()
    })
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  const actionItems: Item[] = commandActionDefinitions.filter((definition) => matchesCommandAction(definition, query, uiText)).flatMap((definition) => {
    const action = (() => {
      const handlers: Partial<Record<CommandActionId, () => void>> = {
        'new-chapter': () => setMode('title'),
        'open-workflow': onOpenWorkflow,
        'open-images': onOpenImages,
        'open-settings': onOpenSettings,
        'open-health': onOpenHealth,
        'repair-indexes': () => { void window.novelAPI.project.repairIndexes().then((result) => { const summary = result.ok ? formatIndexRepairSummary(result.data) : ''; setNotice(result.ok ? formatUiText('indexRepairSummary', { summary }) : formatUiText('indexRepairFailed', { error: result.error.message })) }).catch((error: unknown) => { setNotice(formatUiText('indexRepairFailed', { error: error instanceof Error ? error.message : String(error) })) }) },
        'check-integrity': () => { void window.novelAPI.project.checkIntegrity().then((result) => { setNotice(result.ok ? (result.data.warnings.length ? formatUiText('integrityWarnings', { warnings: result.data.warnings.join('；'), facts: result.data.factsIndexed }) : formatUiText('integrityPassed', { facts: result.data.factsIndexed })) : formatUiText('integrityCheckFailed', { error: result.error.message })) }).catch((error: unknown) => { setNotice(formatUiText('integrityCheckFailed', { error: error instanceof Error ? error.message : String(error) })) }) },
        'close-project': () => { void closeProject() }
      }
      const handler = handlers[definition.id]
      return handler ? () => { onClose(); handler() } : undefined
    })()
    return action ? [{ id: definition.id, label: uiText(definition.labelKey), hint: uiText(definition.hintKey), kind: 'action' as const, action }] : []
  })

  const openStoryResult = (result: StorySearchResult) => {
    window.dispatchEvent(new CustomEvent('novel:focus-story-result', { detail: result.id }))
    onOpenStoryResult?.(result)
  }

  // Build ordered item list based on query and mode.
  const buildItems = (): Item[] => {
    if (mode === 'title') return actionItems.filter((item) => item.id === 'new-chapter')
    const q = query.trim().toLowerCase()
    const chapters_ = q
      ? chapters.filter((c) => (c.title + ' ' + c.number).toLowerCase().includes(q))
      : chapters
    const chapterItems: Item[] = chapters_.map((c) => ({
      id: 'ch:' + c.relPath,
      label: `${c.number} ${c.title}`,
      hint: c.relPath,
      kind: 'chapter' as const,
      action: () => { onClose(); void openChapter(c.relPath) }
    }))
    const entityItems: Item[] = storyHits.map((result) => ({
      id: `${result.kind}:${result.id}`,
      label: result.title,
      hint: result.hint,
      kind: result.kind === 'entity' ? 'entity' as const : 'search' as const,
      action: () => {
        onClose()
        if (result.kind === 'document' && result.relPath) void openChapter(result.relPath)
        else if (result.kind === 'entity') void window.novelAPI.story.getEntity(result.id).then((entity) => { if (entity.ok) onOpenEntity?.(entity.data) })
        else if (result.kind === 'timeline') openStoryResult(result)
        else openStoryResult(result)
      }
    }))
    if (!q) return [...actionItems, ...chapterItems]
    return [...actionItems, ...chapterItems, ...entityItems]
  }

  const items = buildItems()
  const clampedSelected = Math.min(selected, Math.max(0, items.length - 1))
  useEffect(() => {
    if (clampedSelected !== selected) setSelected(clampedSelected)
  }, [clampedSelected, selected])

  const runSelected = () => {
    const it = items[clampedSelected]
    if (!it) return
    if (mode === 'title' && it.id === 'new-chapter') {
      const t = title.trim()
      if (t) { onClose(); void createChapter(t) }
      return
    }
    it.action()
  }

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (mode === 'title') {
      if (e.key === 'Enter') { e.preventDefault(); runSelected() }
      else if (e.key === 'Escape') { e.preventDefault(); setMode('menu'); setTitle('') }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); runSelected() }
  }

  if (!open) return null

  const renderItems = (list: Item[], label: string) => {
    if (list.length === 0) return null
    return (
      <>
        <div className="palette-group">{label}</div>
        {list.map((it, idx) => {
          const globalIdx = items.indexOf(it)
          const Icon = it.kind === 'action' ? (it.id === 'new-chapter' ? Plus : FolderX) : FileText
          return (
           <div key={it.id} className={`palette-item${globalIdx === selected ? ' active' : ''}`}
              id={`palette-option-${globalIdx}`} role="option" aria-selected={globalIdx === selected}
              onMouseEnter={() => setSelected(globalIdx)} onClick={() => runSelected()}>
              {it.id === 'repair-indexes' ? <Wrench size={14} /> : <Icon size={14} />}
              <span>{it.label}</span>
              {it.hint && <em>{it.hint}</em>}
            </div>
          )
        })}
      </>
    )
  }

  const actionList = items.filter((i) => i.kind === 'action')
  const chapterList = items.filter((i) => i.kind === 'chapter')
  const searchList = items.filter((i) => i.kind === 'search')
  const entityList = items.filter((i) => i.kind === 'entity')

  return (
    <div className="palette-overlay" onClick={onClose}>
        <div ref={dialogRef} className="palette" role="dialog" aria-modal="true" aria-label={uiText('commandDialog')} onClick={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          role="combobox"
          aria-controls="palette-options"
          aria-activedescendant={items[clampedSelected] ? `palette-option-${clampedSelected}` : undefined}
          autoFocus
          placeholder={mode === 'title' ? uiText('newChapterTitlePlaceholder') : uiText('commandSearchPlaceholder')}
          value={mode === 'title' ? title : query}
          onChange={(e) => {
            if (mode === 'title') { setTitle(e.target.value); setSelected(0) }
            else { setQuery(e.target.value); setSelected(0) }
          }}
          onKeyDown={onInputKeyDown}
        />
        <div id="palette-options" className="palette-list" role="listbox" aria-label={uiText('paletteOptions')}>
          {searching && <div className="palette-status" role="status">{uiText('searching')}</div>}
          {searchError && <div className="palette-status palette-error" role="alert">{formatUiText('searchFailed', { error: searchError })}</div>}
          {renderItems(actionList, uiText('actionsGroup'))}
          {renderItems(chapterList, uiText('chaptersGroup'))}
          {renderItems(entityList, uiText('entitiesGroup'))}
          {renderItems(searchList, uiText('searchResultsGroup'))}
          {items.length === 0 && <div className="palette-empty">{uiText('noMatchingResults')}</div>}
        </div>
        <div className="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {uiText('choose')}</span>
          <span><kbd>↵</kbd> {uiText('confirm')}</span>
          <span><kbd>Esc</kbd> {uiText('close')}</span>
        </div>
      </div>
    </div>
  )
}
