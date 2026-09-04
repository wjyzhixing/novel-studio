import type { Workflow } from './workflow'

const node = (id: string, type: string, label: string, inputType = 'any', outputType = 'any', agent?: string): Workflow['nodes'][number] => ({ id, type, label, position: { x: 0, y: 0 }, inputs: id === 'chapter-input' ? [] : [{ id: 'in', type: inputType, required: true }], outputs: [{ id: 'out', type: outputType, required: false }], config: agent ? { agent } : {} })
const multiInputNode = (id: string, type: string, label: string, inputs: string[]): Workflow['nodes'][number] => ({ id, type, label, position: { x: 0, y: 0 }, inputs: inputs.map((input) => ({ id: input, type: 'any', required: true })), outputs: [{ id: 'out', type: 'any', required: false }], config: {} })
export function builtinNovelFlow(): Workflow {
  const nodes = [
    node('chapter-input', 'input.chapter', 'Chapter Input', 'none', 'chapter'),
    node('context', 'context.load', 'Context', 'chapter', 'context'),
    node('plan', 'ai.prompt', 'Plan', 'any', 'instruction', 'plot-planner'),
    node('write', 'ai.prompt', 'Write', 'instruction', 'draft', 'writer'),
    node('critic-character', 'ai.critic', 'Character Critic', 'draft', 'review', 'character-critic'),
    node('critic-logic', 'ai.critic', 'Logic Critic', 'draft', 'review', 'logic-critic'),
    node('critic-style', 'ai.critic', 'Style Critic', 'draft', 'review', 'style-critic'),
    multiInputNode('critic-merge', 'logic.merge', 'Merge Critics', ['character', 'logic', 'style']),
    node('rewrite', 'ai.prompt', 'Rewrite', 'review', 'draft', 'rewrite'),
    node('review', 'human.review', 'Review', 'draft', 'review-action'),
    node('chapter-write', 'chapter.write', 'Write Back to Chapter', 'review-action', 'chapter'),
    node('memory', 'memory.extract', 'Memory'),
    node('image-propose', 'image.propose', 'Image Proposal'),
    node('image-generate', 'image.generate', 'Generate Illustration'),
    node('image-select', 'image.select', 'Select Illustration'),
    node('image-insert', 'image.insert', 'Insert Illustration')
  ]
  const edges = [
    ['chapter-input', 'context', 'in'], ['context', 'plan', 'in'], ['plan', 'write', 'in'],
    ['write', 'critic-character', 'in'], ['write', 'critic-logic', 'in'], ['write', 'critic-style', 'in'],
    ['critic-character', 'critic-merge', 'character'], ['critic-logic', 'critic-merge', 'logic'], ['critic-style', 'critic-merge', 'style'],
    ['critic-merge', 'rewrite', 'in'], ['rewrite', 'review', 'in'], ['review', 'chapter-write', 'in'], ['chapter-write', 'memory', 'in'], ['memory', 'image-propose', 'in'],
    ['image-propose', 'image-generate', 'in'], ['image-generate', 'image-select', 'in'], ['image-select', 'image-insert', 'in']
  ].map(([source, target, targetPort], index) => ({ id: `edge-${index}-${source}-${target}`, source, sourcePort: 'out', target, targetPort }))
  const positionedNodes = nodes.map((item, index) => ({ ...item, position: { x: (index % 4) * 240 + 80, y: Math.floor(index / 4) * 170 + 80 } }))
  return { schemaVersion: 1, id: 'flow_builtin_novel', name: 'Novel Authoring Flow', cyclePolicy: 'reject', nodes: positionedNodes, edges, variables: [] }
}
