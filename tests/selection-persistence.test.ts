import { describe, expect, it } from 'vitest'
import { captureSelectionSnapshot, findSelectionRangeByText, nextPersistedSelection, persistedSelectionContainsPosition, selectionContainsText } from '../src/renderer/src/lib/selection-persistence'

describe('editor selection persistence', () => {
  it('keeps a normalized cross-block selection snapshot without mutating content', () => {
    const doc = { textBetween: (from: number, to: number, separator?: string) => `from=${from},to=${to},separator=${separator}` }
    expect(captureSelectionSnapshot(doc, 12, 4)).toEqual({ from: 4, to: 12, text: 'from=4,to=12,separator=\n' })
  })

  it('recognizes the saved selection after focus moves away from the editor', () => {
    const snapshot = { from: 1, to: 5, text: '林默站在窗前' }
    expect(selectionContainsText(snapshot, '雨夜。林默站在窗前。')).toBe(true)
    expect(selectionContainsText(snapshot, '另一段正文')).toBe(false)
  })

  it('keeps the confirmed region when another selection is made until explicitly cleared', () => {
    const active = { from: 4, to: 12 }
    expect(nextPersistedSelection(active, undefined, 40)).toEqual(active)
    expect(nextPersistedSelection(active, { from: 20, to: 28 }, 40)).toEqual({ from: 20, to: 28 })
    expect(nextPersistedSelection({ from: 20, to: 28 }, { clear: true }, 40)).toBeNull()
  })

  it('treats the persisted region as half-open when reactivating it by click', () => {
    const range = { from: 4, to: 12 }
    expect(persistedSelectionContainsPosition(range, 4)).toBe(true)
    expect(persistedSelectionContainsPosition(range, 11)).toBe(true)
    expect(persistedSelectionContainsPosition(range, 12)).toBe(false)
  })

  it('finds the same selected text again after the document is rebuilt', () => {
    const doc = {
      content: { size: 30 },
      descendants: (callback: (node: { isTextblock: boolean; textContent: string }, position: number) => void) => {
        callback({ isTextblock: true, textContent: '第一段' }, 0)
        callback({ isTextblock: true, textContent: '第二段被选中' }, 8)
      }
    }
    expect(findSelectionRangeByText(doc, '第二段被选中')).toEqual({ from: 9, to: 15 })
  })

  it('restores a selection that crosses paragraph boundaries', () => {
    const doc = {
      content: { size: 30 },
      descendants: (callback: (node: { isTextblock: boolean; textContent: string }, position: number) => void) => {
        callback({ isTextblock: true, textContent: '第一段' }, 0)
        callback({ isTextblock: true, textContent: '第二段被选中' }, 8)
      }
    }
    expect(findSelectionRangeByText(doc, '第一段\n第二段')).toEqual({ from: 1, to: 12 })
  })

  it('does not restore an explicitly cleared selection', () => {
    expect(findSelectionRangeByText({ content: { size: 10 }, descendants: () => undefined }, '')).toBeNull()
  })
})
