import { describe, expect, it } from 'vitest'
import { extractFirstJsonObject } from '../src/main/services/memory-service'

describe('memory extractor JSON boundary', () => {
  it('extracts one nested object and ignores trailing prose or objects', () => {
    const text = '结果如下：{"facts":[{"object":"带 } 字符"}]}\n补充说明：{"ignored":true}'
    expect(extractFirstJsonObject(text)).toBe('{"facts":[{"object":"带 } 字符"}]}')
  })

  it('returns null for an incomplete object', () => {
    expect(extractFirstJsonObject('没有完整 JSON：{"facts":')).toBeNull()
  })
})
