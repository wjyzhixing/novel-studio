import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import { selectionActions } from '../lib/selection-actions'
import { captureSelectionSnapshot, type SelectionSnapshot } from '../lib/selection-persistence'
import { useAppStore } from '../store/app-store'
import { useUiText, type UiTextKey } from '../lib/i18n'

export function SelectionToolbar({ editor, onAction }: { editor: Editor | null; onAction: (label: string, prompt: string, mutatesDocument: boolean, selection: SelectionSnapshot, actionId: string) => void }) {
  const uiText = useUiText()
  const selectionActionLabel = (id: string, fallback: string): string => {
    const keys: Record<string, UiTextKey> = { polish: 'selectionPolish', rewrite: 'selectionRewrite', expand: 'selectionExpand', shorten: 'selectionShorten', continue: 'selectionContinue', explain: 'selectionExplain', translate: 'selectionTranslate', select: 'selectionSelect', 'clear-selection': 'selectionClear' }
    return keys[id] ? uiText(keys[id]) : fallback
  }
  const selectionActionPrompt = (id: string, fallback: string): string => {
    const keys: Record<string, UiTextKey> = { polish: 'selectionPolishPrompt', rewrite: 'selectionRewritePrompt', expand: 'selectionExpandPrompt', shorten: 'selectionShortenPrompt', continue: 'selectionContinuePrompt', explain: 'selectionExplainPrompt', translate: 'selectionTranslatePrompt' }
    return keys[id] ? uiText(keys[id]) : fallback
  }
  const confirmed = useAppStore((state) => state.editorSelectionConfirmed)
  const confirmedText = useAppStore((state) => state.editorSelection)
  if (!editor) return null
  const currentText = editor.state?.doc ? captureSelectionSnapshot(editor.state.doc, editor.state.selection.from, editor.state.selection.to)?.text ?? '' : ''
  const currentSelectionIsConfirmed = confirmed && Boolean(confirmedText) && currentText === confirmedText
  return <BubbleMenu editor={editor} shouldShow={({ state }) => !state.selection.empty}>
    <div className="selection-toolbar" role="toolbar" aria-label={uiText('selectionToolbarAria')}>
      {selectionActions.filter((item) => item.id === 'select' ? !currentSelectionIsConfirmed : item.id === 'clear-selection' ? currentSelectionIsConfirmed : true).map((item) => <button type="button" data-action={item.id} title={selectionActionLabel(item.id, item.label)} key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => {
        const { from, to } = editor.state.selection
        const snapshot = captureSelectionSnapshot(editor.state.doc, from, to)
        if (snapshot) onAction(item.label, selectionActionPrompt(item.id, item.prompt), item.mutatesDocument, snapshot, item.id)
      }}>{selectionActionLabel(item.id, item.label)}</button>)}
    </div>
  </BubbleMenu>
}
