# Reusable Novel Authoring Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Novel Studio 中提供可复用的“我的创作流程”，让作者从 Premise 开始逐章完成《雾港来信》，经过人工审核、Canon 审核、全稿修订后才能导出终稿。

**Architecture:** 将章节正文 Markdown 作为唯一正文来源，将创作阶段保存在 `story/authoring-progress.yaml`。新建并初始化创作项目时安装一个独立的 `flow_my_authoring` 工作流并写入项目默认工作流；章节运行由现有 Workflow Runtime 执行，在 `human.review` 处暂停，只有人工批准或编辑后才允许 `chapter.write`。全稿修订使用独立的项目级检查/审核服务，不用一个布尔按钮伪造 AI 修订完成。

**Tech Stack:** React、TypeScript、Electron IPC、YAML、Zod、Vitest、现有 Workflow Runtime、Chapter/Story/Canon/Revision 服务。

## Global Constraints

- 正文 Markdown 是 source of truth；SQLite 只保存索引、运行记录和 Revision 证据。
- AI 正文必须经过 `human.review` 后才允许写回章节。
- Memory 只能产生 Canon 候选；Canon 必须人工应用或拒绝。
- 新项目只能在空目录初始化；已有项目不得被向导覆盖。
- 所有 IPC 输入必须在 Main 边界用 Zod 校验；文件写入使用项目路径沙箱和原子写入。
- 不提交 API key、`.novel/project.db`、模型缓存、运行日志或图片二进制。
- 保留《雾港来信》3–5 万字、3 幕、14 章和中文创作设定。
- 不自动接受 AI 草稿、不自动应用 Canon、不自动发布内容。

---

### Task 1: 建立可复用的“我的创作流程”工作流模板

**Files:**
- Create: `src/shared/authoring-workflow.ts`
- Modify: `src/main/services/project-service.ts`
- Modify: `src/shared/project-schema.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Test: `tests/authoring-workflow-installation.test.ts`

**Interfaces:**
- `myAuthoringWorkflow(): Workflow` 返回 ID 为 `flow_my_authoring` 的章节流程。
- `ProjectService.installAuthoringWorkflow()` 安全写入 `workflows/flow_my_authoring.novelflow.json` 并将 manifest 的 `defaultWorkflow` 设为 `flow_my_authoring`。
- 该工作流只允许已注册节点，且保留 `human.review → chapter.write → memory.extract` 顺序。

- [ ] **Step 1: Write the failing test**

测试新项目安装后拥有流程文件、manifest 指向该流程，且流程通过 `workflowSchema` 与 `validateWorkflow`。

- [ ] **Step 2: Run the focused test**

Run: `pnpm vitest run tests/authoring-workflow-installation.test.ts`

Expected: FAIL，因为模板和安装接口尚不存在。

- [ ] **Step 3: Implement the minimum template and installer**

复用现有 `builtinNovelFlow` 的节点执行边界，移除正文闭环不需要的图片节点，使用稳定的 `flow_my_authoring` 文件名；通过 `atomicWriteFile` 写入，并在 manifest 中以新对象替换 `defaultWorkflow`。

- [ ] **Step 4: Run focused test and typecheck**

Run: `pnpm vitest run tests/authoring-workflow-installation.test.ts && pnpm typecheck`

Expected: PASS。

### Task 2: 让新建项目向导安装并绑定流程

**Files:**
- Modify: `src/main/services/authoring-progress-service.ts`
- Modify: `src/renderer/src/components/AuthoringWizard.tsx`
- Modify: `tests/authoring-progress-service.test.ts`
- Modify: `tests/authoring-wizard.test.ts`

**Interfaces:**
- `authoring.initialize` 完成后项目必须有 `flow_my_authoring`，且只更新当前项目的 default workflow。
- 向导错误可重试，失败不得清空表单，也不得留下半初始化的项目状态。

- [ ] **Step 1: Add failing assertions**

断言初始化后 `novel.yaml.defaultWorkflow === 'flow_my_authoring'`、流程文件存在，重复初始化和非空项目仍被拒绝。

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/authoring-progress-service.test.ts tests/authoring-wizard.test.ts`

