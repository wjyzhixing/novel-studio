import { z } from 'zod'

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const sha512 = /^(?:[A-Fa-f0-9]{128}|[A-Za-z0-9+/]{86}==)$/
const signatureValue = /^[A-Za-z0-9+/]+={0,2}$/

export const updateEndpointSchema = z.string().url().refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
}, '更新清单地址必须使用不带凭据的 HTTPS')

export const updateManifestSchema = z.object({
  format: z.literal('novel-studio.update-manifest'),
  formatVersion: z.literal(1),
  channel: z.enum(['stable', 'beta']),
  version: z.string().regex(semver),
  minAppVersion: z.string().regex(semver),
  platform: z.enum(['darwin', 'win32', 'linux']),
  arch: z.enum(['arm64', 'x64', 'universal']),
  artifactUrl: z.string().url().refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  }, '更新工件地址必须使用不带凭据的 HTTPS'),
  sha512: z.string().regex(sha512),
  size: z.number().int().positive().max(4_000_000_000),
  releasedAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), 'releasedAt 必须是有效时间'),
  releaseNotes: z.string().max(20_000).default(''),
  signature: z.object({
    algorithm: z.literal('ed25519'),
    keyId: z.string().regex(/^key_[a-zA-Z0-9_-]+$/),
    value: z.string().regex(signatureValue).min(80)
  })
}).strict()

export type UpdateManifest = z.infer<typeof updateManifestSchema>
export type UpdateManifestUnsigned = Omit<UpdateManifest, 'signature'>

/** Stable bytes signed by the release publisher; the signature is excluded. */
export function updateManifestSigningPayload(manifest: UpdateManifestUnsigned | UpdateManifest): string {
  const { signature: _signature, ...unsigned } = manifest as UpdateManifest
  return JSON.stringify(unsigned)
}
export type UpdatePlatform = Pick<UpdateManifest, 'platform' | 'arch'>
export type UpdateClient = UpdatePlatform & { currentVersion: string; channel: UpdateManifest['channel'] }
export type UpdateAssessment = { available: true; manifest: UpdateManifest } | { available: false; reason: 'channel' | 'platform' | 'minimum-version' | 'not-newer' }
export type UpdateStatus =
  | { state: 'idle'; reason?: 'cancelled' }
  | { state: 'checking' }
  | { state: 'available'; manifest: UpdateManifest }
  | { state: 'downloading'; downloaded: number; total: number }
  | { state: 'ready'; destination: string; bytes: number }
  | { state: 'install_failed'; destination: string; bytes: number }
  | { state: 'installing'; destination: string; bytes: number }
  | { state: 'up_to_date'; reason: 'channel' | 'platform' | 'minimum-version' | 'not-newer' }
  | { state: 'failed'; reason: 'network' | 'manifest' | 'integrity' | 'destination' | 'installation' | 'not-configured' }

export type UpdateEvent = UpdateStatus

export interface UpdateApiContract {
  check(): Promise<import('./result').Result<UpdateStatus>>
  download(): Promise<import('./result').Result<UpdateStatus>>
  install(): Promise<import('./result').Result<UpdateStatus>>
  cancel(): Promise<import('./result').Result<UpdateStatus>>
  onEvent(listener: (event: UpdateEvent) => void): () => void
}

export function assessUpdate(input: UpdateManifest, client: UpdateClient): UpdateAssessment {
  if (client.channel === 'stable' && input.channel !== 'stable') return { available: false, reason: 'channel' }
  if (input.platform !== client.platform || (input.arch !== 'universal' && input.arch !== client.arch)) return { available: false, reason: 'platform' }
  if (compareVersions(client.currentVersion, input.minAppVersion) < 0) return { available: false, reason: 'minimum-version' }
  if (compareVersions(input.version, client.currentVersion) <= 0) return { available: false, reason: 'not-newer' }
  return { available: true, manifest: input }
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1
  }
  if (!a.pre && !b.pre) return 0
  if (!a.pre) return 1
  if (!b.pre) return -1
  const leftParts = a.pre.split('.')
  const rightParts = b.pre.split('.')
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const l = leftParts[index]
    const r = rightParts[index]
    if (l === undefined) return -1
    if (r === undefined) return 1
    if (l === r) continue
    const lNumber = /^\d+$/.test(l) ? Number(l) : null
    const rNumber = /^\d+$/.test(r) ? Number(r) : null
    if (lNumber !== null && rNumber !== null) return lNumber > rNumber ? 1 : -1
    if (lNumber !== null) return -1
    if (rNumber !== null) return 1
    return l > r ? 1 : -1
  }
  return 0
}

function parseVersion(value: string): { core: [number, number, number]; pre: string } {
  const [core, pre = ''] = value.split('-', 2)
  const parts = core.split('.').map(Number)
  return { core: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0], pre }
}
