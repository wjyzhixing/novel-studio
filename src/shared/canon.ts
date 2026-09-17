import { z } from 'zod'
import type { Result } from './result'
import { storyRelationInputSchema, timelineEventInputSchema, storyArtifactInputSchema, type StoryRelation, type StoryRelationInput, type TimelineEvent, type TimelineEventInput, type StoryArtifact, type StoryArtifactInput } from './story'

export const factInputSchema = z.object({
  id: z.string().regex(/^fact_[a-zA-Z0-9_-]+$/).optional(), subjectId: z.string().min(1), predicate: z.string().min(1).max(160),
  object: z.unknown(), validFrom: z.string().max(100).nullable().default(null), validTo: z.string().max(100).nullable().default(null),
  confidence: z.number().min(0).max(1).default(1), source: z.object({ documentId: z.string().min(1), range: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]) })
})
export type FactInput = z.input<typeof factInputSchema>
export interface Fact extends Omit<FactInput, 'id'> { id: string; canonical: boolean; createdAt: string }
export interface Conflict { id: string; kind: 'unique-attribute' | 'temporal' | 'knowledge-leak'; message: string; factIds: string[]; severity: 'warning' | 'error' }
export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'reverted'
const requiredRelationIdSchema = z.object({ id: z.string().regex(/^rel_[a-zA-Z0-9_-]+$/) })
export const canonRelationUpdatePayloadSchema = z.object({ before: storyRelationInputSchema.and(requiredRelationIdSchema), after: storyRelationInputSchema.and(requiredRelationIdSchema) })
export type CanonRelationUpdatePayload = { before: StoryRelation; after: StoryRelationInput & { id: string } }
const requiredFactIdSchema = z.object({ id: z.string().regex(/^fact_[a-zA-Z0-9_-]+$/) })
const factSnapshotSchema = factInputSchema.and(requiredFactIdSchema).and(z.object({ canonical: z.boolean(), createdAt: z.string() }))
export const canonFactUpdatePayloadSchema = z.object({ before: factSnapshotSchema, after: factInputSchema.and(requiredFactIdSchema) })
export type CanonFactUpdatePayload = { before: Fact; after: FactInput & { id: string } }
const requiredTimelineIdSchema = z.object({ id: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/) })
export const canonTimelineAddPayloadSchema = z.object({ event: timelineEventInputSchema.and(requiredTimelineIdSchema) })
export type CanonTimelineAddPayload = { event: TimelineEventInput & { id: string } }
const requiredArtifactIdSchema = z.object({ id: z.string().regex(/^art_[a-zA-Z0-9_-]+$/) })
export const canonForeshadowingAddPayloadSchema = z.object({ artifact: storyArtifactInputSchema.and(requiredArtifactIdSchema).refine((value) => value.kind === 'foreshadowing', { message: 'Canon 伏笔提案必须是 foreshadowing 类型' }) })
export type CanonForeshadowingAddPayload = { artifact: StoryArtifactInput & { id: string; kind: 'foreshadowing' } }
export type CanonProposalPayload = FactInput | CanonRelationUpdatePayload | CanonFactUpdatePayload | CanonTimelineAddPayload | CanonForeshadowingAddPayload
export interface CanonProposal { id: string; type: 'fact.add' | 'fact.update' | 'knowledge.update' | 'relation.update' | 'timeline.add' | 'foreshadowing.add'; payload: CanonProposalPayload; status: ProposalStatus; createdAt: string; appliedAt: string | null; appliedFactId?: string | null; workflowRunId?: string | null }
export interface CanonApiContract {
  listFacts(subjectId?: string, limit?: number, offset?: number): Promise<Result<Fact[]>>; countFacts(subjectId?: string): Promise<Result<number>>; check(fact: FactInput): Promise<Result<Conflict[]>>; listProposals(): Promise<Result<CanonProposal[]>>
  proposeFact(fact: FactInput): Promise<Result<CanonProposal>>; proposeFactUpdate(fact: FactInput & { id: string }): Promise<Result<CanonProposal>>; proposeRelationUpdate(relation: StoryRelationInput): Promise<Result<CanonProposal>>; proposeTimelineAdd(event: TimelineEventInput): Promise<Result<CanonProposal>>; proposeForeshadowingAdd(artifact: StoryArtifactInput): Promise<Result<CanonProposal>>; rejectProposal(id: string): Promise<Result<null>>; applyProposal(id: string): Promise<Result<Fact | StoryRelation | TimelineEvent | StoryArtifact>>; revertProposal(id: string): Promise<Result<null>>
}
