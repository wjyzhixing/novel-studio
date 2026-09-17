# Editor AI Chat Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the PRD's safe, readable novel-editing workflow: top-level IDE notifications, real Tiptap selection actions, colored AI Diff, Markdown-safe editing, and a wide Agent Chat workspace.

**Architecture:** Keep Markdown as the canonical chapter source and keep all AI output in typed Suggestion, Proposal, Review, or Chat message state until an explicit user action. The editor owns ProseMirror selection and visual decorations; Main owns validation, persistence, revisions and Workflow effects; Chat owns conversation presentation and routes explicit actions back to Suggestion/Note/Canon services.

**Tech Stack:** Electron, React, TypeScript, Tiptap/ProseMirror, Zustand, Markdown-it, Turndown, Vitest, existing typed preload IPC.

## Global Constraints

- Notification is a window-level fixed overlay and never participates in editor layout.
- Tiptap selection range and selected text are both retained for safe AI replacement.
- AI generation never mutates canonical Markdown before explicit acceptance.
- Raw explanation, analysis, instruction, review and metadata outputs cannot enter chapter write-back.
- Markdown remains the canonical source; unsupported syntax must not be silently discarded.
- Renderer uses typed preload IPC and never accesses Node filesystem, SQLite or provider secrets directly.
- Every accepted正文 mutation creates a Revision and can be rejected before persistence.
- Long text, Workflow nodes and Chat messages must wrap or own their vertical scroll without horizontal overflow.

## Task 1: Window-level Notification and layout boundary

**Files:**
- Create: `src/renderer/src/components/NotificationCenter.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/store/app-store.ts`
- Modify: `src/renderer/src/styles/backup.css`
- Test: `tests/notification-center.test.tsx`

**Interfaces:**
- Produces `NotificationItem { id, kind, message, progress?, dismissible }` and `enqueue/update/dismiss` behavior for shell-level consumers.
- Existing `setNotice` calls remain compatible and are adapted into the queue at the shell boundary.

- [x] Add a component contract test that renders a multiline error notification and verifies live status/alert semantics, order and dismiss entry point.
- [x] Run `npm test -- --run tests/notification-center.test.tsx`; component contract passes.
- [x] Implement the queue and render it through a shell portal with `position: fixed; top: 56px; right: 20px; z-index` above workbench content. Set indicator `align-self: center`, text `min-width: 0`, normal wrapping and queue-owned vertical spacing.
- [x] Run the notification model checks and `npm run typecheck`; both pass. A dedicated DOM interaction test remains to be added.
- [x] Verify the existing project/Workflow/AI errors still surface through the same queue and run `git diff --check`.

## Task 2: Real Tiptap selection BubbleMenu and safe selection actions

**Files:**
- Create: `src/renderer/src/components/SelectionToolbar.tsx`
- Modify: `src/renderer/src/components/EditorPane.tsx`
- Modify: `src/renderer/src/store/app-store.ts`
- Modify: `src/renderer/src/components/RightPanel.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Test: `tests/selection-toolbar.test.tsx`

**Interfaces:**
- `SelectionSnapshot { from, to, text, chapterRelPath, revisionFingerprint }` is produced by the editor and consumed by AI Edit requests.
- `SelectionToolbar` receives an editor instance and dispatches typed action names without mutating the document.

- [x] Add a component contract test for a non-empty Tiptap selection exposing 润写、改写、扩写、缩写、续写、解释、翻译、更多; real selection retention is covered by Electron Golden Path.
- [x] Run the focused SelectionToolbar contract test; it passes, with selection retention covered by Electron Golden Path.
- [x] Replace the fixed/sticky toolbar with a Tiptap BubbleMenu-style component driven by selection state and viewport coordinates; prevent toolbar mousedown from clearing the selection, clamp/flip near viewport edges, and wrap on narrow widths.
- [x] Store `from/to` plus selected text and current chapter identity; reject or mark stale when the document fingerprint no longer matches.
- [x] Route rewrite actions to Suggestion generation and explanation to read-only Chat; route custom action to the composer with the selection scope chip.
- [x] Run the focused selection, `tests/ai-edit.test.ts`, and `npm run typecheck` checks.

## Task 3: Inline Diff decorations and unified review state

**Files:**
- Create: `src/renderer/src/lib/diff-decorations.ts`
- Modify: `src/renderer/src/components/EditorPane.tsx`
- Modify: `src/renderer/src/components/RightPanel.tsx`
- Modify: `src/shared/ai-edit.ts`
- Modify: `src/renderer/src/store/app-store.ts`
- Test: `tests/diff-decorations.test.ts`, `tests/ai-edit.test.ts`

**Interfaces:**
- `SuggestionViewState = idle | generating | pending_review | accepted | rejected | stale | failed | cancelled`.
- `buildSuggestionDecorations(original, suggested, targetRange)` returns presentation-only add/remove/replace segments; it never changes Markdown.

- [x] Add Diff tests for replacement unchanged/add/remove segments and canonical-source immutability; selective multi-region coverage is included.
- [x] Run focused Diff tests; they pass.
- [x] Implement a deterministic text diff-to-decoration adapter, render additions green, removals red in the review view, replacements amber/violet, and preserve native Tiptap selection styling separately.
- [x] Add source/target/operation metadata to the pending suggestion UI and stale-selection validation before accept.
- [x] Ensure accept creates one Revision, reject leaves the chapter byte-for-byte unchanged, and retry starts a new request without applying the previous result; multi-region review now supports selecting one region for a new pending Diff.
- [x] Run Diff, AI Edit and relevant Workflow tests plus `npm run typecheck`.

## Task 4: Markdown-safe editor and Chat rendering

**Files:**
- Modify: `src/renderer/src/lib/markdown.ts`
- Modify: `src/renderer/src/components/EditorPane.tsx`
- Create: `src/renderer/src/components/MarkdownMessage.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Test: `tests/markdown.test.ts`, `tests/markdown-message.test.tsx`

