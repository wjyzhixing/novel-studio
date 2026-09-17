import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Community Workflow UI contract', () => {
  it('exposes import and export actions from Workflow Editor', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/WorkflowEditor.tsx', import.meta.url), 'utf8')
    expect(source).toContain('pickCommunityWorkflowOpen')
    expect(source).toContain('pickCommunityWorkflowSave')
    expect(source).toContain('communityWorkflow.preview')
    expect(source).toContain('preview.data.promptNames')
    expect(source).toContain('communityWorkflow.install')
    expect(source).toContain('communityWorkflow.export')
    expect(source).toContain('uiText("importCommunityWorkflow")')
    expect(source).toContain('uiText("exportCommunityWorkflow")')
  })
})
