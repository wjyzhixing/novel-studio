import { describe, expect, it } from 'vitest'
import { clearDraft, draftStorageKey, readDraft, writeDraft } from '../src/renderer/src/lib/autosave-draft'

function storage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) }
  }
}

describe('autosave draft persistence', () => {
  it('roundtrips a bounded draft by project and chapter', () => {
    const store = storage(); const key = draftStorageKey('/tmp/project', 'chapters/001.md')
    writeDraft(store, key, '# Draft', 123)
    expect(readDraft(store, key)).toEqual({ markdown: '# Draft', savedAt: 123 })
    clearDraft(store, key)
    expect(readDraft(store, key)).toBeNull()
  })

  it('ignores malformed and oversized stored values', () => {
    const store = storage(); const key = draftStorageKey('/tmp/project', 'chapters/001.md')
    store.setItem(key, '{bad json')
    expect(readDraft(store, key)).toBeNull()
    store.setItem(key, JSON.stringify({ markdown: 'x'.repeat(2_000_001), savedAt: 123 }))
    expect(readDraft(store, key)).toBeNull()
  })
})