**Interfaces:**
- `markdownToHtml/htmlToMarkdown` remain the source conversion boundary.
- `MarkdownMessage` accepts untrusted response text and produces sanitized, non-editable output with code/table copy actions.

- [x] Add Markdown round-trip tests for Chinese prose, marks, task state, links, tables, code and asset-backed images.
- [x] Run Markdown tests; they pass.
- [x] Implement only the missing conversion/extension behavior, including task-list HTML, table rules, links, image asset markers and protected fallback for unsupported blocks.
- [x] Configure Tiptap extensions and editor styles for the same structures; keep Chat rendering separate from editable HTML.
- [x] Add sanitization, wrapping and block-level scrolling for Chat Markdown, code and tables.
- [x] Run Markdown tests, `npm run typecheck` and production build.

## Task 5: Independent Chat workspace and post-answer actions

**Files:**
- Create: `src/renderer/src/components/ChatWorkspace.tsx`
- Create: `src/renderer/src/components/ChatSessionList.tsx`
- Create: `src/renderer/src/components/ChatMessageActions.tsx`
- Modify: `src/renderer/src/components/RightPanel.tsx`
- Modify: `src/renderer/src/components/BottomPanel.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/store/app-store.ts`
- Modify: `src/renderer/src/styles/app.css`
- Test: `tests/chat-workspace.test.tsx`, `tests/chat-actions.test.tsx`

**Interfaces:**
- `ChatSession { id, title, scope, messages, createdAt, updatedAt }` is shared by quick Drawer and full workspace.
- `ChatMessage` carries `kind`, rendered Markdown, references, generation state and allowed explicit actions.

- [x] Add Chat Workspace/Chat model tests for the independent shell, long-content-safe renderer and type-appropriate actions.
- [x] Run the focused Chat tests; they pass.
- [x] Implement full-width Chat Workspace with session list, readable message column, composer scope chips, source/context inspector, stop/retry/continue controls and quick-panel handoff.
- [x] Implement actions: Copy, Quote, Save Note, Preview Diff, Apply to Selection, Append, Replace, Canon Review and Illustration Studio routing according to message kind; structured Canon proposals are validated before submission.
- [x] Keep explanation/analysis read-only and require Suggestion/Diff confirmation for every draft action.
- [x] Add responsive layout rules so session/context drawers collapse while the message column retains readable width.
- [x] Run Chat tests, relevant AI Edit tests and `npm run typecheck`.

## Task 6: Workflow synchronization, responsive hardening and verification

**Files:**
- Modify: `src/main/services/workflow-runtime-service.ts`
- Modify: `src/shared/runtime.ts`
- Modify: `src/renderer/src/components/RightPanel.tsx`
- Modify: `src/renderer/src/styles/right-panel.css`
- Create/Modify: `tests/workflow-editor-chat.integration.test.ts`

- [x] Add integration coverage for Workflow completion conflict decisions, unchanged-source rejection and approved write-back refresh.
- [x] Implement typed completion/conflict events and explicit refresh/compare handling.
- [x] Ensure Workflow logs, Agent names, notification text and Chat blocks wrap with one clear vertical scroll owner.
- [x] Run the integration checks and verify no horizontal overflow selectors remain in the affected layouts.
- [x] Run `npm test`, `npm run typecheck`, `npm run build` and `git diff --check`; all current checks pass.

## Verification Checklist

- [x] `npm test -- --run tests/notification-center.test.tsx tests/selection-toolbar.test.tsx tests/diff-decorations.test.ts tests/markdown.test.ts tests/chat-workspace.test.tsx`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `git diff --check`
- [x] Manual/E2E: open chapter → select text → invoke rewrite → inspect colored Diff → reject → retry → accept → verify Revision.
- [x] Manual/E2E: open Chat → ask explanation → verify no document mutation → turn a later draft into Suggestion → apply only after confirmation.
- [x] Manual/E2E: trigger long top notification and verify fixed top position, vertical centering, wrapping and dismissal. Verified by Electron Golden Path evidence (`fixed`, `wrapped`, `verticallyCentered`, `dismissed` all true).
