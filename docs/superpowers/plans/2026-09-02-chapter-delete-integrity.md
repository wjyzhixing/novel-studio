# Chapter Delete Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chapter deletion reconcile Markdown, SQLite indexes, Notes, Timeline references, and audit evidence without deleting Canon or workflow history.

**Architecture:** Keep Markdown/YAML as content sources and SQLite as rebuildable index/state. Route deletion through Main `ChapterService`; use existing `RevisionService` for reversible evidence and existing typed preload IPC for UI feedback. Timeline references are detached rather than deleting events.

**Tech Stack:** Electron Main, TypeScript, React/Zustand, SQLite (`node:sqlite`), YAML, runtime smoke scripts.

## Global Constraints

- Do not run `test` or `build`.
- Never write API keys or secrets to source, fixtures, logs, reports, or runtime output.
- Renderer must access deletion only through preload IPC.
- Preserve Canon facts, Story Bible entities/relations, image assets, and Workflow history.
- Use atomic file writes and `Result<T>` error handling at the IPC boundary.

---

### Task 1: Lock the deletion contract in the runtime seam

**Files:** `scripts/verify-runtime.mjs`; inspect `src/main/services/chapter-service.ts`, `src/main/services/story-service.ts`, `src/main/services/revision-service.ts`.

- [x] Add a temporary chapter with a note and a Timeline event, call `chapters.remove()`, then assert: file removed, Timeline detached, no dangling chapter reference, note removed, `chapter-delete:<relPath>` Revision captured, and facts preserved.
- [x] Run `node scripts/verify-runtime.mjs` and observe the expected failure before changing production code.
- [x] Implement the smallest Main-process behavior in `ChapterService.remove()`: read/validate first; create the deletion Revision; delete the file, document/FTS row, and chapter note; set matching Timeline `chapter_rel_path` values to `NULL`; atomically serialize `story/timeline.yaml`.
- [x] Re-run `node scripts/verify-runtime.mjs`; all `report.chapterDelete` fields are true and exit code 0.
- [x] Timeline serialization is kept local to the chapter deletion path because existing StoryService save serialization has a different dependency boundary.

### Task 2: Expose complete deletion feedback in the Renderer

**Files:** `src/renderer/src/components/Sidebar.tsx`; `src/renderer/src/store/app-store.ts` only if Sidebar cannot surface the existing notice.

- [x] Confirm the callback awaits `window.novelAPI.chapter.remove(relPath)`, checks `result.ok`, and refreshes state.
- [x] On success call `setNotice('章节已删除，Timeline 引用已解除')`; on failure call `setNotice(...)` with the sanitized error message.
- [x] If the deleted chapter is active, clear the editor state through the existing store action.
- [x] Run `npm run typecheck`; exit code 0.

### Task 3: Full allowed verification and audit update

**Files:** `docs/blueprint-audit-2026-09-02.md`; `scripts/verify-runtime.mjs` only for clearer final report output.

- [x] Run `npm run typecheck`, `git diff --check`, `node --check scripts/verify-runtime.mjs`, `node scripts/verify-runtime.mjs --long`, `node scripts/generate-fixtures.mjs /tmp/novel-studio-fixtures-audit`, `node scripts/verify-fixtures.mjs /tmp/novel-studio-fixtures-audit`, and `node scripts/release-preflight.mjs`.
- [x] Record chapter-delete evidence under blueprint chapters 6, 8, 16, 18, 20, and 29; keep UI/E2E, RAG, plugin, and release gaps explicitly incomplete.
- [x] Run `git status --short` and inspect only intended files. Do not clean or reset the user’s untracked worktree.

### Task 4: Reconcile references when chapters move

**Files:** `src/main/services/chapter-service.ts`; `scripts/verify-runtime.mjs`; `docs/blueprint-audit-2026-09-02.md`.

- [x] Add a red runtime assertion proving that moving a chapter leaves Timeline, Notes, Revision, and Workflow Run paths stale.
- [x] Implement `remapPathReferences()` after collision-safe file renames; migrate Timeline, Notes, Revision, AI Suggestion, Workflow Run, and Context summary references in a SQLite transaction, then atomically rewrite Timeline and Revision sidecars.
- [x] Run `npm run typecheck`, `node scripts/verify-runtime.mjs --long`, and `git diff --check`; all passed, including `chapterMove.pathChanged`, `timelineRemapped`, `notesRemapped`, `revisionRemapped`, and `workflowRemapped`.

### Task 5: Reconcile stale Provider profile selection

**Files:** `src/main/services/project-service.ts`; `scripts/verify-runtime.mjs`; `docs/blueprint-audit-2026-09-02.md`.

- [x] Add a red runtime assertion for a project whose manifest points to `profile_missing` while its profile store is empty.
- [x] On project open, keep a valid configured profile, otherwise persist `providerProfile: null` when no fallback exists; this makes Renderer Chat/Workflow show the unconfigured state instead of sending a stale ID.
- [x] Run `npm run typecheck`, `node scripts/verify-runtime.mjs --long`, and `git diff --check`; `providerProfileReconciliation.staleProfileCleared` is true.

### Task 6: Surface store notices in the workbench shell

**Files:** `src/renderer/src/App.tsx`; `src/renderer/src/store/app-store.ts`.

- [x] Trace the delete result from `chapter.remove()` through Zustand `notice` and identify that App did not render the store field.
- [x] Render the store notice in the top status banner alongside action notices, with one dismiss action; clear stale notices when closing a project.
- [x] Run `npm run typecheck` and `git diff --check`; both passed.

### Task 7: Add a static UI contract gate

**Files:** `scripts/verify-ui-contract.mjs`; `docs/blueprint-audit-2026-09-02.md`.

- [x] Check workspace mounting, typed preload namespaces, editor selection propagation, Suggestion gates, Workflow pause/resume/retry, Illustration actions, separate Provider image credentials, global notices, Renderer privilege boundaries, and absence of implicit mock profiles.
- [x] Run `node --check scripts/verify-ui-contract.mjs` and `node scripts/verify-ui-contract.mjs`; all checks pass. The script explicitly reports that it is static and does not replace component/E2E execution.
