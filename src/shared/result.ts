/**
 * Unified IPC result contract.
 * Every handler resolves with Result<T> — it never rejects, so the renderer
 * never has to deal with serialized Electron stack traces.
 * Blueprint §33: AppError has code / message / retryable / details.
 */

export type AppErrorCode =
  | 'INTERNAL'
  | 'NO_PROJECT_OPEN'
  | 'PROJECT_NOT_FOUND'
  | 'INVALID_PROJECT'
  | 'PROJECT_TOO_NEW'
  | 'DIR_NOT_EMPTY'
  | 'PATH_DENIED'
  | 'IO_ERROR'
  | 'DB_ERROR'
  | 'VALIDATION_FAILED'
  | 'CANCELED'

export interface AppError {
  code: AppErrorCode
  message: string
  retryable?: boolean
  details?: unknown
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })

export const err = (
  code: AppErrorCode,
  message: string,
  extra?: { retryable?: boolean; details?: unknown }
): Result<never> => ({ ok: false, error: { code, message, ...extra } })
