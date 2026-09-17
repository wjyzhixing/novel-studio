import { describe, expect, it } from 'vitest'
import { builtinNovelFlow } from '../src/shared/builtin-workflow'
import { validateWorkflow } from '../src/main/services/workflow-validation'

describe('built-in novel flow', () => {
  it('contains the ordered authoring stages and is a valid DAG', () => {
    const flow = builtinNovelFlow()
    expect(flow.nodes.map((node) => node.label)).toEqual(['Chapter Input', 'Context', 'Plan', 'Write', 'Character Critic', 'Logic Critic', 'Style Critic', 'Merge Critics', 'Rewrite', 'Review', 'Write Back to Chapter', 'Memory', 'Image Proposal', 'Image Prompt', 'Generate Illustration', 'Select Illustration', 'Insert Illustration'])
    expect(validateWorkflow(flow)).toEqual([])
  })

  it('keeps image prompt compilation as a distinct workflow stage', () => {
    const flow = builtinNovelFlow()
    expect(flow.nodes.find((node) => node.type === 'image.prompt')).toMatchObject({ label: 'Image Prompt' })
    expect(flow.edges).toContainEqual(expect.objectContaining({ source: 'image-propose', target: 'image-prompt' }))
    expect(flow.edges).toContainEqual(expect.objectContaining({ source: 'image-prompt', target: 'image-generate' }))
  })
})
