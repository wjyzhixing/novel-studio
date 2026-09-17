import { createPrivateKey, sign } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
const inputPath = required('--input')
const outputPath = required('--output')
const keyPath = required('--key')
const keyId = required('--key-id')

try {
  const input = resolve(inputPath)
  const output = resolve(outputPath)
  const key = resolve(keyPath)
  if (input === output) throw new Error('输入和输出文件必须不同')
  if (output === key) throw new Error('输出文件不能覆盖私钥')
  if (!/^key_[a-zA-Z0-9_-]+$/.test(keyId)) throw new Error('key-id 格式无效')

  const value = JSON.parse(await readFile(input, 'utf8'))
  const unsigned = validateUnsignedManifest(value)
  if (value.signature !== undefined) throw new Error('输入清单不能已经包含 signature')
  const privateKey = createPrivateKey(await readFile(key, 'utf8'))
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('签名私钥必须是 Ed25519')
  const signature = sign(null, Buffer.from(JSON.stringify(unsigned)), privateKey).toString('base64')
  const signed = { ...unsigned, signature: { algorithm: 'ed25519', keyId, value: signature } }
  await mkdir(dirname(output), { recursive: true })
  const temporary = `${output}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(signed, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(temporary, output)
  console.log(JSON.stringify({ ok: true, output, keyId }))
} catch (error) {
  console.error(error instanceof Error ? error.message : '更新清单签名失败')
  process.exitCode = 1
}

function required(name) {
  const index = args.indexOf(name)
  const value = index >= 0 ? args[index + 1] : undefined
  if (!value || value.startsWith('--')) throw new Error(`${name} 参数必填`)
  return value
}

function validateUnsignedManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('更新清单必须是对象')
  const allowed = new Set(['format', 'formatVersion', 'channel', 'version', 'minAppVersion', 'platform', 'arch', 'artifactUrl', 'sha512', 'size', 'releasedAt', 'releaseNotes'])
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`更新清单字段不允许：${key}`)
  if (value.format !== 'novel-studio.update-manifest' || value.formatVersion !== 1) throw new Error('更新清单格式版本无效')
  if (!['stable', 'beta'].includes(value.channel)) throw new Error('更新清单 channel 无效')
  if (!semver(value.version) || !semver(value.minAppVersion)) throw new Error('更新清单版本无效')
  if (!['darwin', 'win32', 'linux'].includes(value.platform) || !['arm64', 'x64', 'universal'].includes(value.arch)) throw new Error('更新清单平台或架构无效')
  const artifact = new URL(value.artifactUrl)
  if (artifact.protocol !== 'https:' || artifact.username || artifact.password) throw new Error('更新工件地址必须使用不带凭据的 HTTPS')
  if (!/^(?:[A-Fa-f0-9]{128}|[A-Za-z0-9+/]{86}==)$/.test(value.sha512)) throw new Error('更新清单 SHA-512 无效')
  if (!Number.isSafeInteger(value.size) || value.size <= 0 || value.size > 4_000_000_000) throw new Error('更新清单大小无效')
  if (!Number.isFinite(Date.parse(value.releasedAt))) throw new Error('更新清单 releasedAt 无效')
  if (typeof value.releaseNotes !== 'string' || value.releaseNotes.length > 20_000) throw new Error('更新清单 releaseNotes 无效')
  return { ...value }
}

function semver(value) { return typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value) }
