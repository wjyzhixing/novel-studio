import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, markdownToHtml } from '../src/renderer/src/lib/markdown'

describe('chapter image Markdown conversion', () => {
  it('makes title-based asset IDs hydratable without losing the original path', () => {
    const markdown = '![地下星图库](../assets/scenes/002-地下星图库.png "asset_tide_archive_002")'

    const html = markdownToHtml(markdown, '/project')

    expect(html).toContain('data-asset-id="asset_tide_archive_002"')
    expect(html).toContain('data-asset-path="../assets/scenes/002-地下星图库.png"')
    expect(html).toContain('src=""')
  })

  it('preserves the original path when converting hydrated HTML back to Markdown', () => {
    const html = '<p><img data-asset-id="asset_tide_archive_002" data-asset-path="../assets/scenes/002-地下星图库.png" src="data:image/png;base64,AA==" alt="地下星图库" title="asset_tide_archive_002"></p>'

    expect(htmlToMarkdown(html)).toContain('![地下星图库](../assets/scenes/002-地下星图库.png "asset_tide_archive_002")')
  })

  it('keeps supporting asset IDs encoded in filenames', () => {
    const html = markdownToHtml('![Legacy](../assets/scenes/asset_legacy.png "asset_legacy")', '/project')

    expect(html).toContain('data-asset-id="asset_legacy"')
    expect(html).toContain('data-asset-path="../assets/scenes/asset_legacy.png"')
  })
})

describe('chapter Markdown round-trip fidelity', () => {
  it('preserves tables, task list state, links and fenced code', () => {
    const markdown = '| 名称 | 状态 |\n| --- | --- |\n| 月港 | 已确认 |\n\n- [x] 完成设定\n- [ ] 等待审核\n\n[资料](https://example.com)\n\n```ts\nconst chapter = 1\n```'
    const roundTripped = htmlToMarkdown(markdownToHtml(markdown))
    expect(markdownToHtml(markdown)).toContain('data-type="taskItem"')
    expect(roundTripped).toContain('| 名称 | 状态 |')
    expect(roundTripped).toContain('| 月港 | 已确认 |')
    expect(roundTripped).toContain('- [x] 完成设定')
    expect(roundTripped).toContain('- [ ] 等待审核')
    expect(roundTripped).toContain('[资料](https://example.com)')
    expect(roundTripped).toContain('```ts')
    expect(roundTripped).toContain('const chapter = 1')
  })
})
