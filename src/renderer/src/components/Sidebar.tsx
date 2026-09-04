import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MouseEvent } from 'react'
import { BookOpen, ChevronDown, FileText, Folder, Globe2, Image as ImageIcon, MapPin, MoreHorizontal, Network, NotebookTabs, Package, Plus, ScrollText, Trash2, Users } from 'lucide-react'
import { useAppStore } from '../store/app-store'
import type { ChapterMeta } from '../../../shared/chapter'
import type { EntityKind } from '../../../shared/story'
import type { Volume } from '../../../shared/volume'

export type StorySection = EntityKind | 'world' | 'timeline' | 'plots' | 'foreshadowing' | 'lore' | 'notes'
const storyIcons = [Users, Globe2, ScrollText, Network, Package, BookOpen, NotebookTabs, MapPin, ScrollText, FileText]
const storyLabels = ['Characters', 'World', 'Timeline', 'Orgs', 'Items', 'Plots', 'Foreshadowing', 'Places', 'Lore', 'Notes']
const storySections: StorySection[] = ['character', 'world', 'timeline', 'org', 'item', 'plots', 'foreshadowing', 'place', 'lore', 'notes']
const CHAPTER_ROW_HEIGHT = 31
const CHAPTER_OVERSCAN = 8

function ChapterRow({ chapter, total, volumes, volumeId: groupVolumeId, onOpenChapter, assignChapter, unassignChapter, moveChapter }: { chapter: ChapterMeta; total: number; volumes: Volume[]; volumeId?: string; onOpenChapter: (relPath: string) => void; assignChapter: (volumeId: string, relPath: string) => void; unassignChapter: (relPath: string) => void; moveChapter: (relPath: string, toIndex: number) => void }) {
  const activeRelPath = useAppStore((s) => s.activeRelPath)
  const deleteChapter = useAppStore((s) => s.deleteChapter)
  const renameChapter = useAppStore((s) => s.renameChapter)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const [dragOver, setDragOver] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingTitle, setEditingTitle] = useState(chapter.title)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isActive = activeRelPath === chapter.relPath
  const volumeId = volumes.find((volume) => volume.chapterRelPaths.includes(chapter.relPath))?.id ?? ''
  const closeMenu = () => {
    setMenuOpen(false)
    menuButtonRef.current?.blur()
  }
  const handleDelete = () => {
    closeMenu()
    if (window.confirm(`确定删除“${chapter.title}”吗？正文会删除，但 Revision、Canon 和 Workflow 历史会保留。`)) void deleteChapter(chapter.relPath)
  }
  const handleRename = () => {
    closeMenu()
    const title = window.prompt('章节标题', chapter.title)?.trim()
    if (title && title !== chapter.title) void renameChapter(chapter.relPath, title)
  }
  const beginInlineRename = (event: MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation()
    setEditingTitle(chapter.title)
    setEditing(true)
  }
  const commitInlineRename = () => {
    const title = editingTitle.trim()
    setEditing(false)
    if (title && title !== chapter.title) void renameChapter(chapter.relPath, title)
  }
  useEffect(() => {
    if (!menuOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuButtonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeMenu()
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu() }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])
  useEffect(() => {
    if (!menuOpen || !menuRef.current) return
    menuRef.current.style.setProperty('--menu-top', `${menuPosition.top}px`)
    menuRef.current.style.setProperty('--menu-left', `${menuPosition.left}px`)
  }, [menuOpen, menuPosition])
  const openMenuAt = (top: number, left: number) => {
    const menuWidth = 84
    const menuHeight = 32
    setMenuPosition({
      top: top + menuHeight <= window.innerHeight ? top : Math.max(8, top - menuHeight - 4),
      left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, left))
    })
    setMenuOpen(true)
  }
  const toggleMenu = (event: MouseEvent<HTMLButtonElement>) => {
    if (menuOpen) { closeMenu(); return }
    const rect = event.currentTarget.getBoundingClientRect()
    openMenuAt(rect.bottom + 4, rect.right - 84)
  }
  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    openMenuAt(event.clientY + 4, event.clientX)
  }
  return (
    <div className={`chapter${isActive ? ' active' : ''}${dragOver ? ' drag-over' : ''}`} title={chapter.relPath} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/novel-chapter', chapter.relPath) }} onDragOver={(event) => { if (event.dataTransfer.types.includes('text/novel-chapter')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOver(true) } }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); const source = event.dataTransfer.getData('text/novel-chapter'); if (source && source !== chapter.relPath) { moveChapter(source, Math.max(0, chapter.number - 1)); if (groupVolumeId) assignChapter(groupVolumeId, source) } }} onDragEnd={() => setDragOver(false)} onContextMenu={handleContextMenu}>
      {editing ? <><span className="chapter-no">{chapter.number}</span><input className="chapter-title-input" aria-label={`编辑章节标题 ${chapter.title}`} autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') commitInlineRename(); if (event.key === 'Escape') setEditing(false) }} onBlur={commitInlineRename} /><em className="chapter-wc">{chapter.wordCount}</em></> : <button className="chapter-open" type="button" data-testid="chapter-open" data-chapter-relpath={chapter.relPath} aria-posinset={chapter.number} aria-setsize={total} onClick={() => onOpenChapter(chapter.relPath)}>
        <span className="chapter-no">{chapter.number}</span>
        <span className="chapter-title" title="双击编辑章节标题" onDoubleClick={beginInlineRename}>{chapter.title}</span>
        <em className="chapter-wc">{chapter.wordCount}</em>
      </button>}
      <select className="chapter-volume-select" aria-label={`${chapter.title} 所属卷`} value={volumeId} onChange={(event) => event.target.value ? assignChapter(event.target.value, chapter.relPath) : unassignChapter(chapter.relPath)} title="设置所属卷">
        <option value="">未分卷</option>
        {volumes.map((volume) => <option value={volume.id} key={volume.id}>{volume.title}</option>)}
      </select>
      <div className="chapter-menu-wrap">
        <button ref={menuButtonRef} className="chapter-menu-btn" type="button" aria-label={`${chapter.title} 菜单`} aria-expanded={menuOpen} onClick={toggleMenu}>
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && createPortal(
          <div ref={menuRef} className="menu-dropdown" role="menu">
            <button type="button" role="menuitem" className="menu-item" onClick={handleRename}>重命名</button>
            <button type="button" role="menuitem" className="menu-item danger" onClick={handleDelete}>删除</button>
          </div>, document.body)}
      </div>
    </div>
  )
}

