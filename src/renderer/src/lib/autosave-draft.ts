export const MAX_AUTOSAVE_DRAFT_CHARS = 2_000_000

export type AutosaveDraft = { markdown: string; savedAt: number }

export function draftStorageKey(projectRoot: string, relPath: string): string {
  return `novel-studio:draft:${encodeURIComponent(projectRoot)}:${encodeURIComponent(relPath)}`
}

export function readDraft(storage: Pick<Storage, 'getItem'>, key: string): AutosaveDraft | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<AutosaveDraft>
    if (typeof value.markdown !== 'string' || value.markdown.length > MAX_AUTOSAVE_DRAFT_CHARS || typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)) return null
    return { markdown: value.markdown, savedAt: value.savedAt }
  } catch {
    return null
  }
}

export function writeDraft(storage: Pick<Storage, 'setItem'>, key: string, markdown: string, savedAt = Date.now()): void {
  if (markdown.length > MAX_AUTOSAVE_DRAFT_CHARS || !Number.isFinite(savedAt)) return
  try { storage.setItem(key, JSON.stringify({ markdown, savedAt })) } catch { /* quota is best-effort; disk save remains authoritative */ }
}

export function clearDraft(storage: Pick<Storage, 'removeItem'>, key: string): void {
  try { storage.removeItem(key) } catch { /* best-effort cleanup */ }
}
