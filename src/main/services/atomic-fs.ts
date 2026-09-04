import { randomBytes } from 'node:crypto'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/**
 * Atomic write (blueprint §18): temp file in the same directory → fsync → rename.
 * A crash mid-write leaves the previous file intact and at most an orphan tmp.
 */
export async function atomicWriteFile(filePath: string, data: string | Uint8Array): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `.${basename(filePath)}.${randomBytes(4).toString('hex')}.tmp`)
  const fh = await open(tmp, 'w')
  try {
    await fh.writeFile(data)
    await fh.sync()
  } finally {
    await fh.close()
  }
  try {
    await rename(tmp, filePath)
  } catch (e) {
    await unlink(tmp).catch(() => {})
    throw e
  }
}
