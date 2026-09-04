import { randomBytes } from 'node:crypto'
import type { CanonProposal, Conflict, Fact, FactInput } from '../../shared/canon'
import { factInputSchema } from '../../shared/canon'
import type { ProjectService } from './project-service'
import { DomainError } from './errors'

export class CanonService {
  constructor(private readonly project: ProjectService) {}
  private get db() { return this.project.database.raw }

  async listFacts(subjectId?: string, limit = 2_000, offset = 0): Promise<Fact[]> {
    const safeLimit = Math.max(1, Math.min(10_000, Math.trunc(limit)))
    const safeOffset = Math.max(0, Math.trunc(offset))
    const rows = (subjectId ? this.db.prepare('SELECT * FROM facts WHERE subject_id = ? ORDER BY created_at LIMIT ? OFFSET ?').all(subjectId, safeLimit, safeOffset) : this.db.prepare('SELECT * FROM facts ORDER BY created_at LIMIT ? OFFSET ?').all(safeLimit, safeOffset)) as unknown as FactRow[]
    return rows.map(toFact)
  }
  async countFacts(subjectId?: string): Promise<number> {
    const row = (subjectId ? this.db.prepare('SELECT COUNT(*) AS count FROM facts WHERE subject_id = ?').get(subjectId) : this.db.prepare('SELECT COUNT(*) AS count FROM facts').get()) as { count: number }
    return Number(row.count)
  }
  async check(input: FactInput): Promise<Conflict[]> {
    const fact = factInputSchema.parse(input)
    const conflicts: Conflict[] = []
    if (fact.validFrom && fact.validTo && fact.validFrom > fact.validTo) conflicts.push({ id: `conflict_range_${fact.subjectId}_${fact.predicate}`, kind: 'temporal', message: `${fact.subjectId} 的 ${fact.predicate} 时间范围无效：validFrom 晚于 validTo`, factIds: [fact.id ?? 'candidate'], severity: 'error' })
    const rows = this.db.prepare('SELECT * FROM facts WHERE subject_id = ? AND predicate = ? AND canonical = 1').all(fact.subjectId, fact.predicate) as unknown as FactRow[]
    for (const row of rows) {
      if (JSON.stringify(decode(row.object_json, null)) === JSON.stringify(fact.object)) continue
      if (!rangesOverlap(row.valid_from, row.valid_to, fact.validFrom, fact.validTo)) continue
      const temporal = Boolean(row.valid_from || row.valid_to || fact.validFrom || fact.validTo)
      conflicts.push({ id: `conflict_${row.id}_${fact.subjectId}`, kind: temporal ? 'temporal' : 'unique-attribute', message: temporal ? `${fact.subjectId} 的 ${fact.predicate} 时间范围与现有 Canon 重叠且值不同` : `${fact.subjectId} 的 ${fact.predicate} 存在不同 Canon 值`, factIds: [row.id, fact.id ?? 'candidate'], severity: 'error' })
    }
    return conflicts
  }
  async listProposals(): Promise<CanonProposal[]> {
    const rows = this.db.prepare('SELECT * FROM proposals ORDER BY created_at').all() as unknown as ProposalRow[]
    return rows.map(toProposal)
  }
  async proposeFact(input: FactInput, workflowRunId?: string): Promise<CanonProposal> {
    const value = factInputSchema.parse(input)
    const proposal: CanonProposal = { id: `prop_${randomBytes(10).toString('hex')}`, type: 'fact.add', payload: value, status: 'pending', createdAt: new Date().toISOString(), appliedAt: null, workflowRunId: workflowRunId ?? null }
    this.db.prepare('INSERT INTO proposals(id, type, payload_json, status, created_at, applied_at, workflow_run_id) VALUES(?, ?, ?, ?, ?, ?, ?)').run(proposal.id, proposal.type, JSON.stringify(value), proposal.status, proposal.createdAt, null, workflowRunId ?? null)
    return proposal
  }
  async applyProposal(id: string): Promise<Fact> {
    const proposal = await this.getProposal(id)
    if (proposal.status !== 'pending') throw new DomainError('VALIDATION_FAILED', 'Proposal 已处理')
    const value = factInputSchema.parse(proposal.payload); const factId = value.id ?? `fact_${randomBytes(10).toString('hex')}`; const createdAt = new Date().toISOString()
    const conflicts = await this.check(value)
    if (conflicts.some((conflict) => conflict.severity === 'error')) throw new DomainError('VALIDATION_FAILED', 'Proposal 与现有 Canon 冲突', { details: conflicts })
    this.db.exec('BEGIN')
    try {
      this.db.prepare('INSERT INTO facts(id, subject_id, predicate, object_json, valid_from, valid_to, confidence, source_document_id, source_start, source_end, canonical, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)').run(factId, value.subjectId, value.predicate, JSON.stringify(value.object), value.validFrom, value.validTo, value.confidence, value.source.documentId, value.source.range[0], value.source.range[1], createdAt)
      this.db.prepare('UPDATE proposals SET status = ?, applied_at = ?, applied_fact_id = ? WHERE id = ?').run('applied', createdAt, factId, id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return { id: factId, ...value, canonical: true, createdAt }
  }
  async rejectProposal(id: string): Promise<null> {
    const proposal = await this.getProposal(id)
    if (proposal.status !== 'pending') throw new DomainError('VALIDATION_FAILED', '只有 pending Proposal 可以 Reject')
    this.db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run('rejected', id)
    return null
  }
  async revertProposal(id: string): Promise<null> {
    const proposal = await this.getProposal(id)
    if (proposal.status !== 'applied') throw new DomainError('VALIDATION_FAILED', '只有已 Apply 的 Proposal 可以 revert')
    const value = factInputSchema.parse(proposal.payload)
    const factId = proposal.appliedFactId ?? value.id
    if (!factId) throw new DomainError('DB_ERROR', 'Proposal 缺少已 Apply fact 引用，无法安全 Revert')
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM facts WHERE id = ?').run(factId)
      this.db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run('reverted', id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return null
  }
  private async getProposal(id: string): Promise<CanonProposal> { const row = this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as unknown as ProposalRow | undefined; if (!row) throw new DomainError('PROJECT_NOT_FOUND', `Proposal 不存在: ${id}`); return toProposal(row) }
}

interface FactRow { id: string; subject_id: string; predicate: string; object_json: string; valid_from: string | null; valid_to: string | null; confidence: number; source_document_id: string; source_start: number; source_end: number; canonical: number; created_at: string }
interface ProposalRow { id: string; type: CanonProposal['type']; payload_json: string; status: CanonProposal['status']; created_at: string; applied_at: string | null; applied_fact_id: string | null; workflow_run_id: string | null }
const decode = <T>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T } catch { return fallback } }
const toFact = (row: FactRow): Fact => ({ id: row.id, subjectId: row.subject_id, predicate: row.predicate, object: decode(row.object_json, null), validFrom: row.valid_from, validTo: row.valid_to, confidence: row.confidence, source: { documentId: row.source_document_id, range: [row.source_start, row.source_end] }, canonical: Boolean(row.canonical), createdAt: row.created_at })
const toProposal = (row: ProposalRow): CanonProposal => ({ id: row.id, type: row.type, payload: decode(row.payload_json, {} as FactInput), status: row.status, createdAt: row.created_at, appliedAt: row.applied_at, appliedFactId: row.applied_fact_id, workflowRunId: row.workflow_run_id })

function rangesOverlap(aFrom: string | null, aTo: string | null, bFrom: string | null, bTo: string | null): boolean {
  if (aTo && bFrom && aTo < bFrom) return false
  if (bTo && aFrom && bTo < aFrom) return false
  return true
}
