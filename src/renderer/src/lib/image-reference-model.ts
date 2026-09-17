export function toggleImageReference(referenceIds: readonly string[], assetId: string): string[] {
  if (referenceIds.includes(assetId)) return referenceIds.filter((id) => id !== assetId)
  return [...referenceIds, assetId]
}

export function limitImageReferences(referenceIds: readonly string[], max = 20): string[] {
  return [...new Set(referenceIds)].slice(0, max)
}
