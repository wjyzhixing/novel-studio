import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = join(process.cwd(), 'src', 'renderer', 'src')
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const violations = []

async function visit(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    violations.push({ file: relative(process.cwd(), directory), rule: 'directory-readable', detail: error instanceof Error ? error.message : String(error) })
    return
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await visit(path)
    else if (sourceExtensions.has(extname(entry.name))) await inspect(path)
  }
}

async function inspect(path) {
  const source = await readFile(path, 'utf8')
  const file = relative(process.cwd(), path)
  const rules = [
    { pattern: /from\s+['"](?:node:|electron)/, rule: 'renderer-no-privileged-import' },
    { pattern: /import\s*(?:\([^)]*\)|[^;]*?from\s*)['"](?:node:|electron)/, rule: 'renderer-no-privileged-import' },
    { pattern: /\b(?:ipcRenderer|ipcMain)\b/, rule: 'renderer-no-direct-ipc' }
  ]
  for (const { pattern, rule } of rules) if (pattern.test(source)) violations.push({ file, rule })
}

await visit(root)
if (violations.length > 0) {
  console.error(JSON.stringify({ ok: false, violations }, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ ok: true, root: relative(process.cwd(), root), rules: 2 }, null, 2))
}