Expected: 新增绑定断言 FAIL。

- [ ] **Step 3: Implement initialization binding**

在同一个初始化事务边界内先安装流程，再写 Premise、Outline、章节、卷和进度；任何失败通过现有错误返回，不改变其他项目。

- [ ] **Step 4: Run focused tests**

Run: `pnpm vitest run tests/authoring-progress-service.test.ts tests/authoring-wizard.test.ts`

Expected: PASS。

### Task 3: 完成章节状态事件驱动和下一章推进

**Files:**
- Modify: `src/main/services/workflow-runtime-service.ts`
- Modify: `src/shared/runtime.ts`
- Modify: `src/renderer/src/components/AuthoringFlow.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/authoring-golden-path.test.ts`
- Test: `tests/authoring-flow-ui.test.ts`

**Interfaces:**
- Workflow 成功写回后发出带 `targetRelPath` 的 completion 事件；创作面板收到事件后自动刷新进度。
- 当前章节完成后，面板定位下一条 `planned` 章节，但不得绕过作者点击自动启动 AI。
- 从 `waiting_human` 恢复时，拒绝不得写正文；approve/edit 才能继续 writeback 和 memory。

- [ ] **Step 1: Write the failing golden-path test**

用确定性 Provider 验证：章节在 Human Review 前 Markdown 不变；approve 后生成 Revision、正文更新、Memory 只产生 pending proposal；刷新后下一章成为 active chapter。

- [ ] **Step 2: Run the focused test**

Run: `pnpm vitest run tests/authoring-golden-path.test.ts`

Expected: FAIL，当前没有完整的 AuthoringFlow 事件/下一章契约。

- [ ] **Step 3: Implement event subscription and next-chapter selection**

使用现有 `workflowRuntime.onEvent`；组件卸载时取消订阅；只根据持久化进度选择下一章，不在事件回调中直接启动 Provider。

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run tests/authoring-golden-path.test.ts tests/authoring-flow-ui.test.ts && pnpm typecheck`

Expected: PASS。

### Task 4: 用真实项目资料开始《雾港来信》正文

**Files:**
- Modify: `demo/雾港来信/story/outline.md`
- Modify: `demo/雾港来信/story/authoring-progress.yaml`
- Modify: `demo/雾港来信/chapters/002-没有寄件人的包裹.md` through `014-雾散之后.md`
- Modify: `demo/雾港来信/README.md`
- Test: `tests/middle-novel-authoring-flow.test.ts`

**Interfaces:**
- 14 章均有明确目标、冲突、转折和结尾钩子。
- 已有正文只能标记为 draft 或经真实 Human Review 后标记 approved；不得把空章节标记成完成稿。
- README 必须给出从第 1 章开始的实际 IDE 操作顺序和 Provider 配置要求。

- [ ] **Step 1: Add failing content assertions**

断言每章计划字段非空、第一章保持已有正文、空章节状态为 planned、项目默认工作流是 `flow_my_authoring`。

- [ ] **Step 2: Run the focused fixture test**

Run: `pnpm vitest run tests/middle-novel-authoring-flow.test.ts`

Expected: 新增默认工作流/计划断言 FAIL。

- [ ] **Step 3: Complete the chapter plan and opening continuation**

为第 2–14 章补全可执行章节计划；仅把第一章作为现有起始正文，后续章节由工作流逐章生成并等待人工审核，不预先伪造成稿。

- [ ] **Step 4: Run fixture and integrity tests**

Run: `pnpm vitest run tests/middle-novel-authoring-flow.test.ts tests/authoring-progress-service.test.ts`

Expected: PASS，项目索引、卷、时间线、伏笔和章节引用无悬空项。

### Task 5: 将全稿修订从“标记按钮”升级为真实审核流程

**Files:**
- Create: `src/shared/full-revision.ts`
- Create: `src/main/services/full-revision-service.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Modify: `src/renderer/src/components/AuthoringFlow.tsx`
- Test: `tests/full-revision-service.test.ts`

