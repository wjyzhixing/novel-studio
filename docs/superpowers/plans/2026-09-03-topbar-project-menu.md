# Topbar Project Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move backup/index actions into the project menu and add an Agent-icon right-panel toggle beside the model button, hiding right-panel content when collapsed.

**Architecture:** Keep backup IPC behavior in `BackupActions`, expose a small controlled action interface for the project menu, and let `App` own menu/open/close and panel layout state. Render a compact collapsed rail instead of the full `RightPanel` when collapsed.

**Tech Stack:** React 19, TypeScript, lucide-react, Vitest, Electron renderer.

## Global Constraints

- Preserve existing backup, incremental backup, and repair-index IPC behavior and notices.
- Use `PanelRightClose`/`PanelRightOpen` and an Agent icon from lucide-react.
- Keep project menu keyboard accessible and close it on Escape or outside pointer interaction.
- Do not expose right-panel content while collapsed.

---

### Task 1: Add controlled backup actions

**Files:**
- Modify: `src/renderer/src/components/BackupActions.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- `BackupActions` accepts `action?: BackupAction | null` and `onActionHandled?: () => void`.
- `BackupAction` is `'create' | 'incremental' | 'repair'`.

- [ ] **Step 1: Add the public action type and controlled props**

Add the union type and optional props without changing existing restore rendering.

- [ ] **Step 2: Route a received action through existing handlers**

Use an effect that invokes the matching existing function once, then calls `onActionHandled`; preserve the current inline buttons when `controls` remains enabled.

- [ ] **Step 3: Replace topbar inline backup controls with the controlled component**

Keep one hidden/non-visual `BackupActions` instance in `App` wired to the project menu action and `setTopNotice`.

- [ ] **Step 4: Run typecheck**

Run `npm run typecheck`; expected output is a successful TypeScript check.

### Task 2: Build project menu and right-panel toggle

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/app.css`

**Interfaces:**
- Project menu entries call `setBackupAction('create' | 'incremental' | 'repair')` and close the menu.
- Right-panel toggle calls `setRightPanelCollapsed` and renders only a rail with the toggle button while collapsed.

- [ ] **Step 1: Add menu state and keyboard/outside close behavior**

Use a `projectMenuOpen` state, a wrapper ref, a pointer listener for outside clicks, and Escape handling that closes the menu without changing focus mode behavior.

- [ ] **Step 2: Update topbar markup and icon placement**

Turn `.project-name` into a menu trigger with `aria-haspopup`/`aria-expanded`; render the three menu items below it. Render `PanelRightClose` when open and `PanelRightOpen` when collapsed immediately before the model button, with Chinese accessible labels.

- [ ] **Step 3: Render the collapsed rail without RightPanel content**

Change the final workbench branch to render `.right-panel-collapsed-rail` containing only the toggle button when collapsed; render `RightPanel` only when expanded.

- [ ] **Step 4: Add focused styles**

Position the project dropdown below the trigger, style menu items and the icon button consistently with the existing dark topbar, and make the collapsed rail 34px wide.

### Task 3: Verify behavior and quality

**Files:**
- Test: existing Vitest suite and static UI contract script.

- [ ] **Step 1: Run the UI contract check**

Run `node scripts/verify-ui-contract.mjs`; expected result is all checks passing.

- [ ] **Step 2: Run tests and build**

Run `npm test`, `npm run typecheck`, and `npm run build`; expected result is successful completion for all three commands.

- [ ] **Step 3: Review the diff**

Run `git diff --check` and inspect `git diff`; expected result is no whitespace errors and only the requested UI changes plus plan/spec documentation.
