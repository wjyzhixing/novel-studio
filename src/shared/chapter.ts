import { z } from 'zod'
import type { Result } from './result'

/**
 * Chapter IPC contract (Sprint 2 · Blueprint §8/§33).
 * Markdown is the source of truth in chapters/*.md; the DB only indexes.
 */

export interface ChapterMeta {
  relPath: string
  number: number
  title: string
  wordCount: number
  updatedAt: string
}

export interface ChapterContent {
  relPath: string
  title: string
  markdown: string
}

export interface SearchHit {
  relPath: string
  title: string
  snippet: string
}

export const exportFormats = ['markdown', 'plain', 'html'] as const
export type ExportFormat = typeof exportFormats[number] | (string & {})
export interface ExportOptions {
  cleanImageMetadata?: boolean
}

export const chapterCreateInput = z.object({
  title: z.string().min(1).max(100)
})
export const chapterRenameInput = chapterCreateInput.extend({ relPath: z.string().min(1) })

export const chapterSaveInput = z.object({
  relPath: z.string().min(1),
  markdown: z.string().max(2_000_000)
})

export const relPathInput = z.object({
  relPath: z.string().min(1)
})

export const searchInput = z.object({
  query: z.string().min(1).max(200)
})

/** What the renderer may call, with exact Result types. */
export interface ChapterApiContract {
  list(): Promise<Result<ChapterMeta[]>>
  read(relPath: string): Promise<Result<ChapterContent>>
  create(title: string): Promise<Result<ChapterMeta>>
  rename(relPath: string, title: string): Promise<Result<ChapterMeta[]>>
  save(relPath: string, markdown: string): Promise<Result<{ savedAt: string; wordCount: number }>>
  move(relPath: string, toIndex: number): Promise<Result<ChapterMeta[]>>
  remove(relPath: string): Promise<Result<null>>
  readNote(relPath: string): Promise<Result<string>>
  saveNote(relPath: string, notes: string): Promise<Result<null>>
  search(query: string): Promise<Result<SearchHit[]>>
  importFile(sourcePath: string, title?: string): Promise<Result<ChapterMeta>>
  exportAll(format: ExportFormat, destination: string, options?: ExportOptions): Promise<Result<{ destination: string; chapterCount: number }>>
}

export const CHAPTERS_DIR = 'chapters'
