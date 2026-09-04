import { describe, expect, it } from 'vitest'
import { resolveInsideRoot } from '../src/main/services/paths'
import { DomainError } from '../src/main/services/errors'
import { makeTempRoot } from './helpers'
import { join } from 'node:path'

describe('resolveInsideRoot (project sandbox)', () => {
  it('resolves normal relative paths', async () => {
    const root = await makeTempRoot()
    expect(resolveInsideRoot(root, 'chapters/001.md')).toBe(join(root, 'chapters/001.md'))
  })

  it('rejects absolute paths', async () => {
    const root = await makeTempRoot()
    expect(() => resolveInsideRoot(root, '/etc/passwd')).toThrow(DomainError)
  })

  it('rejects .. traversal out of the root', async () => {
    const root = await makeTempRoot()
    expect(() => resolveInsideRoot(root, '../escape.md')).toThrow(DomainError)
    expect(() => resolveInsideRoot(root, 'chapters/../../escape.md')).toThrow(DomainError)
  })

  it('allows nested .. that stays inside the root', () => {
    expect(resolveInsideRoot('/tmp/fake-root', 'a/b/../c.md')).toBe(join('/tmp/fake-root', 'a/c.md'))
  })
})
