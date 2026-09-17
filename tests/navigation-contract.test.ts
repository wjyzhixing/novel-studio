import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sidebar = readFileSync(new URL('../src/renderer/src/components/Sidebar.tsx', import.meta.url), 'utf8')
const storyBible = readFileSync(new URL('../src/renderer/src/components/StoryBible.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/renderer/src/styles/app.css', import.meta.url), 'utf8')

describe('Story Bible navigation contract', () => {
  it('keeps all ten sidebar destinations mapped to StorySection values', () => {
    expect(sidebar).toContain("export type StorySection = EntityKind | 'world' | 'timeline' | 'plots' | 'foreshadowing' | 'lore' | 'notes'")
    expect(sidebar).toContain("['character', 'world', 'timeline', 'org', 'item', 'plots', 'foreshadowing', 'place', 'lore', 'notes']")
    expect(sidebar).toContain('activeSection === section ? \' active\' : \'\'')
  })

  it('renders the active section title in the Story Bible shell', () => {
    expect(storyBible).toContain('const sectionTitle = (value: StorySection)')
    expect(storyBible).toContain("uiText('storyBible')")
    expect(storyBible).toContain('useEffect(() => {\n    setKind(entityKind ?? \'character\')')
  })

  it('keeps Story Bible destinations inside a full-height, bounded overflow layout', () => {
    expect(styles).toContain('.story-bible-shell{display:flex;flex-direction:column;height:100%;min-height:0')
    expect(styles).toContain('.story-bible-layout{flex:1;height:auto;min-height:0}')
    expect(styles).toContain('.story-entity-list,.story-form,.story-section-panel{min-height:0}')
  })
})
