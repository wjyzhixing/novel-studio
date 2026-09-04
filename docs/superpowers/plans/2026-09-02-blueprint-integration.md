# Novel Studio Blueprint Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按《Novel-Studio-完整开发蓝图-v1.0》逐步打通本地项目、编辑器、Canon、Workflow、插图和可恢复数据流。

**Architecture:** Markdown/YAML/图片是项目内容源，SQLite 保存索引、结构化状态和审计；Renderer 只通过 typed preload IPC 访问 Main。Workflow Runtime 独立于 React Flow，并通过持久化 run/node state 关联 Proposal、Asset 和 Revision。

**Tech Stack:** Electron 38, React 19, TypeScript 5.9, Tiptap, React Flow, SQLite (`node:sqlite`), Zod, Zustand。

## Global Constraints

- 不运行 `test` 和 `build`；每个阶段只运行 `npm run typecheck` 与 `git diff --check`。
- API Key 只进入 safeStorage，不写入项目文件、源码或日志。
- Markdown 是正文权威来源；SQLite 是可重建索引与结构化状态层。
- AI 只能生成 Suggestion/Proposal，不能无确认修改正文或 Canon。
- 图片生成不自动插入正文；插入必须保留稳定 Asset ID 并创建 Revision。

---

### Task 1: P0 操作反馈和 Streaming 错误一致性

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/renderer/src/components/IllustrationStudio.tsx`
- Modify: `src/renderer/src/components/StoryBible.tsx`

**Interfaces:**
- Consumes: existing `Result<T, AppError>` IPC envelope.
- Produces: every async user action renders success/failure status; stream errors use the caller's job ID.

- [ ] 修正 stream catch 分支使用 `v.jobId`，并让图片/Story 操作统一处理失败结果。
- [ ] 运行 `npm run typecheck` 和 `git diff --check`。

### Task 2: P0 图片资产和 Markdown 回载闭环

**Files:**
- Modify: `src/main/services/image-service.ts`
- Modify: `src/renderer/src/lib/markdown.ts`
- Modify: `src/renderer/src/components/EditorPane.tsx`
- Modify: `src/renderer/src/components/IllustrationStudio.tsx`
- Test only if explicitly authorized: `tests/image-service.test.ts`, `tests/golden-path.test.ts`

**Interfaces:**
- Consumes: `ImageApiContract`, `asset_[id]` references.
- Produces: preview, insert, delete, reload work across renderer remounts and stale/orphaned files are reported.

- [ ] 统一 Markdown 图片解析为 Asset ID 优先，兼容旧的 title/no-title 引用。
- [ ] 处理非 PNG MIME、Provider 空结果和重复资产写入。
- [ ] 删除前移除所有引用并显示可恢复/不可恢复状态。
- [ ] 运行 typecheck/diff 校验。

### Task 3: P0 Workflow Context 传递

**Files:**
- Modify: `src/main/services/workflow-runtime-service.ts`
- Modify: `src/main/services/workflow-runtime.ts`
- Modify: `src/shared/runtime.ts`

**Interfaces:**
- Consumes: upstream node outputs and `ContextResult`.
- Produces: every AI node receives an explicit context envelope plus its immediate input.

- [ ] 定义统一 node input envelope，保留 `value`、`context` 和上游 outputs。
- [ ] 让 Plan/Write/Critic/Merge/Rewrite 读取同一 Context manifest。
- [ ] 保持 Human pause/resume、cancel、retry 的状态语义不变。
- [ ] 运行 typecheck/diff 校验。

### Task 4: P1 Story Bible 生命周期

**Files:**
- Modify: `src/shared/story.ts`
- Modify: `src/main/services/database.ts`
- Modify: `src/main/services/story-service.ts`
- Modify: `src/renderer/src/components/StoryBible.tsx`
- Modify: `src/renderer/src/components/BottomPanel.tsx`

**Interfaces:**
- Consumes: `story_artifacts` and `timeline_events`.
- Produces: editable Timeline and Foreshadowing lifecycle `planned/planted/echoed/resolved/abandoned`.

### Task 5: P1 Workflow 产物索引与重启恢复

**Files:**
- Modify: `src/main/services/database.ts`
- Modify: `src/main/services/workflow-run-store.ts`
- Modify: `src/main/services/workflow-runtime-service.ts`
- Modify: `src/renderer/src/components/RightPanel.tsx`

**Interfaces:**
- Consumes: node execution results.
- Produces: run → node_run → proposal/asset/revision references and recovered run list.

### Task 6: P2 图片 Workflow 节点与数据库修复

**Files:**
- Modify: `src/shared/workflow.ts`
- Modify: `src/main/services/workflow-runtime-service.ts`
- Modify: `src/main/services/database.ts`
- Modify: `src/main/services/project-service.ts`

**Interfaces:**
- Consumes: Scene Proposal and selected Asset IDs.
- Produces: explicit `image.generate`, `image.select`, `image.insert` nodes plus integrity/rebuild operation.

### Task 7: Blueprint DoD 审计

**Files:**
- Modify only where a verified gap remains.
- Review: `Novel-Studio-完整开发蓝图-v1.0.docx`, all source and project fixtures.

- [ ] 逐项复核章节 1–35。
- [ ] 运行 `npm run typecheck`。
- [ ] 运行 `git diff --check`。
- [ ] 输出未完成项，不以局部通过替代全局完成声明。
