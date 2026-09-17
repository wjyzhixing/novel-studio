# 从 0 到完稿小说创作流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Novel Studio 中提供一条可持久化、可审阅、可恢复的从灵感到终稿的中篇小说创作流程，并用《雾港来信》实际推进验证。

**Architecture:** 在项目 `story/authoring-progress.yaml` 中保存全书阶段和章节状态；主进程通过 `AuthoringProgressService` 从 Markdown/YAML source of truth 重建统计，所有写入经过 Zod 校验和原子写入。渲染器增加创作流程面板，调用现有 Story Bible、Chapter、Workflow Runtime 和 Export API；章节 AI 仍按现有 `human.review → chapter.write → memory.extract` 闸门运行。

**Tech Stack:** React、TypeScript、Electron IPC、YAML、Zod、Vitest、现有 Workflow Runtime、现有 Chapter/Story/Canon 服务。

## Global Constraints

- 正文 Markdown 是 source of truth；进度 YAML 只保存作者阶段和可重建状态，不替代正文。
- 任何 AI 正文必须经过 `human.review` 后才允许写回章节。
- Canon/Memory 只能先生成候选事实，人工应用后才进入 Canon。
- 新增 IPC 必须在 shared contract、preload、main handler、renderer 类型四处同步。
- 所有用户输入在 IPC 边界使用 Zod 校验，项目文件使用路径沙箱和原子写入。
- 保留《雾港来信》3–5 万字、3 幕、14 章设定；不覆盖其他 demo 或用户已有未提交修改。
- 不把 API key、模型缓存、`.novel/project.db` 或生成二进制写入版本控制。

---

### Task 1: 建立全书进度共享模型和失败测试

**Files:**
- Create: `src/shared/authoring.ts`
- Create: `tests/authoring-progress.test.ts`
- Read: `src/shared/project-schema.ts`, `src/shared/chapter.ts`, `src/shared/story.ts`

**Interfaces:** `authoringProgressSchema`、`authoringStageSchema`、`chapterAuthoringStatusSchema`、`authoringInitializeInputSchema`；进度对象必须包含阶段、故事资料状态、章节列表、Canon 状态、全稿修订状态和导出状态。

- [ ] **Step 1: Write failing tests**

测试断言：新进度默认阶段为 `premise`；章节状态只能是 `planned|draft|review|approved|revised`；非法章节路径、负字数、超过 14 章的初始化输入被拒绝；进度序列化/反序列化保留章节状态和更新时间。

- [ ] **Step 2: Run focused test**

Run: `pnpm vitest run tests/authoring-progress.test.ts`

Expected: FAIL because `src/shared/authoring.ts` does not exist。

- [ ] **Step 3: Implement the schema**

实现严格的 Zod schema 和不可变的 `makeAuthoringProgress`、`updateChapterProgress`、`deriveAuthoringStage` helper；所有章节 `relPath` 必须匹配 `chapters/` 下的 Markdown。

- [ ] **Step 4: Run focused test**

Run: `pnpm vitest run tests/authoring-progress.test.ts`

Expected: PASS。

### Task 2: 实现进度文件服务和初始化/刷新能力

**Files:**
- Create: `src/main/services/authoring-progress-service.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Create: `tests/authoring-progress-service.test.ts`

**Interfaces:** `AuthoringProgressService.get()`、`initialize(input)`、`refresh()`、`save(progress)`；`initialize` 创建 `story/authoring-progress.yaml`，可从 premise、genre、目标字数、章节计划生成 1–14 个章节文件和 `story/volumes.yaml`；`refresh` 只从磁盘和索引重建统计，不自动提升人工阶段。

- [ ] **Step 1: Write failing service tests**

覆盖：空项目初始化后产生进度文件和指定数量章节；重复初始化被拒绝；刷新会把磁盘章节字数同步到进度；恶意路径和超过 14 章被拒绝；原子写入失败不会留下半份 YAML。

- [ ] **Step 2: Run focused test**

Run: `pnpm vitest run tests/authoring-progress-service.test.ts`

Expected: FAIL because service and IPC contracts are missing。

- [ ] **Step 3: Implement service and IPC wiring**

使用 `ProjectService.resolveInProject`、`atomicWriteFile`、`parse/stringify` 和现有 `ChapterService`；IPC handler 必须通过 `parseOrThrow` 校验，并在项目关闭时不允许访问。

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run tests/authoring-progress.test.ts tests/authoring-progress-service.test.ts && pnpm typecheck`

Expected: PASS。

### Task 3: 增加 IDE 创作流程面板和入口

