import { z } from 'zod'
import type { Result } from './result'

export const factInputSchema = z.object({
  id: z.string().regex(/^fact_[a-zA-Z0-9_-]+$/).optional(), subjectId: z.string().min(1), predicate: z.string().min(1).max(160),
  object: z.unknown(), validFrom: z.string().max(100).nullable().default(null), validTo: z.string().max(100).nullable().default(null),
  confidence: z.number().min(0).max(1).default(1), source: z.object({ documentId: z.string().min(1), range: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]) })
})
export type FactInput = z.input<typeof factInputSchema>
export interface Fact extends Omit<FactInput, 'id'> { id: string; canonical: boolean; createdAt: string }
export interface Conflict { id: string; kind: 'unique-attribute' | 'temporal' | 'knowledge-leak'; message: string; factIds: string[]; severity: 'warning' | 'error' }
export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'reverted'
export interface CanonProposal { id: string; type: 'fact.add' | 'fact.update' | 'relation.update'; payload: FactInput; status: ProposalStatus; createdAt: string; appliedAt: string | null; appliedFactId?: string | null; workflowRunId?: string | null }
export interface CanonApiContract {
  listFacts(subjectId?: string, limit?: number, offset?: number): Promise<Result<Fact[]>>; countFacts(subjectId?: string): Promise<Result<number>>; check(fact: FactInput): Promise<Result<Conflict[]>>; listProposals(): Promise<Result<CanonProposal[]>>
  proposeFact(fact: FactInput): Promise<Result<CanonProposal>>; rejectProposal(id: string): Promise<Result<null>>; applyProposal(id: string): Promise<Result<Fact>>; revertProposal(id: string): Promise<Result<null>>
}
