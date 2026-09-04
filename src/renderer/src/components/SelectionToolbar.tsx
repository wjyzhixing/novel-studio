import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import { selectionActions } from '../lib/selection-actions'
import { captureSelectionSnapshot, type SelectionSnapshot } from '../lib/selection-persistence'

export function SelectionToolbar({ editor, onAction }: { editor: Editor | null; onAction: (label: string, prompt: string, mutatesDocument: boolean, selection: SelectionSnapshot) => void }) {
  if (!editor) return null
  return <BubbleMenu editor={editor} shouldShow={({ state }) => !state.selection.empty}>
    <div className="selection-toolbar" role="toolbar" aria-label="选区 AI 操作">
      {selectionActions.map((item) => <button type="button" title={item.label} key={item.label} onMouseDown={(event) => event.preventDefault()} onClick={() => {
        const { from, to } = editor.state.selection
        const snapshot = captureSelectionSnapshot(editor.state.doc, from, to)
        if (snapshot) onAction(item.label, item.prompt, item.mutatesDocument, snapshot)
      }}>{item.label}</button>)}
    </div>
  </BubbleMenu>
}
