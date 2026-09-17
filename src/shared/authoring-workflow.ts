import type { Workflow } from './workflow'

const node = (id: string, type: string, label: string, inputType = 'any', outputType = 'any', agent?: string, prompt?: string): Workflow['nodes'][number] => ({
  id,
  type,
  label,
  position: { x: 0, y: 0 },
  inputs: id === 'chapter-input' ? [] : [{ id: 'in', type: inputType, required: true }],
  outputs: [{ id: 'out', type: outputType, required: false }],
  config: { ...(agent ? { agent } : {}), ...(prompt ? { prompt } : {}) }
})

const multiInputNode = (id: string, type: string, label: string, inputs: string[]): Workflow['nodes'][number] => ({
  id,
  type,
  label,
  position: { x: 0, y: 0 },
  inputs: inputs.map((input) => ({ id: input, type: 'any', required: true })),
  outputs: [{ id: 'out', type: 'any', required: false }],
  config: {}
})

/** The reusable chapter-by-chapter authoring flow installed for new projects. */
export function myAuthoringWorkflow(): Workflow {
  const nodes = [
    node('chapter-input', 'input.chapter', '读取当前章节', 'none', 'chapter'),
    node('context', 'context.load', '构建 Context', 'chapter', 'context'),
    node('plan', 'ai.prompt', '章节规划', 'any', 'instruction', 'plot-planner', '基于 Context 规划本章目标、冲突、转折、场景 beats 和结尾钩子。'),
    node('write', 'ai.prompt', '生成章节草稿', 'instruction', 'draft', 'writer', '按照规划写出本章中文正文，只输出可审核正文，不提前解决主谜团。'),
    node('critic-character', 'ai.critic', '人物一致性检查', 'draft', 'review', 'character-critic', '检查人物目标、恐惧、秘密、关系和已知信息是否一致。'),
    node('critic-logic', 'ai.critic', '逻辑一致性检查', 'draft', 'review', 'logic-critic', '检查因果、时间、空间、证据和信息释放是否自洽。'),
    node('critic-style', 'ai.critic', '文风一致性检查', 'draft', 'review', 'style-critic', '检查视角、节奏、重复表达、感官细节和整体语气。'),
    multiInputNode('critic-merge', 'logic.merge', '合并审阅意见', ['character', 'logic', 'style']),
    node('rewrite', 'ai.prompt', '按意见重写', 'review', 'draft', 'rewrite', '综合审阅意见重写正文，只输出可审核正文，保留未揭示的主谜团和已确认事实。'),
    node('review', 'human.review', '人工审核', 'draft', 'review-action'),
    node('chapter-write', 'chapter.write', '审核后写回章节', 'review-action', 'chapter'),
    node('memory', 'memory.extract', '提取候选事实')
  ]
  const connections: Array<[string, string, string]> = [
    ['chapter-input', 'context', 'in'],
    ['context', 'plan', 'in'],
    ['plan', 'write', 'in'],
    ['write', 'critic-character', 'in'],
    ['write', 'critic-logic', 'in'],
    ['write', 'critic-style', 'in'],
    ['critic-character', 'critic-merge', 'character'],
    ['critic-logic', 'critic-merge', 'logic'],
    ['critic-style', 'critic-merge', 'style'],
    ['critic-merge', 'rewrite', 'in'],
    ['rewrite', 'review', 'in'],
    ['review', 'chapter-write', 'in'],
    ['chapter-write', 'memory', 'in']
  ]
  const edges = connections.map(([source, target, targetPort], index) => ({
    id: `edge-${index}-${source}-${target}`,
    source,
    sourcePort: 'out',
    target,
    targetPort
  }))
  const positionedNodes = nodes.map((item, index) => ({
    ...item,
    position: { x: (index % 4) * 240 + 80, y: Math.floor(index / 4) * 170 + 80 }
  }))
  return {
    schemaVersion: 1,
    id: 'flow_my_authoring',
    name: '我的创作流程',
    cyclePolicy: 'reject',
    nodes: positionedNodes,
    edges,
    variables: []
  }
}
