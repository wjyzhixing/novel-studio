import { describe, expect, it } from 'vitest'
import { selectionActions } from '../src/renderer/src/lib/selection-actions'

describe('selection AI actions', () => {
  it('exposes the complete editor action order and separates read-only explanation', () => {
    expect(selectionActions.map((item) => item.label)).toEqual(['润写', '改写', '扩写', '缩写', '续写', '解释', '翻译', '选中', '取消选中'])
    expect(selectionActions.find((item) => item.label === '解释')?.mutatesDocument).toBe(false)
    expect(selectionActions.find((item) => item.label === '改写')?.mutatesDocument).toBe(true)
    expect(selectionActions.find((item) => item.label === '选中')?.mutatesDocument).toBe(false)
    expect(selectionActions.find((item) => item.label === '取消选中')?.mutatesDocument).toBe(false)
    expect(new Set(selectionActions.map((item) => item.id)).size).toBe(selectionActions.length)
  })
})
