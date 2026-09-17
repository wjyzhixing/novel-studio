# Developer Diagnostics Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the metadata-only Developer Inspector with searchable node logs, a compact trace timeline, and a gzip diagnostics export without exposing prompts, outputs, secrets, or project files.

**Architecture:** Keep filtering and trace derivation in a Renderer-safe pure module. Keep diagnostics serialization, redaction, gzip compression, and destination sandbox checks Main-owned. Add a separate typed IPC operation so existing JSON export remains backward compatible.

**Tech Stack:** React, TypeScript, Electron IPC/preload, Node `node:zlib`, Vitest.

## Global Constraints

- Preserve all existing user changes and the metadata-only diagnostics boundary.
- Never include full workflow input/output, prompts, API keys, image data URLs, or project-root destinations in exports.
- UI remains dark IDE style and all new controls have labels, keyboard focus, hover, and pointer affordances.
- Do not claim real Electron visual acceptance while the native Electron binary is unavailable.

### Task 1: Pure trace and log filtering contract

**Files:**
- Create: `src/renderer/src/lib/developer-trace.ts`
- Test: `tests/developer-trace.test.ts`

- [x] Write tests for case-insensitive log filtering, empty-query behavior, stable node timeline ordering, and missing timestamps.
- [x] Run the focused test and confirm the trace/filter behavior passes against the implemented module.
- [x] Implement small pure functions `filterTraceLogs(log: string[], query: string): string[]` and `buildNodeTrace(nodes: NodeRun[]): NodeTraceEntry[]`.
- [x] Run the focused test and then refactor only while it remains green.

### Task 2: Compressed metadata export

**Files:**
- Modify: `src/main/services/diagnostics-service.ts`
- Modify: `src/shared/diagnostics.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/diagnostics-safety.test.ts`

- [x] Add a regression test proving gzip export writes a valid gzip JSON bundle outside the project root and retains the same redaction rules.
- [x] Run the focused diagnostics test against the implemented export path.
- [x] Add `exportCompressed(destination)` using `gzip` over the existing metadata-only bundle builder; keep path validation and atomic write semantics.
- [x] Expose the operation through typed diagnostics contract, IPC validation, and preload.
- [x] Run diagnostics tests and confirm JSON and gzip exports both pass.

### Task 3: Developer Inspector UI

**Files:**
- Modify: `src/renderer/src/components/DeveloperPanel.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Modify: `src/renderer/src/lib/i18n.ts`
- Test: `tests/developer-observability.test.ts`
- Test: `tests/developer-panel-i18n.test.ts`

- [x] Add source contracts for a log query input, filtered log rendering, trace timeline region, and compressed export action.
- [x] Run focused UI contracts against the implemented controls.
- [x] Add the controls with stable selectors, accessible labels, and status-preserving empty states; use the pure trace/filter helpers.
- [x] Add a compressed export action that reuses the existing destination picker and reports through the global notification surface.
- [x] Add IDE-style wrapping, scrolling, hover, and focus-visible styles for long logs and trace rows.
- [x] Run focused UI contracts and typecheck.

### Task 4: Audit and verification

**Files:**
- Modify: `docs/blueprint-audit-2026-09-02.md`
- Modify: `docs/development-process.md`

- [x] Record the slice, its security boundary, and remaining real Electron limitation.
- [x] Run `npm test`, `npm run typecheck`, `npm run build`, `node scripts/verify-runtime.mjs`, `node scripts/verify-ui-contract.mjs`, and `git diff --check` directly in the source checkout.
- [x] Report only claims supported by fresh command output.

> Evidence (2026-09-15): source checkout verification passed: `npm test` reported 145 files / 625 tests; `npm run typecheck`, `npm run build`, `node scripts/verify-runtime.mjs`, `node scripts/verify-ui-contract.mjs`, and `git diff --check` all exited 0. Build emitted only existing Rollup warnings about removable `@__PURE__` comments in Zod. Runtime smoke confirmed migrations through v20, metadata-only diagnostics, fixture cleanup, and security checks. Real Electron visual acceptance remains separate and is not claimed here.
