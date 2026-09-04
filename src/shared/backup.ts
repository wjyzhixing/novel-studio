import { z } from 'zod'
import type { Result } from './result'

export const backupManifestSchema = z.object({
  version: z.literal(1),
  kind: z.enum(['full', 'incremental']),
  createdAt: z.string().datetime(),
  files: z.record(z.string().min(1), z.string().regex(/^[a-f0-9]{64}$/)),
  changed: z.array(z.string().min(1)),
  deleted: z.array(z.string().min(1)),
  baseManifestHash: z.string().regex(/^[a-f0-9]{64}$/).optional()
})

export type BackupManifest = z.infer<typeof backupManifestSchema>

export interface BackupApiContract {
  createArchive(destination: string): Promise<Result<string>>
  restoreArchive(archive: string, destination: string): Promise<Result<string>>
  createIncrementalArchive(destination: string, baseArchive: string): Promise<Result<string>>
  restoreIncrementalArchive(baseArchive: string, incrementalArchive: string, destination: string): Promise<Result<string>>
}
