import { realpath, mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { DomainError } from './errors'
import type { AppErrorCode } from '../../shared/result'

/**
 * Project root sandbox (blueprint §19 路径穿越).
 * Every project-relative IO must go through resolveInsideRoot; absolute input
 * or `..` escape is rejected with PATH_DENIED.
 */

/** Realpath of an existing path (rejects missing paths with PROJECT_NOT_FOUND by default). */
export async function canonicalizeExisting(p: string, code: AppErrorCode = 'PROJECT_NOT_FOUND'): Promise<string> {
  try {
    return await realpath(p)
  } catch {
    throw new DomainError(code, `路径不存在或不可访问: ${p}`)
  }
}

/** mkdir -p then realpath; used when creating a brand-new project folder. */
export async function canonicalizeCreated(p: string): Promise<string> {
  await mkdir(p, { recursive: true })
  return realpath(p)
}

export function isInsideRoot(root: string, target: string): boolean {
  const r = resolve(root)
  const t = resolve(target)
  return t === r || t.startsWith(r + sep)
}

export function resolveInsideRoot(root: string, ...relSegments: string[]): string {
  const relPath = relSegments.join('/')
  if (isAbsolute(relPath)) {
    throw new DomainError('PATH_DENIED', `拒绝绝对路径: ${relPath}`)
  }
  const target = resolve(root, ...relSegments)
  if (!isInsideRoot(root, target)) {
    throw new DomainError('PATH_DENIED', `路径越出项目根目录: ${relPath}`)
  }
  return target
}

/** Parent dir of a not-yet-existing path must exist — used before canonicalize. */
export function parentOf(p: string): string {
  return dirname(p)
}
