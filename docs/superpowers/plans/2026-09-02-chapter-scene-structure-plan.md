# 章节与场景结构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个章节建立可持久化、可校验、可回链的场景元数据，使后续 Context、Workflow 和插图都能使用稳定 `sceneId`。

**Architecture:** Markdown 仍是章节正文源文件；场景元数据写入章节同级 `.scenes.yaml` sidecar，SQLite 仅保存可重建索引。Main 的 ChapterSceneService 负责 schema、路径、原子写入和章节移动/删除回链，preload 暴露最小 typed API，Renderer 先提供场景列表和 CRUD 面板。

**Tech Stack:** Electron Main、React、TypeScript、Zod、YAML、SQLite、现有 typed IPC/Result 契约。

## Global Constraints

- 不运行 `test` 或 `build`；使用 `npm run typecheck`、静态 UI contract、runtime smoke 和 `git diff --check`。
- Markdown/YAML 为内容源；SQLite 只保存可重建索引、状态和审计。
- Renderer 不直接访问 fs、SQLite、网络或 secret。
- 场景 CRUD 不删除或静默修改正文、Canon、Revision、Workflow 历史。
- 路径必须限制在项目根和 `chapters/`，YAML schema 版本必须拒绝未来版本。

### Task 1: Shared scene contract and sidecar schema

**Files:**
- Create: `src/shared/scene.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc.ts`

**Interfaces:**
- `ChapterScene`, `SceneApiContract`, `sceneCreateInput`, `sceneUpdateInput`, `sceneReorderInput`。
- API: `list(chapterRelPath)`, `create(input)`, `update(input)`, `remove(chapterRelPath, sceneId)`, `reorder(chapterRelPath, sceneIds)`。

- [ ] **Step 1: Define the shared schema and typed channels.**
  - Use `schemaVersion: 1`, UUID-like `id`, chapter-relative `chapterRelPath`, non-empty title, integer paragraph bounds, summary max 20,000 chars, ISO timestamps.
  - Add the five channels to `IPC` and the `scene` namespace to the preload API without exposing `ipcRenderer`.
- [ ] **Step 2: Verify the contract statically.**
  - Add checks to `scripts/verify-ui-contract.mjs` for the namespace, sidecar extension and absence of renderer Node imports.
  - Run `npm run typecheck` and `node scripts/verify-ui-contract.mjs`.

### Task 2: Main scene service and persistence

**Files:**
- Create: `src/main/services/scene-service.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/services/project-service.ts`
- Modify: `src/main/services/chapter-service.ts`

**Interfaces:**
- `SceneService.list(chapterRelPath): Promise<ChapterScene[]>`
- `SceneService.create(input): Promise<ChapterScene>`
- `SceneService.update(input): Promise<ChapterScene>`
- `SceneService.remove(chapterRelPath, sceneId): Promise<null>`
- `SceneService.reorder(chapterRelPath, sceneIds): Promise<ChapterScene[]>`

- [ ] **Step 1: Add sidecar read/write helpers.**
  - Resolve only `chapters/<basename>.scenes.yaml`; reject `..`, non-chapter paths, and missing chapter files.
  - Read missing sidecars as an empty list; reject malformed or future-version YAML.
  - Write `{ schemaVersion: 1, scenes }` through `atomicWriteFile`.
- [ ] **Step 2: Implement validation and CRUD.**
  - Count Markdown paragraphs using the same stable split for every operation.
  - Enforce `startParagraph <= endParagraph` and `endParagraph < paragraphCount`; reject duplicate IDs and overlapping ranges only when the requested operation creates an invalid range.
  - Preserve all other scenes when updating or deleting; reorder only changes order values.
- [ ] **Step 3: Add SQLite derived index and repair integration.**
  - Add a migration/table for scene metadata keyed by `(chapter_rel_path, scene_id)` and rebuild it from sidecars during repair.
  - Make chapter move rename the sidecar and update index paths; make chapter delete remove sidecar/index rows without touching the Markdown revision.
- [ ] **Step 4: Wire IPC handlers and Result errors.**
  - Validate all payloads at the existing Main boundary and return existing `DomainError` codes.
  - Run `npm run typecheck` and `git diff --check`.

### Task 3: Renderer scene tree and CRUD feedback

**Files:**
- Create: `src/renderer/src/components/ScenePanel.tsx`
- Modify: `src/renderer/src/components/EditorPane.tsx`
- Modify: `src/renderer/src/store/app-store.ts`
- Modify: `src/renderer/src/styles/app.css`
- Modify: `scripts/verify-ui-contract.mjs`

**Interfaces:**
- Store state: `scenes`, `selectedSceneId`, `sceneMessage`, `loadScenes`, `createScene`, `updateScene`, `deleteScene`, `reorderScenes`。
- `ScenePanel` receives the active chapter path and reports selection without changing Markdown.

- [ ] **Step 1: Add loading and error state to the store.**
  - Reload scenes whenever `activeRelPath` changes; clear stale selection when the scene disappears.
  - Catch rejected IPC promises and display the error in the panel; always clear busy state in `finally`.
- [ ] **Step 2: Add the panel to the Writer workspace.**
  - Show ordered scenes, paragraph ranges, create/edit/delete controls and a selected state.
  - Require explicit confirmation for delete and show success/failure status.
- [ ] **Step 3: Verify static UI wiring.**
  - Confirm selected scene does not call `chapter.save`, and all scene actions use `window.novelAPI.scene`.
  - Run `node scripts/verify-ui-contract.mjs` and `npm run typecheck`.

### Task 4: Runtime smoke and audit documentation

**Files:**
- Modify: `scripts/verify-runtime.mjs`
- Modify: `docs/blueprint-audit-2026-09-02.md`
- Modify: `docs/development-process.md`

- [ ] **Step 1: Add non-test runtime invariants.**
  - Verify create/read/update/reorder/delete, reopen persistence, invalid bounds rejection, chapter move sidecar remap, chapter delete cleanup, and unchanged Markdown.
- [ ] **Step 2: Run allowed verification.**
  - Run `node scripts/verify-runtime.mjs --long`, `node scripts/verify-ui-contract.mjs`, `npm run typecheck`, and `git diff --check`; do not run test/build.
- [ ] **Step 3: Record evidence and remaining scope.**
  - Document that Workflow, Context, and Illustration consume `sceneId` only in a later slice; do not claim those integrations are complete from this plan.