**Interfaces:**
- `fullRevision.prepare()` 读取全书章节、Canon 和 Story Bible，返回可审阅的结构化检查项，不改正文。
- `fullRevision.approve(input)` 只在作者确认后记录 revision checkpoint，并把进度置为 `full_revision` 完成；不能通过任意 `authoring.save` 伪造完成状态。
- 检查项至少覆盖人物一致性、时间线、伏笔回收、章节衔接和字数目标。

- [ ] **Step 1: Write failing service tests**

覆盖空章节/待处理 Canon 被拒绝、准备报告不写正文、人工确认后才进入 export 阶段，以及重复确认幂等。

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/full-revision-service.test.ts`

Expected: FAIL，因为服务和 IPC 尚不存在。

- [ ] **Step 3: Implement report and explicit approval**

把“分析”与“确认”分成两个 API；所有输入按 Zod 校验，报告稳定排序，审批写入可恢复的 checkpoint/进度字段。

- [ ] **Step 4: Connect the panel and run focused tests**

Run: `pnpm vitest run tests/full-revision-service.test.ts tests/authoring-review-service.test.ts && pnpm typecheck`

Expected: PASS。

### Task 6: 修复 Electron 开发启动并完成真实 GUI 验收

**Files:**
- Modify: `scripts/dev-stable.mjs`
- Modify: `scripts/golden-path-electron.mjs`
- Test: `tests/dev-startup.test.ts`
- Test: `tests/authoring-electron-golden-path.test.ts`

**Interfaces:**
- 启动脚本在 Electron 安装目录缺失/`path.txt` 无效时给出明确诊断，并在安全范围内尝试恢复；不能静默把 Electron 当作已安装。
- GUI 验收至少覆盖：打开新项目向导、创建项目、打开“我的创作流程”、启动章节 Workflow、停在 Human Review、恢复并检查下一章。

- [ ] **Step 1: Reproduce and instrument the startup failure**

记录 `electron/package.json`、`path.txt`、目标二进制、Node/Electron 版本和启动子进程 stderr，确认失败发生在 getElectronPath 而不是 renderer/build。

- [ ] **Step 2: Write the failing startup test**

用临时 Electron 安装路径覆盖无效 `path.txt` 和缺失二进制场景，断言脚本返回可操作错误而不是 `Electron uninstall`。

- [ ] **Step 3: Implement the smallest diagnostic/recovery change**

优先修复依赖安装状态或脚本调用路径；只在确认安装损坏时调用 `pnpm rebuild electron`，不删除用户目录或整个 node_modules。

- [ ] **Step 4: Run startup and GUI verification**

Run: `pnpm run dev:stable`, `pnpm e2e:electron`, `pnpm vitest run tests/dev-startup.test.ts tests/authoring-electron-golden-path.test.ts`

Expected: 开发应用能启动；关键流程在真实 Electron 中通过。

### Task 7: 全量验证和作者交付

**Files:**
- Modify: `README.md`
- Modify: `demo/雾港来信/README.md`
- Test: all existing tests and authoring tests

- [ ] **Step 1: Run focused authoring suite**

Run: `pnpm vitest run tests/authoring-progress.test.ts tests/authoring-progress-service.test.ts tests/authoring-review-service.test.ts tests/authoring-flow-ui.test.ts tests/authoring-wizard.test.ts tests/authoring-golden-path.test.ts tests/full-revision-service.test.ts tests/middle-novel-authoring-flow.test.ts`

Expected: PASS。

- [ ] **Step 2: Run project checks**

Run: `pnpm typecheck && npm run build && git diff --check`

Expected: typecheck、Electron/Vite build 和 diff 检查通过。

- [ ] **Step 3: Run the full test suite and record unrelated baseline failures**

Run: `pnpm test -- --exclude tests/fixture-verifier.test.ts`

Expected: 本次功能测试通过；任何非本任务的基线失败单独记录，不削弱创作流程断言。

- [ ] **Step 4: Update author handoff**

在 README 中明确：用户需要配置 Provider；每章必须人工审核；Canon 必须人工处理；全稿修订通过后才能导出；生成质量由 Provider 和作者判断共同决定。

