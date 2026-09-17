import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('editor accessibility contract', () => {
  it('names formatting controls and exposes pressed state', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/EditorPane.tsx', import.meta.url), 'utf8')
    for (const key of ['editorHeading1', 'editorHeading2', 'editorBold', 'editorItalic', 'editorBulletList', 'editorBlockquote']) expect(source).toContain(`uiText('${key}')`)
    expect(source).toContain('aria-pressed={editor?.isActive(')
  })
})
