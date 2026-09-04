# Writing Workflow and Markdown Interaction Plan

## Goal

从用户的写作流程出发，阻止 Workflow 的说明性输出误写入正文，并补齐原型图中的选区 AI 操作、Diff 审核和 Markdown 编辑能力。

## Current evidence

- `src/main/services/workflow-runtime-service.ts` 的 `chapter.write` 当前只检查输入是否为非空字符串，因此无法区分正文与写作说明。
- `human.review` 当前返回 `humanReviewOutput(input)`，审核结果没有独立的 approve/reject/edit 协议。
- `src/shared/builtin-workflow.ts` 将 `review` 直接连接到 `chapter-write`，缺少类型化输出端口。
- `src/renderer/src/components/EditorPane.tsx` 目前有 Tiptap 编辑器和选区状态，但没有原型图中的选区浮动操作条。
- `src/renderer/src/components/RightPanel.tsx` 有 Quick Actions 和 AI Suggestion，但需要与中央选区、Diff 和 Workflow 输出类型统一。
- `src/renderer/src/lib/markdown.ts` 负责 Markdown 往返转换，需要在扩展编辑能力时增加保真度测试。

## User journey

1. 用户打开章节，中央区域显示正文和保存状态。
2. 用户选中一段文字，选区上方出现“改写、扩写、缩写、续写、解释、翻译、更多”。
3. 用户选择操作，AI 只能生成待审核建议，不得直接改变 Markdown。
4. 中央区域显示 Diff，用户可以接受、拒绝或重试。
5. 用户运行 Workflow，界面先展示当前章节、场景、写回目标和需要审核的节点。
6. Writer/Rewrite 节点输出结构化草稿；Critic/Plan 节点输出分析或指令。
7. Human Review 返回 approve/reject/edit 动作，而不是任意正文字符串。
8. 只有合法草稿经过审核后才进入 Write Back。
9. 写回完成后中央编辑器立即读取最新章节内容，不需要切换 Chapter。

## Output contracts

在 `src/shared/runtime.ts` 或独立的 Workflow 类型模块中定义：

```ts
type DraftOutput = {
  kind: 'draft'
  content: string
  mode: 'replace' | 'append' | 'rewrite'
  target: 'chapter' | 'selection'
  selection?: string
  sourceNode: string
}

type ReviewOutput = {
  kind: 'review'
  findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>
  recommendation?: string
}

type HumanReviewAction = {
  action: 'approve' | 'reject' | 'edit'
  draftId?: string
  editedContent?: string
  comment?: string
}
```

Rules:

- `draft → chapter.write` is valid。
- `review → chapter.write` is invalid。
- `instruction → chapter.write` is invalid。
- `HumanReviewAction` is valid only as an approval decision and must resolve to a previously validated draft。
- `asset → image.insert` is valid。

## Phase 1: Prevent incorrect write-back

Files:

- Modify `src/shared/runtime.ts` and `src/shared/workflow.ts` for output types and port types。
- Modify `src/main/services/workflow-runtime-service.ts` so `chapter.write` accepts only `DraftOutput` or an approved edited draft。
- Modify `src/main/services/workflow-runtime.ts` to persist and pass approval actions separately from node outputs。
- Modify `src/shared/builtin-workflow.ts` so review output does not masquerade as article content。
- Add tests under `tests/workflow-runtime.test.ts` and a new focused output-validation test。

User-visible behavior:

- 说明、定位、写作习惯、审核意见、分析过程不会写进章节。
- 检测到不合法输出时 Workflow 暂停并说明原因。
- 原正文保持不变。

Acceptance cases:

- “好的，以下是改写建议”被拒绝写回。
- “写作习惯：保持克制叙事”被拒绝写回。
- 合法小说段落能够写回。
- 空输出、代码围栏、超长输出被拒绝或要求人工处理。

## Phase 2: Human Review and safe write-back

Files:

- Modify `src/renderer/src/components/RightPanel.tsx` for approve/reject/edit UI。
- Modify `src/shared/runtime.ts` for review state and approved draft references。
- Modify `src/main/services/workflow-runtime-service.ts` for action validation。
- Modify `src/renderer/src/store/app-store.ts` for immediate chapter refresh。

Flow:

- Review card displays the draft, not the reviewer instruction。
- Approve uses the stored draft。
- Edit validates and writes only the edited draft。
- Reject ends the write-back branch and keeps the original chapter。
- Success refreshes the central editor immediately。
- Every write creates a Revision。

## Phase 3: Selection toolbar and AI edit flow

Files:

- Modify `src/renderer/src/components/EditorPane.tsx` to add a Tiptap selection toolbar。
- Add a focused `SelectionToolbar.tsx` component if the toolbar exceeds one responsibility。
- Modify `src/renderer/src/components/RightPanel.tsx` to show the selected operation and result。
- Modify `src/renderer/src/store/app-store.ts` to preserve a selection anchor/range, not only selected text。
- Extend `tests/ai-edit.test.ts` and add renderer component tests。

Actions:

- 改写：替换选区。
- 扩写：保留原文并扩展上下文。
- 缩写：压缩选区但保留关键事实。
- 续写：在选区后追加内容。
- 解释：只生成解释，不写正文。
- 翻译：生成可审核的替换建议。
- 更多：自定义指令、改变语气、增强冲突、增加环境描写、删除重复。

Safety:

- AI 请求记录章节路径、选区文本和稳定范围。
- 选区不再存在时拒绝自动替换。
- 接受 Diff 后只修改原目标范围。
- 拒绝或取消后正文完全不变。

## Phase 4: Markdown editing fidelity

Files:

- Modify `src/renderer/src/lib/markdown.ts`。
- Modify `src/renderer/src/components/EditorPane.tsx` extensions。
- Add Markdown round-trip tests under `tests/markdown.test.ts`。

Required support:

- H1-H6、粗体、斜体、删除线。
- 有序/无序列表、任务列表。
- 引用、代码块、行内代码、分隔线。
- 链接、图片、表格。
- 中文段落和多行换行。
- 图片相对路径与 `data-asset-id`。
- 不支持的 Markdown 不得静默丢失。
- 正文源始终是 Markdown；编辑器只是可视化层。

## Phase 5: IDE interaction and regression verification

Files:

- Modify `src/renderer/src/styles/app.css` and focused component CSS。
- Add E2E coverage for critical user journeys。

UI requirements:

- 选区工具条跟随选区并在窄窗口换行。
- Diff 卡片可滚动，不发生横向溢出。
- Agent、Workflow、中央编辑区的状态提示使用统一 Notification。
- Workflow 长节点、日志和审核内容可换行、可纵向滚动。
- 中央编辑区在 Workflow 写回后立即刷新。

## Verification matrix

| Scenario | Expected result |
| --- | --- |
| Writer 输出正文 | 生成 draft，审核后可写回 |
| Writer 输出写作习惯 | 被拦截，不修改正文 |
| Reviewer 输出说明 | 只显示在审核卡片，不写入正文 |
| 用户 Reject | 正文不变 |
| 用户 Edit 后 Approve | 仅写入编辑后的合法正文 |
| 选区改写 | 只替换选区并生成 Revision |
| 选区续写 | 在选区后追加并生成 Revision |
| Markdown 表格/图片 | 往返转换不丢失 |
| Workflow 写回成功 | 中央编辑区立即显示新内容 |
| 失败/超时/取消 | 不产生部分正文写回 |

## Implementation order

按 Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 实施。Phase 1 和 Phase 2 是数据安全前置条件，在它们完成并通过测试前，不扩展更多 AI 写作入口。
