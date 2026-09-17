import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('user project Electron smoke contract', () => {
  it('opens the configured user project without mutating project content', async () => {
    const script = await readFile(new URL('../scripts/golden-path-user-project.mjs', import.meta.url), 'utf8')

    expect(script).toContain("demo/未命名文件夹")
    expect(script).toContain('window.novelAPI.project.open')
    expect(script).toContain('window.novelAPI.project.checkIntegrity')
    expect(script).toContain('invalidStoryArtifactDetails')
    expect(script).toContain('data-testid="chapter-open"')
    expect(script).toContain('data-testid="editor-pane"')
    expect(script).toContain('data-testid="right-panel"')
    expect(script).toContain('await driver?.close()')
    expect(script).toContain('await launcher?.stop()')

    expect(script).not.toContain('project.repairIndexes')
    expect(script).not.toContain('chapter.save')
    expect(script).not.toContain('chapter.importFile')
    expect(script).not.toContain('workflowRuntime.start')
  })
})
