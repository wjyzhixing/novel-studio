# Sprint 2 Chapter Authoring Implementation Plan

**Goal:** 修复并验收章节创作闭环：章节 CRUD、Markdown 持久化、原子自动保存、脏状态、全文搜索与命令面板。

**Architecture:** Markdown 文件是正文唯一来源，SQLite 只保存可重建索引；Renderer 仅调用 preload 的 typed API，所有文件和数据库写入留在 Main。修复优先围绕现有公开接口和回归测试，不扩展到 Sprint 3+。

**Tech Stack:** Electron, React, TypeScript, Vitest, node:sqlite, markdown-it, turndown, Zustand。

## Global Constraints

- 遵守蓝图 §35：不让 Renderer 直接访问 fs/db，不把正文只存 SQLite。
- 遵守蓝图 §29：连续输入不丢字；AI/后续能力不能破坏本地持久化；项目可搜索、可恢复。
- 所有持久化写入使用 atomic write；输入通过 Zod/路径沙箱校验。
- 每个行为采用单测先行，最终运行 `pnpm typecheck` 与 `pnpm test`。

### Task 1: Establish the Sprint 2 baseline

**Files:** existing `tests/*.test.ts`, `src/shared/*`, `src/main/services/*`, renderer components.

- [ ] 运行 `pnpm typecheck` 和 `pnpm test`，记录第一个失败点。
- [ ] 检查失败是否覆盖公开行为：创建/读取/保存/移动/删除章节、Markdown round-trip、autosave 状态、搜索和命令动作。
- [ ] 不修改测试来掩盖实现错误；为发现的损坏路径增加最小回归测试。

### Task 2: Repair the broken Chapter Authoring path

**Files:** `src/shared/chapter.ts`, `src/shared/ipc.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/main/services/chapter-service.ts`, related renderer components.

- [ ] 先写一个复现当前损坏行为的失败测试。
- [ ] 修复 IPC 合约、参数校验、章节路径处理、索引维护或 UI 状态连接中的实际故障。
- [ ] 保持 Markdown 为唯一正文源，并确保 DB 索引可由文件重建。
- [ ] 针对保存失败、空章节、删除/移动和短中文搜索保留用户可理解的错误结果。

### Task 3: Verify the Sprint 2 Definition of Done

**Files:** regression tests and only the implementation files required by Task 2.

- [ ] 验证输入后 debounce autosave 最多丢失 autosave 窗口内内容，保存状态最终回到 saved。
- [ ] 验证强制重开项目后章节正文从 Markdown 恢复，搜索结果来自索引且可重建。
- [ ] 验证 `⌘K` 命令面板能导航、触发保存/创建等公开动作。
- [ ] 运行 `pnpm typecheck` 和 `pnpm test`，保留完整输出作为交付证据。
