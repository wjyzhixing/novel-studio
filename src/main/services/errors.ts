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
    return { code: e.code, message: redactSensitive(e.message), retryable: e.retryable, details: redactDetails(e.details) }
  }
  const message = safeErrorMessage(e)
  return { code: 'INTERNAL', message: redactSensitive(message) }
}

function safeErrorMessage(value: unknown): string {
  try {
    return value instanceof Error ? value.message : String(value)
  } catch {
    return '未知错误'
  }
}

const sensitiveDetailKey = /(?:secret|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|credential)/i

function redactDetails(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (typeof value === 'string') return redactSensitive(value)
  if (typeof value === 'bigint') return value.toString()
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value !== 'object') return undefined
  if (depth >= 8 || seen.has(value)) return '[redacted]'
  seen.add(value)
  if (Array.isArray(value)) {
    return Array.from({ length: value.length }, (_, index) => {
      try {
        return redactDetails(value[index], seen, depth + 1)
      } catch {
        return '[redacted]'
      }
    })
  }
  let entries: [string, unknown][]
  try {
    entries = Object.entries(value)
  } catch {
    return '[redacted]'
  }
  return Object.fromEntries(entries.map(([key, child]) => {
    if (sensitiveDetailKey.test(key)) return [key, '[redacted]']
    try {
      return [key, redactDetails(child, seen, depth + 1)]
    } catch {
      return [key, '[redacted]']
    }
  }))
}

/** Keep provider diagnostics useful without allowing credentials to cross the
 * IPC/UI boundary when an upstream error echoes request headers or payloads. */
export function redactSensitive(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bsk[_-][A-Za-z0-9_-]{8,}\b/g, '[redacted-key]')
    .replace(/data:[^,\s]+,[A-Za-z0-9+/=%_-]+/gi, '[redacted-data-url]')
    .replace(/(authorization\s*[:=]\s*)(?:[A-Za-z]+\s+)?[^\s,}"']+/gi, '$1[redacted]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|x-api-key|api[_-]?key|token|secret)["']?\s*[:=]\s*["']?)[^\s,&}"']+/gi, '$1[redacted]')
    .replace(/([?&](?:key|access[_-]?token|refresh[_-]?token|api[_-]?key|token|secret)=)[^&\s]+/gi, '$1[redacted]')
}

/** Normalize and cap operational messages before they reach a Main-process
 * log. Logs must remain useful for diagnosis without retaining multiline
 * payloads or unbounded provider/renderer error text. */
export function redactLogMessage(value: string, maxLength = 512): string {
  const safeLimit = Number.isFinite(maxLength) ? Math.max(1, Math.floor(maxLength)) : 512
  return redactSensitive(value.replace(/\s+/g, ' ').trim().slice(0, safeLimit))
}
