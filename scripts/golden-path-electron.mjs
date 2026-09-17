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
const cdpPort = Number(process.env.NOVEL_STUDIO_CDP_PORT ?? 9222)

const closeServer = async (server) => {
  if (!server) return
  server.closeAllConnections?.()
  await Promise.race([
    new Promise((resolveClose) => server.close(() => resolveClose())),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000))
  ])
  server.closeAllConnections?.()
}

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
  launcher = await startStableElectron({ remoteDebuggingPort: cdpPort, timeoutMs: 15_000 })
  driver = await connectCdp({ port: cdpPort, timeoutMs: 15_000 })
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
        timeoutMs: 60_000,
        run: async () => {
          try {
            await driver.waitFor('Boolean(document.querySelector(\'.novel-editor\')?.textContent?.trim())', 8_000)
            await driver.waitFor('Boolean(document.querySelector(\'.novel-editor[contenteditable="true"]\'))', 8_000)
            const editorFocused = await driver.evaluate(`(() => { const editor = document.querySelector('.novel-editor'); if (!(editor instanceof HTMLElement)) return false; editor.focus(); return document.activeElement === editor })()`)
            if (!editorFocused) throw new Error('编辑器无法获得焦点')
            await driver.waitFor('document.activeElement?.closest?.(\'.novel-editor\') !== null', 2_000)
          } catch (error) {
            const diagnostic = await driver.evaluate(`(() => ({ editor: Boolean(document.querySelector('.novel-editor')), text: document.querySelector('.novel-editor')?.textContent?.slice(0, 180) ?? '', checkpoint: Boolean(document.querySelector('.checkpoint-popover')), notice: document.querySelector('.notification-center')?.textContent ?? '' }))()`)
            throw new Error(`${error instanceof Error ? error.message : String(error)}；选区前状态=${JSON.stringify(diagnostic)}`)
          }
          const points = await driver.evaluate(`(() => {
            const editor = document.querySelector('.novel-editor')
            const walker = editor ? document.createTreeWalker(editor, NodeFilter.SHOW_TEXT) : null
            let node = walker?.nextNode()
            while (node && (node.textContent?.trim().length ?? 0) < 12) node = walker?.nextNode()
            if (!node || node.nodeType !== Node.TEXT_NODE || (node.textContent?.length ?? 0) < 12) return null
            const range = document.createRange()
            range.setStart(node, 0)
            range.setEnd(node, 12)
            const rects = [...range.getClientRects()]
            if (!rects.length) return null
            const firstRect = rects[0]
            const lastRect = rects.at(-1)
            const start = document.createRange()
            start.setStart(node, 0)
            start.setEnd(node, 1)
            const startRect = start.getBoundingClientRect()
            return { from: { x: startRect.left + 2, y: startRect.top + startRect.height / 2 }, to: { x: lastRect.right - 2, y: lastRect.top + lastRect.height / 2 }, rectCount: rects.length, firstTop: firstRect.top }
          })()`)
          if (!points) throw new Error('无法在编辑器正文建立测试选区')
          await driver.drag(points.from, points.to)
          try {
            await driver.waitFor("Boolean(document.querySelector('.selection-toolbar'))", 8_000)
          } catch (error) {
            const diagnostic = await driver.evaluate(`(() => ({ toolbar: Boolean(document.querySelector('.selection-toolbar')), selection: window.getSelection()?.toString() ?? '', editorText: document.querySelector('.novel-editor')?.textContent?.slice(0, 180) ?? '', checkpoint: Boolean(document.querySelector('.checkpoint-popover')), notice: document.querySelector('.notification-center')?.textContent ?? '' }))()`)
            throw new Error(`${error instanceof Error ? error.message : String(error)}；拖选后状态=${JSON.stringify(diagnostic)}`)
          }
          const selectClicked = await driver.evaluate(`(() => { const button = document.querySelector('.selection-toolbar button[data-action="select"]'); if (!button) return false; button.click(); return true })()`)
          if (!selectClicked) throw new Error('BubbleMenu 选中动作点击失败')
          await driver.waitFor("document.querySelector('.selection-hint')?.textContent?.includes('已选中') === true", 8_000)
          const rewriteState = await driver.evaluate(`(() => { const toolbar = document.querySelector('.selection-toolbar'); const button = document.querySelector('.selection-toolbar button[data-action="rewrite"]'); return { clicked: Boolean(button && (button.click(), true)), toolbar: Boolean(toolbar), toolbarText: toolbar?.textContent ?? '', nativeSelection: window.getSelection()?.toString() ?? '', editorSelection: (() => { const editor = document.querySelector('.novel-editor'); return editor ? { text: editor.textContent?.slice(0, 180) ?? '', active: document.activeElement?.className ?? '' } : null })() } })()`)
          if (!rewriteState.clicked) throw new Error(`BubbleMenu 改写动作点击失败；状态=${JSON.stringify(rewriteState)}`)
          await driver.waitFor("Boolean(document.querySelector('.suggestion-card'))", 10_000)
          if (!await driver.click('[data-testid="suggestion-reject"]')) throw new Error('选区 Suggestion Reject 点击失败')
          await driver.waitFor("!Boolean(document.querySelector('.suggestion-card'))", 8_000)
          return { selectionCreated: true, toolbarVisible: true, selectionConfirmed: true, suggestionRejected: true }
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
          try {
            await driver.waitFor('Boolean(document.querySelector(\'.agent-chat-message.assistant\')) || Boolean(document.querySelector(\'.agent-response\'))', 8_000)
            await driver.waitFor('Boolean(document.querySelector(\'.context-manifest\'))', 8_000)
          } catch (error) {
            const diagnostic = await driver.evaluate(`(() => ({
              messages: [...document.querySelectorAll('.agent-chat-message')].map((item) => item.textContent?.slice(0, 160) ?? ''),
              response: document.querySelector('.agent-response')?.textContent?.slice(0, 240) ?? '',
              context: Boolean(document.querySelector('.context-manifest')),
              selectionChip: document.querySelector('.selection-hint')?.textContent ?? '',
              askBusy: document.querySelector('.ask-box button')?.getAttribute('aria-label') ?? '',
              provider: document.querySelector('.model')?.textContent ?? ''
            }))()`).catch(() => ({}))
            throw new Error(`${error instanceof Error ? error.message : String(error)}；Chat 状态=${JSON.stringify(diagnostic)}`)
          }
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
        id: 'context-replay-migration',
        label: 'Context Replay 展示迁移兼容性与逐条差异',
        timeoutMs: 30_000,
        run: async () => {
          const snapshot = await driver.evaluate(`(async () => {
            const result = await window.novelAPI.context.listSnapshots('chapters/001-fixture.md')
            return result.ok ? result.data[0] ?? null : null
          })()`)
          if (!snapshot?.id) throw new Error('Context Replay fixture 快照不存在')
          const chapter = await driver.evaluate(`(async () => {
            const result = await window.novelAPI.chapter.read('chapters/001-fixture.md')
            return result.ok ? result.data.markdown : null
          })()`)
          if (typeof chapter !== 'string') throw new Error('Context Replay fixture 章节读取失败')
          const changed = await driver.evaluate(`(async () => {
            const result = await window.novelAPI.chapter.save('chapters/001-fixture.md', ${JSON.stringify(`${chapter}\n\nContext Replay golden 变更。`)})
            return result.ok
          })()`)
          if (!changed) throw new Error('Context Replay fixture 章节变更失败')
          try {
            if (!await driver.click(`[data-snapshot-id="${snapshot.id}"]`)) throw new Error('Context Snapshot 回放按钮点击失败')
            await driver.waitFor("Boolean(document.querySelector('[data-testid=\"context-replay-compatibility\"]'))", 8_000)
            const replayState = await driver.evaluate(`(() => ({ compatibility: document.querySelector('[data-testid="context-replay-compatibility"]')?.textContent ?? '', differences: document.querySelectorAll('[data-testid="context-difference"]').length }))()`)
            if (!replayState.compatibility.includes('回放兼容性') || !replayState.compatibility.includes('使用当前索引重算') || replayState.differences < 1) throw new Error(`Context Replay 迁移差异展示不完整：${JSON.stringify(replayState)}`)
            return { replayed: true, migrationVisible: true, perSourceDifferences: replayState.differences }
          } finally {
            await driver.evaluate(`window.novelAPI.chapter.save('chapters/001-fixture.md', ${JSON.stringify(chapter)}).catch(() => undefined)`)
          }
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
          await driver.waitFor('document.querySelectorAll(\'.editor-selection-persisted\').length > 0', 8_000)
          return { workspaceVisible: true, draftActionsVisible: true, returnedToEditor: true, selectionHighlightRestored: true }
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
            const diagnostic = await driver.evaluate(`(async () => { const runs = await window.novelAPI.workflowRuntime.listRuns(); return { errors: runs.ok ? runs.data.flatMap((run) => Object.values(run.nodes).filter((node) => node.error).map((node) => ({ runStatus: run.status, nodeId: node.nodeId, error: node.error, diagnostics: node.diagnostics, log: node.log }))) : [], runStatuses: runs.ok ? runs.data.map((run) => run.status) : [], runButton: document.querySelector('[data-testid="workflow-run"]')?.textContent ?? '' } })()`)
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
        id: 'story-bible-timeline',
        label: 'Story Bible Timeline 事件参与者、地点与因果编辑',
        timeoutMs: 30_000,
        run: async () => {
          const created = await driver.evaluate(`(async () => {
            const participant = await window.novelAPI.story.saveEntity({ id: 'ent_lan', kind: 'character', name: '林默', aliases: [], fields: {}, notes: 'golden timeline fixture' })
            const location = await window.novelAPI.story.saveEntity({ id: 'ent_place_golden', kind: 'place', name: '旧城门', aliases: [], fields: {}, notes: 'golden timeline fixture' })
            if (!participant.ok || !location.ok) return { ok: false, error: { message: 'Timeline fixture 实体创建失败' } }
            return window.novelAPI.story.saveTimelineEvent({ title: '雨夜相遇', at: '2127-05-17 21:42', description: '初始描述', chapterRelPath: 'chapters/001-fixture.md', entityIds: ['ent_lan'], locationId: 'ent_place_golden', causes: '初始原因', effects: '初始结果' })
          })()`)
          if (!created?.ok || !created.data?.id) throw new Error(`Timeline fixture 事件创建失败：${JSON.stringify(created)}`)
          if (!await driver.click('[data-testid="story-timeline-open"]')) throw new Error('Story Bible Timeline 打开失败')
          try { await driver.waitFor("Boolean(document.querySelector('.story-bible-shell'))", 8_000) } catch (error) { throw new Error(`Story Bible 未显示：${error instanceof Error ? error.message : String(error)}`) }
          await driver.waitFor(`Boolean(document.querySelector('[data-testid="timeline-event"][data-event-id="${created.data.id}"]'))`, 8_000)
          if (!await driver.click(`[data-testid="timeline-event"][data-event-id="${created.data.id}"]`)) throw new Error('Timeline 事件选择失败')
          if (!await driver.fill('[data-testid="timeline-causes"]', '目击者追踪线索')) throw new Error('Timeline 原因填写失败')
          if (!await driver.fill('[data-testid="timeline-effects"]', '双方建立盟约')) throw new Error('Timeline 结果填写失败')
          if (!await driver.fill('[data-testid="timeline-description"]', '编辑后的事件描述')) throw new Error('Timeline 描述填写失败')
          const locationSelected = await driver.evaluate(`(() => { const select = document.querySelector('[data-testid="timeline-location"]'); if (!select) return false; const option = [...select.options].find((item) => item.textContent?.includes('旧城门')); if (!option) return false; select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
          if (!locationSelected) throw new Error('Timeline 地点选择失败')
          const participantChecked = await driver.evaluate(`(() => { const input = document.querySelector('[data-testid="timeline-participant-ent_lan"]'); if (!(input instanceof HTMLInputElement)) return false; if (!input.checked) input.click(); return input.checked })()`)
          if (!participantChecked) throw new Error('Timeline 参与者选择失败')
          if (!await driver.click('[data-testid="timeline-save"]')) throw new Error('Timeline 保存点击失败')
          await driver.waitFor("document.querySelector('.story-form-actions')?.textContent?.includes('已保存') === true", 8_000)
          const saved = await driver.evaluate(`(async () => {
            const result = await window.novelAPI.story.listTimeline()
            const event = result.ok ? result.data.find((item) => item.id === ${JSON.stringify(created.data.id)}) : null
            return event ? { entityIds: event.entityIds, locationId: event.locationId, causes: event.causes, effects: event.effects, description: event.description } : null
          })()`)
          if (!saved || !saved.entityIds.includes('ent_lan') || saved.locationId !== 'ent_place_golden' || saved.causes !== '目击者追踪线索' || saved.effects !== '双方建立盟约' || saved.description !== '编辑后的事件描述') throw new Error(`Timeline 保存结果不正确：${JSON.stringify(saved)}`)
          if (!await driver.click(`[data-testid="timeline-event"][data-event-id="${created.data.id}"]`)) throw new Error('Timeline 保存后回显点击失败')
          const echoed = await driver.evaluate(`(() => ({ causes: document.querySelector('[data-testid="timeline-causes"]')?.value ?? '', effects: document.querySelector('[data-testid="timeline-effects"]')?.value ?? '', description: document.querySelector('[data-testid="timeline-description"]')?.value ?? '', location: document.querySelector('[data-testid="timeline-location"]')?.value ?? '' }))()`)
          if (echoed.causes !== '目击者追踪线索' || echoed.effects !== '双方建立盟约' || echoed.description !== '编辑后的事件描述' || echoed.location !== 'ent_place_golden') throw new Error(`Timeline 编辑回显不正确：${JSON.stringify(echoed)}`)
          if (!await driver.click('[data-testid="timeline-delete"]')) throw new Error('Timeline 删除点击失败')
          await driver.waitFor("document.querySelector('.story-form-actions')?.textContent?.includes('已删除') === true", 8_000)
          const deleted = await driver.evaluate(`(async () => { const result = await window.novelAPI.story.listTimeline(); return result.ok && !result.data.some((item) => item.id === ${JSON.stringify(created.data.id)}) })()`)
          if (!deleted) throw new Error('Timeline 删除结果未持久化')
          return { created: true, participantsEdited: true, locationEdited: true, causesEffectsEdited: true, editEchoed: true, deleted: true }
        }
      },
      {
        id: 'graph-relation-editing',
        label: 'Graph Studio 关系新增、编辑回显与删除',
        timeoutMs: 30_000,
        run: async () => {
          const createdResult = await driver.evaluate(`(async () => {
            const lan = await window.novelAPI.story.saveEntity({ id: 'ent_lan', kind: 'character', name: '林默', aliases: [], fields: {}, notes: 'golden fixture' })
            const su = await window.novelAPI.story.saveEntity({ id: 'ent_su', kind: 'character', name: '苏璃', aliases: [], fields: {}, notes: 'golden fixture' })
            if (!lan.ok || !su.ok) return { ok: false, error: { message: 'fixture 实体创建失败' } }
            const result = await window.novelAPI.story.saveRelation({ fromId: 'ent_lan', toId: 'ent_su', relationType: '盟友', metadata: { confidence: 0.8 } })
            return result
          })()`)
          const created = createdResult?.ok ? createdResult.data : null
          if (!created?.id) throw new Error(`Graph fixture 关系创建失败：${JSON.stringify(createdResult)}`)
          if (!await driver.click('[data-testid="graph-open"]')) throw new Error('Graph Studio 打开失败')
          try { await driver.waitFor("Boolean(document.querySelector('.graph-shell'))", 8_000) } catch (error) { throw new Error(`Graph Studio 工作台未显示：${error instanceof Error ? error.message : String(error)}`) }
          await driver.waitFor(`Boolean(document.querySelector('[data-testid="graph-relation-edge"][data-relation-id="${created.id}"]'))`, 8_000)
          if (!await driver.click(`[data-testid="graph-relation-edge"][data-relation-id="${created.id}"]`)) throw new Error('Graph 关系列表点击失败')
          if (!await driver.fill('[data-testid="graph-relation-type"]', '宿敌')) throw new Error('Graph 关系类型填写失败')
          if (!await driver.fill('[data-testid="graph-relation-metadata"]', '{"confidence":0.95,"source":"golden"}')) throw new Error('Graph 关系元数据填写失败')
          if (!await driver.click('[data-testid="graph-relation-save"]')) throw new Error('Graph 关系保存点击失败')
          await driver.waitFor("document.querySelector('.workflow-message')?.textContent?.includes('关系已保存') === true", 8_000)
          const saved = await driver.evaluate(`(async () => {
            const result = await window.novelAPI.story.listRelations()
            const relation = result.ok ? result.data.find((item) => item.id === ${JSON.stringify(created.id)}) : null
            return relation ? { relationType: relation.relationType, metadata: relation.metadata } : null
          })()`)
          if (saved?.relationType !== '宿敌' || saved.metadata?.confidence !== 0.95 || saved.metadata?.source !== 'golden') throw new Error(`Graph 关系保存结果不正确：${JSON.stringify(saved)}`)
          if (!await driver.click(`[data-testid="graph-relation-edge"][data-relation-id="${created.id}"]`)) throw new Error('Graph 修改后关系回显点击失败')
          const echoed = await driver.evaluate(`(() => ({ relationType: document.querySelector('[data-testid="graph-relation-type"]')?.value ?? '', metadata: document.querySelector('[data-testid="graph-relation-metadata"]')?.value ?? '' }))()`)
          if (echoed.relationType !== '宿敌' || !echoed.metadata.includes('0.95') || !echoed.metadata.includes('golden')) throw new Error(`Graph 关系编辑回显不正确：${JSON.stringify(echoed)}`)
          if (!await driver.click('[data-testid="graph-relation-delete"]')) throw new Error('Graph 关系删除点击失败')
          await driver.waitFor("document.querySelector('.workflow-message')?.textContent?.includes('关系已删除') === true", 8_000)
          const deleted = await driver.evaluate(`(async () => {
            const result = await window.novelAPI.story.listRelations()
            return result.ok && !result.data.some((item) => item.id === ${JSON.stringify(created.id)})
          })()`)
          if (!deleted) throw new Error('Graph 关系删除结果未持久化')
          return { created: true, edited: true, metadataPersisted: true, editEchoed: true, deleted: true }
        }
      },
      {
        id: 'workflow-cross-chapter-retry',
        label: '切换章节后仍按历史章节 Retry Workflow',
        timeoutMs: 30_000,
        run: async () => {
          const started = await driver.evaluate(`(async () => {
            const result = await window.novelAPI.workflowRuntime.start('flow_builtin_novel', 'chapters/does-not-exist.md')
            return result.ok ? result.data : null
          })()`)
          if (!started) throw new Error('无法创建跨章节 Retry fixture Run')
          await driver.waitFor(`(async () => { const result = await window.novelAPI.workflowRuntime.listRuns(false); const run = result.ok ? result.data.find((item) => item.id === ${JSON.stringify(started)}) : null; return run?.status === 'failed' })()`, 15_000)
          const switched = await driver.evaluate(`(() => {
            const buttons = [...document.querySelectorAll('[data-testid="chapter-open"], .chapter-open')]
            const target = buttons[1]
            if (!target) return false
            target.click()
            return true
          })()`)
          if (!switched) throw new Error('切换到第二章节失败')
          await driver.waitFor(`(() => { const card = document.querySelector('.runtime-card'); return Boolean(card?.textContent?.includes('chapters/does-not-exist.md')) })()`, 8_000)
          const retryClicked = await driver.evaluate(`(() => {
            const card = document.querySelector('.runtime-card')
            const button = [...(card?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.includes('Retry') || item.textContent?.includes('重试'))
            if (!button) return false
            button.click()
            return true
          })()`)
          if (!retryClicked) throw new Error('跨章节 Retry 按钮不可用')
          await driver.waitFor(`(async () => { const result = await window.novelAPI.workflowRuntime.listRuns(false); const run = result.ok ? result.data.find((item) => item.id === ${JSON.stringify(started)}) : null; return run?.status === 'failed' && run.relPath === 'chapters/does-not-exist.md' })()`, 15_000)
          return { sourceChapter: 'chapters/does-not-exist.md', switchedChapter: true, retryTargetPreserved: true }
        }
      },
      {
        id: 'workflow-cancel-ui',
        label: 'Workflow UI 取消运行并恢复可操作状态',
        timeoutMs: 20_000,
        run: async () => {
          const buttonSelector = '[data-testid="workflow-run"]'
          await driver.waitFor("(() => { const button = document.querySelector('[data-testid=\"workflow-run\"]'); return button instanceof HTMLButtonElement && button.dataset.running === 'false' })()", 8_000)
          if (!await driver.click(buttonSelector)) throw new Error('Workflow 启动按钮点击失败')
          await driver.waitFor("(() => { const button = document.querySelector('[data-testid=\"workflow-run\"]'); return button instanceof HTMLButtonElement && button.dataset.running === 'true' })()", 8_000)
          if (!await driver.click(buttonSelector)) throw new Error('Workflow 取消按钮点击失败')
          await driver.waitFor("(async () => { const result = await window.novelAPI.workflowRuntime.listRuns(false); return result.ok && result.data.some((run) => run.status === 'cancelled') })()", 12_000)
          await driver.waitFor("(() => { const button = document.querySelector('[data-testid=\"workflow-run\"]'); return button instanceof HTMLButtonElement && button.dataset.running === 'false' })()", 8_000)
          const state = await driver.evaluate("(async () => { const result = await window.novelAPI.workflowRuntime.listRuns(false); const cancelled = result.ok ? result.data.find((run) => run.status === 'cancelled') : null; const button = document.querySelector('[data-testid=\"workflow-run\"]'); return { status: cancelled?.status ?? '', buttonText: button?.textContent?.trim() ?? '' } })()")
          if (state.status !== 'cancelled' || state.buttonText === '') throw new Error('Workflow 取消后状态不正确：' + JSON.stringify(state))
          return { started: true, cancelled: true, uiReady: true }
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
      },
      {
        id: 'notification-layout',
        label: '长通知固定定位、换行、居中并可关闭',
        timeoutMs: 15_000,
        run: async () => {
          if (!await driver.click('.checkpoint-actions > button')) throw new Error('Checkpoint 入口点击失败')
          await driver.waitFor("Boolean(document.querySelector('.checkpoint-popover'))", 5_000)
          const longName = '超长通知测试·'.repeat(15)
          const notificationPrefix = longName.slice(0, 8)
          if (!await driver.fill('.checkpoint-popover input', longName)) throw new Error('长通知内容填充失败')
          if (!await driver.click('.checkpoint-create button')) throw new Error('Checkpoint 创建点击失败')
          await driver.waitFor(`[...document.querySelectorAll('.global-notification-message')].some((node) => node.textContent?.includes(${JSON.stringify(notificationPrefix)}))`, 8_000)
          const layout = await driver.evaluate(`(() => {
            const center = document.querySelector('.notification-center')
            const item = [...document.querySelectorAll('.global-notification')].find((node) => node.textContent?.includes(${JSON.stringify(notificationPrefix)}))
            const text = item?.querySelector('.global-notification-message')
            const marker = item?.querySelector('.global-notification-indicator')
            if (!center || !item || !text || !marker) return null
            const centerStyle = getComputedStyle(center)
            const itemRect = item.getBoundingClientRect()
            const textRect = text.getBoundingClientRect()
            const markerRect = marker.getBoundingClientRect()
            return {
              fixed: centerStyle.position === 'fixed',
              overflowY: centerStyle.overflowY,
              wraps: textRect.height > 30,
              verticalCenterDelta: Math.abs((markerRect.top + markerRect.height / 2) - (itemRect.top + itemRect.height / 2)),
              notificationText: item.textContent?.includes('超长通知测试') ?? false
            }
          })()`)
          if (!layout?.fixed || !['auto', 'scroll'].includes(layout.overflowY) || !layout.wraps || layout.verticalCenterDelta > 8 || !layout.notificationText) throw new Error(`长通知布局不符合预期：${JSON.stringify(layout)}`)
          const dismissed = await driver.evaluate(`(() => {
            const item = [...document.querySelectorAll('.global-notification')].find((node) => node.textContent?.includes(${JSON.stringify(notificationPrefix)}))
            const button = item?.querySelector('button[aria-label="关闭通知"]')
            if (!(button instanceof HTMLButtonElement)) return false
            button.click()
            return true
          })()`)
          if (!dismissed) throw new Error('通知关闭按钮点击失败')
          await driver.waitFor(`[...document.querySelectorAll('.global-notification-message')].every((node) => !node.textContent?.includes(${JSON.stringify(notificationPrefix)}))`, 5_000)
          if (await driver.evaluate("Boolean(document.querySelector('.checkpoint-popover'))")) await driver.click('.checkpoint-actions > button')
          return { fixed: true, wrapped: true, verticallyCentered: true, dismissed: true }
        }
      },
      {
        id: 'telemetry-consent',
        label: 'Telemetry 默认关闭并可撤销同意',
        timeoutMs: 15_000,
        run: async () => {
          const opened = await driver.evaluate(`(() => {
            const button = [...document.querySelectorAll('.bottom-tab-list button')].find((item) => item.textContent?.trim() === 'Developer')
            if (!button) return false
            button.click()
            return true
          })()`)
          if (!opened) throw new Error('Developer 面板入口不存在')
          await driver.waitFor("Boolean(document.querySelector('.developer-telemetry'))", 8_000)
          const initial = await driver.evaluate(`(() => document.querySelector('.developer-telemetry')?.textContent ?? '')()`)
          if (!initial.includes('默认关闭') && !initial.includes('已关闭')) throw new Error(`Telemetry 初始状态不安全：${initial}`)
          if (!await driver.click('.developer-telemetry-actions button')) throw new Error('Telemetry 启用按钮点击失败')
          await driver.waitFor("document.querySelector('.developer-telemetry')?.textContent?.includes('已启用') === true", 8_000)
          if (!await driver.click('.developer-telemetry-actions button')) throw new Error('Telemetry 撤销按钮点击失败')
          await driver.waitFor("document.querySelector('.developer-telemetry')?.textContent?.includes('已关闭') === true", 8_000)
          return { defaultOff: true, explicitlyEnabled: true, revoked: true }
        }
      },
      {
        id: 'developer-inspector-observability',
        label: 'Developer Inspector 状态筛选与节点元数据 Trace',
        timeoutMs: 20_000,
        run: async () => {
          const opened = await driver.evaluate(`(() => {
            const button = [...document.querySelectorAll('.bottom-tab-list button')].find((item) => item.textContent?.trim() === 'Developer')
            if (!button) return false
            button.click()
            return true
          })()`)
          if (!opened) throw new Error('Developer 面板入口不存在')
          await driver.waitFor("Boolean(document.querySelector('.developer-layout'))", 8_000)

          const selectStatus = async (selector, value) => Boolean(await driver.evaluate(`(() => {
            const select = document.querySelector(${JSON.stringify(selector)})
            if (!(select instanceof HTMLSelectElement)) return false
            select.value = ${JSON.stringify(value)}
            select.dispatchEvent(new Event('change', { bubbles: true }))
            return select.value === ${JSON.stringify(value)}
          })()`))

          if (!await selectStatus('[data-testid="developer-run-filter"]', 'failed')) throw new Error('Run 状态筛选切换失败')
          await driver.waitFor('document.querySelector(\'[data-testid="developer-run-filter"]\')?.value === \'failed\'', 5_000)
          const runFilterState = await driver.evaluate(`(() => ({
            value: document.querySelector('[data-testid="developer-run-filter"]')?.value ?? '',
            statuses: [...document.querySelectorAll('.developer-runs .runtime-status')].map((item) => item.textContent?.trim() ?? '')
          }))()`)
          if (runFilterState.value !== 'failed' || runFilterState.statuses.some((status) => !['failed', '失败'].includes(status))) throw new Error(`Run 筛选结果不正确：${JSON.stringify(runFilterState)}`)

          if (!await selectStatus('[data-testid="developer-job-filter"]', 'failed')) throw new Error('Job 状态筛选切换失败')
          await driver.waitFor('document.querySelector(\'[data-testid="developer-job-filter"]\')?.value === \'failed\'', 5_000)
          const jobFilterState = await driver.evaluate(`(() => ({
            value: document.querySelector('[data-testid="developer-job-filter"]')?.value ?? '',
            statuses: [...document.querySelectorAll('.developer-job .runtime-status')].map((item) => item.textContent?.trim() ?? '')
          }))()`)
          if (jobFilterState.value !== 'failed' || jobFilterState.statuses.some((status) => !['failed', '失败'].includes(status))) throw new Error(`Job 筛选结果不正确：${JSON.stringify(jobFilterState)}`)

          if (!await driver.click('.developer-runs > button')) throw new Error('Developer Run 选择失败')
          await driver.waitFor("Boolean(document.querySelector('.developer-nodes button'))", 8_000)
          if (!await driver.click('.developer-nodes button')) throw new Error('Developer 节点选择失败')
          await driver.waitFor('Boolean(document.querySelector(\'[data-testid="developer-trace"]\'))', 8_000)
          const trace = await driver.evaluate(`(() => {
            const element = document.querySelector('[data-testid="developer-trace"]')
            const text = element?.textContent ?? ''
            return {
              visible: Boolean(element),
              metadata: (element?.querySelectorAll('.developer-diagnostics > span').length ?? 0) >= 9,
              summaryOnly: text.includes('仅展示摘要、诊断和脱敏日志') && !text.includes('API Key') && !text.includes('Provider secret'),
              hasFullChapterBody: text.includes('临时章节') || text.includes('fixture chapter')
            }
          })()`)
          if (!trace.visible || !trace.metadata || !trace.summaryOnly || trace.hasFullChapterBody) throw new Error(`Developer Trace 不符合元数据约束：${JSON.stringify(trace)}`)
          return { runFilter: 'failed', jobFilter: 'failed', runSelected: true, nodeSelected: true, metadataTraceVisible: true, summaryOnly: true }
        }
      }
    ]
  })
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
} finally {
  if (driver) await driver.evaluate(`window.novelAPI.ai.removeImageSecret('profile_fixture_electron').catch(() => undefined)`).catch(() => undefined)
  await driver?.close()
  await launcher?.stop()
  await closeServer(imageServer)
  await fixture.cleanup()
}
