import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { ChapterService } from '../src/main/services/chapter-service'
import { StoryService } from '../src/main/services/story-service'
import { CanonService } from '../src/main/services/canon-service'
import { ImageService } from '../src/main/services/image-service'
import { makeTempRoot } from './helpers'

describe('golden path integration', () => {
  it('creates project → writes chapter → creates Story entity → applies Canon → inserts image', async () => {
    const root = await makeTempRoot(); const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Golden path'); const chapters = new ChapterService(project); const story = new StoryService(project)
    const chapter = await chapters.create('第一章'); await chapters.save(chapter.relPath, '# 第一章\n\n林默走进雨夜。')
    const character = await story.saveEntity({ kind: 'character', name: '林默', aliases: ['阿默'], fields: { role: 'protagonist' }, notes: '' })
    const canon = new CanonService(project); const proposal = await canon.proposeFact({ subjectId: character.id, predicate: 'status.alive', object: true, validFrom: 'chapter:1', validTo: null, confidence: 1, source: { documentId: chapter.relPath, range: [1, 9] as [number, number] } })
    await canon.applyProposal(proposal.id); const image = new ImageService(project, chapters); const asset = (await image.generate({ prompt: '雨夜街道', references: [], aspectRatio: '16:9' }))[0]
    await image.insertIntoChapter(chapter.relPath, asset.assetId, '场景插图')
    const markdown = await readFile(join(project.getInfo()!.rootPath, chapter.relPath), 'utf8')
    expect(markdown).toContain('![场景插图]'); expect((await canon.listFacts(character.id))).toHaveLength(1); expect((await image.listAssets())).toHaveLength(1)
  })
})
