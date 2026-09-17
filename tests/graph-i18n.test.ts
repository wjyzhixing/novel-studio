import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { getUiText, type UiTextKey } from '../src/renderer/src/lib/i18n'

const keys: UiTextKey[] = [
  'graphStudio', 'graphEntityRelationMap', 'graphSearchEntities', 'graphSearchRelations', 'graphRelation',
  'graphEntityType', 'graphAll', 'graphArrangeLayout', 'graphFocusNeighborhood', 'graphShowFullGraph', 'graphNeighborhoodDepth', 'graphHops',
  'graphRefresh', 'graphExpandProperties', 'graphCollapseProperties', 'graphEditRelation', 'graphNewRelation',
  'graphRelationList', 'graphLoading', 'graphStart', 'graphEnd', 'graphSelectEntity', 'graphRelationType',
  'graphRelationMetadata', 'graphSaveRelation', 'graphUpdateRelation', 'graphSwitchToNew', 'graphCancelEdit',
  'graphDeleteRelation', 'graphSelectedEntity', 'graphSelectedRelation', 'graphAliases', 'graphRelationId',
  'graphCanvasHint', 'graphEntityCharacter', 'graphEntityPlace', 'graphEntityOrg', 'graphEntityItem',
  'graphEntityLoadFailed', 'graphRelationLoadFailed', 'graphLoadFailed', 'graphLayoutArranged',
  'graphRelationLoaded', 'graphMetadataInvalid', 'graphSaveFailed', 'graphRelationSaved', 'graphRelationSaveFailed',
  'graphDeleteFailed', 'graphRelationDeleted', 'graphRelationDeleteFailed', 'graphEndpointsFilled'
  , 'graphMetadataObjectExpected'
]

describe('Graph Studio i18n contract', () => {
  it('provides bilingual graph UI copy and feedback', () => {
    for (const key of keys) {
      const zh = getUiText('zh-CN', key)
      const en = getUiText('en-US', key)
      expect(zh, key).toBeTruthy()
      expect(en, key).toBeTruthy()
      if (key !== 'graphStudio') expect(en, key).not.toBe(zh)
    }
  })

  it('does not hardcode graph shell labels or operation feedback', async () => {
    const source = await readFile(new URL('../src/renderer/src/components/GraphStudio.tsx', import.meta.url), 'utf8')
    for (const literal of ['<b>Graph Studio</b>', 'Story Bible 实体关系图', 'aria-label="搜索图谱实体"', 'placeholder="搜索实体…"', '图谱加载失败：', '关系元数据无效：', '已保存关系', '关系已保存', '删除关系失败：', '已填入关系端点', '必须是 JSON 对象']) {
      expect(source).not.toContain(literal)
    }
  })
})
