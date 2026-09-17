import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { ProjectService } from '../src/main/services/project-service'
import { RecentProjectsStore } from '../src/main/services/recent-projects'
import { validateWorkflow } from '../src/main/services/workflow-validation'
import { workflowSchema } from '../src/shared/workflow'
import { makeTempRoot } from './helpers'

describe('reusable authoring workflow installation', () => {
  it('installs and selects 我的创作流程 without replacing the built-in workflow', async () => {
    const root = await makeTempRoot()
    const project = new ProjectService(new RecentProjectsStore(join(root, 'recents.json')))
    await project.create(join(root, 'novel'), '我的第一本小说')

    const info = await project.installAuthoringWorkflow()
    expect(info.manifest.defaultWorkflow).toBe('flow_my_authoring')

    const workflowPath = join(info.rootPath, 'workflows/flow_my_authoring.novelflow.json')
    const workflow = workflowSchema.parse(JSON.parse(await readFile(workflowPath, 'utf8')))
    expect(workflow.id).toBe('flow_my_authoring')
    expect(validateWorkflow(workflow)).toEqual([])
    expect(workflow.nodes.map((node) => node.type)).toEqual(expect.arrayContaining([
      'context.load', 'ai.prompt', 'ai.critic', 'logic.merge', 'human.review', 'chapter.write', 'memory.extract'
    ]))
    expect(workflow.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'review', target: 'chapter-write' }),
      expect.objectContaining({ source: 'chapter-write', target: 'memory' })
    ]))

    const builtIn = await readFile(join(info.rootPath, 'workflows/flow_builtin_novel.novelflow.json'), 'utf8')
    expect(JSON.parse(builtIn).id).toBe('flow_builtin_novel')
    await project.close()
  })
})
