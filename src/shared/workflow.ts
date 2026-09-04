import { z } from 'zod'
import type { Result } from './result'

export const portSchema = z.object({ id: z.string().min(1).max(80), type: z.string().min(1).max(80), required: z.boolean().default(false) })
export const workflowNodeSchema = z.object({ id: z.string().min(1).max(120), type: z.string().min(1).max(120), label: z.string().min(1).max(160), position: z.object({ x: z.number().finite(), y: z.number().finite() }), inputs: z.array(portSchema).default([]), outputs: z.array(portSchema).default([]), config: z.record(z.string(), z.unknown()).default({}) })
export const workflowEdgeSchema = z.object({ id: z.string().min(1).max(120), source: z.string().min(1), sourcePort: z.string().min(1), target: z.string().min(1), targetPort: z.string().min(1) })
export const workflowSchema = z.object({ schemaVersion: z.literal(1), id: z.string().regex(/^flow_[a-zA-Z0-9_-]+$/), name: z.string().min(1).max(160), cyclePolicy: z.enum(['reject']).default('reject'), nodes: z.array(workflowNodeSchema).max(500), edges: z.array(workflowEdgeSchema).max(2000), variables: z.array(z.object({ name: z.string().min(1), type: z.string().min(1), defaultValue: z.unknown().optional() })).default([]) })
export type Workflow = z.infer<typeof workflowSchema>
export interface WorkflowIssue { code: 'DUPLICATE_NODE' | 'MISSING_NODE' | 'MISSING_PORT' | 'MISSING_INPUT' | 'PORT_TYPE_MISMATCH' | 'CYCLE'; message: string; edgeId?: string; nodeId?: string }
export interface WorkflowSummary { id: string; name: string; relPath: string }
export interface WorkflowApiContract { list(): Promise<Result<WorkflowSummary[]>>; read(relPath: string): Promise<Result<Workflow>>; save(workflow: Workflow): Promise<Result<WorkflowSummary>>; validate(workflow: Workflow): Promise<Result<WorkflowIssue[]>> }
