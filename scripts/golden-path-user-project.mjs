import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { startStableElectron } from './dev-stable.mjs'
import { connectCdp } from './cdp-driver.mjs'
import { runGoldenPath } from './golden-path-runner.mjs'

const DEFAULT_PROJECT_ROOT = resolve('demo/未命名文件夹')
const projectRoot = process.argv.indexOf('--project') >= 0
  ? resolve(process.argv[process.argv.indexOf('--project') + 1] ?? DEFAULT_PROJECT_ROOT)
  : DEFAULT_PROJECT_ROOT
const cdpPort = Number(process.env.NOVEL_STUDIO_CDP_PORT ?? 9222)

if (!existsSync(resolve(projectRoot, 'novel.yaml'))) {
  throw new Error(`用户项目缺少 novel.yaml：${projectRoot}`)
}

let launcher
let driver

try {
  launcher = await startStableElectron({ remoteDebuggingPort: cdpPort, timeoutMs: 15_000 })
  driver = await connectCdp({ port: cdpPort, timeoutMs: 15_000 })
  await driver.waitFor('document.readyState !== "loading" && Boolean(window.novelAPI)', 15_000)

  const report = await runGoldenPath({
    steps: [
      {
        id: 'user-project-open',
        label: '打开指定用户项目',
        timeoutMs: 20_000,
        run: async () => {
          const result = await driver.evaluate(`window.novelAPI.project.open(${JSON.stringify(projectRoot)})`)
          if (!result?.ok) throw new Error(result?.error?.message ?? '用户项目打开失败')
          return { projectOpened: true }
        }
      },
      {
        id: 'user-project-chapter-list',
        label: '用户项目章节列表可见',
        timeoutMs: 20_000,
        run: async () => {
          await driver.waitFor('Boolean(document.querySelector(\'[data-testid="chapter-open"], .chapter-open\'))', 15_000)
          return { chapterListVisible: true }
        }
      },
      {
        id: 'user-project-workbench',
        label: '用户项目编辑器与右侧面板可见',
        timeoutMs: 15_000,
        run: async () => {
          if (!await driver.click('[data-testid="chapter-open"], .chapter-open')) throw new Error('用户项目章节打开失败')
          await driver.waitFor('Boolean(document.querySelector(\'[data-testid="editor-pane"], .editor-shell\'))', 10_000)
          await driver.waitFor('Boolean(document.querySelector(\'[data-testid="right-panel"], .right-panel\'))', 10_000)
          return { chapterOpened: true, editorVisible: true, rightPanelVisible: true }
        }
      },
      {
        id: 'user-project-integrity',
        label: '用户项目完整性检查可返回',
        timeoutMs: 30_000,
        run: async () => {
          const result = await driver.evaluate('window.novelAPI.project.checkIntegrity()')
          if (!result?.ok) throw new Error(result?.error?.message ?? '用户项目完整性检查失败')
          const report = result.data
          return {
            integrityChecked: true,
            warnings: report.warnings.length,
            missingFiles: report.missingFiles.length,
            invalidSourceFiles: report.invalidSourceFiles.length,
            invalidStoryArtifactDetails: report.invalidStoryArtifactDetails.map((artifact) => ({ id: artifact.id, kind: artifact.kind, title: artifact.title, issues: artifact.issues })),
            chaptersIndexed: report.chaptersIndexed,
            chaptersOnDisk: report.chaptersOnDisk,
            migrationStatus: report.migration.status
          }
        }
      }
    ]
  })
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
} finally {
  await driver?.close()
  await launcher?.stop()
}
