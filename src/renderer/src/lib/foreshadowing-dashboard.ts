import type { ForeshadowingRecord, ForeshadowingStatus } from '../../../shared/story'

const statuses: readonly ForeshadowingStatus[] = ['planned', 'planted', 'echoed', 'resolved', 'abandoned']

export interface ForeshadowingDashboard {
  total: number
  statusCounts: Record<ForeshadowingStatus, number>
  resolvedPercent: number
  evidencePercent: number
  missingEvidenceIds: string[]
}

export function buildForeshadowingDashboard(records: readonly ForeshadowingRecord[]): ForeshadowingDashboard {
  const statusCounts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<ForeshadowingStatus, number>
  const missingEvidenceIds: string[] = []
  for (const record of records) {
    statusCounts[record.status] += 1
    if (!record.evidence.trim() && record.evidenceItems.length === 0) missingEvidenceIds.push(record.id)
  }
  const total = records.length
  const percentage = (value: number): number => total === 0 ? 0 : Math.round(value / total * 100)
  return {
    total,
    statusCounts,
    resolvedPercent: percentage(statusCounts.resolved),
    evidencePercent: percentage(total - missingEvidenceIds.length),
    missingEvidenceIds
  }
}
