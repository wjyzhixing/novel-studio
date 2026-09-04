import { join } from 'node:path'
import { createServer } from 'vite'

const demoRoot = process.argv[2] ?? join(process.cwd(), 'demo/潮汐灯塔')
const server = await createServer({ root: process.cwd(), server: { middlewareMode: 'ssr', hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
try {
  const [{ ProjectService }, { RecentProjectsStore }, { WorkflowService }, { SceneService }] = await Promise.all([
    server.ssrLoadModule('/src/main/services/project-service.ts'),
    server.ssrLoadModule('/src/main/services/recent-projects.ts'),
    server.ssrLoadModule('/src/main/services/workflow-service.ts'),
    server.ssrLoadModule('/src/main/services/scene-service.ts')
  ])
  const project = new ProjectService(new RecentProjectsStore(join(demoRoot, '.novel/demo-recents.json')))
  await project.open(demoRoot)
  const repaired = await project.repairIndexes()
  const integrity = await project.checkIntegrity()
  const workflows = await new WorkflowService(project).list()
  const scenes = await new SceneService(project).list('chapters/001-港口的罗盘.md')
  console.log(JSON.stringify({ root: '[demo]', repaired, chapters: integrity.chaptersIndexed, entities: integrity.entitiesIndexed, assets: integrity.assetsIndexed, scenes: scenes.length, workflows, warnings: integrity.warnings }, null, 2))
  await project.close()
} finally {
  await server.close()
}
