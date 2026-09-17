import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Story Bible Timeline golden-path selectors', () => {
  it('exposes stable selectors for event editing and source fields', async () => {
    const sidebar = await readFile(new URL('../src/renderer/src/components/Sidebar.tsx', import.meta.url), 'utf8')
    const storyBible = await readFile(new URL('../src/renderer/src/components/StoryBible.tsx', import.meta.url), 'utf8')
    expect(sidebar).toContain('story-timeline-open')
    expect(storyBible).toContain('timeline-new')
    expect(storyBible).toContain('timeline-event')
    expect(storyBible).toContain('timeline-title')
    expect(storyBible).toContain('timeline-participant-')
    expect(storyBible).toContain('timeline-location')
    expect(storyBible).toContain('timeline-causes')
    expect(storyBible).toContain('timeline-effects')
    expect(storyBible).toContain('timeline-save')
    expect(storyBible).toContain('timeline-visual')
    expect(storyBible).toContain('timeline-point')
    expect(storyBible).toContain('aria-label={point.event.title}')
    expect(storyBible).toContain("ariaLabel={uiText('storyTimelineOverview')}")
    expect(storyBible).not.toContain('aria-label="Timeline overview"')
  })
})
