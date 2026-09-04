# Novel Studio 编辑器、AI 编辑与 Chat 体验 PRD

## Problem Statement

从用户视角，当前 Novel Studio 的核心写作体验有四类断裂：

1. 全局提示虽然已经脱离部分页面布局，但视觉上仍像底部状态条，无法稳定卡在窗口顶部；多行消息、错误消息和长文本时容易遮挡编辑内容，也不能形成连续的 IDE 通知队列。
2. 用户选中文字后，工具条没有真正绑定 Tiptap 的 selection。工具条位置不随选区移动，选区高亮、操作目标和 AI 结果之间缺少明确关联。
3. AI 修改结果只展示为一整块“原文/建议文本”，用户无法快速判断具体改了哪些字、哪些句子被删除或新增，也无法确认操作针对的是当前选区还是整章。
4. Agent、Context、Quick Actions、Workflow 和对话记录全部堆在约 410px 的右侧栏中。短问题还能使用，连续对话、长回答、代码/表格/引用和后续操作会被压缩、截断或迫使用户频繁滚动。

小说编辑与普通文本编辑不同：正文是长期资产，AI 输出必须可追溯、可比较、可拒绝、可回滚；解释、分析、设定和正文建议也必须分开。当前需要建立一套以 Tiptap selection、Suggestion/Diff、Workflow Review 和独立 Chat 会话为核心的统一交互模型。

## Solution

建立“编辑器主工作区 + 右侧快速 AI 入口 + 独立 Chat 工作区”的体验：

- 全局 Notification 使用真正的窗口级 fixed overlay，固定在顶部右侧，不参与任何布局计算；消息内容自适应换行、堆叠和滚动。
- 选区工具条改为基于 Tiptap selection 的 BubbleMenu，显示在实际选区上方并根据窗口边界自动调整；选区使用 Tiptap 原生 selection 视觉，AI 待确认内容使用 decoration 显示差异。
- 所有改写、续写、扩写、缩写、润写和翻译先生成 Suggestion/Diff，不直接改 Markdown；接受后才写回并生成 Revision。
- 解释、分析、检查冲突、提取设定等只读结果进入 Chat 或结构化 Proposal，不得伪装成正文。
- 右侧栏保留上下文摘要、快捷操作和最近一条建议；完整多轮对话抽到独立 Chat 工作区，支持长内容渲染、引用、继续生成和转为编辑动作。
- Chat、选区工具栏和 Workflow 共用同一套上下文引用与动作协议，确保“回答内容是什么”和“是否改变正文”始终是两个明确步骤。

## User Stories

### 全局提示

1. As a writer, I want operation feedback to appear fixed at the top-right of the window, so that it is always visible without moving the editor layout.
2. As a writer, I want success, warning, error and progress notifications to have distinct visual states, so that I can understand urgency immediately.
3. As a writer, I want long notifications to wrap naturally and keep the status marker vertically centered, so that Chinese multi-line messages remain readable.
4. As a writer, I want several notifications to stack in time order, so that a later error does not hide an earlier operation result.
5. As a writer, I want to dismiss a notification without affecting the current editor or Chat, so that transient feedback never becomes a blocking modal.
6. As a writer, I want progress notifications to update in place when an operation completes, so that one action does not produce a confusing stream of duplicate messages.

### Tiptap 选区与编辑器

7. As a writer, I want the selected text to use an obvious Tiptap selection highlight, so that I know exactly which text an AI action will target.
8. As a writer, I want the selection toolbar to appear above the selected text, so that the action feels attached to the text rather than to a fixed page position.
9. As a writer, I want the toolbar to remain usable near the top, bottom or edge of the viewport, so that it never goes off-screen.
10. As a writer, I want the toolbar to wrap on a narrow window, so that all actions remain accessible without horizontal overflow.
11. As a writer, I want to perform rewrite, polish, expand, shorten, continue, explain and translate on the current selection, so that I can work at sentence and paragraph level.
12. As a writer, I want a custom action to preserve the selected range and selected text in its request context, so that my instruction cannot accidentally target the whole chapter.
13. As a writer, I want selection actions to preserve my selection until the request starts, so that clicking an action does not silently change the target.
14. As a writer, I want the editor to tell me when the selected text has changed before the AI result is applied, so that an old suggestion cannot overwrite newer writing.
15. As a writer, I want headings, emphasis, strike-through, lists, task lists, quotes, code, links, images, tables and horizontal rules to remain editable, so that Markdown remains a first-class writing format.
16. As a writer, I want the editor to preserve unsupported or unknown Markdown instead of silently dropping it, so that opening and saving a chapter never destroys content.
17. As a writer, I want editor changes to autosave with a visible dirty/saving/saved state, so that I know whether the source Markdown is safe on disk.

