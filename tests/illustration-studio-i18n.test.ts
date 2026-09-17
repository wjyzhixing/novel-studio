import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys = [
  'illustrationStudio', 'visualConsistency', 'visualSetup', 'sceneProposal', 'reviewInsert',
  'artDirection', 'compiledPrompt', 'negativePrompt', 'illustrationCaption', 'variants',
  'imageModel', 'generateVariants', 'refreshAssets', 'favorite', 'previewImage', 'deleteImage',
  'assetProvenance', 'insertSelectedImage', 'illustrationEmptyHint', 'proposeFromChapter',
  'saveArtDirection', 'cancel', 'generate', 'generating', 'refreshingAssets', 'assetsRefreshed',
  'refreshAssetsFailed', 'chapterRequiredForIllustration', 'sceneProposalGenerating',
  'sceneProposalGenerated', 'sceneProposalFailed', 'promptRequired', 'artDirectionSaving',
  'artDirectionSaved', 'artDirectionSaveFailed', 'generationFailed', 'providerNoImages',
  'variantsGenerated', 'chapterRequiredForInsert', 'imageRequired', 'insertingImage',
  'imageInserted', 'editorRefreshFailed', 'deleteAssetConfirm', 'deletingAsset',
  'assetDeleted', 'assetDeletedRefreshFailed', 'imageUnavailable', 'closePreview',
  'retryIllustration', 'noIllustrationsYet'
  , 'proposalSubject', 'proposalCamera', 'proposalComposition', 'proposalLighting', 'visualSetupHint',
  'artDirectionUnset', 'artDirectionPlaceholder', 'sceneProposalHint', 'compiledPromptPlaceholder',
  'captionPlaceholder', 'variantsUnit', 'reviewInsertHint', 'seedUnavailable', 'visualBible', 'referenceImages', 'referenceImagesHint', 'useAsReference', 'removeReference', 'referencesSelected', 'referenceLimitReached'
] as const

describe('Illustration Studio i18n contract', () => {
  it('provides bilingual copy for the studio shell and feedback', () => {
    for (const key of keys) {
      expect(getUiText('zh-CN', key as UiTextKey), key).toBeTruthy()
      expect(getUiText('en-US', key as UiTextKey), key).toBeTruthy()
      if (!['illustrationStudio', 'visualSetup', 'sceneProposal', 'reviewInsert', 'artDirection', 'compiledPrompt', 'negativePrompt', 'generateVariants', 'assetProvenance'].includes(key)) expect(getUiText('en-US', key as UiTextKey), key).not.toBe(getUiText('zh-CN', key as UiTextKey))
    }
  })

  it('keeps fixed studio UI copy in locale keys', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/IllustrationStudio.tsx', import.meta.url), 'utf8')
    for (const literal of [
      '>Illustration Studio<', 'Visual Consistency 工作台', '>Visual Setup<', '>Scene Proposal<',
      '>Review & Insert<', '>Art Direction<', '>Compiled Prompt', '>Negative Prompt',
      'Image Model：当前项目图片 Provider', 'Generate Variants', 'Asset provenance', '>收藏<', '>查看大图<', '>删除图片<',
      '图片预览', '关闭预览', '图片资产不可用', '正在刷新资产列表', '场景提案失败：', '正在生成',
      '插入选中的图片', '删除后将移除本地图片'
    ]) expect(source).not.toContain(literal)
  })

  it('routes studio hints, proposal labels, and metadata fallbacks through locale keys', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/IllustrationStudio.tsx', import.meta.url), 'utf8')
    for (const literal of [
      "['主体', '镜头', '构图', '光线']", '先确认全书风格，再提取当前章节镜头', '尚未设置全书视觉风格',
      '例如：儿童绘本，柔和水彩，深蓝与月光金为主色，梦幻、安静，不出现文字和水印',
      '从当前章节提取值得插图的场景', '点击“从当前章节提案”，或手动描述镜头、角色和场景',
      '例如：月亮草原上的小牛', 'value}>{value} 张</option>', '查看 provenance，选择并插入章节', 'seed 未返回'
    ]) expect(source).not.toContain(literal)
  })

  it('exposes a Visual Bible picker and sends selected asset IDs with generation', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/IllustrationStudio.tsx', import.meta.url), 'utf8')
    expect(source).toContain('referenceAssetIds')
    expect(source).toContain('references: referenceAssetIds')
    expect(source).toContain('reference-asset')
    expect(source).toContain('aria-pressed={referenceAssetIds.includes(asset.assetId)}')
  })

  it('keeps a long reference asset list scrollable', async () => {
    const source = await readFile(new URL('../src/renderer/src/styles/illustration-studio.css', import.meta.url), 'utf8')
    expect(source).toContain('.reference-asset-list{max-height:108px;overflow:auto')
  })

  it('persists Asset Review favorites per project', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/IllustrationStudio.tsx', import.meta.url), 'utf8')
    expect(source).toContain('favoriteStorageKey')
    expect(source).toContain('readFavorites')
    expect(source).toContain('writeFavorites')
  })
})
