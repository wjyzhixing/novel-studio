# Illustration Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按蓝图第 14 节把 Illustration Studio 做成可正常操作的视觉一致性工作台。

**Architecture:** 延续 Electron Main + typed preload IPC + React renderer。项目文件 `novel.yaml` 保存 Art Direction，Story entities 保存视觉身份，图片文件与 SQLite 保存资产及 provenance；Renderer 只通过 `window.novelAPI` 访问它们。

**Tech Stack:** Electron, React 19, TypeScript, Zustand, Zod, YAML, SQLite。

## Global Constraints

- 不运行 `test` 和 `build`；只运行 `npm run typecheck`、`git diff --check` 及必要的静态检查。
- API key 只能进入 OS safeStorage，不能写入源码、novel.yaml、SQLite、日志或文档。
- AI 只生成 Proposal；正文插入必须由用户明确点击确认。
- 图片请求使用独立 image secret 与 image model，不复用文本 secret。
- 文件内容以 Markdown/YAML/图片为源，SQLite 只作为索引和 provenance 层。

### Task 1: 项目 Art Direction IPC

**Files:**
- Modify: `src/main/services/project-service.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`

**Interfaces:**
- Produce `ProjectService.setArtDirection(value: string): Promise<ProjectInfo>` and `window.novelAPI.project.setArtDirection(value)`.
- Preserve existing `ProjectInfo` and manifest schema; only `novel.yaml.artDirection` changes.

- [ ] Add a validated IPC channel accepting a string with a bounded length and returning the refreshed project info.
- [ ] Persist through `atomicWriteFile`, update Main's in-memory manifest, and return a serializable Result error on missing project.
- [ ] Expose the method through preload and renderer typings.
- [ ] Run `npm run typecheck` and confirm no contract mismatch.

### Task 2: Story visual identity editing

**Files:**
- Modify: `src/renderer/src/components/StoryBible.tsx`
- Modify: `src/renderer/src/styles/app.css`

**Interfaces:**
- Reuse `StoryEntity.fields.visualIdentity` as a JSON-safe string in the existing `saveEntity` fields object.
- Existing entities without this field remain valid and display an empty editor.

- [ ] Add a Visual Identity textarea for character and place entities, with a clear label explaining that it feeds image Prompt compilation.
- [ ] Keep existing fields when saving instead of replacing them with only `role`; merge the edited `role` and `visualIdentity` into the selected entity fields.
- [ ] Show saved visual identity in the form after reload and use accessible labels/status text.
- [ ] Run `npm run typecheck`.

### Task 3: Visual Director proposal and compiler data

**Files:**
- Modify: `src/shared/image.ts`
- Modify: `src/main/services/image-prompt-compiler.ts`
- Modify: `src/main/services/image-service.ts`

**Interfaces:**
- Extend `SceneProposal` with optional structured fields: `subject`, `camera`, `composition`, `lighting`, `visualAnchors`.
- Keep `proposeScene(relPath)` backward-compatible for existing callers.

- [ ] Extract a useful scene description from the current chapter with a deterministic fallback and populate structured proposal fields.
- [ ] Include `artDirection`, related entity visual identities, camera, composition, and lighting in the compiled prompt.
- [ ] Preserve a safe fallback if no Story entities or Art Direction exist.
- [ ] Keep provider/model/seed/reference metadata on every generated asset.
- [ ] Run `npm run typecheck`.

### Task 4: Illustration Studio normal interaction

**Files:**
- Modify: `src/renderer/src/components/IllustrationStudio.tsx`
- Modify: `src/renderer/src/styles/app.css`

**Interfaces:**
- Use existing `image.proposeScene`, `image.generate`, `image.listAssets`, `image.readAsset`, and `image.insertIntoChapter` APIs.
- Add local UI state only for draft prompt, art direction draft, generation status, selected asset, and preview modal.

- [ ] Add an Art Direction panel with load, edit, save, cancel, and success/error feedback.
- [ ] Render structured Scene Proposal details and allow the user to edit compiled and negative prompts before generation.
- [ ] Add generation status, disabled states, retry action, and a clear message when no chapter is selected.
- [ ] Render real asset thumbnails, selected state, provenance details, favorite state, and a large preview dialog.
- [ ] Add “重新生成” from the current prompt and preserve the selected variant after generation.
- [ ] Keep insertion explicit and show the inserted caption/asset result without silently modifying the editor draft.
- [ ] Run `npm run typecheck` and `git diff --check`.

### Task 5: Navigation and final verification

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/RightPanel.tsx`

**Interfaces:**
- Pass an `onOpenImages` callback from `App` to `RightPanel`; it must set `imagesOpen`, clear workflow/story destinations, and retain the active chapter.

- [ ] Make the Right Panel “生成插图” action open the same Illustration Studio destination as the left sidebar.
- [ ] Ensure opening a chapter exits Illustration Studio only when intended, while the active chapter remains selected.
- [ ] Run `npm run typecheck` and `git diff --check`; do not run test/build.
- [ ] Review the final diff for secrets, accidental generated files, and incomplete mock-only paths.
