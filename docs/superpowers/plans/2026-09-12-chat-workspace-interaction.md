# ChatWorkspace Interaction Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the independent Chat workspace's streaming, cancellation, session, and confirmed-selection behavior deterministic and directly testable.

**Architecture:** Keep browser and Electron effects in `ChatWorkspace.tsx`, while move pure message/event/session decisions into a small renderer model module. The model receives immutable inputs and returns new state, so stream delta/done/error and cancellation behavior can be tested without introducing a DOM test dependency.

**Tech Stack:** Electron, React, TypeScript, Vitest.

## Global Constraints

- Renderer accesses Main only through the existing typed preload contract.
- Confirmed editor selection is the only selection sent as Chat scope; ordinary browser selection is not treated as scope.
- AI output remains a streamed chat result until an explicit action creates a Suggestion or Proposal.
- Existing localStorage session format and bilingual UI contract remain compatible.
- Do not claim real Electron UI verification when the local Electron binary is unavailable.

---

### Task 1: Pure Chat stream state model

**Files:**
- Create: `src/renderer/src/lib/chat-workspace-model.ts`
- Modify: `src/renderer/src/components/ChatWorkspace.tsx`
- Test: `tests/chat-workspace-model.test.ts`

**Interfaces:**
- `createChatTurn(messages, assistantId, prompt, kind): ChatRow[]`
- `applyChatEvent(messages, assistantId, event): { messages: ChatRow[]; terminal: boolean }`
- `chatHistory(messages): Array<{ role: 'user' | 'assistant'; content: string }>`

- [x] Add failing tests for immutable user/assistant turn creation, delta accumulation, done result replacement with context, error termination, and history exclusion of empty/streaming rows.
- [x] Run the focused model test and confirm it fails before the module exists.
- [x] Implement the pure functions with immutable array/object updates and no browser dependencies.
- [x] Replace equivalent inline stream state transitions in `ChatWorkspace.tsx` with the model functions.
- [x] Run focused model and component contract tests.

### Task 2: Session and confirmed selection boundaries

**Files:**
- Modify: `src/renderer/src/lib/chat-workspace-model.ts`
- Modify: `src/renderer/src/components/ChatWorkspace.tsx`
- Test: `tests/chat-workspace-model.test.ts`

**Interfaces:**
- `resolveConfirmedChatSelection(confirmed, snapshot, activeRelPath, rawSelection): string`
- `sanitizeChatMessages(messages): ChatRow[]`

- [x] Add failing tests proving a mismatched snapshot, unconfirmed selection, or empty raw selection produces no Chat selection scope.
- [x] Implement the selection resolver and message sanitizer without mutating stored session data.
- [x] Use the resolver and sanitizer during hydration, session switching, and request construction.
- [x] Run focused tests and typecheck.

### Task 3: Verification and audit record

**Files:**
- Modify: `docs/blueprint-audit-2026-09-02.md`

- [x] Run `npm test -- --run --no-file-parallelism --maxWorkers=1`.
- [x] Run `npm run test:coverage -- --run --no-file-parallelism --maxWorkers=1`, `npm run typecheck`, `npm run build`, `node scripts/verify-runtime.mjs`, `node scripts/verify-ui-contract.mjs`, and `git diff --check`.
- [x] Append the next numbered slice with exact results and retain the real-Electron binary limitation.
