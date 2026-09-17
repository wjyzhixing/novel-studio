import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Editor, Extension, Node } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Bold, Heading1, Heading2, Italic, List, MessageSquareQuote, Redo2, Undo2 } from 'lucide-react'
import { markdownToHtml, htmlToMarkdown } from '../lib/markdown'
import { buildDiffPreview } from '../lib/diff-preview'
import { useAppStore } from '../store/app-store'
import { ScenePanel } from './ScenePanel'
import { SelectionToolbar } from './SelectionToolbar'
import { captureSelectionSnapshot, findSelectionRangeByText, nativeSelectionState, nextPersistedSelection, persistedSelectionContainsPosition, selectionBelongsToChapter, selectionDecorationNeedsUpdate, type PersistedSelectionRange } from '../lib/selection-persistence'
import { useUiText } from '../lib/i18n'

const selectionHighlightKey = new PluginKey('novel-selection-persistence')
const SelectionPersistence = Extension.create({
  name: 'selectionPersistence',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: selectionHighlightKey,
      state: {
        init: () => DecorationSet.empty,
        apply: (transaction, decorations) => {
          const meta = transaction.getMeta(selectionHighlightKey) as { from?: number; to?: number; clear?: boolean } | undefined
          const mapped = transaction.docChanged ? decorations.map(transaction.mapping, transaction.doc) : decorations
          const existing = mapped.find()[0]
          const current = existing ? { from: existing.from, to: existing.to } satisfies PersistedSelectionRange : null
          const next = nextPersistedSelection(current, meta, transaction.doc.content.size)
          if (!next) return DecorationSet.empty
          if (!meta || typeof meta.from !== 'number' || typeof meta.to !== 'number') return mapped
          return DecorationSet.create(transaction.doc, [Decoration.inline(next.from, next.to, { class: 'editor-selection-persisted' })])
        }
      },
      props: {
        decorations: (state) => selectionHighlightKey.getState(state),
        handleClick: (view, position) => {
          const persisted = selectionHighlightKey.getState(view.state)?.find(position, position + 1)[0]
          if (!persisted || !persistedSelectionContainsPosition({ from: persisted.from, to: persisted.to }, position)) return false
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, persisted.from, persisted.to)))
          view.focus()
          return true
        }
      }
    })]
  }
})

function setSelectionHighlight(editor: Editor) {
  const { from, to } = editor.state.selection
  editor.view.dispatch(editor.view.state.tr.setMeta(selectionHighlightKey, { from, to }))
}

function clearSelectionHighlight(editor: Editor) {
  editor.view.dispatch(editor.view.state.tr.setMeta(selectionHighlightKey, { clear: true }))
}

function restoreSelectionHighlight(editor: Editor, selectedText: string) {
  const range = findSelectionRangeByText(editor.state.doc, selectedText)
  if (!range) return false
  const current = selectionHighlightKey.getState(editor.state)?.find(range.from, range.to)[0]
  if (!selectionDecorationNeedsUpdate(current ? { from: current.from, to: current.to } : null, range)) return true
  editor.view.dispatch(editor.view.state.tr.setMeta(selectionHighlightKey, range))
  return true
}

const NovelImage = Node.create({
  name: 'novelImage',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: () => ({ src: {}, alt: { default: '' }, title: { default: '' }, 'data-asset-id': { default: null }, 'data-asset-path': { default: null } }),
  parseHTML: () => [{ tag: 'img[src]' }],
  renderHTML: ({ HTMLAttributes }) => ['img', HTMLAttributes]
})

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
function createAssetBlobUrl(bytes: Uint8Array, mimeType: string): string {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return URL.createObjectURL(new Blob([copy.buffer], { type: mimeType }))
}
function previewHtml(markdown: string, original: string, suggested: string, selection: string | null, projectRoot?: string): string {
  const html = markdownToHtml(markdown, projectRoot)
  let originalPart = original
  let suggestedPart = suggested
  if (selection && original.indexOf(selection) >= 0) {
    const start = original.indexOf(selection)
    const suffix = original.slice(start + selection.length)
    originalPart = selection
    suggestedPart = suggested.slice(start, Math.max(start, suggested.length - suffix.length))
  }
  const visibleChanged = buildDiffPreview(originalPart, suggestedPart).filter((part) => part.kind === 'add' && part.text.trim())
  return visibleChanged.reduce((result, part) => result.replace(escapeHtml(part.text), `<span class="ai-diff-add">${escapeHtml(part.text)}</span>`), html)
}

