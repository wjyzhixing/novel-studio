import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { extensionPermissionSchema, type ExtensionPermission } from '../../shared/extensions'

export type ExtensionPermissionGrant = {
  extensionId: string
  version: string
  permissions: readonly ExtensionPermission[]
}

const grantSchema = z.object({
  extensionId: z.string().regex(/^ext_[a-zA-Z0-9_-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  permissions: z.array(extensionPermissionSchema).max(20)
})

/** Main-owned, fail-closed persistence for explicit extension approvals. */
export class ExtensionPermissionStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<ExtensionPermissionGrant[]> {
    let raw: string
    try { raw = await readFile(this.filePath, 'utf8') } catch { return [] }
    try {
      const value: unknown = JSON.parse(raw)
      if (!Array.isArray(value)) return []
      const grants = value.flatMap((item) => {
        const parsed = grantSchema.safeParse(item)
        return parsed.success ? [{ ...parsed.data, permissions: [...parsed.data.permissions] }] : []
      })
      return grants.filter((grant, index) => grants.findIndex((candidate) => candidate.extensionId === grant.extensionId) === index)
    } catch { return [] }
  }

  async grant(grant: ExtensionPermissionGrant): Promise<void> {
    const parsed = grantSchema.parse({ ...grant, permissions: [...grant.permissions] })
    const grants = (await this.list()).filter((item) => item.extensionId !== parsed.extensionId)
    await this.write([...grants, { ...parsed, permissions: [...parsed.permissions] }])
  }

  async revoke(extensionId: string): Promise<void> {
    await this.write((await this.list()).filter((grant) => grant.extensionId !== extensionId))
  }

  private async write(grants: readonly ExtensionPermissionGrant[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, `${JSON.stringify(grants, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.filePath)
  }
}
