# 中篇小说从零创作流程实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建可直接打开的《雾港来信》示例项目、专属章节创作 Workflow、Prompt Pack 和第一章闭环验收，让作者可以从 premise 开始逐章写到终稿。

**Architecture:** 使用独立的 `demo/雾港来信/` 作为内容项目，不改变现有 `demo/潮汐灯塔` 和应用默认行为。全书阶段保存在 Markdown/YAML 项目资料中；逐章 AI 协作使用一个仅由现有已注册节点组成的 `.novelflow.json`，在 `human.review` 后才允许 `chapter.write`。

**Tech Stack:** Markdown、YAML、JSON、TypeScript、Vitest、Novel Studio `workflowSchema`、`validateWorkflow`、`WorkflowService`。

## Global Constraints

- 正文 Markdown 是 source of truth；SQLite 只保存索引、运行记录和修订证据。
- AI 生成内容必须经过人工审核后才写回章节。
- Workflow 只能使用现有已注册节点类型。
- 新项目必须独立于现有 demo，不覆盖用户当前工作区修改。
- 不提交 `.novel/project.db`、缓存、日志或生成图片二进制。
- 保留中文 `language: zh-CN`、3–5 万字目标、3 幕 14 章结构。

---

### Task 1: 为小说项目和 Workflow 建立失败验收测试

**Files:**
- Create: `tests/middle-novel-authoring-flow.test.ts`
- Read: `src/shared/workflow.ts`
- Read: `src/main/services/workflow-validation.ts`

**Interfaces:** 测试读取 `demo/雾港来信/`，使用 `workflowSchema.parse` 和 `validateWorkflow`；后续任务必须提供测试所需的确切文件、路径和数量。

- [ ] **Step 1: Write the failing test**

测试必须覆盖三项行为：项目存在 `novel.yaml`、`story/premise.md`、含“第十四章”的大纲、4 个角色、3 个世界实体和 1 个章节；Workflow ID 为 `flow_middle_novel_authoring` 且 `validateWorkflow` 返回空数组；Workflow 同时包含 `human.review` 与 `chapter.write`，并存在从 review 到 write 的边。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/middle-novel-authoring-flow.test.ts`

Expected: FAIL because `demo/雾港来信/` and its workflow do not exist yet.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/middle-novel-authoring-flow.test.ts
git commit -m "test: define middle novel authoring fixture"
```

### Task 2: 创建《雾港来信》的项目资料和第一章

**Files:**
- Create: `demo/雾港来信/novel.yaml`
- Create: `demo/雾港来信/DIRECTORY.md`
- Create: `demo/雾港来信/README.md`
- Create: `demo/雾港来信/story/{premise,outline,volumes,timeline,artifacts,relations}`
- Create: `demo/雾港来信/characters/{lin-lan,gu-shen,zhou-ye,lin-cheng}.yaml`
- Create: `demo/雾港来信/world/{wu-gang,repair-shop,old-accident-site}.yaml`
- Create: `demo/雾港来信/chapters/001-录音里的求救声.md`
- Create: `demo/雾港来信/chapters/001-录音里的求救声.scenes.yaml`

**Interfaces:** 产出 Task 1 读取的完整 fixture；`novel.yaml.defaultWorkflow` 必须指向 `flow_middle_novel_authoring`。

- [ ] **Step 1: Add the project manifest and directory guide**

`novel.yaml` 使用 `projectId: proj_mist_harbor_letter`、`title: 雾港来信`、`language: zh-CN`、`schemaVersion: 1`、`defaultWorkflow: flow_middle_novel_authoring`、`providerProfile: null`，并声明潮湿旧城与磁带噪声的视觉方向。`DIRECTORY.md` 说明各目录用途，并说明 `.novel/` 是生成数据。

- [ ] **Step 2: Add the premise and outline**

`story/premise.md` 定义林岚、十五年前的录音、中心谜团、代价、主题、叙事视角、目标篇幅和禁写事项。`story/outline.md` 写出 3 幕且恰好 14 个编号章节，每章有目标、冲突、转折和结尾钩子；第 1 章结尾固定为录音说出“别让他们找到灯塔下的第二个门”。

- [ ] **Step 3: Add Story Bible entities and Canon sources**

创建 4 个角色和 3 个世界实体 YAML，包含稳定 ID、目标、恐惧、秘密和关系。`timeline.yaml` 至少包含录音寄达事件；`artifacts.yaml` 至少包含“第二个门”伏笔；引用统一使用 `chapters/001-录音里的求救声.md`。

- [ ] **Step 4: Write the first chapter and scene sidecar**

第一章写 1,500–2,500 个中文字符：建立修复店、匿名包裹、损坏磁带、父亲失踪的矛盾和最终音频钩子，但不揭示中心谜团。sidecar 定义 `scene_001`、地点、参与者和时间。

