# AI Native Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the real Provider → Context → Agent → Chat/Editor/Workflow loop and remove misleading AI mocks.

**Architecture:** Main owns Provider requests, secret access, context assembly and agent execution. Renderer owns chat presentation and transient conversation state. Ask Agent, Quick Actions and Workflow call the same typed AI execution seams.

**Tech Stack:** Electron, React, TypeScript, SQLite, Zod, OpenAI-compatible HTTP/SSE.

## Global Constraints

- Do not expose plaintext API keys to Renderer or project files.
- Do not overwrite chapter text directly from an AI response; use Suggestion/Diff and revision audit.
- Keep deterministic local services for non-LLM indexing and Canon checks.
- Do not run test or build commands during this user-requested pass.

### Task 1: Contracts and Agent/Context execution seams

**Files:** Modify `src/shared/ai.ts`, `src/shared/context.ts`, `src/main/services/ai-service.ts`; create `src/main/services/agent-service.ts`.

- Add typed `AgentId`, `AiChatInput`, `AiStreamEvent` and `AgentConfig` contracts.
- Add `AgentService.buildRequest(agentId, input)` that combines system prompt, user prompt and context text.
- Add `AiService.chatWithAgent()` and `AiService.streamWithAgent()` delegating Provider calls after AgentService compilation.
- Use `project.providerProfile` when no explicit profile is supplied.

### Task 2: Context-aware IPC and streaming Chat

**Files:** Modify `src/shared/ipc.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/src/env.d.ts`, `src/renderer/src/components/RightPanel.tsx`.

- Add context-aware chat request and stream event channels with request IDs.
- Build context in Main using the active chapter and optional selection; return the context manifest with the first response metadata.
- Render a message list with streaming deltas, cancel action, retry action and error state.
- Replace `ai.ask` mock fallback with the project default profile.

### Task 3: Quick Actions and Workflow Agent routing

**Files:** Modify `src/main/services/ai-edit-service.ts`, `src/main/services/workflow-runtime-service.ts`, `src/shared/builtin-workflow.ts`, `src/renderer/src/components/RightPanel.tsx`.

- Route rewrite/critic/extract actions through named Agent IDs and ContextService.
- Keep AI Edit output in Suggestion/Diff and attach the context/agent metadata to the audit record.
- Read each Workflow AI node’s `config.agent` and execute it through AgentService; persist model/request metadata in node logs.

### Task 4: Provider and UI truthfulness

**Files:** Modify `src/main/services/ai-provider.ts`, `src/main/services/image-service.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/components/ProviderSettings.tsx`.

- Add request validation, timeout/error classification and model metadata to the text adapter.
- Replace fake image success with an OpenAI-compatible image adapter or an explicit `IMAGE_PROVIDER_NOT_CONFIGURED` error.
- Display the active profile/model dynamically and show secret/configuration status.
- Keep Anthropic/Gemini adapters explicit; do not silently claim native support.

### Task 5: Static verification and handoff

**Files:** All touched files and `docs/hardening-report.md` if needed.

- Search for remaining production `profile_mock`, static model labels and fake image success paths.
- Run `git diff --check` only; do not run test/build.
- Verify no plaintext API key exists in the workspace and summarize any remaining intentionally deterministic non-AI mocks.
