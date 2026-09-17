import { describe, expect, it } from 'vitest'
import { favoriteStorageKey, readFavorites, toggleFavorite, writeFavorites } from '../src/renderer/src/lib/image-favorites'

function storage(): Storage {
  const values = new Map<string, string>()
  return { get length() { return values.size }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null, key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key), setItem: (key, value) => values.set(key, value) }
}

describe('image favorites persistence', () => {
  it('roundtrips project-scoped favorites and toggles immutably', () => {
    const store = storage(); const key = favoriteStorageKey('/tmp/project')
    writeFavorites(store, key, ['asset_one'])
    expect(readFavorites(store, key)).toEqual(['asset_one'])
    expect(toggleFavorite(['asset_one'], 'asset_one')).toEqual([])
    expect(toggleFavorite(['asset_one'], 'asset_two')).toEqual(['asset_one', 'asset_two'])
  })

  it('ignores malformed values and caps the stored list', () => {
    const store = storage(); const key = favoriteStorageKey('/tmp/project')
    store.setItem(key, '{bad')
    expect(readFavorites(store, key)).toEqual([])
    writeFavorites(store, key, Array.from({ length: 500 }, (_, index) => `asset_${index}`))
    expect(readFavorites(store, key)).toHaveLength(200)
  })
})