### AI 修改与 Diff

18. As a writer, I want AI changes to be shown inline with color-coded additions, removals and replacements, so that I can understand what changed without comparing two large blocks manually.
19. As a writer, I want unchanged text to remain visually quiet, so that my attention is directed only to the changed regions.
20. As a writer, I want the Diff panel to show original and suggested content side by side, so that I can review a paragraph-level change in context.
21. As a writer, I want every suggestion to display its operation, target scope, source and timestamp, so that I can distinguish selection rewrite from Workflow rewrite.
22. As a writer, I want to accept a complete suggestion, reject it, or retry it, so that AI never becomes an irreversible editor action.
23. As a writer, I want to accept only one changed region when a suggestion contains multiple regions, so that I can keep good edits and reject bad ones independently.
24. As a writer, I want accepted changes to create a Revision with original and replacement content, so that I can undo an AI decision later.
25. As a writer, I want explanations and analysis to remain read-only, so that prose-like AI responses cannot accidentally enter the chapter.
26. As a writer, I want AI outputs containing writing habits, role positioning, confirmation text or review instructions to be classified as metadata or rejected, so that they cannot be adopted as article content.

### 独立 Agent Chat

27. As a writer, I want a full-width Chat workspace for long conversations, so that I can reason with an Agent without sacrificing readable message width.
28. As a writer, I want the right panel to provide a quick Chat entry point, so that I can ask a short question without leaving the chapter.
29. As a writer, I want the quick panel and full Chat workspace to share sessions, so that switching views does not lose conversation history.
30. As a writer, I want to create, rename, archive and switch Chat sessions, so that different chapters and creative goals do not mix together.
31. As a writer, I want Chat answers to render Markdown, code blocks, tables, lists, quotes and inline emphasis correctly, so that answers remain readable and useful.
32. As a writer, I want code blocks and tables to support copy actions, so that structured output can be reused without manual cleanup.
33. As a writer, I want each answer to show referenced chapter, scene, selection and Canon sources, so that I can judge whether the Agent used the right context.
34. As a writer, I want to expand or collapse injected Context, so that I can inspect grounding without letting it dominate the conversation.
35. As a writer, I want to stop, retry, regenerate and continue an answer, so that a slow or incomplete response remains recoverable.
36. As a writer, I want to copy an answer, save it as a Note, create a Canon Proposal, or turn it into a Suggestion, so that Chat output has explicit destinations.
37. As a writer, I want Chat to distinguish explanation, analysis, draft, Canon proposal and image proposal, so that each answer receives the correct follow-up actions.
38. As a writer, I want a Chat draft to be applied to the selected text, appended to the chapter, or inserted at a chosen location only after confirmation, so that conversation never directly mutates the source.
39. As a writer, I want the active chapter and selection to be visible in the Chat composer, so that I can detect a stale or wrong writing scope before sending.
40. As a writer, I want to quote a specific Chat message or source passage in a follow-up, so that the next request has a stable reference rather than relying on ambiguous natural language.

### Workflow 与审核

41. As a writer, I want Workflow Review to show the actual Draft rather than reviewer instructions, so that I review content instead of internal process text.
42. As a writer, I want Workflow Review to offer approve, edit-and-approve and reject actions, so that every write-back decision is explicit.
43. As a writer, I want a rejected Workflow draft to leave the original chapter unchanged, so that failed review cannot damage my manuscript.
44. As a writer, I want successful Workflow write-back to refresh the visible editor immediately, so that I do not need to switch chapters to see the result.
45. As a writer, I want Workflow status, logs and long node names to wrap and scroll vertically, so that a long run never overflows the right panel.
46. As a writer, I want Workflow, Chat and AI Edit to use the same source/target/revision vocabulary, so that I can predict what each action will change.

## Implementation Decisions

### 1. Notification layer

- Create one application-level notification queue owned by the renderer shell.
- Render notifications through a portal or shell-level overlay above all panels and dialogs.
- Use `position: fixed` with a top offset that accounts for the desktop title bar/topbar; the notification itself must not be a child of the editor scroll container.
- Set a constrained width with `min-width: 0`, `max-width`, `overflow-wrap: anywhere` and normal white-space wrapping.
- Use a flex row whose indicator has `align-self: center`; the indicator height should follow the message block or use a minimum height, never force top alignment.
- Keep one notification identity per long-running operation and update its state in place.
- Notification duration is state-dependent: success may auto-dismiss, errors remain until dismissed or replaced, and progress remains while the operation is active.

