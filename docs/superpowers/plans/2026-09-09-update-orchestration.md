# Secure Update Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Main-owned, typed, cancellable update check/download flow that only exposes verified artifacts to the renderer.

**Architecture:** Keep manifest selection and network access in a small Electron-free `UpdateService`; add narrow shared/preload/IPC contracts and a renderer status card. Reuse the existing bounded download verifier and never install or replace the running app.

**Tech Stack:** TypeScript, Zod, Electron IPC, React, Vitest.

## Global Constraints

- Artifact URLs must be credential-free HTTPS.
- Artifact bytes must pass declared size and SHA-512 checks before atomic write.
- Renderer must not access filesystem, network, secrets, or Electron APIs directly.
- Errors crossing IPC must be `Result` values with redacted messages.
- Cancellation must not leave a partially usable artifact.

### Task 1: Shared update contract

**Files:**
- Modify: `src/shared/update.ts`
- Modify: `src/shared/ipc.ts`
- Test: `tests/update-orchestration.test.ts`

- [ ] Step 1: Add failing tests for typed update status and channel request validation.
- [ ] Step 2: Run `npm test -- --run tests/update-orchestration.test.ts` and confirm failure.
- [ ] Step 3: Add `UpdateStatus`, `UpdateApiContract`, and IPC channel constants with strict Zod schemas.
- [ ] Step 4: Run the focused test and confirm it passes.
- [ ] Step 5: Run `npm run typecheck`.

### Task 2: Main update service

**Files:**
- Create: `src/main/services/update-service.ts`
- Modify: `src/main/services/update-verification.ts`
- Test: `tests/update-orchestration.test.ts`

- [ ] Step 1: Add failing tests for check, available, up-to-date, progress, cancellation, and retryable failure.
- [ ] Step 2: Run the focused test and confirm failure.
- [ ] Step 3: Implement injected manifest/artifact fetchers, an AbortController per download, bounded progress events, and verified atomic destination paths.
- [ ] Step 4: Run the focused test and confirm all cases pass.
- [ ] Step 5: Run `git diff --check`.

### Task 3: Typed IPC and preload wiring

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Test: `tests/update-ipc-contract.test.ts`

- [ ] Step 1: Add a failing static contract test for check/download/cancel and progress event forwarding.
- [ ] Step 2: Implement Main registration and preload forwarding with strict payload validation.
- [ ] Step 3: Run the focused contract test and `npm run typecheck`.

### Task 4: Renderer update card

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Test: `tests/update-ui.test.tsx`

- [ ] Step 1: Add failing component contract tests for idle/checking/available/downloading/ready/error and hover/pointer actions.
- [ ] Step 2: Add the compact IDE-style status card and event cleanup on unmount.
- [ ] Step 3: Run focused UI tests and `npm run build`.

### Task 5: Regression verification

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm run verify:release` and `node scripts/verify-ui-contract.mjs`.
- [ ] Review the diff for secret/path leakage and update the release readiness notes.