function VirtualChapterList({ chapters, volumes, volumeId, onOpenChapter, assignChapter, unassignChapter, moveChapter }: { chapters: ChapterMeta[]; volumes: Volume[]; volumeId?: string; onOpenChapter: (relPath: string) => void; assignChapter: (volumeId: string, relPath: string) => void; unassignChapter: (relPath: string) => void; moveChapter: (relPath: string, toIndex: number) => void }) {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(420)
  const viewportRef = useRef<HTMLDivElement>(null)
  const activeRelPath = useAppStore((state) => state.activeRelPath)
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => setViewportHeight(viewport.clientHeight))
    observer.observe(viewport)
    setViewportHeight(viewport.clientHeight)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!activeRelPath) return
    const index = chapters.findIndex((chapter) => chapter.relPath === activeRelPath)
    const viewport = viewportRef.current
    if (index < 0 || !viewport) return
    if (index * CHAPTER_ROW_HEIGHT < viewport.scrollTop || (index + 1) * CHAPTER_ROW_HEIGHT > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = Math.max(0, index * CHAPTER_ROW_HEIGHT - CHAPTER_OVERSCAN * CHAPTER_ROW_HEIGHT)
  }, [activeRelPath, chapters])
  const start = Math.max(0, Math.floor(scrollTop / CHAPTER_ROW_HEIGHT) - CHAPTER_OVERSCAN)
  const end = Math.min(chapters.length, Math.ceil((scrollTop + viewportHeight) / CHAPTER_ROW_HEIGHT) + CHAPTER_OVERSCAN)
  const visible = useMemo(() => chapters.slice(start, end), [chapters, start, end])
  return <div ref={viewportRef} className="chapter-list virtual-chapter-list" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
    <div className="virtual-chapter-spacer" data-count={chapters.length}>
      <div className="virtual-chapter-window" data-start={start}>
        {visible.map((chapter) => <ChapterRow key={chapter.relPath} chapter={chapter} total={chapters.length} volumes={volumes} volumeId={volumeId} onOpenChapter={onOpenChapter} assignChapter={assignChapter} unassignChapter={unassignChapter} moveChapter={moveChapter} />)}
      </div>
    </div>
  </div>
}

