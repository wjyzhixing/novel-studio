import { updateManifestSchema, assessUpdate, type UpdateClient, type UpdateEvent, type UpdateManifest, type UpdateStatus } from '../../shared/update'
import { downloadAndVerifyArtifact, verifyArtifact, verifyUpdateManifestSignature, type TrustedUpdateKey } from './update-verification'
import { UpdateManifestFetchError } from './update-manifest-fetch'
import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Listener = (event: UpdateEvent) => void
type Installer = (destination: string) => Promise<string>
type ManifestFetcher = (signal: AbortSignal) => Promise<unknown>

export class UpdateService {
  private readonly listeners = new Set<Listener>()
  private selectedManifest: UpdateManifest | null = null
  private readyArtifact: { destination: string; bytes: number } | null = null
  private controller: AbortController | null = null
  private checkController: AbortController | null = null
  private checkGeneration = 0

  constructor(
    private readonly client: UpdateClient,
    private readonly manifestFetcher: ManifestFetcher,
    private readonly artifactFetcher: Fetcher = fetch,
    private readonly destinationRoot?: string,
    private readonly trustedKeys: readonly TrustedUpdateKey[] = [],
    private readonly installer: Installer = async () => '未配置安装器',
    private readonly manifestTimeoutMs = 30_000
  ) {}

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async check(): Promise<UpdateStatus> {
    const generation = ++this.checkGeneration
    this.checkController?.abort()
    const checkController = new AbortController()
    this.checkController = checkController
    const activeController = this.controller
    activeController?.abort()
    if (this.controller === activeController) this.controller = null
    this.selectedManifest = null
    this.readyArtifact = null
    this.emit({ state: 'checking' })
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      checkController.abort()
    }, this.manifestTimeoutMs)
    let payload: unknown
    try {
      payload = await this.manifestFetcher(checkController.signal)
    } catch (error) {
      if (generation !== this.checkGeneration) return { state: 'idle', reason: 'cancelled' }
      if (checkController.signal.aborted && !timedOut) return { state: 'idle', reason: 'cancelled' }
      if (timedOut) {
        const status: UpdateStatus = { state: 'failed', reason: 'network' }
        this.emit(status)
        return status
      }
      const status: UpdateStatus = {
        state: 'failed',
        reason: error instanceof UpdateManifestFetchError
          ? error.kind === 'manifest' ? 'manifest' : error.kind === 'configuration' ? 'not-configured' : 'network'
          : 'network'
      }
      this.emit(status)
      return status
    }
    if (generation !== this.checkGeneration) return { state: 'idle', reason: 'cancelled' }
    if (timedOut) {
      const status: UpdateStatus = { state: 'failed', reason: 'network' }
      this.emit(status)
      return status
    }
    if (checkController.signal.aborted) return { state: 'idle', reason: 'cancelled' }
    try {
      const manifest = updateManifestSchema.parse(payload)
      if (!verifyUpdateManifestSignature(manifest, this.trustedKeys)) throw new Error('更新清单签名校验失败')
      const assessment = assessUpdate(manifest, this.client)
      if (!assessment.available) {
        this.selectedManifest = null
        const status: UpdateStatus = { state: 'up_to_date', reason: assessment.reason }
        this.emit(status)
        return status
      }
      this.selectedManifest = assessment.manifest
      const status: UpdateStatus = { state: 'available', manifest: assessment.manifest }
      this.emit(status)
      return status
    } catch (error) {
      if (generation !== this.checkGeneration) return { state: 'idle', reason: 'cancelled' }
      if (checkController.signal.aborted) return { state: 'idle', reason: 'cancelled' }
      this.selectedManifest = null
      const status: UpdateStatus = { state: 'failed', reason: 'manifest' }
      this.emit(status)
      return status
    } finally {
      clearTimeout(timeout)
      if (this.checkController === checkController) this.checkController = null
    }
  }

  async download(destination?: string): Promise<UpdateStatus> {
    const manifest = this.selectedManifest
    if (!manifest) return { state: 'failed', reason: 'manifest' }
    this.readyArtifact = null
    const target = destination ?? this.defaultDestination(manifest)
    if (!target || !this.isSafeDestination(target)) return { state: 'failed', reason: 'destination' }
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    this.emit({ state: 'downloading', downloaded: 0, total: manifest.size })
    try {
      const result = await downloadAndVerifyArtifact(manifest, target, this.artifactFetcher, {
        signal: controller.signal,
        onProgress: (downloaded, total) => { if (this.controller === controller) this.emit({ state: 'downloading', downloaded, total }) }
      })
      if (this.controller !== controller || controller.signal.aborted) return { state: 'idle', reason: 'cancelled' }
      const status: UpdateStatus = { state: 'ready', ...result }
      this.readyArtifact = result
      this.emit(status)
      return status
    } catch (error) {
      if (controller.signal.aborted && this.controller !== controller) return { state: 'idle', reason: 'cancelled' }
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        const status: UpdateStatus = { state: 'idle', reason: 'cancelled' }
        this.emit(status)
        return status
      }
      const message = error instanceof Error ? error.message : String(error)
      const status: UpdateStatus = { state: 'failed', reason: message.includes('完整性') || message.includes('超过声明大小') ? 'integrity' : 'destination' }
      this.emit(status)
      return status
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  cancel(): UpdateStatus {
    this.controller?.abort()
    this.readyArtifact = null
    return { state: 'idle', reason: 'cancelled' }
  }

  async install(): Promise<UpdateStatus> {
    const artifact = this.readyArtifact
    const manifest = this.selectedManifest
    if (!artifact || !manifest) return { state: 'failed', reason: 'installation' }
    try {
      const currentBytes = await readFile(artifact.destination)
      const verification = verifyArtifact(currentBytes, manifest)
      if (!verification.ok) {
        const status: UpdateStatus = { state: 'failed', reason: 'installation' }
        this.emit(status)
        return status
      }
    } catch {
      const status: UpdateStatus = { state: 'failed', reason: 'installation' }
      this.emit(status)
      return status
    }
    try {
      const error = await this.installer(artifact.destination)
      if (error) throw new Error(error)
      const status: UpdateStatus = { state: 'installing', ...artifact }
      this.emit(status)
      return status
    } catch {
      const status: UpdateStatus = { state: 'install_failed', destination: artifact.destination, bytes: artifact.bytes }
      this.emit(status)
      return status
    }
  }

  private emit(event: UpdateEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private defaultDestination(manifest: UpdateManifest): string | null {
    if (!this.destinationRoot) return null
    const extension = manifest.platform === 'darwin' ? '.dmg' : manifest.platform === 'win32' ? '.exe' : extname(new URL(manifest.artifactUrl).pathname) || '.artifact'
    return join(this.destinationRoot, `Novel-Studio-${manifest.version}${extension}`)
  }

  private isSafeDestination(target: string): boolean {
    if (!this.destinationRoot) return true
    const root = resolve(this.destinationRoot)
    const candidate = resolve(target)
    const pathFromRoot = relative(root, candidate)
    return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
  }
}
