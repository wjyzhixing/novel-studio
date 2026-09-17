import { randomBytes } from 'node:crypto'
import type { CanonProposal, Conflict, Fact, FactInput, CanonRelationUpdatePayload, CanonFactUpdatePayload, CanonTimelineAddPayload, CanonForeshadowingAddPayload } from '../../shared/canon'
import { factInputSchema, canonRelationUpdatePayloadSchema, canonFactUpdatePayloadSchema, canonTimelineAddPayloadSchema, canonForeshadowingAddPayloadSchema } from '../../shared/canon'
import type { StoryRelation, StoryRelationInput, TimelineEvent, TimelineEventInput, StoryArtifact, StoryArtifactInput } from '../../shared/story'
import type { ProjectService } from './project-service'
import type { StoryService } from './story-service'
import { DomainError } from './errors'

export class CanonService {
  constructor(private readonly project: ProjectService, private readonly story?: StoryService) {}
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
    if (fact.validFrom && fact.validTo && compareStoryTime(fact.validFrom, fact.validTo) > 0) conflicts.push({ id: `conflict_range_${fact.subjectId}_${fact.predicate}`, kind: 'temporal', message: `${fact.subjectId} 的 ${fact.predicate} 时间范围无效：validFrom 晚于 validTo`, factIds: [fact.id ?? 'candidate'], severity: 'error' })
    const knowledgeStart = fact.predicate.toLowerCase().startsWith('knowledge.') ? chapterOrdinal(fact.validFrom) : null
    const sourceChapter = chapterOrdinal(fact.source.documentId)
    if (knowledgeStart !== null && sourceChapter !== null && knowledgeStart > sourceChapter) conflicts.push({ id: `conflict_knowledge_${fact.subjectId}_${fact.predicate}`, kind: 'knowledge-leak', message: `${fact.subjectId} 的 ${fact.predicate} 在第 ${knowledgeStart} 章才生效，但证据来自第 ${sourceChapter} 章`, factIds: [fact.id ?? 'candidate'], severity: 'warning' })
    const rows = this.db.prepare('SELECT * FROM facts WHERE subject_id = ? AND predicate = ? AND canonical = 1').all(fact.subjectId, fact.predicate) as unknown as FactRow[]
    for (const row of rows) {
      if (row.id === fact.id) continue
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
  async proposeRelationUpdate(input: StoryRelationInput, workflowRunId?: string): Promise<CanonProposal> {
    if (!this.story) throw new DomainError('VALIDATION_FAILED', 'Canon Relation Proposal 未连接 Story 服务')
    const after = canonRelationUpdatePayloadSchema.shape.after.parse(input)
    const before = (await this.story.listRelations()).find((relation) => relation.id === after.id)
    if (!before) throw new DomainError('PROJECT_NOT_FOUND', `关系不存在: ${after.id}`)
    const payload: CanonRelationUpdatePayload = { before, after }
    const proposal: CanonProposal = { id: `prop_${randomBytes(10).toString('hex')}`, type: 'relation.update', payload, status: 'pending', createdAt: new Date().toISOString(), appliedAt: null, workflowRunId: workflowRunId ?? null }
    this.db.prepare('INSERT INTO proposals(id, type, payload_json, status, created_at, applied_at, workflow_run_id) VALUES(?, ?, ?, ?, ?, ?, ?)').run(proposal.id, proposal.type, JSON.stringify(payload), proposal.status, proposal.createdAt, null, workflowRunId ?? null)
    return proposal
  }
  async proposeFactUpdate(input: FactInput & { id: string }, workflowRunId?: string): Promise<CanonProposal> {
    const after = canonFactUpdatePayloadSchema.shape.after.parse(input) as FactInput & { id: string }
    const row = this.db.prepare('SELECT * FROM facts WHERE id = ? AND canonical = 1').get(after.id) as unknown as FactRow | undefined
    if (!row) throw new DomainError('PROJECT_NOT_FOUND', `Canon 事实不存在: ${after.id}`)
    const before = toFact(row)
    const payload: CanonFactUpdatePayload = { before, after }
    const type: CanonProposal['type'] = after.predicate.toLowerCase().startsWith('knowledge.') ? 'knowledge.update' : 'fact.update'
    const proposal: CanonProposal = { id: `prop_${randomBytes(10).toString('hex')}`, type, payload, status: 'pending', createdAt: new Date().toISOString(), appliedAt: null, workflowRunId: workflowRunId ?? null }
    this.db.prepare('INSERT INTO proposals(id, type, payload_json, status, created_at, applied_at, workflow_run_id) VALUES(?, ?, ?, ?, ?, ?, ?)').run(proposal.id, proposal.type, JSON.stringify(payload), proposal.status, proposal.createdAt, null, workflowRunId ?? null)
    return proposal
  }
  async proposeTimelineAdd(input: TimelineEventInput, workflowRunId?: string): Promise<CanonProposal> {
    if (!this.story) throw new DomainError('VALIDATION_FAILED', 'Canon Timeline Proposal 未连接 Story 服务')
    const event = canonTimelineAddPayloadSchema.shape.event.parse(input) as TimelineEventInput & { id: string }
    if ((await this.story.listTimeline()).some((item) => item.id === event.id)) throw new DomainError('VALIDATION_FAILED', `时间线事件已存在: ${event.id}`)
    const payload: CanonTimelineAddPayload = { event }
    const proposal: CanonProposal = { id: `prop_${randomBytes(10).toString('hex')}`, type: 'timeline.add', payload, status: 'pending', createdAt: new Date().toISOString(), appliedAt: null, workflowRunId: workflowRunId ?? null }
    this.db.prepare('INSERT INTO proposals(id, type, payload_json, status, created_at, applied_at, workflow_run_id) VALUES(?, ?, ?, ?, ?, ?, ?)').run(proposal.id, proposal.type, JSON.stringify(payload), proposal.status, proposal.createdAt, null, workflowRunId ?? null)
    return proposal
  }
  async proposeForeshadowingAdd(input: StoryArtifactInput, workflowRunId?: string): Promise<CanonProposal> {
    if (!this.story) throw new DomainError('VALIDATION_FAILED', 'Canon Foreshadowing Proposal 未连接 Story 服务')
    const artifact = canonForeshadowingAddPayloadSchema.shape.artifact.parse(input) as StoryArtifactInput & { id: string; kind: 'foreshadowing' }
    if ((await this.story.listArtifacts()).some((item) => item.id === artifact.id)) throw new DomainError('VALIDATION_FAILED', `故事条目已存在: ${artifact.id}`)
    const payload: CanonForeshadowingAddPayload = { artifact }
    const proposal: CanonProposal = { id: `prop_${randomBytes(10).toString('hex')}`, type: 'foreshadowing.add', payload, status: 'pending', createdAt: new Date().toISOString(), appliedAt: null, workflowRunId: workflowRunId ?? null }
    this.db.prepare('INSERT INTO proposals(id, type, payload_json, status, created_at, applied_at, workflow_run_id) VALUES(?, ?, ?, ?, ?, ?, ?)').run(proposal.id, proposal.type, JSON.stringify(payload), proposal.status, proposal.createdAt, null, workflowRunId ?? null)
    return proposal
  }
  async applyProposal(id: string): Promise<Fact | StoryRelation | TimelineEvent | StoryArtifact> {
    const proposal = await this.getProposal(id)
    if (proposal.status !== 'pending') throw new DomainError('VALIDATION_FAILED', 'Proposal 已处理')
    if (proposal.type === 'relation.update') {
      if (!this.story) throw new DomainError('VALIDATION_FAILED', 'Canon Relation Proposal 未连接 Story 服务')
      const payload = canonRelationUpdatePayloadSchema.parse(proposal.payload)
      const relation = await this.story.saveRelation(payload.after)
      this.db.prepare('UPDATE proposals SET status = ?, applied_at = ?, applied_fact_id = ? WHERE id = ?').run('applied', new Date().toISOString(), relation.id, id)
      return relation
    }
    if (proposal.type === 'fact.update' || proposal.type === 'knowledge.update') {
      const payload = canonFactUpdatePayloadSchema.parse(proposal.payload)
      const conflicts = await this.check(payload.after)
      if (conflicts.some((conflict) => conflict.severity === 'error')) throw new DomainError('VALIDATION_FAILED', 'Proposal 与现有 Canon 冲突', { details: conflicts })
      const updated = await this.updateFact(payload.after, payload.before.createdAt)
      this.db.prepare('UPDATE proposals SET status = ?, applied_at = ?, applied_fact_id = ? WHERE id = ?').run('applied', new Date().toISOString(), updated.id, id)
      return updated
    }
    if (proposal.type === 'timeline.add') {
      if (!this.story) throw new DomainError('VALIDATION_FAILED', 'Canon Timeline Proposal 未连接 Story 服务')
      const payload = canonTimelineAddPayloadSchema.parse(proposal.payload)
      const event = await this.story.saveTimelineEvent(payload.event)
      this.db.prepare('UPDATE proposals SET status = ?, applied_at = ?, applied_fact_id = ? WHERE id = ?').run('applied', new Date().toISOString(), event.id, id)
      return event
    }
    if (proposal.type === 'foreshadowing.add') {
      if (!this.story) throw new DomainError('VALIDATION_FAILED', 'Canon Foreshadowing Proposal 未连接 Story 服务')
      const payload = canonForeshadowingAddPayloadSchema.parse(proposal.payload)
      const artifact = await this.story.saveArtifact(payload.artifact)
      this.db.prepare('UPDATE proposals SET status = ?, applied_at = ?, applied_fact_id = ? WHERE id = ?').run('applied', new Date().toISOString(), artifact.id, id)
      return artifact
    }
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
    if (proposal.type === 'relation.update') {
      if (!this.story) throw new DomainError('VALIDATION_FAILED', 'Canon Relation Proposal 未连接 Story 服务')
      const payload = canonRelationUpdatePayloadSchema.parse(proposal.payload)
      await this.story.saveRelation(payload.before)
      this.db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run('reverted', id)
      return null
    }
    if (proposal.type === 'fact.update' || proposal.type === 'knowledge.update') {
      const payload = canonFactUpdatePayloadSchema.parse(proposal.payload)
      await this.updateFact(payload.before, payload.before.createdAt)
      this.db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run('reverted', id)
      return null
    }
    if (proposal.type === 'timeline.add') {
      if (!this.story) throw new DomainError('VALIDATION_FAILED', 'Canon Timeline Proposal 未连接 Story 服务')
      const payload = canonTimelineAddPayloadSchema.parse(proposal.payload)
      await this.story.deleteTimelineEvent(payload.event.id)
      this.db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run('reverted', id)
      return null
    }
    if (proposal.type === 'foreshadowing.add') {
      if (!this.story) throw new DomainError('VALIDATION_FAILED', 'Canon Foreshadowing Proposal 未连接 Story 服务')
      const payload = canonForeshadowingAddPayloadSchema.parse(proposal.payload)
      await this.story.deleteArtifact(payload.artifact.id)
      this.db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run('reverted', id)
      return null
    }
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
  private async updateFact(input: FactInput & { id: string }, createdAt: string): Promise<Fact> {
    const value = factInputSchema.parse(input)
    const factId = input.id
    this.db.prepare('UPDATE facts SET subject_id = ?, predicate = ?, object_json = ?, valid_from = ?, valid_to = ?, confidence = ?, source_document_id = ?, source_start = ?, source_end = ?, canonical = 1, created_at = ? WHERE id = ?').run(value.subjectId, value.predicate, JSON.stringify(value.object), value.validFrom, value.validTo, value.confidence, value.source.documentId, value.source.range[0], value.source.range[1], createdAt, factId)
    const row = this.db.prepare('SELECT * FROM facts WHERE id = ?').get(factId) as unknown as FactRow | undefined
    if (!row) throw new DomainError('PROJECT_NOT_FOUND', `Canon 事实不存在: ${factId}`)
    return toFact(row)
  }
  private async getProposal(id: string): Promise<CanonProposal> { const row = this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as unknown as ProposalRow | undefined; if (!row) throw new DomainError('PROJECT_NOT_FOUND', `Proposal 不存在: ${id}`); return toProposal(row) }
}

interface FactRow { id: string; subject_id: string; predicate: string; object_json: string; valid_from: string | null; valid_to: string | null; confidence: number; source_document_id: string; source_start: number; source_end: number; canonical: number; created_at: string }
interface ProposalRow { id: string; type: CanonProposal['type']; payload_json: string; status: CanonProposal['status']; created_at: string; applied_at: string | null; applied_fact_id: string | null; workflow_run_id: string | null }
const decode = <T>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T } catch { return fallback } }
const toFact = (row: FactRow): Fact => ({ id: row.id, subjectId: row.subject_id, predicate: row.predicate, object: decode(row.object_json, null), validFrom: row.valid_from, validTo: row.valid_to, confidence: row.confidence, source: { documentId: row.source_document_id, range: [row.source_start, row.source_end] }, canonical: Boolean(row.canonical), createdAt: row.created_at })
const toProposal = (row: ProposalRow): CanonProposal => ({ id: row.id, type: row.type, payload: decode(row.payload_json, {} as FactInput), status: row.status, createdAt: row.created_at, appliedAt: row.applied_at, appliedFactId: row.applied_fact_id, workflowRunId: row.workflow_run_id })

function rangesOverlap(aFrom: string | null, aTo: string | null, bFrom: string | null, bTo: string | null): boolean {
  if (aTo && bFrom && compareStoryTime(aTo, bFrom) < 0) return false
  if (bTo && aFrom && compareStoryTime(bTo, aFrom) < 0) return false
  return true
}

function compareStoryTime(left: string, right: string): number {
  const leftChapter = chapterOrdinal(left)
  const rightChapter = chapterOrdinal(right)
  if (leftChapter !== null && rightChapter !== null) return leftChapter - rightChapter
  return left.localeCompare(right)
}

function chapterOrdinal(value: string | null): number | null {
  if (!value) return null
  const match = value.match(/(?:chapters?|ch)[^0-9]*(\d+)/i)
  return match ? Number(match[1]) : null
}
