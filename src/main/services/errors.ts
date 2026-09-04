import type { AppError, AppErrorCode } from '../../shared/result'

/**
 * Throwable AppError for services. Services stay Electron-free so vitest can
 * exercise them directly; the IPC layer serializes this to a plain object.
 */
export class DomainError extends Error implements AppError {
  readonly code: AppErrorCode
  readonly retryable?: boolean
  readonly details?: unknown

  constructor(code: AppErrorCode, message: string, extra?: { retryable?: boolean; details?: unknown }) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.retryable = extra?.retryable
    this.details = extra?.details
  }
}

export function toAppError(e: unknown): AppError {
  if (e instanceof DomainError) {
    return { code: e.code, message: redactSensitive(e.message), retryable: e.retryable, details: e.details }
  }
  const message = e instanceof Error ? e.message : String(e)
  return { code: 'INTERNAL', message: redactSensitive(message) }
}

/** Keep provider diagnostics useful without allowing credentials to cross the
 * IPC/UI boundary when an upstream error echoes request headers or payloads. */
export function redactSensitive(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bsk[_-][A-Za-z0-9_-]{8,}\b/g, '[redacted-key]')
    .replace(/([?&](?:key|api[_-]?key|token|secret)=)[^&\s]+/gi, '$1[redacted]')
}