### 2. Tiptap selection model

- Treat the editor's ProseMirror selection as the source of truth for the active target.
- Store both selected text and a stable selection anchor/range; selected text alone is insufficient for safe replacement.
- Use a BubbleMenu-style component driven by the editor instance and selection lifecycle rather than a hard-coded absolute page coordinate.
- Prevent toolbar `mousedown` from blurring the editor or changing the range before the action is dispatched.
- When the document changes, verify the stored range and original selected text before accepting a result. If verification fails, require the user to reselect.
- Keep selection highlight, AI decoration and pending suggestion state separate; clearing a Suggestion must never clear the user's normal selection unexpectedly.

### 3. AI suggestion and Diff state machine

Use the following externally observable states:

`idle → generating → pending_review → accepted | rejected | stale | failed | cancelled`

- `generating` never changes the canonical Markdown.
- `pending_review` renders inline decorations and a Diff panel.
- `accepted` writes the replacement through the existing chapter/revision service and removes the decoration.
- `rejected` leaves the source unchanged and records the rejection state.
- `stale` occurs when the source chapter or selection no longer matches the request snapshot; it cannot be auto-applied.
- `failed` and `cancelled` restore an actionable UI state and retain a safe error message.
- Every suggestion records operation, source node/agent, chapter path, scene, selection snapshot, original text, replacement text, request ID and revision linkage.

Use semantic visual tokens:

- Normal Tiptap selection: selection blue/purple, no semantic “changed” meaning.
- Added content: green text tint/background.
- Removed content: red tint and deletion treatment in Diff view; avoid deleting source text in the live editor before acceptance.
- Changed/replaced content: amber or violet marker around the replacement.
- Stale content: muted warning treatment with a “重新选择并重试” action.

Inline decorations are presentation state only. Canonical source remains Markdown and is changed only by an explicit service action.

### 4. AI response classification

All AI results must be classified before rendering an action:

- `explanation`: Chat-only, no write action.
- `analysis`: Chat or diagnostic card, no write action.
- `draft`: eligible for Suggestion/Diff after validation.
- `review`: findings and recommendation, no write action.
- `canon-proposal`: enters Canon Review.
- `image-proposal`: enters Illustration/Asset flow.
- `instruction`: workflow control data, never article content.

The write boundary accepts only a validated Draft or an explicitly approved edited Draft. Human-readable prefixes such as writing habits, positioning, confirmation, review notes and process explanations must be rejected or routed to metadata. A raw string from Chat, Reviewer or a generic utility node is never implicitly treated as article content.

### 5. Editor Markdown capability

- Keep Markdown as the canonical source of prose.
- Configure Tiptap extensions for headings, marks, lists, task lists, blockquotes, code, links, images, tables and horizontal rules.
- Add explicit conversion rules for asset-backed images, tables and task list checked state.
- Validate round-trip behavior with Chinese text, multiline paragraphs, nested formatting, relative asset paths, links, tables, task lists and fenced code.
- If a Markdown construct cannot be represented safely in Tiptap, preserve it as an explicit protected block or refuse the save with a visible warning; never silently discard it.
- Render AI answer Markdown in Chat with a separate renderer from the editable Tiptap document. Chat HTML must be sanitized and must not be inserted into the editor as trusted HTML.

### 6. Chat information architecture

Use two surfaces with one session model:

- Quick Chat Drawer/right panel: current question, compact recent answer, current selection badge and “在 Chat 工作区打开”. It is optimized for one-shot questions.
- Chat Workspace: wide message column, session list, composer, source/context inspector and action rail. It is optimized for multi-turn writing work.

The full workspace should reserve a readable message width rather than allowing the entire response to stretch across the screen. On smaller windows, the session list and context inspector collapse into drawers; the message column remains the priority.

Each assistant response may expose actions based on its classified type:

- Explanation/analysis: Copy, Quote, Ask follow-up, Save Note.
- Draft: Preview Diff, Apply to Selection, Append, Replace, Retry, Reject.
- Canon proposal: Open Canon Review, Apply, Reject.
- Image proposal: Open Illustration Studio.
- Workflow result: Open run details, Resume Review, Retry failed nodes.

The composer displays scope chips for project, chapter, scene and selection. Removing a chip changes the request context explicitly, rather than silently changing the active editor.