- [ ] **Step 5: Run the fixture test**

Run: `pnpm vitest run tests/middle-novel-authoring-flow.test.ts`

Expected: 项目资料断言通过；Workflow 断言在 Task 3 前仍失败。

- [ ] **Step 6: Commit project content**

```bash
git add demo/雾港来信
git commit -m "feat: add mist harbor letter novel foundation"
```

### Task 3: 创建专属章节创作 Workflow 和 Prompt Pack

**Files:**
- Create: `demo/雾港来信/workflows/flow_middle_novel_authoring.novelflow.json`
- Create: `demo/雾港来信/prompts/agent-{plot-planner,writer,character-critic,logic-critic,style-critic,rewrite,memory-extractor}.md`

**Interfaces:** Workflow ID 为 `flow_middle_novel_authoring`；只使用 `input.chapter`、`context.load`、`ai.prompt`、`ai.critic`、`logic.merge`、`human.review`、`chapter.write`、`memory.extract`；Agent ID 使用 `plot-planner`、`writer`、`character-critic`、`logic-critic`、`style-critic`、`rewrite`。

- [ ] **Step 1: Write the workflow JSON**

连接：`chapter-input → context → plan → write`；`write` 并行连接三类 critic；三类 critic 分别连接 merge 的 `character`、`logic`、`style` 端口；然后连接 `critic-merge → rewrite → review → chapter-write → memory`。每个 ID 唯一，schemaVersion 为 1，cyclePolicy 为 reject，所有必需输入有边。

- [ ] **Step 2: Add project-level prompts**

每个 Prompt 明确角色、输入上下文、输出契约和边界。writer 必须使用中文、以林岚为中心的第三人称限知视角、具体感官细节，不擅自解决主谜团；memory-extractor 只能输出候选事实，不能直接写入 Canon。

- [ ] **Step 3: Run the workflow validation test**

Run: `pnpm vitest run tests/middle-novel-authoring-flow.test.ts`

Expected: 所有 fixture 和 Workflow 断言通过，`validateWorkflow(workflow)` 等于 `[]`。

- [ ] **Step 4: Commit workflow and prompts**

```bash
git add demo/雾港来信/workflows demo/雾港来信/prompts
git commit -m "feat: add middle novel chapter workflow"
```

### Task 4: 增加第一章闭环运行验收

**Files:**
- Modify: `tests/middle-novel-authoring-flow.test.ts`
- Read: `tests/workflow-runtime.test.ts`
- Read: `src/main/services/workflow-runtime.ts`

**Interfaces:** 使用确定性 executor 验证章节流程顺序，不需要真实 Provider 或 API key；验证 `chapter.write` 的上游是 `human.review`，`memory.extract` 的上游是 `chapter.write`。

- [ ] **Step 1: Add the runtime-order assertion**

读取 Workflow 节点类型并断言包含 `context.load`、`ai.prompt`、`ai.critic`、`logic.merge`、`human.review`、`chapter.write`、`memory.extract`；断言 review→write 和 write→memory 的边存在。

- [ ] **Step 2: Run the focused test**

Run: `pnpm vitest run tests/middle-novel-authoring-flow.test.ts`

Expected: PASS；失败时修正 fixture，不削弱断言。

- [ ] **Step 3: Commit the runtime acceptance test**

```bash
git add tests/middle-novel-authoring-flow.test.ts
git commit -m "test: verify chapter authoring gate"
```

### Task 5: 运行完整验证并写明作者用法

**Files:**
- Modify: `demo/雾港来信/README.md`
- Read: `README.md`
- Read: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Document the user path**

README 必须说明：打开项目 → 配置 Provider → 打开 Workflow → 选择章节 → 运行到 Human Review → 查看 Diff → 接受/拒绝 → 检查 Canon → 进入下一章；并说明可以从第 1 章开始重复该闭环。

- [ ] **Step 2: Run focused validation**

Run: `pnpm vitest run tests/middle-novel-authoring-flow.test.ts`

Expected: PASS。

- [ ] **Step 3: Run project checks**

Run: `pnpm typecheck`

Expected: exit code 0。

Run: `pnpm test`

Expected: 全部现有和新增测试通过。

Run: `pnpm build`

Expected: main、preload、renderer 构建成功。

- [ ] **Step 4: Review only the intended diff**

Run: `git status --short` and `git diff --check`。

Expected: 只出现本任务新增的规格、计划、fixture、Prompt 和测试；用户原有修改保持不变。

- [ ] **Step 5: Commit documentation**

```bash
git add demo/雾港来信/README.md
git commit -m "docs: explain middle novel writing workflow"
```

