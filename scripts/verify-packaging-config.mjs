import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createTargets, Platform } from 'electron-builder'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const build = packageJson.build ?? {}
const errors = []
const repoRoot = fileURLToPath(new URL('../', import.meta.url))

if (packageJson.main !== './out/main/index.js') errors.push('package main must point to ./out/main/index.js')
if (build.directories?.output !== 'release') errors.push('builder output must be release/')
if (build.electronDist !== 'node_modules/electron/dist') errors.push('builder must use the locally installed Electron distribution')
if (!build.files?.includes('out/**/*') || !build.files?.includes('assets/**/*')) errors.push('builder must include out/**/* and assets/**/*')
if (!build.files?.includes('!demo{,/**}') || !build.files?.includes('!tests{,/**}') || !build.files?.includes('!src{,/**}')) errors.push('development-only paths must be excluded')
for (const [platform, icon] of [['Windows', build.win?.icon], ['macOS', build.mac?.icon]]) {
  if (typeof icon !== 'string' || !(await pathExists(resolve(repoRoot, icon)))) errors.push(`${platform} installer icon is missing`)
}
for (const script of ['dist:win', 'dist:win:x64', 'dist:mac', 'dist:mac:arm64', 'dist:mac:universal']) {
  const command = packageJson.scripts?.[script]
  if (typeof command !== 'string' || !command.includes('npm run build') || !command.includes('electron-builder')) errors.push(`${script} must build the app before electron-builder`)
}
if (!packageJson.scripts?.['dist:mac:arm64']?.includes('--arm64')) errors.push('dist:mac:arm64 must target arm64')
if (!packageJson.scripts?.['dist:mac:universal']?.includes('--universal')) errors.push('dist:mac:universal must target universal')
if (!packageJson.scripts?.['dist:win:x64']?.includes('--x64')) errors.push('dist:win:x64 must target x64')

const windows = build.win?.target ?? []
const windowsConfig = Array.isArray(windows) ? windows[0] : windows
if (windowsConfig?.target !== 'nsis' || !windowsConfig.arch?.includes('x64')) errors.push('Windows target must be NSIS x64')

const mac = build.mac?.target ?? []
const macConfig = Array.isArray(mac) ? mac[0] : mac
if (macConfig?.target !== 'dmg') errors.push('macOS target must be DMG')

const resolvedWindows = createTargets([Platform.WINDOWS], 'nsis', 'x64')
const resolved = [...resolvedWindows.entries()].map(([platform, architectures]) => ({ platform: platform.name, architectures: [...architectures.entries()].map(([arch, targets]) => ({ arch: arch.name, targets })) }))
if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ ok: true, output: build.directories.output, electronDist: build.electronDist, windows: resolved, macTarget: macConfig.target }, null, 2))
}

async function pathExists(path) {
  try { await access(path); return true } catch { return false }
}
