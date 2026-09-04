# Project Integrity Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Main-owned 完整性检查与索引修复能力接入真实工作台，让用户能查看问题、修复结果和仍待处理的风险。

**Architecture:** 复用现有 `ProjectService.checkIntegrity()` 与 `repairIndexes()`，不新增数据库写入协议。顶部 Shell 通过独立的 `ProjectHealthPanel` 调用 typed preload IPC；每次检查/修复后重新读取项目状态并以状态消息展示结果，修复不触碰正文、Canon、Revision 或 Workflow 历史。

**Tech Stack:** Electron Main、React、TypeScript、typed `contextBridge` IPC、Zod、现有 CSS。

## Global Constraints

- Renderer 不直接访问 Node.js fs、SQLite、网络或 secret。
- SQLite 只作为可重建索引/状态/审计层，Markdown/YAML/JSON/图片仍是内容源。
- 破坏性操作必须可回退、可审计；本切片只执行索引修复，不修改正文和 Canon。
- 不运行 `test` 或 `build`；使用 `npm run typecheck`、runtime smoke、UI contract、`git diff --check`。

### Task 1: Define the health panel contract

**Files:**
- Modify: `src/renderer/src/components/ProjectHealthPanel.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Modify: `scripts/verify-ui-contract.mjs`

**Interfaces:**
- Consumes: `window.novelAPI.project.checkIntegrity(): Promise<Result<ProjectIntegrity>>` and `repairIndexes(): Promise<Result<ProjectRepairResult>>`.
- Produces: `ProjectHealthPanel` with visible loading, healthy, warning, failed, and repaired states.

- [ ] **Step 1: Add the component with explicit state transitions.**
  Render a top-level status button, a modal/panel, all count fields, warnings, missing files, invalid Story Bible count, and a repair action. On every thrown or failed IPC result, clear `busy` and show the error.

- [ ] **Step 2: Mount the panel in the application shell.**
  Add `healthOpen` state in `App.tsx`, mount the button beside Checkpoint/Backup, and pass the current `ProjectInfo` only for display; all data reads remain inside the panel through preload.

- [ ] **Step 3: Add focused styles.**
  Use existing dark panel tokens and status colors; do not add inline styles or new dependencies.

- [ ] **Step 4: Extend the static UI contract.**
  Assert that the panel exposes integrity counts, missing-file warnings, repair action, and failure feedback.

### Task 2: Add runtime acceptance evidence

**Files:**
- Modify: `scripts/verify-runtime.mjs`
- Modify: `docs/blueprint-audit-2026-09-02.md`

**Interfaces:**
- Consumes: existing `ProjectService` integrity/repair methods.
- Produces: `report.integrityPanel` evidence showing warning detection, restored source reporting, and clean re-check.

- [ ] **Step 1: Exercise broken-project before repair.**
  Record missing source files and index mismatch from `checkIntegrity()`.

- [ ] **Step 2: Repair and re-check.**
  Record `restoredSources`, counts, and absence of the original warnings; fail the smoke script if any invariant is false.

- [ ] **Step 3: Update the chapter matrix.**
  Mark UI visibility as implemented while retaining real Electron E2E as a separate unverified gate.

### Task 3: Verify without test/build

**Files:**
- No source changes.

- [ ] **Step 1:** Run `npm run typecheck`.
- [ ] **Step 2:** Run `node scripts/verify-runtime.mjs`.
- [ ] **Step 3:** Run `node scripts/verify-ui-contract.mjs`.
- [ ] **Step 4:** Run `git diff --check`.
- [ ] **Step 5:** Inspect the diff and leave changes uncommitted per user instruction.
