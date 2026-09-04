# Story Bible Layout and Mock Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Story Bible destination usable at full height, keep navigation highlights synchronized, and seed the current/new project with a three-chapter Little Cow mock story.

**Architecture:** Keep one `StorySection` value as the renderer navigation source of truth. Story Bible entity views and timeline views occupy the same flex/grid area as Workflow, with their own overflow containers. Put mock project content behind a reusable `ProjectService` seed method used by both project creation and an explicit current-project reseed action.

**Tech Stack:** Electron + React + TypeScript, Zustand, node:sqlite, YAML, Vitest, CSS.

## Global Constraints

- Markdown files remain the canonical chapter source; SQLite remains index/state.
- Renderer accesses project data only through the preload typed IPC bridge.
- Reseeding affects only `chapters/` and Story Bible tables/YAML, never project configuration, workflows, prompts, or assets.
- Every schema change requires a migration and fixture; this change requires no schema change.
- Verification must pass `pnpm typecheck` and `pnpm test`.

### Task 1: Full-height Story Bible navigation

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/components/StoryBible.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Test: `tests/navigation-contract.test.ts`

- [ ] Write a source contract test asserting all ten Story Bible entries map to a `StorySection`, Story Bible renders the active section title, and its shell uses a full-height overflow layout.
- [ ] Run `pnpm test -- tests/navigation-contract.test.ts`; expect the new assertions to fail before implementation.
- [ ] Use the existing `StorySection` union as the single App state value; pass it to Story Bible and reset it when a chapter/workflow/illustration destination opens.
- [ ] Set `.story-bible-shell`, `.story-section-panel`, and `.story-bible-layout` to fill the center stack with `min-height: 0`; put overflow on the list/panel content rather than the outer shell.
- [ ] When the section changes, reset the entity kind and selected form state; render Timeline and non-entity sections inside the same full-height panel.
- [ ] Add active styling to the matching left navigation entry and matching Story Bible entity tab.
- [ ] Run `pnpm typecheck` and `pnpm test`; expect all tests to pass.

### Task 2: Reusable Little Cow project seed

**Files:**
- Create: `src/shared/mock-story.ts`
- Modify: `src/main/services/project-service.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/components/Welcome.tsx`
- Test: `tests/mock-story.test.ts`

- [ ] Write a failing integration test that creates a project and verifies three ordered `chapters/*.md`, Little Cow entities, YAML source files, and timeline records.
- [ ] Add immutable seed data in `src/shared/mock-story.ts` for three short Chinese chapters plus character/place/org/item entities and timeline events.
- [ ] Add `ProjectService.seedMockStory()` that removes only existing chapter Markdown and Story Bible records/files, then writes the seed through the existing Chapter/Story service boundaries or equivalent validated main-process operations.
- [ ] Call the seed during first-time project creation; keep `open()` non-destructive.
- [ ] Add a typed `project.seedMockStory` IPC action for the current open project and expose a Welcome/utility action that invokes it only when explicitly requested.
- [ ] Run the focused test, then `pnpm typecheck` and `pnpm test`.

### Task 3: Current project reseed and UI verification

**Files:**
- Modify: `tests/golden-path.test.ts`
- Modify: `docs/hardening-report.md`

- [ ] Add a regression test proving reseed removes old chapter/entity records without touching workflow and asset paths.
- [ ] Invoke the explicit reseed action for the currently opened project and verify the three chapters, Bible entries, and timeline appear after reload.
- [ ] Manually verify chapter click returns to the editor, each Story Bible section fills the center viewport, the selected left entry and middle tab highlight together, and bottom/right tabs remain usable.
- [ ] Run `pnpm typecheck`, `pnpm test`, and `npm run build`.

