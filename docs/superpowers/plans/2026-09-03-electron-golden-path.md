# Electron 黄金路径验收层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可重复、可清理、metadata-only 的本地 Electron 黄金路径 harness，验证核心 UI/preload/Main 闭环而不接触真实 Provider。

**Architecture:** 复用现有 `dev-stable` 固定端口启动器，增加独立 fixture 工厂和顺序 runner。Runner 只产生步骤摘要，业务结果通过 Electron UI/typed preload 边界获得；runtime/UI contract 继续作为轻量验证门，不冒充真实 E2E。

**Tech Stack:** Electron 38、Vite stable renderer、TypeScript/Node ESM scripts、React renderer、现有 typed preload IPC、临时目录 fixture。

## Global Constraints

- 不运行 `test` 或 `build`。
- 不使用、保存或输出真实 Provider API Key。
- 不提交代码，不 reset/checkout，不清理用户文件。
- Renderer 不得直接访问 Node、fs、SQLite、网络或 secret。
- Markdown/YAML/JSON/图片是内容源；SQLite 只做可重建索引、状态和审计。
- AI 只能产生 Suggestion/Proposal/Asset，人工动作才修改正文或 Canon。
- 失败步骤必须脱敏，禁止正文、prompt、Authorization、`sk_` 和 data URL 进入证据。

---

### Task 1: 提取稳定 Electron 生命周期边界

**Files:**
- Modify: `scripts/dev-stable.mjs`
- Modify: `scripts/verify-ui-contract.mjs`

**Interfaces:**
- Produces `startStableElectron(options)`-compatible lifecycle semantics through reusable local functions, while preserving direct `node scripts/dev-stable.mjs` behavior.
- The launcher must expose fixed renderer URL/port, wait timeout, and idempotent cleanup to the runner.

- [x] Step 1: 保留现有固定端口行为，抽取 `listeningPids`、`waitForRenderer`、`stop` 的可测试纯边界；不要改变 Electron 入口路径和环境变量名称。
- [x] Step 2: 增加启动失败时的阶段化错误信息和统一 `SIGINT`/`SIGTERM` 清理，确保 Vite 与 Electron 都能结束。
- [x] Step 3: 在 UI contract 增加固定 URL、无真实 Key 注入、清理函数和稳定入口契约。
- [x] Step 4: 运行 `npm run typecheck`、`node scripts/verify-ui-contract.mjs` 和 `git diff --check`。

### Task 2: 创建 metadata-only fixture 工厂

**Files:**
- Create: `scripts/golden-path-fixture.mjs`
- Modify: `scripts/verify-runtime.mjs`

**Interfaces:**
- Exports `createGoldenFixture(rootDir)` returning `{ projectRoot, chapterRelPath, evidencePath, cleanup }`.
- Fixture contains only deterministic project files and mock-compatible Provider metadata; returned evidence never contains source text or secrets.

- [x] Step 1: 使用 `mkdtemp` 创建任务目录，调用现有项目服务/fixture 生成入口创建项目、章节、工作流和 Provider metadata。
- [x] Step 2: 将章节、Provider、图片和 workflow 初始状态写入临时目录，禁止把 API key 字段或 data URL 写入 evidence。
- [x] Step 3: 实现 `cleanup()` 只删除本次工厂创建的明确临时目录，并在失败时保持幂等。
- [x] Step 4: 在 `verify-runtime.mjs` 增加工厂输出的脱敏断言：证据不含正文、prompt、`sk_`、Authorization、data URL，且临时目录可清理。

### Task 3: 实现顺序步骤 runner 与证据协议

**Files:**
- Create: `scripts/golden-path-runner.mjs`
- Modify: `scripts/verify-ui-contract.mjs`

**Interfaces:**
- Defines immutable `GoldenStepResult` records with `id`, `label`, `status`, `durationMs`, `evidence`, and optional `error`.
- Defines `runStep({ id, label, run })` and `runGoldenPath({ fixture, driver })`; a failed step stops dependent steps and marks them skipped.

- [x] Step 1: 实现步骤状态机和单步超时，所有结果使用新对象，不原地修改共享结果。
- [x] Step 2: 实现 `sanitizeEvidence`，只允许摘要 primitive 值，过滤正文/prompt/secret/data URL 等敏感内容。
- [x] Step 3: 实现 JSON 输出到任务临时目录，成功/失败都执行 launcher、fixture cleanup。
- [x] Step 4: 在 UI contract 检查 runner 不导入 Renderer Node API，且存在失败停止、skipped 和清理逻辑。

### Task 4: 接入首批 Electron 黄金路径适配器

**Files:**
- Modify: `scripts/golden-path-runner.mjs`
- Modify: `scripts/dev-stable.mjs`
- Modify: `docs/blueprint-audit-2026-09-02.md`
- Modify: `docs/development-process.md`

**Interfaces:**
- Driver actions are named adapters: `openProject`, `openChapter`, `inspectProvider`, `runChat`, `reviewSuggestion`, `applyAndRevertCanon`, `resumeWorkflow`, `manageIllustration`, `roundTripBackup`.
- Each adapter returns summary evidence only; it does not expose raw UI text or payloads.

- [x] Step 1: 接入项目/章节打开和 Provider 状态检查，失败时报告步骤 ID 与状态，不执行真实连接测试。
- [x] Step 2a: 接入 Chat/Context 首段步骤摘要；发送前按 Main 权威状态校正 Renderer 的 Provider 快照，并验证 assistant 与 Context manifest 可见。
- [x] Step 2b: 接入 Suggestion 生成、Accept、Reject 步骤摘要，并增加稳定 UI selector。
- [x] Step 2c: 接入 Canon Proposal 的 UI Apply/Revert 步骤摘要，修复 preload/Renderer 方法名漂移并暴露稳定状态 selector。
- [x] Step 2: 接入 Chat/Context、Suggestion Accept/Reject、Canon Apply/Revert 的完整步骤摘要。
- [x] Step 3: 接入 Workflow 两次人工暂停/恢复以及 Illustration 生成/插入/删除摘要。
- [x] Step 4: 接入 HTML/备份导出与临时目标导入摘要，验证不覆盖原项目。
- [x] Step 5: 更新蓝图审计和开发流程，明确本地 harness 证据与真实 Electron/Provider 证据的区别。

### Task 5: 验证与交付门

**Files:**
- Modify: `docs/release-readiness-checklist.md`
- Modify: `docs/blueprint-audit-2026-09-02.md`

- [x] Step 1: 运行 `npm run typecheck`。
- [x] Step 2: 运行 `node scripts/verify-runtime.mjs --long`。
- [x] Step 3: 运行 `node scripts/verify-ui-contract.mjs`。
- [x] Step 4: 运行 `git diff --check`。
- [x] Step 5: 记录通过项、未覆盖项和未运行的 `test/build`；不宣称完整 Electron E2E、真实 Provider、发布或性能验收已完成。
