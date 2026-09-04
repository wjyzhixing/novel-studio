import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project-service'
import { PromptService } from '../src/main/services/prompt-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { makeTempRoot } from './helpers'

describe('PromptService', () => {
  it('loads versioned prompts from the project and rejects traversal names', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recent.json')))
    await project.create(join(root, 'novel'), 'Prompt test')
    const prompts = new PromptService(project)
    await expect(prompts.read('ai-edit')).resolves.toContain('只返回可替换正文')
    await expect(prompts.read('../secret')).rejects.toThrow('Prompt 名称不合法')
  })
})