### 7. Workflow and editor synchronization

- Workflow write-back emits a typed completion event containing run ID, target chapter and revision ID.
- The renderer compares the event target with the active chapter before refreshing the editor.
- If the user is editing the same chapter while the Workflow completes, show a conflict notification and require a reload/compare decision instead of overwriting unsaved content.
- Workflow Review uses the same Diff presentation as selection AI Edit, but keeps its run/node provenance visible.

### 8. Accessibility and responsive behavior

- All floating tools have keyboard focus order, visible focus rings, labels and shortcut hints where available.
- Selection toolbar remains keyboard reachable and does not rely on hover only.
- Notification messages use `aria-live` with polite progress and assertive errors; repeated progress updates must not spam announcements.
- Chat code, tables and long unbroken paths wrap or scroll within their own blocks, never expanding the application layout horizontally.
- Right panel and Chat Workspace use `min-width: 0`, `min-height: 0`, explicit scroll ownership and `overflow-x: hidden` at layout boundaries.

## Testing Decisions

Good tests verify externally visible behavior through public editor, service and IPC boundaries. They should not assert private React state, DOM implementation details or a specific internal helper name.

Test layers:

1. Notification component tests verify fixed-surface semantics through rendered role/aria behavior, multiline wrapping classes, state changes, dismissal and queue ordering.
2. Tiptap editor tests verify that a selection exposes the correct toolbar actions, preserves the target on toolbar click, and clears/marks stale ranges correctly.
3. AI Edit integration tests verify rewrite, append, continue, explanation-only and stale-selection behavior; acceptance must create a Revision and rejection must leave Markdown unchanged.
4. Diff tests verify unchanged/add/remove/replace segments and that pending decorations do not mutate canonical Markdown.
5. Markdown round-trip tests verify headings, marks, lists, task state, quote, code, links, images, tables, Chinese multiline prose and unsupported-block safety.
6. Workflow integration tests verify Draft-only write-back, Review/Instruction rejection, approve/edit/reject behavior, immediate target refresh events and no partial writes on failure/cancel.
7. Chat renderer tests verify Markdown rendering, sanitized HTML, code/table actions, source references, message action routing and long-content wrapping.
8. Component/E2E tests verify the critical user path: open chapter → select text → invoke rewrite → inspect colored Diff → reject → retry → accept → see saved revision; and open Chat → ask explanation → turn a later draft into a Suggestion → apply only after confirmation.
9. Responsive checks verify narrow right panels, long Workflow logs, long Agent names, multiline notifications and full Chat at the supported minimum viewport.
10. Existing golden-path and runtime fixture checks remain required; fixture success cannot be used as a substitute for a real renderer interaction check.

Regression cases that must be retained:

- Writer output beginning with writing habits, positioning, confirmation or review instructions never changes the chapter.
- A raw Reviewer or Chat explanation never reaches chapter write-back.
- A stale selection cannot replace newer text.
- Rejecting a Suggestion, Workflow Review or Chat draft leaves the canonical Markdown byte-for-byte unchanged.
- Accepting a suggestion creates exactly one Revision and refreshes the active editor.
- A table, checked task item, image asset path or fenced code block survives open/edit/save.
- Long messages and Workflow node names wrap without horizontal overflow.

## Out of Scope

- Multi-user collaboration, simultaneous remote cursors and server-side shared sessions.
- Provider billing, model marketplace and automatic model selection beyond the existing provider policy.
- Fully autonomous AI write-back without human confirmation.
- Rich Word/PDF layout editing; export formats continue to be separate from the Markdown source editor.
- Online Chat synchronization across devices.
- Plugin-provided editor extensions without an explicit permission and schema contract.
- Apple/Windows signing, notarization and auto-update behavior.

## Further Notes

- The reference prototype establishes the intended spatial relationship: the BubbleMenu belongs to the selected text, the Diff belongs to the editor review flow, and Agent/Workflow/Outline are auxiliary tools rather than substitutes for a readable writing surface.
- The current right panel should not become a second full editor. Keep it useful for inspection and quick actions, then move sustained conversation into Chat Workspace.
- The implementation should be delivered in vertical slices: notification positioning; selection + toolbar; one complete Diff operation; Chat Workspace with one end-to-end action; then Markdown coverage and responsive hardening.
- Before implementation begins, the PRD should be converted into an implementation plan with explicit API boundaries and user-visible checkpoints. The local repository currently has no configured issue tracker integration, so this document is the authoritative local PRD until one is connected.
