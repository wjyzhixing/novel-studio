# Blueprint Flow Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按蓝图把内置创作 Workflow、图片 Provider、Markdown 资产回链、Provider 选择和诊断提示组成可追踪的真实闭环。

**Architecture:** 文件系统中的 Markdown/YAML/JSON/图片是内容源，SQLite 保存索引、运行状态、资产 provenance 和审计；Renderer 只通过 preload IPC 调用 Main。Workflow 的图片节点由 Runtime 执行，人工选择/审核节点暂停并持久化，图片插入通过稳定 Asset ID 写回 Markdown 并创建 Revision。

**Tech Stack:** Electron、React、TypeScript、Zod、SQLite、Tiptap、Markdown-it、Turndown。

## Global Constraints

- 不运行 `test` 和 `build`。
- API Key 只进入 OS safeStorage，不写入源码、项目文件、fixture、日志或回复。
- AI 只能生成 Suggestion/Proposal，不能未经人工确认修改正文或 Canon。
- Renderer 不直接访问 Node.js fs、SQLite 或 secret。
- Provider URL 只允许 HTTPS；HTTP 仅允许本机开发地址。
- 每个持久化行为必须保留可追踪的 Asset/Revision/Workflow provenance。

---

### Task 1: Complete the built-in illustration workflow

**Files:**
- Modify: `src/shared/builtin-workflow.ts`
- Modify: `src/main/services/workflow-runtime-service.ts`
- Modify: `src/renderer/src/components/RightPanel.tsx`
- Modify: `src/renderer/src/components/DeveloperPanel.tsx`
- Test fixture/update: `scripts/verify-runtime.mjs`

**Interfaces:**
- Built-in workflow produces nodes `image-propose`, `image-generate`, `image-select`, and `image-insert` after human review/memory.
- `image.select` pauses when no `assetId` is configured and resumes with a selected asset ID.
- Run state preserves node input/output and remains retryable after failure.

- [ ] Add the four image nodes and edges to `builtinNovelFlow()`; use `image.select` as the human gate and leave `image.insert` after it.
- [ ] Make `image.select` accept a resume payload shaped as `{ assetId: string }` and validate that the asset belongs to the incoming generated list.
- [ ] Persist the selected asset output before allowing `image.insert` to execute.
- [ ] Add a runtime smoke fixture that executes through proposal/generation, pauses at selection, resumes with an asset ID, and asserts the Markdown reference and Revision exist.
- [ ] Surface the waiting node and resume action in the right panel and developer details.

### Task 2: Strict image-provider request adaptation

**Files:**
- Modify: `src/shared/image.ts`
- Modify: `src/main/services/image-service.ts`
- Modify: `src/renderer/src/components/IllustrationStudio.tsx`
- Modify: `scripts/verify-runtime.mjs`

**Interfaces:**
- `ImageRequest` supports provider-safe options without allowing arbitrary secret-bearing fields.
- OpenAI-compatible image adapters send only the provider-supported minimal body by default and preserve local negative prompt/variant metadata.
- A mocked fetch boundary can assert the exact outgoing JSON without exposing a key.

- [ ] Add a schema for safe image parameters (`size`, `quality`, `style`, `response_format`) with bounded values and optional provider options.
- [ ] Normalize unsupported UI fields before sending; keep negative prompt and requested variant count in local provenance.
- [ ] Handle base64 and URL responses, real MIME types, and redacted provider errors deterministically.
- [ ] Add runtime request assertions for the strict minimal body and the persisted provenance.

### Task 3: Remove Mock ambiguity from normal Provider/Chat flow

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/RightPanel.tsx`
- Modify: `src/renderer/src/components/ProviderSettings.tsx`
- Modify: `src/main/services/ai-service.ts`

**Interfaces:**
- No configured profile produces an explicit “未配置 Provider” state instead of silently labeling the UI Mock.
- A stale manifest profile is repaired to a configured profile and the repaired ID is reflected in the project state.
- Mock remains available only as an explicit deterministic fixture option.

- [ ] Replace renderer hardcoded `profile_mock` fallbacks with a single provider-selection helper/state.
- [ ] Display profile name/model and an actionable configuration message when no real profile exists.
- [ ] Keep `mock` selectable only when explicitly saved or used by runtime fixtures.
- [ ] Add a runtime assertion that stale profile IDs converge to the first configured profile without persisting secrets.

### Task 4: Markdown asset round-trip and user feedback

**Files:**
- Modify: `src/renderer/src/lib/markdown.ts`
- Modify: `src/renderer/src/components/EditorPane.tsx`
- Modify: `src/renderer/src/components/IllustrationStudio.tsx`
- Modify: `src/main/services/image-service.ts`
- Modify: `src/renderer/src/store/app-store.ts`

**Interfaces:**
- Asset references round-trip as `![caption](assets/scenes/<assetId>.<ext> "<assetId>")`.
- Editor hydrates asset IDs through IPC after chapter switch/reopen and never persists data URLs.
- Insert/refresh/delete always emit visible status and leave no dangling Markdown reference after deletion.

- [ ] Make Markdown conversion recognize image attributes regardless of DOM attribute order.
- [ ] Hydrate all asset IDs through `image.readAsset`, with a visible broken-reference state when the asset is missing.
- [ ] After insert/delete/refresh reload the chapter and asset list from Main rather than relying only on local state.
- [ ] Route operation messages through the existing `role=status` surfaces and preserve errors with safe text.

### Task 5: Workflow Inspector completeness

**Files:**
- Modify: `src/shared/runtime.ts`
- Modify: `src/main/services/workflow-runtime.ts`
- Modify: `src/main/services/workflow-runtime-service.ts`
- Modify: `src/renderer/src/components/DeveloperPanel.tsx`
- Modify: `src/renderer/src/components/RightPanel.tsx`

**Interfaces:**
- Every node run records safe input/output summaries, status transitions, attempts, duration, diagnostics, and error category.
- Context manifest references are visible for AI nodes without exposing secrets or full API keys.
- Human pause/resume and retry actions show a deterministic status message.

- [ ] Add bounded/sanitized summaries for node input/output and error categories.
- [ ] Persist context manifest metadata and provider request ID on AI/image nodes.
- [ ] Render the details in Developer Panel and the compact right-panel status card.
- [ ] Add a runtime smoke assertion for waiting, resumed, failed, and retried state transitions.

### Task 6: Verification and blueprint audit update

**Files:**
- Modify: `docs/blueprint-audit-2026-09-02.md`
- Modify: `scripts/verify-runtime.mjs`
- Modify: `docs/release-readiness-checklist.md`

- [ ] Run `npm run typecheck`.
- [ ] Run `git diff --check`.
- [ ] Run `node --check scripts/verify-runtime.mjs` and `node scripts/verify-runtime.mjs --long`.
- [ ] Run `node scripts/release-preflight.mjs`.
- [ ] Update each affected blueprint chapter with evidence, leaving unverified E2E/test/build claims explicitly incomplete.

