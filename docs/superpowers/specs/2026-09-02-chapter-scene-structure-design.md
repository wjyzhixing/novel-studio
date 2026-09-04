# 章节与场景结构设计

## 目标

为 Writer、Context、Workflow 和 Illustration Studio 提供稳定的场景粒度，同时保持 Markdown 为正文唯一内容源。作者可以在一个章节内组织多个场景，并通过稳定的场景 ID 让 AI、插图和审计引用同一段内容。

## 范围

本阶段只实现章节内场景元数据与基础树形展示，不改变现有章节文件命名，也不把正文迁移到数据库。

- 场景元数据保存为 `chapters/<chapter-stem>.scenes.yaml`，与章节 Markdown 同级。
- 每个场景拥有稳定 UUID、标题、顺序、起止段落锚点和可选摘要。
- 场景锚点使用 Markdown 段落序号，不依赖易变的字符偏移；正文保存后可通过段落数量校验并安全降级。
- Main 负责路径校验、YAML schema 校验、原子写入和章节存在性校验；SQLite 只保存可重建的场景索引。
- Renderer 通过 typed preload 调用场景列表、创建、更新、删除和排序接口。
- 当前编辑器继续按整章读取/保存；场景选择先作为结构和后续 Workflow/插图的引用入口，不在本切片强行重写编辑器。

## 数据模型

```ts
type ChapterScene = {
  id: string
  chapterRelPath: string
  title: string
  order: number
  startParagraph: number
  endParagraph: number
  summary: string
  createdAt: string
  updatedAt: string
}
```

不允许场景跨章节；`0 <= startParagraph <= endParagraph`，段落边界超过当前正文时保存失败。删除场景只删除元数据，不删除正文。移动场景只重排 `order`，不改变正文。

## 数据流

```text
Renderer 场景树
  → preload chapter-scene IPC
  → Main Zod 校验 + ChapterService
  → chapters/*.scenes.yaml 原子写入
  → SQLite scenes 派生索引
  → Result<T>
  → Renderer 更新树和状态提示
```

章节移动时，sidecar 与章节一起改名；章节删除时删除 sidecar，并清理场景索引。若 sidecar 损坏，章节仍可打开，完整性检查报告问题，不能静默覆盖原文件。

## 错误与边界

- 未打开项目、章节不存在、路径越界：返回现有 DomainError/Result 错误。
- YAML 非法或 schema 版本过新：拒绝读取并显示可操作错误，不修改文件。
- 段落边界失效：拒绝保存并提示重新选择场景范围。
- 原子写失败：保留旧 sidecar，Renderer 显示保存失败。
- 旧项目没有 sidecar：返回空场景列表，不自动篡改章节正文。

## 后续接口预留

后续切片可将 `sceneId` 加入 Context 请求、Workflow 输入、Image Proposal 和 Revision provenance；这些能力必须复用本阶段稳定 ID，不通过标题或字符偏移猜测场景。

## 验收标准

1. 新建、读取、更新、删除和排序场景可通过 Main/preload/UI 闭环完成。
2. 重开项目后场景 ID、顺序和范围保持不变。
3. 章节移动后 sidecar 跟随新路径，章节删除后不留场景索引。
4. 非法边界、非法路径、损坏 YAML 和未来 schema 都有明确错误且不破坏原文件。
5. Markdown 正文、Canon、Revision 和 Workflow 历史不因场景 CRUD 被静默修改。