export function EditorPane() {
  const activeChapter = useAppStore((s) => s.activeChapter)
  const editorMarkdown = useAppStore((s) => s.editorMarkdown)
  const editorSelection = useAppStore((s) => s.editorSelection)
  const editorSelectionSnapshot = useAppStore((s) => s.editorSelectionSnapshot)
  const editorSelectionConfirmed = useAppStore((s) => s.editorSelectionConfirmed)
  const activeRelPath = useAppStore((s) => s.activeRelPath)
  const liveWordCount = useAppStore((s) => s.liveWordCount)
  const pendingSuggestion = useAppStore((s) => s.pendingSuggestion)
  const scenes = useAppStore((s) => s.scenes)
  const selectedSceneId = useAppStore((s) => s.selectedSceneId)
  const projectRoot = useAppStore((s) => s.project?.rootPath)
  const uiText = useUiText()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))

  const lastLoadedRef = useRef<string | null>(null)
  const relPathRef = useRef<string | null>(null)
  const persistedSelectionRef = useRef<{ relPath: string; text: string } | null>(null)
  const missingAssetPlaceholder = (assetId: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180"><rect width="640" height="180" rx="12" fill="#211c36"/><text x="24" y="78" fill="#c6b8ff" font-family="sans-serif" font-size="22">${formatUiText('assetUnavailable', {})}</text><text x="24" y="116" fill="#8f86a8" font-family="monospace" font-size="15">${assetId}</text></svg>`)}\n`

  const hydrateAssetImages = async (html: string): Promise<string> => {
    const assetIds = [...html.matchAll(/data-asset-id=["'](asset_[a-zA-Z0-9_-]+)["']/g)].map((match) => match[1])
    const uniqueIds = [...new Set(assetIds)]
    const resolved = await Promise.all(uniqueIds.map(async (assetId) => {
      try {
        const result = await window.novelAPI.image.readAsset(assetId)
        return [assetId, result.ok ? createAssetBlobUrl(result.data.bytes, result.data.mimeType) : null] as const
      } catch {
        return [assetId, null] as const
      }
    }))
    const resolvedById = new Map(resolved)
    return html.replace(/<img\b[^>]*>/gi, (tag) => {
      const idMatch = tag.match(/data-asset-id=["'](asset_[a-zA-Z0-9_-]+)["']/i)
      if (!idMatch) return tag
      const assetUrl = resolvedById.get(idMatch[1])
      const cleanTag = tag.replace(/\sdata-asset-missing=["'][^"']*["']/i, '')
      if (!assetUrl) return cleanTag
        .replace(/\s*src=["'][^"']*["']/i, ` data-asset-missing="true" src="${missingAssetPlaceholder(idMatch[1])}"`)
        .replace(/\salt=["'][^"']*["']/i, ` alt="${formatUiText('assetUnavailableWithId', { id: idMatch[1] })}"`)
        .replace(/\stitle=["'][^"']*["']/i, ` title="${formatUiText('assetMissingWithId', { id: idMatch[1] })}"`)
      if (/\bsrc=["'][^"']*["']/i.test(cleanTag)) return cleanTag.replace(/\bsrc=["'][^"']*["']/i, `src="${assetUrl}"`)
      return cleanTag.replace(/>$/, ` src="${assetUrl}">`)
    })
  }

  const editor = useEditor({
    extensions: [StarterKit, Highlight.configure({ multicolor: false }), Link.configure({ openOnClick: false, autolink: true }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, TaskList, TaskItem.configure({ nested: true }), NovelImage, SelectionPersistence],
    content: '<p></p>',
    editorProps: { attributes: { class: 'novel-editor' } },
    onUpdate: ({ editor: ed }) => {
      const md = htmlToMarkdown(ed.getHTML())
      useAppStore.getState().setEditorMarkdown(md)
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection
      const snapshot = captureSelectionSnapshot(ed.state.doc, from, to)
      const store = useAppStore.getState()
      store.setEditorSelectionActive(Boolean(snapshot))
    }
  })

  // Load markdown into the editor when opening a new chapter or when the store
  // content changes while the user is NOT mid-edit (avoids cursor jumps).
  useEffect(() => {
    if (!editor) return
    const relChanged = relPathRef.current !== activeRelPath
    if (relChanged) {
      relPathRef.current = activeRelPath
      persistedSelectionRef.current = null
      lastLoadedRef.current = editorMarkdown
      clearSelectionHighlight(editor)
      const source = pendingSuggestion ? previewHtml(pendingSuggestion.suggested, pendingSuggestion.original, pendingSuggestion.suggested, pendingSuggestion.selection, projectRoot) : markdownToHtml(editorMarkdown, projectRoot)
      void hydrateAssetImages(source).then((html) => {
        if (relPathRef.current !== activeRelPath) return
        editor.commands.setContent(html, { emitUpdate: false })
        const confirmed = useAppStore.getState()
        const snapshot = confirmed.editorSelectionConfirmed && selectionBelongsToChapter(confirmed.editorSelectionSnapshot, activeRelPath) ? confirmed.editorSelectionSnapshot : null
        if (snapshot) {
          persistedSelectionRef.current = { relPath: snapshot.relPath ?? activeRelPath ?? '', text: snapshot.text }
          restoreSelectionHighlight(editor, snapshot.text)
        }
      })
      return
    }
    if (lastLoadedRef.current === editorMarkdown) return
    if (editor.isFocused) return
    lastLoadedRef.current = editorMarkdown
    const source = pendingSuggestion ? previewHtml(pendingSuggestion.suggested, pendingSuggestion.original, pendingSuggestion.suggested, pendingSuggestion.selection, projectRoot) : markdownToHtml(editorMarkdown, projectRoot)
    void hydrateAssetImages(source).then((html) => {
      if (relPathRef.current !== activeRelPath) return
      editor.commands.setContent(html, { emitUpdate: false })
      const persisted = persistedSelectionRef.current
      if (persisted?.relPath === activeRelPath) restoreSelectionHighlight(editor, persisted.text)
    })
  }, [editor, editorMarkdown, activeRelPath, pendingSuggestion, projectRoot])

  // Chat temporarily unmounts this component. When it mounts again, the
  // ProseMirror decoration state is new even though the confirmed selection
  // remains in the app store. Re-apply it independently of the content-load
  // promise so returning from Chat cannot leave the editor visually unmarked.
  useEffect(() => {
    if (!editor || !editorSelectionConfirmed || !selectionBelongsToChapter(editorSelectionSnapshot, activeRelPath)) return
    const restore = () => {
      restoreSelectionHighlight(editor, editorSelectionSnapshot!.text)
    }
    restore()
    const handleTransaction = () => {
      const current = useAppStore.getState()
      if (!current.editorSelectionConfirmed || !selectionBelongsToChapter(current.editorSelectionSnapshot, current.activeRelPath)) return
      restoreSelectionHighlight(editor, current.editorSelectionSnapshot!.text)
    }
    editor.on('transaction', handleTransaction)
    return () => { editor.off('transaction', handleTransaction) }
  }, [editor, editorMarkdown, activeRelPath, editorSelectionConfirmed, editorSelectionSnapshot?.relPath, editorSelectionSnapshot?.text])

  // Browser text selection can also originate outside Tiptap (for example,
  // when the user drags across the Agent panel). Keep the persisted editor
  // range, but only expose it as the active selection when the native anchor
  // still belongs to the editor.
  useEffect(() => {
    const handleDocumentSelection = () => {
      const selection = document.getSelection()
      if (!selection || selection.isCollapsed || !selection.anchorNode) return
      const anchor = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement
      const belongsToEditor = Boolean(anchor?.closest('.novel-editor'))
      const store = useAppStore.getState()
      const next = nativeSelectionState({ confirmed: store.editorSelectionConfirmed, active: store.editorSelectionActive }, belongsToEditor)
      store.setEditorSelectionActive(next.active)
    }
    document.addEventListener('selectionchange', handleDocumentSelection)
    return () => document.removeEventListener('selectionchange', handleDocumentSelection)
  }, [])

  useEffect(() => {
    const clearSelection = () => {
      if (!editor) return
      persistedSelectionRef.current = null
      useAppStore.getState().setEditorSelectionSnapshot(null)
      useAppStore.getState().setEditorSelectionConfirmed(false)
      clearSelectionHighlight(editor)
    }
    window.addEventListener('novel:clear-selection', clearSelection)
    return () => window.removeEventListener('novel:clear-selection', clearSelection)
  }, [editor])

  // A scene is an operating scope, not just metadata. Selecting one from the
  // scene panel highlights its paragraph range so following actions are
  // visibly scoped to the same text the Main process will consume.
  useEffect(() => {
    if (!editor || !selectedSceneId) return
    const selectedScene = scenes.find((scene) => scene.id === selectedSceneId)
    if (!selectedScene) return
    const textBlocks: Array<{ from: number; to: number }> = []
    editor.state.doc.descendants((node, position) => {
      if (node.isTextblock) textBlocks.push({ from: position + 1, to: Math.max(position + 1, position + node.nodeSize - 1) })
    })
    const start = textBlocks[selectedScene.startParagraph]
    const end = textBlocks[selectedScene.endParagraph]
    if (!start || !end) return
    editor.commands.setTextSelection({ from: start.from, to: end.to })
    editor.commands.scrollIntoView()
  }, [editor, editorMarkdown, selectedSceneId, scenes])

  const run = (fn: () => void) => { fn(); editor?.commands.focus() }

  if (!activeChapter) {
    return (
      <main className="editor-shell">
        <div className="editor-empty">{uiText('editorEmpty')}</div>
      </main>
    )
  }

  return (
    <main className="editor-shell" data-testid="editor-pane">
      <div className="editor-tab"><span className="doc-dot">▣</span> {activeChapter.title}{selectedSceneId && <span className="editor-scope">· {scenes.find((scene) => scene.id === selectedSceneId)?.title ?? uiText('editorSceneFallback')}</span>}</div>
      <ScenePanel />
      <div className="toolbar" role="toolbar" aria-label={uiText('editorToolbarAria')}>
        <button type="button" aria-label={uiText('editorHeading1')} title={uiText('editorHeading1')} aria-pressed={editor?.isActive('heading', { level: 1 }) ?? false} onClick={() => run(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())}><Heading1 size={16} /></button>
        <button type="button" aria-label={uiText('editorHeading2')} title={uiText('editorHeading2')} aria-pressed={editor?.isActive('heading', { level: 2 }) ?? false} onClick={() => run(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}><Heading2 size={16} /></button>
        <span className="sep" />
        <button type="button" aria-label={uiText('editorBold')} title={uiText('editorBold')} aria-pressed={editor?.isActive('bold') ?? false} onClick={() => run(() => editor?.chain().focus().toggleBold().run())}><Bold size={16} /></button>
        <button type="button" aria-label={uiText('editorItalic')} title={uiText('editorItalic')} aria-pressed={editor?.isActive('italic') ?? false} onClick={() => run(() => editor?.chain().focus().toggleItalic().run())}><Italic size={16} /></button>
        <span className="sep" />
        <button type="button" aria-label={uiText('editorBulletList')} title={uiText('editorBulletList')} aria-pressed={editor?.isActive('bulletList') ?? false} onClick={() => run(() => editor?.chain().focus().toggleBulletList().run())}><List size={16} /></button>
        <button type="button" aria-label={uiText('editorTaskList')} title={uiText('editorTaskList')} aria-pressed={editor?.isActive('taskList') ?? false} onClick={() => run(() => editor?.chain().focus().toggleTaskList().run())}>☑</button>
        <button type="button" aria-label={uiText('editorBlockquote')} title={uiText('editorBlockquote')} aria-pressed={editor?.isActive('blockquote') ?? false} onClick={() => run(() => editor?.chain().focus().toggleBlockquote().run())}><MessageSquareQuote size={16} /></button>
        {editorSelection.trim() && <button type="button" aria-label={uiText('editorClearSelectionHighlight')} title={uiText('editorClearSelectionHighlight')} onMouseDown={(event) => event.preventDefault()} onClick={() => window.dispatchEvent(new Event('novel:clear-selection'))}>×</button>}
        <span className="grow" />
        <button type="button" aria-label={uiText('editorUndo')} title={uiText('editorUndo')} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={15} /></button>
        <button type="button" aria-label={uiText('editorRedo')} title={uiText('editorRedo')} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={15} /></button>
        <div className="word-count">{formatUiText('editorWordCount', { count: liveWordCount })}</div>
      </div>
      <div className="editor-scroll">
        <SelectionToolbar editor={editor} onAction={(label, prompt, mutatesDocument, selection, actionId) => { if (actionId === 'clear-selection') { window.dispatchEvent(new Event('novel:clear-selection')); return }; persistedSelectionRef.current = { relPath: activeRelPath ?? '', text: selection.text }; const store = useAppStore.getState(); store.setEditorSelectionActive(true); if (actionId === 'select') store.setEditorSelectionSnapshot({ ...selection, relPath: activeRelPath }); setSelectionHighlight(editor); window.dispatchEvent(new CustomEvent('novel:selection-action', { detail: { action: actionId, actionId, label, prompt, mutatesDocument, selection: selection.text, selectionRange: selection } })) }} />
        <EditorContent editor={editor} />
        {pendingSuggestion && <div className="ai-pending-banner"><span>{uiText('aiChangePreview')}</span><button onMouseDown={(event) => event.preventDefault()} onClick={() => void useAppStore.getState().acceptPendingSuggestion()}>{uiText('confirmChange')}</button><button onMouseDown={(event) => event.preventDefault()} onClick={() => useAppStore.getState().setPendingSuggestion(null)}>{uiText('editorCancel')}</button></div>}
      </div>
    </main>
  )
}
