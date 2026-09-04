import { describe, expect, it } from 'vitest'
import { validateWorkflow } from '../src/main/services/workflow-validation'
import type { Workflow } from '../src/shared/workflow'
import { WorkflowService } from '../src/main/services/workflow-service'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { makeTempRoot } from './helpers'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const node = (id: string, inputType: string, outputType: string): Workflow['nodes'][number] => ({ id, type: 'utility.transform', label: id, position: { x: 0, y: 0 }, inputs: [{ id: 'in', type: inputType, required: false }], outputs: [{ id: 'out', type: outputType, required: false }], config: {} })
const base = (edges: Workflow['edges']): Workflow => ({ schemaVersion: 1, id: 'flow_test', name: 'Test', cyclePolicy: 'reject', nodes: [node('a', 'text', 'text'), node('b', 'text', 'text')], edges, variables: [] })

describe('workflow validation', () => {
  it('accepts a valid typed DAG', () => { expect(validateWorkflow(base([{ id: 'e1', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' }]))).toEqual([]) })
  it('rejects missing ports and mismatched types', () => {
    const workflow = base([{ id: 'e1', source: 'a', sourcePort: 'missing', target: 'b', targetPort: 'in' }]); expect(validateWorkflow(workflow)[0].code).toBe('MISSING_PORT')
    workflow.nodes[0].outputs[0].type = 'image'; workflow.edges[0].sourcePort = 'out'; expect(validateWorkflow(workflow)[0].code).toBe('PORT_TYPE_MISMATCH')
  })
  it('rejects cycles', () => { const workflow = base([{ id: 'e1', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' }, { id: 'e2', source: 'b', sourcePort: 'out', target: 'a', targetPort: 'in' }]); expect(validateWorkflow(workflow).some((issue) => issue.code === 'CYCLE')).toBe(true) })

  it('saves, reads and lists a valid .novelflow file', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Workflow file test'); const service = new WorkflowService(project)
    const workflow = { ...base([]), id: 'flow_story', name: 'Story Flow' }
    const summary = await service.save(workflow)
    expect(summary.relPath).toBe('workflows/flow_story.novelflow.json'); expect(existsSync(join(project.getInfo()!.rootPath, summary.relPath))).toBe(true)
    expect((await service.read(summary.relPath)).name).toBe('Story Flow'); expect((await service.list())).toHaveLength(2)
    await expect(service.read('workflows/../novel.yaml')).rejects.toMatchObject({ code: 'PATH_DENIED' })
  })
})
