import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('authoring wizard contract', () => {
  it('collects the minimum story foundation and initializes it through the authoring API', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/AuthoringWizard.tsx', import.meta.url), 'utf8')
    for (const field of ['genre', 'premise', 'targetWordCount', 'chapterCount', 'volumeTitles', 'chapterTitles']) expect(source).toContain(field)
    expect(source).toContain('createProject')
    expect(source).toContain('window.novelAPI.authoring.initialize')
    expect(source).toContain('loadChapters()')
    expect(source).toContain('loadVolumes()')
    expect(source).toContain('novel:open-authoring')
  })

  it('keeps the existing welcome route and opens the wizard before project creation', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/Welcome.tsx', import.meta.url), 'utf8')
    expect(source).toContain('AuthoringWizard')
    expect(source).toContain('setWizardRoot(dir)')
    expect(source).not.toContain('if (dir) await createProject(dir, title)')
  })
})
