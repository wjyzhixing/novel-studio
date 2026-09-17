# Graph Entity Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a selected Graph entity inspectable and provide direct navigation through its adjacent relations without changing the persisted Story data.

**Architecture:** Reuse the existing `selectedEntity`, `relations`, and `entities` state in `GraphStudio`. Add a small pure helper for adjacent relation projection, render the selected entity as an inspector section above the existing relation editor, and use existing neighborhood focus state for exploration. No new IPC or database schema is needed.

**Tech Stack:** React, TypeScript, `@xyflow/react`, Vitest, CSS.

## Global Constraints

- Graph remains a read-only exploration surface until the existing relation form is explicitly saved.
- Renderer accesses Story data only through the existing typed preload API.
- Entity and relation IDs remain stable; no source files or SQLite rows are mutated by inspection.
- All new UI text uses existing or new `i18n` keys for `zh-CN` and `en-US`.

---

### Task 1: Add the adjacent relation projection

**Files:**
- Create: `src/renderer/src/lib/graph-inspector.ts`
- Test: `tests/graph-inspector.test.ts`

**Interfaces:**
- Consumes: `StoryEntity[]`, `StoryRelation[]`, selected entity ID.
- Produces: `GraphAdjacentRelation[]` containing relation ID, neighbor entity, direction, and relation type.

- [ ] **Step 1: Write the failing test** for both incoming and outgoing relations and unknown endpoints.
- [ ] **Step 2: Run `npm test -- --run tests/graph-inspector.test.ts` and verify it fails because the helper does not exist.**
- [ ] **Step 3: Implement a pure, bounded projection that ignores relations with missing endpoints.**
- [ ] **Step 4: Run the focused test and verify it passes.**

### Task 2: Render selected entity inspection and exploration controls

**Files:**
- Modify: `src/renderer/src/components/GraphStudio.tsx`
- Modify: `src/renderer/src/styles/graph.css`
- Modify: `src/renderer/src/lib/i18n.ts`
- Test: `tests/graph-inspector-ui.test.ts`

**Interfaces:**
- Consumes: `getAdjacentRelations()` from Task 1 and existing `selectedEntity` state.
- Produces: a visible `data-testid="graph-entity-inspector"` section with entity name, kind, aliases, notes, relation neighbors, and buttons to select/focus a neighbor.

- [ ] **Step 1: Add a source-level failing contract for the inspector, adjacent relation labels, and locale keys.**
- [ ] **Step 2: Run the focused UI contract and verify it fails.**
- [ ] **Step 3: Add the inspector above the relation editor; keep the relation editor unchanged for relation selection and persistence.**
- [ ] **Step 4: Add wrapping, overflow, hover, focus, and empty-state styles consistent with the existing dark IDE panels.**
- [ ] **Step 5: Run the focused UI contract and verify it passes.**

### Task 3: Verify the Graph slice

**Files:**
- Modify: `docs/blueprint-audit-2026-09-02.md`
- Modify: `docs/development-process.md`

- [ ] **Step 1: Run `npm test -- --run tests/graph-inspector.test.ts tests/graph-inspector-ui.test.ts tests/graph-neighborhood.test.ts`.**
- [ ] **Step 2: Run `npm run typecheck`, `npm run build`, `node scripts/verify-ui-contract.mjs`, and `git diff --check`.**
- [ ] **Step 3: Record the implemented slice and explicitly retain real Electron/low-end performance verification as pending.**
