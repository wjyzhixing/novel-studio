# ChatWorkspace i18n Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ChatWorkspace-owned hardcoded labels and internal message-kind leakage while preserving existing action IDs and behavior.

**Architecture:** Keep `chatMessageActions()` returning stable domain action IDs for compatibility, and map those IDs to locale keys only at the Renderer boundary. Add locale keys for session controls and message-kind labels; no user content or persisted data is translated or mutated.

**Tech Stack:** React, TypeScript, Vitest.

## Global Constraints

- Keep Chinese action IDs as stable internal compatibility values.
- All visible ChatWorkspace shell, control, status, and message-kind labels must use `useUiText`.
- Preserve existing bilingual locale behavior and typed `UiTextKey` checking.

---

### Task 1: Add failing i18n boundary assertions

**Files:**
- Modify: `tests/chat-workspace-i18n.test.ts`

- [ ] Assert the component has no literal session control labels or `message.kind` interpolation and references locale keys for session controls and message kinds.
- [ ] Run the focused test and confirm it fails against the current component.

### Task 2: Implement translated labels

**Files:**
- Modify: `src/renderer/src/lib/i18n.ts`
- Modify: `src/renderer/src/components/ChatWorkspace.tsx`

- [ ] Add bilingual keys for short rename/archive labels and all seven Chat message kinds.
- [ ] Map the persisted `ChatMessageKind` values to locale keys and render them through `uiText`.
- [ ] Replace the hardcoded short session buttons with translated labels and accessible titles.
- [ ] Run focused i18n/component tests and typecheck.

### Task 3: Verify and audit

**Files:**
- Modify: `docs/blueprint-audit-2026-09-02.md`

- [ ] Run full single-worker tests, coverage, build, runtime/UI contracts, typecheck, and diff check.
- [ ] Append the numbered audit slice with exact results and remaining real-Electron gaps.
