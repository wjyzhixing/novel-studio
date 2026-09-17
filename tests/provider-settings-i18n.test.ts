import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = ['providerSettings', 'providerClose', 'providerHint', 'providerCurrent', 'providerUse', 'providerNewProfile', 'providerDefaultName', 'providerConnectionTab', 'providerModelsTab', 'providerBillingTab', 'providerName', 'providerProtocol', 'providerTextBaseUrl', 'providerTextModel', 'providerEmbeddingModel', 'providerEmbeddingPlaceholder', 'providerImageBaseUrl', 'providerImageModel', 'providerImageModelPlaceholder', 'providerInputPrice', 'providerOutputPrice', 'providerTextApiKey', 'providerImageApiKey', 'providerEmbeddingHint', 'providerBillingHint', 'providerConfigured', 'providerKeepExistingKey', 'providerSecretNotProjectFile', 'providerSecretEncrypted', 'providerDeleteProfile', 'providerSave', 'providerTestText', 'providerTestEmbedding', 'providerTestImage', 'providerLoadingFailed', 'providerSecretStatusFailed', 'providerSwitching', 'providerSwitched', 'providerSwitchFailed', 'providerDeleteConfirm', 'providerDeleting', 'providerDeleted', 'providerDeleteFailed', 'providerSaving', 'providerSaveFailed', 'providerSecretSaveFailed', 'providerImageSecretSaveFailed', 'providerDefaultFailed', 'providerSavedDefault', 'providerSaved', 'providerUnsavedTestBlocked', 'providerTestingText', 'providerTextSuccess', 'providerTextFailed', 'providerTestingEmbedding', 'providerEmbeddingSuccess', 'providerEmbeddingFailed', 'providerTestingImage', 'providerImageSuccess', 'providerImageFailed']
const sameInBothLocales = new Set<UiTextKey>(['providerTextBaseUrl', 'providerTextModel', 'providerEmbeddingModel', 'providerImageBaseUrl', 'providerImageModel', 'providerImageModelPlaceholder', 'providerInputPrice', 'providerOutputPrice'])

describe('Provider settings i18n contract', () => {
  it('provides bilingual provider configuration copy', () => {
    for (const key of keys) {
      const zh = getUiText('zh-CN', key)
      const en = getUiText('en-US', key)
      expect(zh, key).toBeTruthy()
      expect(en, key).toBeTruthy()
      if (!sameInBothLocales.has(key)) expect(en, key).not.toBe(zh)
    }
  })

  it('does not hardcode provider feedback and modal labels', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/ProviderSettings.tsx', import.meta.url), 'utf8')
    for (const literal of ['新 Provider', '删除 ${item.name}', '>名称<', '>协议<', '可选，例如：text-embedding-3-small', '配置后 Context 会建立本地语义索引', '例如 https://tokenrhythm.studio/v1', '留空单价则只统计 token', 'Text API Key', 'Image API Key', '已配置', '不会写入项目文件', '独立加密存储', '>保存<', '测试文本连接</button>', '测试 Embedding 连接</button>', '测试图片连接</button>']) expect(source).not.toContain(literal)
  })
})
