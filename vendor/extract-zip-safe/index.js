const debug = require('debug')('extract-zip')
const { createWriteStream, promises: fs } = require('fs')
const path = require('path')
const { promisify } = require('util')
const stream = require('stream')
const yauzl = require('yauzl')

const openZip = promisify(yauzl.open)
const pipeline = promisify(stream.pipeline)

function safeDestination(root, fileName) {
  if (fileName.includes('\0')) throw new Error(`Invalid NUL byte in ZIP entry "${fileName}"`)
  const normalized = fileName.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) throw new Error(`Out of bound path "${fileName}"`)
  const destination = path.resolve(root, normalized)
  const relative = path.relative(root, destination)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Out of bound path "${fileName}"`)
  return destination
}

class Extractor {
  constructor(zipPath, opts) { this.zipPath = zipPath; this.opts = opts; this.canceled = false }

  async extract() {
    if (!path.isAbsolute(this.opts.dir)) throw new Error('Target directory is expected to be absolute')
    await fs.mkdir(this.opts.dir, { recursive: true })
    this.opts.dir = await fs.realpath(this.opts.dir)
    this.zipfile = await openZip(this.zipPath, { lazyEntries: true })
    return new Promise((resolve, reject) => {
      this.zipfile.on('error', (error) => { this.canceled = true; reject(error) })
      this.zipfile.on('close', () => { if (!this.canceled) resolve() })
      this.zipfile.on('entry', (entry) => {
        void this.handleEntry(entry).catch((error) => {
          this.canceled = true
          this.zipfile.close()
          reject(error)
        })
      })
      this.zipfile.readEntry()
    })
  }

  async handleEntry(entry) {
    if (this.canceled || entry.fileName.startsWith('__MACOSX/')) { if (!this.canceled) this.zipfile.readEntry(); return }
    const dest = safeDestination(this.opts.dir, entry.fileName)
    const mode = (entry.externalFileAttributes >> 16) & 0xFFFF
    const fileType = mode & 61440
    const isSymlink = fileType === 40960
    if (isSymlink) throw new Error(`Symlink ZIP entries are not supported: "${entry.fileName}"`)
    let isDir = fileType === 16384 || entry.fileName.endsWith('/')
    if (!isDir && (entry.versionMadeBy >> 8) === 0 && entry.externalFileAttributes === 16) isDir = true
    const extractedMode = this.extractedMode(mode, isDir)
    debug('extracting entry', entry.fileName)
    if (this.opts.onEntry) this.opts.onEntry(entry, this.zipfile)
    if (isDir) await fs.mkdir(dest, { recursive: true, mode: extractedMode })
    else {
      await fs.mkdir(path.dirname(dest), { recursive: true })
      const readStream = await promisify(this.zipfile.openReadStream.bind(this.zipfile))(entry)
      await pipeline(readStream, createWriteStream(dest, { flags: 'w', mode: extractedMode }))
    }
    if (!this.canceled) this.zipfile.readEntry()
  }

  extractedMode(entryMode, isDir) {
    if (entryMode) return entryMode & 0o777
    const configured = isDir ? this.opts.defaultDirMode : this.opts.defaultFileMode
    return (configured ? parseInt(configured, 10) : (isDir ? 0o755 : 0o644)) & 0o777
  }
}

module.exports = (zipPath, opts) => new Extractor(zipPath, opts).extract()
