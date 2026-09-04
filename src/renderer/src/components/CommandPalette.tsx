import { useEffect, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { FileText, FolderX, Plus, Wrench } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import type { SearchHit } from '../../../shared/chapter'
import type { StoryEntity } from '../../../shared/story'
import { commandActionDefinitions, matchesCommandAction, type CommandActionId } from '../commands/action-registry'

interface Props { open: boolean; onClose: () => void; onOpenWorkflow?: () => void; onOpenImages?: () => void; onOpenSettings?: () => void; onOpenHealth?: () => void; onOpenEntity?: (entity: StoryEntity) => void }

interface Item { id: string; label: string; hint?: string; kind: 'action' | 'chapter' | 'search' | 'entity'; action: () => void }

export function CommandPalette({ open, onClose, onOpenWorkflow, onOpenImages, onOpenSettings, onOpenHealth, onOpenEntity }: Props) {
  const chapters = useAppStore((s) => s.chapters)
  const openChapter = useAppStore((s) => s.openChapter)
  const createChapter = useAppStore((s) => s.createChapter)
  const closeProject = useAppStore((s) => s.closeProject)
  const setNotice = useAppStore((s) => s.setNotice)

  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'menu' | 'title'>('menu')
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState(0)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [entityHits, setEntityHits] = useState<StoryEntity[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Live search via IPC whenever the query is non-empty.
  useEffect(() => {
    if (!open || mode !== 'menu') return
    const q = query.trim()
    if (!q) { setHits([]); setEntityHits([]); setSearchError(null); setSearching(false); return }
    let cancelled = false
    setSearching(true); setSearchError(null)
    void Promise.all([window.novelAPI.search.project(q), window.novelAPI.story.search(q)]).then(([searchResult, entityResult]) => {
      if (cancelled) return
      if (searchResult.ok) setHits(searchResult.data)
      else setSearchError(searchResult.error.message)
      if (entityResult.ok) setEntityHits(entityResult.data)
      else setSearchError((current) => current ?? entityResult.error.message)
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
      setQuery(''); setMode('menu'); setTitle(''); setSelected(0); setHits([]); setEntityHits([]); setSearching(false); setSearchError(null)
    }
  }, [open])

  // Global keyboard: Cmd+K handled by App; here handle Escape + navigation.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const actionItems: Item[] = commandActionDefinitions.filter((definition) => matchesCommandAction(definition, query)).flatMap((definition) => {
    const action = (() => {
      const handlers: Partial<Record<CommandActionId, () => void>> = {
        'new-chapter': () => setMode('title'),
        'open-workflow': onOpenWorkflow,
        'open-images': onOpenImages,
        'open-settings': onOpenSettings,
        'open-health': onOpenHealth,
        'repair-indexes': () => { void window.novelAPI.project.repairIndexes().then((result) => { setNotice(result.ok ? `索引已修复：${result.data.documents} 章、${result.data.entities} 个实体、${result.data.timeline} 个事件、${result.data.artifacts} 个故事条目、${result.data.assets} 个资产${result.data.embeddingsRemoved ? `；清理 Embedding ${result.data.embeddingsRemoved} 条` : ''}${result.data.restoredSources.length ? `；恢复源文件：${result.data.restoredSources.join('、')}` : ''}` : `索引修复失败：${result.error.message}`) }).catch((error: unknown) => { setNotice(`索引修复失败：${error instanceof Error ? error.message : String(error)}`) }) },
        'check-integrity': () => { void window.novelAPI.project.checkIntegrity().then((result) => { setNotice(result.ok ? (result.data.warnings.length ? `完整性检查发现：${result.data.warnings.join('；')}（facts ${result.data.factsIndexed}）` : `完整性检查通过，文件源与索引一致（facts ${result.data.factsIndexed}）`) : `完整性检查失败：${result.error.message}`) }).catch((error: unknown) => { setNotice(`完整性检查失败：${error instanceof Error ? error.message : String(error)}`) }) },
        'close-project': () => { void closeProject() }
      }
      const handler = handlers[definition.id]
      return handler ? () => { onClose(); handler() } : undefined
    })()
    return action ? [{ id: definition.id, label: definition.label, hint: definition.hint, kind: 'action' as const, action }] : []
  })

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
    const searchItems: Item[] = hits.map((h) => ({
      id: 's:' + h.relPath,
      label: h.title,
      hint: h.snippet,
      kind: 'search' as const,
      action: () => { onClose(); void openChapter(h.relPath) }
    }))
    const entityItems: Item[] = entityHits.map((entity) => ({
      id: 'entity:' + entity.id,
      label: entity.name,
      hint: `${entity.kind} · ${entity.id}`,
      kind: 'entity' as const,
      action: () => { onClose(); onOpenEntity?.(entity) }
    }))
    if (!q) return [...actionItems, ...chapterItems]
    return [...actionItems, ...chapterItems, ...entityItems, ...searchItems]
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
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          className="palette-input"
          autoFocus
          placeholder={mode === 'title' ? '输入新章节标题，回车创建' : '输入命令或搜索章节…'}
          value={mode === 'title' ? title : query}
          onChange={(e) => {
            if (mode === 'title') { setTitle(e.target.value); setSelected(0) }
            else { setQuery(e.target.value); setSelected(0) }
          }}
          onKeyDown={onInputKeyDown}
        />
        <div className="palette-list">
          {searching && <div className="palette-status" role="status">正在搜索…</div>}
          {searchError && <div className="palette-status palette-error" role="alert">搜索失败：{searchError}</div>}
          {renderItems(actionList, '操作')}
          {renderItems(chapterList, '章节')}
          {renderItems(entityList, 'Story Bible 实体')}
          {renderItems(searchList, '搜索结果')}
          {items.length === 0 && <div className="palette-empty">无匹配结果</div>}
        </div>
        <div className="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 确认</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  )
}
