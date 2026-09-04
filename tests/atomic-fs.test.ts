import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWriteFile } from '../src/main/services/atomic-fs'
import { makeTempRoot } from './helpers'

describe('atomicWriteFile', () => {
  it('creates parent directories and writes content', async () => {
    const root = await makeTempRoot()
    const target = join(root, 'a/b/c.txt')
    await atomicWriteFile(target, 'hello')
    expect(await readFile(target, 'utf8')).toBe('hello')
  })

  it('overwrites without leaving temp files behind', async () => {
    const root = await makeTempRoot()
    const target = join(root, 'overwrite.txt')
    await atomicWriteFile(target, 'v1')
    await atomicWriteFile(target, 'v2')
    expect(await readFile(target, 'utf8')).toBe('v2')
    const files = await readdir(root)
    expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0)
  })

  it('writes binary data', async () => {
    const root = await makeTempRoot()
    const target = join(root, 'bin.dat')
    await atomicWriteFile(target, new Uint8Array([1, 2, 3, 255]))
    expect([...await readFile(target)]).toEqual([1, 2, 3, 255])
  })
})
