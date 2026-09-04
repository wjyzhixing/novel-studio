import { describe, expect, it } from 'vitest'
import { countWords } from '../src/renderer/src/lib/wordcount'

describe('renderer word count', () => {
  it('counts Chinese characters and Latin words after stripping Markdown', () => {
    expect(countWords('# 第一章\n\n你好，world **novel**')).toBe(7)
  })

  it('ignores fenced and inline code content', () => {
    expect(countWords('正文 `code`\n\n```ts\nconst hidden = true\n```')).toBe(2)
  })
})
