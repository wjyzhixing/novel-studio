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
import { captureSelectionSnapshot, findSelectionRangeByText, nextPersistedSelection, persistedSelectionContainsPosition, type PersistedSelectionRange } from '../lib/selection-persistence'

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
  const activeRelPath = useAppStore((s) => s.activeRelPath)
  const liveWordCount = useAppStore((s) => s.liveWordCount)
  const pendingSuggestion = useAppStore((s) => s.pendingSuggestion)
  const scenes = useAppStore((s) => s.scenes)
  const selectedSceneId = useAppStore((s) => s.selectedSceneId)
  const projectRoot = useAppStore((s) => s.project?.rootPath)

  const lastLoadedRef = useRef<string | null>(null)
  const relPathRef = useRef<string | null>(null)
  const persistedSelectionRef = useRef<{ relPath: string; text: string } | null>(null)
  const missingAssetPlaceholder = (assetId: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180"><rect width="640" height="180" rx="12" fill="#211c36"/><text x="24" y="78" fill="#c6b8ff" font-family="sans-serif" font-size="22">图片资产不可用</text><text x="24" y="116" fill="#8f86a8" font-family="monospace" font-size="15">${assetId}</text></svg>`)}\n`

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
        .replace(/\salt=["'][^"']*["']/i, ` alt="图片资产不可用：${idMatch[1]}"`)
        .replace(/\stitle=["'][^"']*["']/i, ` title="Asset 缺失 · ${idMatch[1]}"`)
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
      if (snapshot) useAppStore.getState().setEditorSelectionSnapshot({ ...snapshot, relPath: useAppStore.getState().activeRelPath })
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
        <div className="editor-empty">从左侧选择一个章节，或新建一个章节开始写作</div>
      </main>
    )
  }

  return (
    <main className="editor-shell" data-testid="editor-pane">
      <div className="editor-tab"><span className="doc-dot">▣</span> {activeChapter.title}{selectedSceneId && <span className="editor-scope">· {scenes.find((scene) => scene.id === selectedSceneId)?.title ?? '场景'}</span>}</div>
      <ScenePanel />
      <div className="toolbar">
        <button onClick={() => run(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())}><Heading1 size={16} /></button>
        <button onClick={() => run(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}><Heading2 size={16} /></button>
        <span className="sep" />
        <button onClick={() => run(() => editor?.chain().focus().toggleBold().run())}><Bold size={16} /></button>
        <button onClick={() => run(() => editor?.chain().focus().toggleItalic().run())}><Italic size={16} /></button>
        <span className="sep" />
        <button onClick={() => run(() => editor?.chain().focus().toggleBulletList().run())}><List size={16} /></button>
        <button title="任务列表" onClick={() => run(() => editor?.chain().focus().toggleTaskList().run())}>☑</button>
        <button onClick={() => run(() => editor?.chain().focus().toggleBlockquote().run())}><MessageSquareQuote size={16} /></button>
        {editorSelection.trim() && <button title="清除选区高亮" onMouseDown={(event) => event.preventDefault()} onClick={() => { if (!editor) return; persistedSelectionRef.current = null; clearSelectionHighlight(editor); useAppStore.getState().setEditorSelectionSnapshot(null) }}>×</button>}
        <span className="grow" />
        <button onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={15} /></button>
        <button onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={15} /></button>
        <div className="word-count">{liveWordCount.toLocaleString()} 字</div>
      </div>
      <div className="editor-scroll">
        <SelectionToolbar editor={editor} onAction={(label, prompt, mutatesDocument, selection) => { persistedSelectionRef.current = { relPath: activeRelPath ?? '', text: selection.text }; setSelectionHighlight(editor); window.dispatchEvent(new CustomEvent('novel:selection-action', { detail: { action: label, prompt, mutatesDocument, selection: selection.text, selectionRange: selection } })) }} />
        <EditorContent editor={editor} />
        {pendingSuggestion && <div className="ai-pending-banner"><span>AI 修改已预览</span><button onMouseDown={(event) => event.preventDefault()} onClick={() => void useAppStore.getState().acceptPendingSuggestion()}>确认修改</button><button onMouseDown={(event) => event.preventDefault()} onClick={() => useAppStore.getState().setPendingSuggestion(null)}>取消</button></div>}
      </div>
    </main>
  )
}
