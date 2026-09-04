declare function extractZip(zipPath: string, options: {
  dir: string
  defaultDirMode?: number | string
  defaultFileMode?: number | string
  onEntry?: (entry: unknown, zipfile: unknown) => void
}): Promise<void>

export = extractZip
