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

- [x] Write a source contract test asserting all ten Story Bible entries map to a `StorySection`, Story Bible renders the active section title, and its shell uses a full-height overflow layout.
- [x] Run the navigation contract test; it passes against the implemented navigation/layout boundary.
- [x] Use the existing `StorySection` union as the single App state value; pass it to Story Bible and reset it when a chapter/workflow/illustration destination opens.
- [x] Set `.story-bible-shell`, `.story-section-panel`, and `.story-bible-layout` to fill the center stack with `min-height: 0`; put overflow on the list/panel content rather than the outer shell.
- [x] When the section changes, reset the entity kind and selected form state; render Timeline and non-entity sections inside the same full-height panel.
- [x] Add active styling to the matching left navigation entry and matching Story Bible entity tab.
- [x] Run typecheck and the full test suite; all current tests pass.

### Task 2: Reusable Little Cow project seed

**Files:**
- Create: `src/shared/mock-story.ts`
- Modify: `src/main/services/project-service.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/components/Welcome.tsx`
- Test: `tests/mock-story.test.ts`

- [x] Add an integration regression test that creates a project and verifies three ordered `chapters/*.md`, Little Cow entities, YAML source files, and timeline records.
- [x] Add immutable seed data in `src/shared/mock-story.ts` for three short Chinese chapters plus character/place/org/item entities and timeline events.
- [x] Add `ProjectService.seedMockStory()` that removes only existing chapter Markdown and Story Bible records/files, then writes the seed through the existing validated main-process boundary.
- [x] Call the seed during first-time project creation; keep `open()` non-destructive.
- [x] Add a typed `project.seedMockStory` IPC action for the current open project and expose explicit Welcome/utility actions.
- [x] Run the focused seed test and typecheck; both pass.

### Task 3: Current project reseed and UI verification

**Files:**
- Modify: `tests/golden-path.test.ts`
- Modify: `docs/hardening-report.md`

- [x] Add a regression test proving reseed removes old chapter/entity records without touching workflow and asset paths.
- [ ] Invoke the explicit reseed action for the currently opened project and verify the three chapters, Bible entries, and timeline appear after reload.
- [ ] Manually verify chapter click returns to the editor, each Story Bible section fills the center viewport, the selected left entry and middle tab highlight together, and bottom/right tabs remain usable.
- [ ] Run `pnpm typecheck`, `pnpm test`, and `npm run build`.
