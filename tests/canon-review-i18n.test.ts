import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = ['canonProposals', 'canonPendingCount', 'canonRefresh', 'canonEmpty', 'canonApply', 'canonReject', 'canonRevert', 'canonReverting', 'canonApplied', 'canonReverted', 'proposalRejected']

describe('CanonReview i18n contract', () => {
  it('provides bilingual review labels and feedback', () => {
    for (const key of keys) {
      expect(getUiText('zh-CN', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).toBeTruthy()
      expect(getUiText('en-US', key), key).not.toBe(getUiText('zh-CN', key))
    }
  })

  it('routes Canon review UI copy through locale keys', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/CanonReview.tsx', import.meta.url), 'utf8')
    for (const literal of ['Canon Proposals', '待审核', '>刷新<', '暂无提案。AI 提取的事实会先进入这里', 'Canon 已应用', '正在撤回 Canon', 'Canon 已撤回', 'Proposal 已拒绝', '>Apply<', '>Reject<', '>Revert<']) expect(source).not.toContain(literal)
    expect(source).toContain('useUiText()')
  })
})
