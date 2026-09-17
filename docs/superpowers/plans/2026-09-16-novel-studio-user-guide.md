# Novel Studio 中篇小说操作文档计划

> **For agentic workers:** 本计划用于生成一份带真实 IDE 截图的中文操作手册。每一步都必须能在当前工作区复现，并在交付前完成截图、链接和内容核验。

**Goal:** 生成 `docs/雾港来信-Novel-Studio完整操作手册.md`，让作者能够从新建项目开始，在 Novel Studio 中完成《雾港来信》的配置、逐章创作、人工审核、Canon 处理、全稿修订和导出。

**Architecture:** 以当前 `demo/雾港来信` 和 Novel Studio renderer 的实际 UI 为权威。使用稳定 Electron + CDP 建立一个临时演示项目，截取欢迎页、向导、Provider、工作台、创作流程、工作流运行和审阅门禁等真实界面；图片放在 `docs/assets/novel-studio-guide/`，Markdown 用相对路径引用，并在每个截图下说明操作和预期状态。

**Tech Stack:** Electron、Vite、React、CDP、PNG、Markdown。

## Global Constraints

- 截图必须来自当前 Novel Studio 真实界面，不使用占位图或纯文字示意图。
- 文档必须从“创建新项目”开始，覆盖每个配置字段、对话提示词、审核门禁和导出步骤。
- 不在截图、文档或日志中保存真实 API Key；Provider 示例只能使用占位值。
- 不修改或覆盖用户已有项目；演示过程使用临时目录或现有 demo 的副本。
- 正文 Markdown 是 source of truth；AI 草稿必须人工审核后写回。

---

### Task 1: 盘点运行入口和截图状态

**Files:**
- Read: `src/renderer/src/components/AuthoringWizard.tsx`
- Read: `src/renderer/src/components/ProviderSettings.tsx`
- Read: `src/renderer/src/components/AuthoringFlow.tsx`
- Read: `src/renderer/src/components/RightPanel.tsx`
- Read: `src/renderer/src/components/Sidebar.tsx`
- Read: `scripts/dev-stable.mjs`

- [x] 确认稳定 Electron 能启动并能通过 CDP 访问页面。
- [x] 列出文档需要截图的界面状态，并为每张图指定唯一文件名。

### Task 2: 建立可重复的临时演示状态并截取真实界面

**Files:**
- Create: `docs/assets/novel-studio-guide/*.png`
- Optional Create: `scripts/capture-guide-screenshots.mjs`

- [x] 截取欢迎页和新建项目向导，覆盖所有向导字段。
- [x] 截取初始化后的工作台、Provider 设置和已配置状态。
- [x] 截取 Story Bible、创作流程总览、章节计划和 Workflow 标签。
- [x] 截取 Human Review、Diff/写回门禁、Canon Review、全稿修订和导出门禁。
- [x] 检查所有 PNG 可读、非空，并且没有 API Key 或秘密值。

### Task 3: 编写中文操作手册

**Files:**
- Create: `docs/雾港来信-Novel-Studio完整操作手册.md`

- [x] 说明前置条件、启动命令和 Electron uninstall 的处理方式。
- [x] 按截图顺序写出“在哪里、填什么、输入什么提示词、看到什么结果”。
- [x] 给出《雾港来信》的具体示例数据：都市悬疑、Premise、3–5 万字、3 幕 14 章。
- [x] 给出逐章重复模板，解释 Context → 规划 → 写作 → 三类审阅 → 合并 → 重写 → Human Review → 写回 → Memory。
- [x] 明确 Reject、Approve/Edit、Canon 应用、全书检查和导出的门禁行为。

### Task 4: 验证交付物

- [x] 用 `rg` 检查文档包含所有截图引用、关键 UI 文案和提示词。
- [x] 用脚本检查每个相对图片链接存在且 PNG 文件大小大于 0。
- [x] 运行 `git diff --check`，确认没有空格错误。
- [x] 不把用户已有修改误列入本任务交付范围。