**Files:**
- Create: `src/renderer/src/components/AuthoringFlow.tsx`
- Create: `src/renderer/src/styles/authoring-flow.css`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/lib/i18n.ts`
- Create: `tests/authoring-flow-ui.test.ts`

**Interfaces:** 面板显示八个阶段：故事前提、Story Bible、三幕大纲、章节计划、逐章写作、Canon 审核、全稿修订、导出终稿；每个阶段显示完成/进行中/阻塞；章节卡片可打开章节并启动当前项目默认 Workflow；面板不直接写 Canon。

- [ ] **Step 1: Write failing UI contract tests**

测试源码必须包含进度 API 调用、八个阶段文案、当前章节 Workflow 启动、Human Review/Canon 提示和空项目初始化入口。

- [ ] **Step 2: Implement panel and navigation**

新增 `novel:open-authoring` 事件，与现有 Story Bible/Workflow 互斥；加载时调用 `authoring.get`，操作后调用 `authoring.refresh`；错误显示用户可理解的消息。

- [ ] **Step 3: Run UI tests and typecheck**

Run: `pnpm vitest run tests/authoring-flow-ui.test.ts && pnpm typecheck`

Expected: PASS。

### Task 4: 把新建项目变成真正的从零向导

**Files:**
- Create: `src/renderer/src/components/AuthoringWizard.tsx`
- Modify: `src/renderer/src/components/Welcome.tsx`
- Modify: `src/renderer/src/store/app-store.ts`
- Modify: `src/renderer/src/lib/i18n.ts`
- Create: `tests/authoring-wizard.test.ts`

**Interfaces:** 向导收集书名、题材、核心 premise、目标字数、章节数、卷标题和首章标题；提交后调用 `project.create`，再调用 `authoring.initialize`；取消不创建项目；错误可重试且不丢输入。

- [ ] **Step 1: Write failing wizard tests**

覆盖表单校验、取消不调用 API、成功创建后进入创作流程面板、初始化失败时保留输入。

- [ ] **Step 2: Implement wizard**

分两步展示基本信息和结构信息；章节数限制 1–14；为每章生成“计划中”的空 Markdown，不生成未经审核的正文。

- [ ] **Step 3: Run focused tests**

Run: `pnpm vitest run tests/authoring-wizard.test.ts tests/authoring-flow-ui.test.ts`

Expected: PASS。

### Task 5: 增加全书级检查、阶段门禁和终稿导出

**Files:**
- Create: `src/main/services/authoring-review-service.ts`
- Modify: `src/shared/authoring.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Modify: `src/renderer/src/components/AuthoringFlow.tsx`
- Create: `tests/authoring-review-service.test.ts`

**Interfaces:** `AuthoringReviewService.review()` 返回章节缺口、悬空引用、未处理伏笔、待审核 Canon、目标字数和实际字数；`canExport(report)` 只有无结构错误、所有章节已审核且无待处理 Canon 时为 true；导出动作复用现有 `chapter.exportAll`。

- [ ] **Step 1: Write failing review tests**

测试覆盖缺章节、空正文、悬空时间线/伏笔引用、未审核章节、pending Canon 和合格项目；断言合格项目允许导出，不合格项目拒绝导出并返回具体问题。

- [ ] **Step 2: Implement review service**

读取 `ProjectIntegrity`、章节列表、伏笔和 Canon proposal；结果必须稳定排序、可显示给用户，不修改任何 source file。

- [ ] **Step 3: Add UI gates and export action**

面板中只有 review 通过后启用“导出终稿”；导出前显示检查结果和目标格式，不绕过现有选择器。

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run tests/authoring-review-service.test.ts && pnpm typecheck`

Expected: PASS。

### Task 6: 用《雾港来信》实际推进章节并验证端到端闭环

**Files:**
- Modify: `demo/雾港来信/story/authoring-progress.yaml`
- Modify: `demo/雾港来信/story/outline.md`
- Modify: `demo/雾港来信/story/volumes.yaml`
- Create: `demo/雾港来信/chapters/002-潮汐坐标.md` through `014-雾中的第二扇门.md`
- Modify: `tests/middle-novel-authoring-flow.test.ts`
- Create: `tests/authoring-golden-path.test.ts`

**Interfaces:** 示例项目必须有 14 个可打开章节、每章有目标和结尾钩子、进度文件与磁盘一致；端到端测试使用确定性 Provider 验证“章节计划 → Workflow 等待审核 → 审核通过写回 → Memory 候选 → 下一章”的顺序。

- [ ] **Step 1: Add chapter plan and progress fixture**

保持既有第一章正文；为第 2–14 章创建有明确计划的 Markdown 草稿，正文可先为空但不得伪装为已审核成稿，状态为 `planned`。

- [ ] **Step 2: Run deterministic golden path**

Run: `pnpm vitest run tests/authoring-golden-path.test.ts tests/middle-novel-authoring-flow.test.ts`

Expected: PASS；审核前没有正文写回，审核后只写当前章节，Canon 仍为候选。

- [ ] **Step 3: Run project-wide verification**

Run: `pnpm typecheck && pnpm test -- --exclude tests/fixture-verifier.test.ts && npm run build && git diff --check`

Expected: 新增功能通过；已知 fixture-verifier 基线超时单独记录，不把它误报为本功能失败。

