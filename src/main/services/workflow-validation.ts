import type { Workflow, WorkflowIssue } from '../../shared/workflow'

/** Node types whose execution is implemented and owned by the Main process. */
export const BUILTIN_WORKFLOW_NODE_TYPES = new Set([
  'input.chapter',
  'context.load',
  'memory.extract',
  'chapter.write',
  'image.propose',
  'image.prompt',
  'image.generate',
  'image.select',
  'image.insert',
  'human.review',
  'logic.condition',
  'logic.merge',
  'utility.transform',
  'ai.prompt',
  'ai.generate',
  'ai.critic'
])

export function validateWorkflow(workflow: Workflow, additionalNodeTypes: Iterable<string> = []): WorkflowIssue[] {
  const issues: WorkflowIssue[] = []; const nodes = new Map<string, Workflow['nodes'][number]>()
  const allowedNodeTypes = new Set([...BUILTIN_WORKFLOW_NODE_TYPES, ...additionalNodeTypes])
  for (const node of workflow.nodes) {
    if (nodes.has(node.id)) issues.push({ code: 'DUPLICATE_NODE', nodeId: node.id, message: `节点 ID 重复: ${node.id}` })
    else nodes.set(node.id, node)
    if (!allowedNodeTypes.has(node.type)) issues.push({ code: 'UNKNOWN_NODE', nodeId: node.id, message: `节点类型未注册或不受支持: ${node.type}` })
  }
  const indegree = new Map<string, number>(workflow.nodes.map((node) => [node.id, 0])); const adjacency = new Map<string, string[]>()
  for (const edge of workflow.edges) {
    const source = nodes.get(edge.source); const target = nodes.get(edge.target)
    if (!source || !target) { issues.push({ code: 'MISSING_NODE', edgeId: edge.id, message: `边 ${edge.id} 引用了不存在的节点` }); continue }
    const output = source.outputs.find((port) => port.id === edge.sourcePort); const input = target.inputs.find((port) => port.id === edge.targetPort)
    if (!output || !input) { issues.push({ code: 'MISSING_PORT', edgeId: edge.id, message: `边 ${edge.id} 引用了不存在的端口` }); continue }
    if (output.type !== input.type && output.type !== 'any' && input.type !== 'any') issues.push({ code: 'PORT_TYPE_MISMATCH', edgeId: edge.id, message: `边 ${edge.id} 端口类型不匹配: ${output.type} → ${input.type}` })
    adjacency.set(source.id, [...(adjacency.get(source.id) ?? []), target.id]); indegree.set(target.id, (indegree.get(target.id) ?? 0) + 1)
  }
  for (const node of workflow.nodes) {
    const connected = new Set(workflow.edges.filter((edge) => edge.target === node.id).map((edge) => edge.targetPort))
    for (const input of node.inputs) if (input.required && !connected.has(input.id)) issues.push({ code: 'MISSING_INPUT', nodeId: node.id, message: `节点 ${node.id} 缺少必需输入端口 ${input.id}` })
  }
  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id); let visited = 0
  while (queue.length) { const id = queue.shift()!; visited++; for (const next of adjacency.get(id) ?? []) { const count = (indegree.get(next) ?? 0) - 1; indegree.set(next, count); if (count === 0) queue.push(next) } }
  if (visited !== nodes.size) issues.push({ code: 'CYCLE', message: 'Workflow 包含环路，当前 cyclePolicy 不允许执行' })
  return issues
}
