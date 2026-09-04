import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createGoldenFixture } from './golden-path-fixture.mjs'
import { startStableElectron } from './dev-stable.mjs'
import { connectCdp } from './cdp-driver.mjs'
import { runGoldenPath } from './golden-path-runner.mjs'

const fixture = await createGoldenFixture()
let launcher
let driver
let imageServer
let imageBaseURL
const imageSecret = `fixture-${crypto.randomUUID()}`

const pageState = async () => driver.evaluate(`(async () => {
  try {
    const info = await window.novelAPI.project.getInfo()
    const recents = await window.novelAPI.project.listRecent()
    return {
      welcome: Boolean(document.querySelector('.welcome')),
      loading: Boolean(document.querySelector('.boot-screen')),
      workbench: Boolean(document.querySelector('.workbench')),
      api: Boolean(window.novelAPI),
      infoOk: Boolean(info?.ok),
      infoHasData: Boolean(info?.data),
      recentCount: recents?.ok ? recents.data.length : -1
    }
  } catch {
    return { welcome: true, loading: false, workbench: false, api: Boolean(window.novelAPI), infoOk: false, infoHasData: false, recentCount: -1 }
  }
})()`)

try {
  const imageData = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#6d4dff"/></svg>').toString('base64')
  imageServer = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/images/generations') { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ data: [{ b64_json: imageData }] }))
  })
  await new Promise((resolve) => imageServer.listen(0, '127.0.0.1', resolve))
  const address = imageServer.address()
  if (!address || typeof address === 'string') throw new Error('本地图片 fixture 服务启动失败')
  imageBaseURL = `http://127.0.0.1:${address.port}/v1`
  launcher = await startStableElectron({ remoteDebuggingPort: 9222, timeoutMs: 15_000 })
  driver = await connectCdp({ port: 9222, timeoutMs: 15_000 })
  await driver.waitFor('document.readyState !== "loading" && Boolean(window.novelAPI)', 15_000)

  const openProject = async () => Boolean(await driver.evaluate(`(async () => {
    const opened = await window.novelAPI.project.open(${JSON.stringify(fixture.projectRoot)})
    if (!opened.ok) return false
    const saved = await window.novelAPI.ai.saveProfile({ id: 'profile_fixture_electron', name: 'Electron Fixture', kind: 'mock', model: 'fixture-electron', embeddingModel: 'fixture-electron-embedding', imageBaseURL: ${JSON.stringify(imageBaseURL)}, imageModel: 'fixture-image' })
    if (!saved.ok) return false
    const imageSecretResult = await window.novelAPI.ai.setImageSecret('profile_fixture_electron', ${JSON.stringify(imageSecret)})
    if (!imageSecretResult.ok) return false
    const selected = await window.novelAPI.ai.selectProfile('profile_fixture_electron')
    if (!selected.ok) return false
    const proposal = await window.novelAPI.canon.proposeFact({ subjectId: 'ent_lan', predicate: 'status.fixture', object: 'verified', validFrom: null, validTo: null, confidence: 1, source: { documentId: 'chapters/001-fixture.md', range: [0, 1] } })
    if (!proposal.ok) return false
    return true
  })()`))

  const report = await runGoldenPath({
    steps: [
      { id: 'project-open', label: '打开临时 fixture 项目', run: openProject },
      {
        id: 'chapter-visible',
        label: '章节列表可见',
        timeoutMs: 40_000,
        run: async () => {
          const selector = 'Boolean(document.querySelector(\'[data-testid="chapter-open"], .chapter-open\'))'
          try {
            await driver.waitFor(selector, 15_000)
          } catch (error) {
            const state = await pageState()
            if (!state.welcome) throw new Error(`${error instanceof Error ? error.message : String(error)}；页面状态=${JSON.stringify(state)}`)
            await driver.waitFor('Boolean(document.querySelector(\'.recent-open:not([disabled])\'))', 8_000)
            const recentButton = Boolean(await driver.evaluate(`(() => {
              const buttons = [...document.querySelectorAll('.recent-open')]
              const target = buttons.find((button) => !button.disabled && button.textContent?.includes('Tiny CN')) ?? buttons.find((button) => !button.disabled)
              if (!target) return false
              target.click()
              return true
            })()`))
            if (!recentButton) {
              const recovered = await driver.evaluate(`(async () => {
                const result = await window.novelAPI.project.open(${JSON.stringify(fixture.projectRoot)})
                if (result.ok) location.reload()
                return result.ok
              })()`)
              if (!recovered) throw new Error(`Welcome 恢复打开 fixture 项目失败；状态=${JSON.stringify(state)}`)
            }
            try {
              await driver.waitFor(selector, 15_000)
            } catch (retryError) {
              throw new Error(`${retryError instanceof Error ? retryError.message : String(retryError)}；恢复后页面状态=${JSON.stringify(await pageState())}`)
            }
          }
          return { chapterListVisible: true }
        }
      },
      { id: 'chapter-open', label: '打开 fixture 章节', run: async () => ({ chapterOpened: await driver.click('[data-testid="chapter-open"], .chapter-open') }) },
      {
        id: 'workbench-visible',
        label: '编辑器与右侧面板可见',
        run: async () => ({
          editorVisible: await driver.waitFor('Boolean(document.querySelector(\'[data-testid="editor-pane"], .editor-shell\'))'),
          rightPanelVisible: await driver.waitFor('Boolean(document.querySelector(\'[data-testid="right-panel"], .right-panel\'))')
        })
      },
      {
        id: 'selection-toolbar',
        label: '正文选区唤起 BubbleMenu 并拒绝改写',
        timeoutMs: 20_000,
        run: async () => {
          await driver.waitFor('Boolean(document.querySelector(\'.novel-editor\')?.textContent?.trim())', 8_000)
          const points = await driver.evaluate(`(() => {
            const editor = document.querySelector('.novel-editor')
            const walker = editor ? document.createTreeWalker(editor, NodeFilter.SHOW_TEXT) : null
            let node = walker?.nextNode()
            while (node && (node.textContent?.trim().length ?? 0) < 12) node = walker?.nextNode()
            if (!node || node.nodeType !== Node.TEXT_NODE || (node.textContent?.length ?? 0) < 12) return null
            const range = document.createRange()
            range.setStart(node, 0)
            range.setEnd(node, 12)
            const rect = range.getBoundingClientRect()
            const start = document.createRange()
            start.setStart(node, 0)
            start.setEnd(node, 1)
            const startRect = start.getBoundingClientRect()
            return { from: { x: startRect.left + 2, y: startRect.top + startRect.height / 2 }, to: { x: rect.right - 2, y: rect.top + rect.height / 2 } }
          })()`)
          if (!points) throw new Error('无法在编辑器正文建立测试选区')
          await driver.drag(points.from, points.to)
          await driver.waitFor("Boolean(document.querySelector('.selection-toolbar'))", 8_000)
          const rewriteClicked = await driver.evaluate(`(() => { const button = [...document.querySelectorAll('.selection-toolbar button')].find((item) => item.textContent?.includes('改写')); if (!button) return false; button.click(); return true })()`)
          if (!rewriteClicked) throw new Error('BubbleMenu 改写动作点击失败')
          await driver.waitFor("Boolean(document.querySelector('.suggestion-card'))", 10_000)
          if (!await driver.click('[data-testid="suggestion-reject"]')) throw new Error('选区 Suggestion Reject 点击失败')
          await driver.waitFor("!Boolean(document.querySelector('.suggestion-card'))", 8_000)
          return { selectionCreated: true, toolbarVisible: true, suggestionRejected: true }
        }
      },
      {
        id: 'chat-context',
        label: 'Chat 通过 Context 返回结果',
        run: async () => {
          const beforeChat = await driver.evaluate(`(async () => {
            const info = await window.novelAPI.project.getInfo()
            const profiles = await window.novelAPI.ai.listProfiles()
            return {
              topModel: document.querySelector('.model')?.textContent ?? '',
              chatInput: Boolean(document.querySelector('[aria-label="询问 Agent"]')),
              projectProfile: info.ok ? info.data?.manifest.providerProfile ?? null : null,
              profileIds: profiles.ok ? profiles.data.map((profile) => profile.id) : []
            }
          })()`)
          if (!await driver.evaluate('Boolean(document.querySelector(\'[aria-label="询问 Agent"]\'))')) throw new Error('Chat 输入框不存在')
          if (!await driver.fill('[aria-label="询问 Agent"]', 'fixture chat request')) throw new Error('Chat 输入框填充失败')
          if (!await driver.click('[aria-label="发送问题"]')) throw new Error('Chat 发送按钮点击失败')
          await driver.waitFor('Boolean(document.querySelector(\'.agent-chat-message.assistant\')) || Boolean(document.querySelector(\'.agent-response\'))', 8_000)
          await driver.waitFor('Boolean(document.querySelector(\'.context-manifest\'))', 8_000)
          const state = await driver.evaluate(`(() => {
            const text = document.querySelector('.agent-response')?.textContent ?? ''
            return {
              assistantVisible: Boolean(document.querySelector('.agent-chat-message.assistant')),
              providerMissing: text.includes('尚未配置 Provider'),
              chatError: text.includes('Chat 失败')
            }
          })()`)
          if (state.providerMissing) {
            const providerState = await driver.evaluate(`(async () => { const info = await window.novelAPI.project.getInfo(); const profiles = await window.novelAPI.ai.listProfiles(); return { manifestHasDefault: Boolean(info?.ok && info.data?.manifest?.providerProfile), profileCount: profiles?.ok ? profiles.data.length : -1 } })()`)
            throw new Error(`Renderer 未拿到默认 Provider；点击前=${JSON.stringify(beforeChat)}；点击后=${JSON.stringify(providerState)}`)
          }
          if (state.chatError) throw new Error('Chat 通过 UI 返回 Provider 错误')
          return { chatSubmitted: true, assistantVisible: state.assistantVisible, contextVisible: Boolean(await driver.evaluate('Boolean(document.querySelector(\'.context-manifest\'))')) }
        }
      },
      {
        id: 'chat-workspace-draft',
        label: '独立 Chat 发送 Draft 并进入 Diff 动作',
        timeoutMs: 20_000,
        run: async () => {
          if (!await driver.click('.open-chat-button')) throw new Error('独立 Chat 打开按钮点击失败')
          await driver.waitFor('Boolean(document.querySelector(\'[data-testid="chat-workspace"]\'))', 8_000)
          if (!await driver.evaluate('Boolean(document.querySelector(".chat-scope-chip"))')) throw new Error('独立 Chat scope 未显示')
          if (!await driver.fill('[aria-label="Chat 输入"]', '请改写这一段正文')) throw new Error('独立 Chat 输入框填充失败')
          if (!await driver.click('[aria-label="发送"]')) throw new Error('独立 Chat 发送按钮点击失败')
          try {
            await driver.waitFor('(() => [...document.querySelectorAll(".chat-message-actions button")].some((button) => button.textContent?.includes("预览 Diff")))()', 10_000)
          } catch (error) {
            const diagnostic = await driver.evaluate(`(() => ({ messages: [...document.querySelectorAll('.chat-workspace-message')].map((item) => item.textContent?.slice(0, 240) ?? ''), composerNotice: document.querySelector('.chat-workspace-notice')?.textContent ?? '', sendLabel: document.querySelector('.chat-composer-input button')?.getAttribute('aria-label') ?? '', actionCount: document.querySelectorAll('.chat-message-actions').length }))()`)
            throw new Error(`${error instanceof Error ? error.message : String(error)}；独立 Chat 状态=${JSON.stringify(diagnostic)}`)
          }
          const actionVisible = await driver.evaluate(`(() => [...document.querySelectorAll('.chat-message-actions button')].some((button) => button.textContent?.includes('预览 Diff')))()`)
          if (!actionVisible) throw new Error('Draft 未显示预览 Diff 动作')
          if (!await driver.click('[aria-label="返回编辑器"]')) throw new Error('独立 Chat 返回编辑器失败')
          await driver.waitFor('Boolean(document.querySelector(\'[data-testid="right-panel"]\'))', 8_000)
          return { workspaceVisible: true, draftActionsVisible: true, returnedToEditor: true }
        }
      },
      {
        id: 'suggestion-review',
        label: 'Suggestion 生成并人工 Accept/Reject',
        run: async () => {
          if (!await driver.click('[data-testid="suggestion-generate"]')) throw new Error('Suggestion 生成按钮点击失败')
          await driver.waitFor("Boolean(document.querySelector('.suggestion-card'))", 8_000)
          if (!await driver.click('[data-testid="suggestion-accept"]')) throw new Error('Suggestion Accept 点击失败')
          await driver.waitFor("!Boolean(document.querySelector('.suggestion-card'))", 8_000)
          if (!await driver.click('[data-testid="suggestion-generate"]')) throw new Error('第二次 Suggestion 生成按钮点击失败')
          await driver.waitFor("Boolean(document.querySelector('.suggestion-card'))", 8_000)
          if (!await driver.click('[data-testid="suggestion-reject"]')) throw new Error('Suggestion Reject 点击失败')
          await driver.waitFor("!Boolean(document.querySelector('.suggestion-card'))", 8_000)
          return { generated: true, accepted: true, rejected: true }
        }
      },
      {
        id: 'canon-review',
        label: 'Canon Proposal 人工 Apply/Revert',
        run: async () => {
          if (!await driver.click('[data-testid="canon-check-tab"]')) throw new Error('Canon Check 标签点击失败')
          if (!await driver.click('[data-testid="canon-refresh"]')) throw new Error('Canon 刷新按钮点击失败')
          try {
            await driver.waitFor("Boolean(document.querySelector('.canon-proposal'))", 8_000)
          } catch (error) {
            const diagnostic = await driver.evaluate(`(async () => { const proposals = await window.novelAPI.canon.listProposals(); return { proposalCount: proposals.ok ? proposals.data.length : -1, canonReview: Boolean(document.querySelector('.canon-review')), refreshCount: document.querySelectorAll('[data-testid="canon-refresh"]').length, bottomText: document.querySelector('.bottom-content')?.textContent?.slice(0, 240) ?? '' } })()`)
            throw new Error(`${error instanceof Error ? error.message : String(error)}；Canon 状态=${JSON.stringify(diagnostic)}`)
          }
          if (!await driver.click('[data-testid="canon-apply"]')) throw new Error('Canon Apply 点击失败')
          try { await driver.waitFor('Boolean(document.querySelector(\'[data-testid="canon-revert"]\'))', 8_000) } catch (error) { throw new Error(`Canon Apply 后未出现 Revert：${error instanceof Error ? error.message : String(error)}`) }
          if (!await driver.click('[data-testid="canon-revert"]')) throw new Error('Canon Revert 点击失败')
          try { await driver.waitFor('Boolean(document.querySelector(\'.canon-proposal[data-status="reverted"]\'))', 8_000) } catch (error) {
            const diagnostic = await driver.evaluate(`(async () => { const proposals = await window.novelAPI.canon.listProposals(); return { statuses: proposals.ok ? proposals.data.map((proposal) => proposal.status) : [], domStatuses: [...document.querySelectorAll('.canon-proposal')].map((item) => item.getAttribute('data-status')), message: document.querySelector('.canon-review-head')?.textContent?.slice(-80) ?? '' } })()`)
            throw new Error(`Canon Revert 后未显示 reverted 状态：${error instanceof Error ? error.message : String(error)}；状态=${JSON.stringify(diagnostic)}`)
          }
          return { proposalVisible: true, applied: true, reverted: true }
        }
      },
      {
        id: 'workflow-human-review',
        label: 'Workflow 两次人工暂停并恢复到插图插入',
        timeoutMs: 45_000,
        run: async () => {
          if (!await driver.click('[data-testid="workflow-run"]')) throw new Error('Workflow 启动按钮点击失败')
          try { await driver.waitFor("Boolean(document.querySelector('.runtime-status.waiting_human'))", 15_000) } catch (error) {
            const diagnostic = await driver.evaluate(`(async () => { const runs = await window.novelAPI.workflowRuntime.listRuns(); return { runStatuses: runs.ok ? runs.data.map((run) => ({ status: run.status, nodeStatuses: Object.values(run.nodes).map((node) => node.status) })) : [], runButton: document.querySelector('[data-testid="workflow-run"]')?.textContent ?? '', message: document.querySelector('.agent-response')?.textContent?.slice(-160) ?? '' } })()`)
            throw new Error(`Workflow 首次人工暂停未出现：${error instanceof Error ? error.message : String(error)}；状态=${JSON.stringify(diagnostic)}`)
          }
          if (!await driver.click('[data-testid="workflow-resume-review"]')) throw new Error('Workflow Review Resume 点击失败')
          try { await driver.waitFor("Boolean(document.querySelector('[data-testid=\\\"workflow-asset-choice\\\"]'))", 20_000) } catch (error) {
            const diagnostic = await driver.evaluate(`(async () => { const runs = await window.novelAPI.workflowRuntime.listRuns(); return { runStatuses: runs.ok ? runs.data.map((run) => { const nodes = Object.values(run.nodes); const failed = nodes.find((node) => node.error); return { status: run.status, failedNode: failed?.nodeId ?? '', firstError: failed?.error?.slice(0, 120) ?? '' } }) : [], message: document.querySelector('.agent-response')?.textContent?.slice(-120) ?? '' } })()`)
            throw new Error(`Workflow 第二次人工暂停未出现：${error instanceof Error ? error.message : String(error)}；状态=${JSON.stringify(diagnostic)}`)
          }
          if (!await driver.click('[data-testid="workflow-asset-choice"]')) throw new Error('Workflow 图片选择点击失败')
          await driver.waitFor("Boolean(document.querySelector('.runtime-status.succeeded'))", 15_000)
          return { firstPause: true, resumedReview: true, selectedImage: true, completed: true }
        }
      },
      {
        id: 'illustration-studio',
        label: 'Illustration 提案、生成、插入、刷新、删除',
        timeoutMs: 30_000,
        run: async () => {
          if (!await driver.click('[data-testid="illustration-open"]')) throw new Error('Illustration Studio 打开失败')
          try { await driver.waitFor("Boolean(document.querySelector('.illustration-shell'))", 8_000) } catch (error) { throw new Error(`Illustration 工作台未显示：${error instanceof Error ? error.message : String(error)}`) }
          if (!await driver.click('[data-testid="illustration-propose"]')) throw new Error('场景提案按钮点击失败')
          try { await driver.waitFor("Boolean(document.querySelector('.scene-proposal'))", 8_000) } catch (error) { throw new Error(`场景提案未显示：${error instanceof Error ? error.message : String(error)}`) }
          if (!await driver.click('[data-testid="illustration-generate"]')) throw new Error('图片生成按钮点击失败')
          try { await driver.waitFor("Boolean(document.querySelector('.asset-card'))", 12_000) } catch (error) { throw new Error(`图片资产未显示：${error instanceof Error ? error.message : String(error)}`) }
          if (!await driver.click('[data-testid="illustration-refresh"]')) throw new Error('图片刷新按钮点击失败')
          try { await driver.waitFor("Boolean(document.querySelector('.image-message'))", 8_000) } catch (error) { throw new Error(`图片刷新反馈未显示：${error instanceof Error ? error.message : String(error)}`) }
          await driver.waitFor('Boolean(document.querySelector(\'[data-testid="illustration-insert"]:not([disabled])\'))', 8_000)
          if (!await driver.click('[data-testid="illustration-insert"]')) throw new Error('图片插入按钮点击失败')
          try { await driver.waitFor("document.querySelector('.image-message')?.textContent?.includes('已插入当前章节') === true", 8_000) } catch (error) {
            const diagnostic = await driver.evaluate(`(async () => { const chapter = await window.novelAPI.chapter.read('chapters/001-fixture.md'); const assets = await window.novelAPI.image.listAssets(); return { markdownHasImage: chapter.ok ? /!\\[[^\\]]*\\]\\(/.test(chapter.data.markdown) : false, assetCount: assets.ok ? assets.data.length : -1, message: document.querySelector('.image-message')?.textContent?.slice(-160) ?? '' } })()`)
            throw new Error(`图片插入反馈未显示：${error instanceof Error ? error.message : String(error)}；状态=${JSON.stringify(diagnostic)}`)
          }
          await driver.evaluate('window.confirm = () => true')
          if (!await driver.click('[data-testid="illustration-delete"]')) throw new Error('图片删除按钮点击失败')
          try { await driver.waitFor("document.querySelector('.image-message')?.textContent?.includes('图片资产已删除') === true", 8_000) } catch (error) { throw new Error(`图片删除反馈未显示：${error instanceof Error ? error.message : String(error)}`) }
          return { proposalVisible: true, generated: true, refreshed: true, inserted: true, deleted: true }
        }
      },
      {
        id: 'backup-import-export',
        label: '临时目标备份、导出与章节导入',
        timeoutMs: 20_000,
        run: async () => {
          const importPath = `${fixture.taskRoot}/golden-import.md`
          const backupPath = `${fixture.taskRoot}/golden-backup.zip`
          const exportPath = `${fixture.taskRoot}/golden-export.html`
          await writeFile(importPath, '# Fixture Import\n\n临时导入章节。\n', 'utf8')
          const result = await driver.evaluate(`(async () => {
            const imported = await window.novelAPI.chapter.importFile(${JSON.stringify(importPath)}, 'Fixture Import')
            const exported = await window.novelAPI.chapter.exportAll('html', ${JSON.stringify(exportPath)})
            const backup = await window.novelAPI.backup.createArchive(${JSON.stringify(backupPath)})
            return { imported: imported.ok, exported: exported.ok, backup: backup.ok, chapterCount: exported.ok ? exported.data.chapterCount : -1 }
          })()`)
          if (!result.imported || !result.exported || !result.backup) throw new Error('导入、导出或备份返回失败')
          return { imported: true, exported: true, backupCreated: true, chapterCount: result.chapterCount }
        }
      }
    ]
  })
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
} finally {
  if (driver) await driver.evaluate(`window.novelAPI.ai.removeImageSecret('profile_fixture_electron').catch(() => undefined)`).catch(() => undefined)
  driver?.close()
  launcher?.stop()
  imageServer?.close()
  await fixture.cleanup()
}
