# 章节删除引用完整性设计

## 背景

章节 Markdown 是正文内容源，SQLite 保存可重建索引、Notes、Revision、Workflow 状态，`story/timeline.yaml` 保存时间线源文件。删除章节如果只删除 `chapters/*.md`，会留下时间线章节引用、章节 Notes、Revision 或运行记录，导致 Story Bible、Context 和恢复结果互相矛盾。

## 目标

删除一个章节后：

1. 正文文件和 `documents`/FTS 索引不再包含该章节。
2. `story/timeline.yaml` 与 `timeline_events` 中指向该章节的事件改为无章节关联，而不是留下悬空路径。
3. 章节 Notes 被删除；Revision 与 Workflow 历史保留，作为审计和恢复证据。
4. 删除操作通过 Revision 记录章节原文到空文本的逆向证据；不删除 Canon facts。
5. UI 显示明确的成功/失败反馈，不能静默吞掉 IPC 错误。
6. 重开项目、repair index 后，结果仍与内容源一致。

## 非目标

- 不自动删除 Canon facts、Story Bible 实体、图片资产或 Workflow 历史。
- 不实现完整垃圾回收或回收站；恢复使用 Revision/Checkpoint。
- 不改变 Markdown 编辑器格式和 Provider 协议。

## 方案与数据流

在 Main 的 `ChapterService.remove()` 内执行一个有界、可审计的删除流程：先读取章节及受影响 Timeline 事件，再创建章节删除 Revision；删除章节文件和 Notes/文档索引；更新 Timeline SQLite 行并由同一份受校验的 YAML 序列化逻辑写回源文件；最后返回删除结果。文件使用 atomic write，IPC 错误统一返回脱敏 `Result`。

```text
Renderer Sidebar 删除
  → preload chapter.remove
  → Main IPC Zod relPath 校验
  → ChapterService 读取章节/引用
  → RevisionService 保留逆向证据
  → Markdown、Notes、documents/FTS、Timeline YAML/SQLite 同步
  → Result + Renderer notice
```

## 验收标准

- 删除带 Timeline 章节引用的章节后，`checkIntegrity().danglingTimelineChapterRefs === 0`，且 YAML 中事件仍存在但 `chapterRelPath` 为 `null`。
- 删除带 Notes 的章节后，章节文件和 `chapter_notes` 记录均不存在。
- 至少有一条 `chapter-delete:<relPath>` Revision，原文非空、replacement 为空。
- 删除不存在章节返回 `PROJECT_NOT_FOUND`，不改变其他数据。
- Canon facts、实体、关系、图片资产和 Workflow run 数量不因删除章节而减少。
- runtime smoke 覆盖上述行为；允许的 `typecheck`、`diff --check`、fixture 和 release preflight 通过。

## 同一切片的路径迁移扩展

章节移动不仅是文件重命名。`ChapterService.move()` 现在对每个 old/new 路径映射同步迁移 Timeline、Chapter Notes、Revision、AI Suggestion、Workflow Run 顶层 `relPath` 和 Context summary key，并把 Revision sidecar 的 `relPath` 原子写回。Canon facts、实体、关系、图片资产和 Workflow 节点历史内容不被删除或重写。

迁移验收要求：移动后路径改变，Timeline/Notes/Revision/Workflow Run 均指向新路径；runtime smoke 必须同时报告五项为 true。
