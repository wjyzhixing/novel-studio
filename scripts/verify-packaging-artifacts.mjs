import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const releaseDir = resolve(option('--dir', 'release'))
const platform = option('--platform', 'all')
if (!['all', 'win', 'mac'].includes(platform)) {
  console.error('--platform must be one of: all, win, mac')
  process.exit(1)
}

async function filesIn(directory) {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

// Only top-level files are distributable installers. Recursing would mistake
// helper binaries inside win-unpacked/ or an app bundle for an installer.
const allArtifacts = (await filesIn(releaseDir))
  .filter((entry) => entry.isFile() && isInstallerArtifact(entry.name))
  .map((entry) => join(releaseDir, entry.name))
const selected = allArtifacts.filter((file) => platform === 'all' || (platform === 'win' ? file.toLowerCase().endsWith('.exe') : file.toLowerCase().endsWith('.dmg')))
const reports = await Promise.all(selected.map(async (file) => {
  const info = await stat(file)
  return { file: file.slice(`${releaseDir}/`.length), bytes: info.size, usable: info.size > 1_000_000 }
}))
const expected = platform === 'all' ? ['win', 'mac'] : [platform]
const presentPlatforms = new Set(reports.map((item) => item.file.toLowerCase().endsWith('.exe') ? 'win' : 'mac'))
const missing = expected.filter((item) => !presentPlatforms.has(item))
const undersized = reports.filter((item) => !item.usable).map((item) => item.file)
const metadata = await verifyUpdateMetadata(releaseDir, platform, presentPlatforms)
const ok = missing.length === 0 && undersized.length === 0 && metadata.issues.length === 0

console.log(JSON.stringify({ ok, releaseDir, platform, artifacts: reports, missing, undersized, metadata, note: '仅验证产物存在、更新元数据完整性和体积合理，不替代签名、公证或实际安装测试。' }, null, 2))
if (!ok) process.exitCode = 1

function isInstallerArtifact(name) {
  return /^Novel Studio(?: Setup |-)\S+\.(?:exe|dmg)$/i.test(name)
}

async function verifyUpdateMetadata(directory, selectedPlatform, presentPlatforms) {
  const requiredPlatforms = selectedPlatform === 'all' ? [...presentPlatforms] : [selectedPlatform]
  const names = requiredPlatforms.flatMap((item) => item === 'mac' ? ['latest-mac.yml'] : item === 'win' ? ['latest.yml'] : [])
  const manifests = []
  const issues = []
  for (const name of names) {
    const path = join(directory, name)
    let value
    try { value = parse(await readFile(path, 'utf8')) } catch { issues.push(`${name}: 更新元数据缺失或无法读取`); continue }
    manifests.push(name)
    if (typeof value?.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.version)) issues.push(`${name}: version 无效`)
    if (!Array.isArray(value?.files) || value.files.length === 0) { issues.push(`${name}: 缺少 files`); continue }
    const installerExtension = name === 'latest-mac.yml' ? '.dmg' : '.exe'
    let referencesInstaller = false
    for (const file of value.files) {
      if (!file || typeof file.url !== 'string' || typeof file.sha512 !== 'string' || !Number.isInteger(file.size) || file.size <= 0) { issues.push(`${name}: 文件条目字段无效`); continue }
      const basename = file.url.split(/[\\/]/).at(-1) ?? ''
      if (isInstallerArtifact(basename) && basename.toLowerCase().endsWith(installerExtension)) referencesInstaller = true
      const artifactPath = resolve(directory, file.url)
      const relativePath = relative(directory, artifactPath)
      if (!relativePath || relativePath.startsWith('..') || relativePath.includes(`..${sep}`)) { issues.push(`${name}: 文件路径越界 ${file.url}`); continue }
      try {
        const bytes = await readFile(artifactPath)
        const actualHash = createHash('sha512').update(bytes).digest('base64')
        if (bytes.length !== file.size) issues.push(`${name}: 大小不匹配 ${file.url}`)
        if (actualHash !== file.sha512) issues.push(`${name}: SHA-512 不匹配 ${file.url}`)
      } catch { issues.push(`${name}: 引用文件不存在 ${file.url}`) }
    }
    if (!referencesInstaller) issues.push(`${name}: 未引用对应平台安装器 (${installerExtension})`)
  }
  return { manifests, issues }
}
