import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Story Bible quick open contract', () => {
  it('passes a story result id and selects timeline or artifact hits', async () => {
    const app = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    const story = await readFile(new URL('../src/renderer/src/components/StoryBible.tsx', import.meta.url), 'utf8')
    expect(app).toContain('focusStoryResultId')
    expect(app).toContain('focusStoryResultId={focusedStoryResultId}')
    expect(app).toContain("novel:focus-story-result")
    expect(story).toContain('focusStoryResultId')
    expect(story).toContain('chooseTimeline(focused)')
    expect(story).toContain('chooseArtifact(focused)')
  })
})
