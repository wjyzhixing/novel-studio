const MAX_FAVORITES = 200

export function favoriteStorageKey(projectRoot: string): string {
  return `novel-studio:image-favorites:${encodeURIComponent(projectRoot)}`
}

export function readFavorites(storage: Pick<Storage, 'getItem'>, key: string): string[] {
  try {
    const value = JSON.parse(storage.getItem(key) ?? '[]')
    if (!Array.isArray(value)) return []
    return [...new Set(value.filter((item): item is string => typeof item === 'string' && /^asset_[a-zA-Z0-9_-]+$/.test(item)))].slice(0, MAX_FAVORITES)
  } catch {
    return []
  }
}

export function writeFavorites(storage: Pick<Storage, 'setItem'>, key: string, favorites: readonly string[]): void {
  try { storage.setItem(key, JSON.stringify([...new Set(favorites)].filter((id) => /^asset_[a-zA-Z0-9_-]+$/.test(id)).slice(0, MAX_FAVORITES))) } catch { /* best effort; asset provenance remains authoritative */ }
}

export function toggleFavorite(favorites: readonly string[], assetId: string): string[] {
  return favorites.includes(assetId) ? favorites.filter((id) => id !== assetId) : [...favorites, assetId]
}
