import { readFile } from 'node:fs/promises'
import type { SecretStore } from '../../shared/ai'
import { atomicWriteFile } from './atomic-fs'

export interface SafeStorageBackend { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string }

/** OS-backed secret storage adapter. The encrypted payload is kept outside the project. */
export class SafeStorageSecretStore implements SecretStore {
  private readonly values = new Map<string, string>()
  private loaded = false
  constructor(private readonly backend: SafeStorageBackend, private readonly storageFile?: string) {}
  private async ensureLoaded() {
    if (this.loaded) return
    this.loaded = true
    if (!this.storageFile) return
    try {
      const raw = JSON.parse(await readFile(this.storageFile, 'utf8')) as Record<string, string>
      for (const [id, value] of Object.entries(raw)) this.values.set(id, value)
    } catch { /* no secrets configured yet */ }
  }
  private async persist() {
    if (this.storageFile) await atomicWriteFile(this.storageFile, JSON.stringify(Object.fromEntries(this.values)))
  }
  async has(id: string) { await this.ensureLoaded(); return this.values.has(id) }
  async set(id: string, secret: string) {
    await this.ensureLoaded()
    if (!this.backend.isEncryptionAvailable()) throw new Error('OS 安全存储不可用')
    this.values.set(id, this.backend.encryptString(secret).toString('base64'))
    await this.persist()
  }
  async get(id: string) {
    await this.ensureLoaded()
    const value = this.values.get(id)
    return value ? this.backend.decryptString(Buffer.from(value, 'base64')) : null
  }
  async remove(id: string) { await this.ensureLoaded(); this.values.delete(id); await this.persist() }
}

/** Test-only deterministic store; no production code should persist secrets in project files. */
export class MemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>()
  async has(id: string) { return this.values.has(id) }
  async set(id: string, secret: string) { this.values.set(id, secret) }
  async get(id: string) { return this.values.get(id) ?? null }
  async remove(id: string) { this.values.delete(id) }
}
