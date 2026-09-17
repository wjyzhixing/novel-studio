# Invalid Story Artifact Integrity Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make project integrity checks identify invalid Story Bible artifacts with stable IDs, types, titles, and validation details instead of exposing only an aggregate count.

**Architecture:** Main validates content-source Story Bible artifacts with the existing shared Zod schema and returns structured diagnostic records through the typed IPC result. The Renderer renders those records as diagnostic data in the existing project-health dialog; repair continues to preserve invalid source data and reports what was skipped.

**Tech Stack:** Electron, TypeScript, React, Zod, node:sqlite, Vitest.

## Global Constraints

- Markdown/YAML/JSON remain authoritative content sources; SQLite remains a rebuildable index.
- Invalid source data must not be silently rewritten or deleted during repair.
- Renderer accesses Main only through the existing typed preload contract.
- Keep user content, artifact IDs, titles, and validation details as data; translate only Renderer-owned labels.
- Use TDD: add a failing regression test before production changes, then run focused tests, typecheck, full tests, build, and `git diff --check`.

### Task 1: Structured invalid artifact diagnostics

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/services/project-service.ts`
- Test: `tests/project-service.test.ts`

**Interfaces:**
- Produces `ProjectIntegrity.invalidStoryArtifactDetails` and `ProjectRepairResult.invalidStoryArtifactDetails` as arrays of `{ id, kind, title, issues }`.
- `issues` contains stable human-readable Zod validation messages and does not include full source content.

- [ ] **Step 1: Write the failing test** asserting integrity and repair expose the invalid artifact identity and issue text while preserving the invalid source.
- [ ] **Step 2: Run `npm test -- --run tests/project-service.test.ts` and confirm the new assertion fails because detail arrays do not exist.
- [ ] **Step 3: Extend shared IPC types and collect structured details from `safeParse` issues in `checkIntegrity()` and `repairIndexes()`.
- [ ] **Step 4: Run the focused project-service tests and confirm they pass.

### Task 2: Project health diagnostic rendering

**Files:**
- Modify: `src/renderer/src/components/ProjectHealthPanel.tsx`
- Modify: `src/renderer/src/lib/i18n.ts`
- Test: `tests/project-health-accessibility.test.ts`

**Interfaces:**
- Consumes `invalidStoryArtifactDetails` from the typed integrity and repair results.
- Renders a compact invalid-artifact diagnostic section with artifact title/ID/type and issue messages.

- [ ] **Step 1: Add a static UI contract for the invalid-artifact diagnostic section and its translated labels.
- [ ] **Step 2: Run the focused health-panel tests and confirm the new contract fails.
- [ ] **Step 3: Add locale keys and render the diagnostic records without exposing full `fields_json` or other source payloads.
- [ ] **Step 4: Run the focused health-panel tests and typecheck.

### Task 3: Verification and audit record

**Files:**
- Modify: `docs/blueprint-audit-2026-09-02.md`

- [ ] **Step 1: Run `npm test -- --run --no-file-parallelism --maxWorkers=1`.
- [ ] **Step 2: Run `npm run build` and `git diff --check`.
- [ ] **Step 3: Append the next numbered blueprint slice with the exact verification results and remaining Electron/manual gaps.