export function Sidebar({ onOpenStory, onOpenWorkflow, onOpenGraph, onOpenImages, onOpenChapter, activeSection, activeTool }: { onOpenStory: (section: StorySection) => void; onOpenWorkflow: () => void; onOpenGraph: () => void; onOpenImages: () => void; onOpenChapter: (relPath: string) => void; activeSection: StorySection | null; activeTool: 'workflow' | 'graph' | 'images' | null }) {
  const project = useAppStore((s) => s.project)
  const chapters = useAppStore((s) => s.chapters)
  const volumes = useAppStore((s) => s.volumes)
  const createChapter = useAppStore((s) => s.createChapter)
  const createVolume = useAppStore((s) => s.createVolume)
  const updateVolume = useAppStore((s) => s.updateVolume)
  const deleteVolume = useAppStore((s) => s.deleteVolume)
  const assignChapter = useAppStore((s) => s.assignChapterToVolume)
  const unassignChapter = useAppStore((s) => s.unassignChapterFromVolume)
  const moveChapter = useAppStore((s) => s.moveChapter)
  const reorderVolumes = useAppStore((s) => s.reorderVolumes)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creatingVolume, setCreatingVolume] = useState(false)
  const [newVolumeTitle, setNewVolumeTitle] = useState('')
  const [editingVolumeId, setEditingVolumeId] = useState<string | null>(null)
  const [editingVolumeTitle, setEditingVolumeTitle] = useState('')
  const commitNew = () => { const t = newTitle.trim(); setNewTitle(''); setCreating(false); if (t) void createChapter(t) }
  const commitVolume = () => { const title = newVolumeTitle.trim(); setNewVolumeTitle(''); setCreatingVolume(false); if (title) void createVolume({ title }) }
  const volumeForChapter = new Map(volumes.flatMap((volume) => volume.chapterRelPaths.map((path) => [path, volume.id] as const)))
  const unassigned = chapters.filter((chapter) => !volumeForChapter.has(chapter.relPath))
  const chaptersInVolume = (volume: Volume) => chapters.filter((chapter) => volume.chapterRelPaths.includes(chapter.relPath))
  const renameVolume = (volume: Volume) => { setEditingVolumeId(volume.id); setEditingVolumeTitle(volume.title) }
  const commitVolumeRename = (volume: Volume) => { const title = editingVolumeTitle.trim(); setEditingVolumeId(null); if (title && title !== volume.title) void updateVolume({ id: volume.id, title }) }
  const removeVolume = (volume: Volume) => { if (window.confirm(`删除卷“${volume.title}”？卷内章节需要先移出。`)) void deleteVolume(volume.id) }
  const moveVolume = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const ids = volumes.map((volume) => volume.id)
    const from = ids.indexOf(sourceId); const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1); ids.splice(to, 0, sourceId)
    void reorderVolumes(ids)
  }
  return (

    <aside className="sidebar panel-border-right">
      <div className="section-title">
        <span>EXPLORER</span>
        <button className="sidebar-plus" type="button" title="新建章节" onClick={() => setCreating(true)}><Plus size={14} /></button>
      </div>
      <div className="project-row" title={project?.rootPath}><Folder size={15} /><span>{project?.manifest.title ?? '未打开项目'}</span></div>
      <div className="section-title story-title"><span>CHAPTERS</span><button className="sidebar-plus" type="button" title="新建卷" onClick={() => setCreatingVolume(true)}><Plus size={14} /></button></div>
      {creatingVolume && <div className="chapter-create"><input className="chapter-create-input" autoFocus type="text" value={newVolumeTitle} placeholder="卷名称，回车创建" onChange={(event) => setNewVolumeTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commitVolume(); else if (event.key === 'Escape') { setNewVolumeTitle(''); setCreatingVolume(false) } }} /></div>}
      {creating && (
        <div className="chapter-create">
          <input className="chapter-create-input" autoFocus type="text" value={newTitle} placeholder="章节标题，回车创建"
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNew()
              else if (e.key === 'Escape') { setNewTitle(''); setCreating(false) }
            }} />
        </div>
      )}
      {chapters.length > 0 && <div className="volume-tree">
        {volumes.map((volume) => <section className="volume-group" key={volume.id}><div className="volume-heading" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/novel-volume', volume.id) }} onDragOver={(event) => { if (event.dataTransfer.types.includes('text/novel-volume')) event.preventDefault() }} onDrop={(event) => { event.preventDefault(); moveVolume(event.dataTransfer.getData('text/novel-volume'), volume.id) }}><ChevronDown size={12} />{editingVolumeId === volume.id ? <input className="volume-title-input" autoFocus value={editingVolumeTitle} onChange={(event) => setEditingVolumeTitle(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') commitVolumeRename(volume); if (event.key === 'Escape') setEditingVolumeId(null) }} onBlur={() => commitVolumeRename(volume)} /> : <span title="双击或点击改名编辑卷名" onDoubleClick={() => renameVolume(volume)}>{volume.title}</span>}<small>{chaptersInVolume(volume).length}</small><button type="button" aria-label={`重命名 ${volume.title}`} onClick={() => renameVolume(volume)}>改名</button><button type="button" aria-label={`删除 ${volume.title}`} onClick={() => removeVolume(volume)}><Trash2 size={11} /></button></div><VirtualChapterList chapters={chaptersInVolume(volume)} volumes={volumes} volumeId={volume.id} onOpenChapter={onOpenChapter} assignChapter={(volumeId, relPath) => void assignChapter(volumeId, relPath)} unassignChapter={(relPath) => void unassignChapter(relPath)} moveChapter={(relPath, toIndex) => void moveChapter(relPath, toIndex)} /></section>)}
        {unassigned.length > 0 && <section className="volume-group"><div className="volume-heading unassigned"><ChevronDown size={12} /><span>未分卷</span><small>{unassigned.length}</small></div><VirtualChapterList chapters={unassigned} volumes={volumes} onOpenChapter={onOpenChapter} assignChapter={(volumeId, relPath) => void assignChapter(volumeId, relPath)} unassignChapter={(relPath) => void unassignChapter(relPath)} moveChapter={(relPath, toIndex) => void moveChapter(relPath, toIndex)} /></section>}
      </div>}
      {chapters.length === 0 && (
          <div className="chapter-empty">
            <p>还没有章节。</p>
            <p>点击上方 <b>＋</b> 新建，或将 <code>.md</code> 拖入 <code>chapters/</code> 目录。</p>
          </div>
      )}
      <div className="section-title story-title"><span>STORY BIBLE</span></div>
      <button className={`story-row workflow-nav${activeTool === 'workflow' ? ' active' : ''}`} onClick={onOpenWorkflow}><Network size={14} /><span>Workflow Editor</span></button>
      <button className={`story-row workflow-nav${activeTool === 'graph' ? ' active' : ''}`} onClick={onOpenGraph}><Network size={14} /><span>Graph Studio</span></button>
      <button data-testid="illustration-open" className={`story-row workflow-nav${activeTool === 'images' ? ' active' : ''}`} onClick={onOpenImages}><ImageIcon size={14} /><span>Illustration Studio</span></button>
      <div className="story-list">
        {storyLabels.map((label, i) => {
          const Icon = storyIcons[i]
          const section = storySections[i]
          return <button className={`story-row${activeSection === section ? ' active' : ''}`} key={label} onClick={() => onOpenStory(section)}><Icon size={14} /><span>{label}</span></button>
        })}
      </div>
    </aside>
  )
}
