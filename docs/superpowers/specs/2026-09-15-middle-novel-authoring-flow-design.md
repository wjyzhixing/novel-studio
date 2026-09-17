# 中篇小说从零创作流程设计

## 目标

在 Novel Studio 中提供一条可复用的“从灵感到完稿”创作路径，并用一部可直接打开的原创中文中篇小说《雾港来信》验证这条路径。用户可以先建立故事资料，再逐章运行 AI 辅助流程；所有 AI 生成内容都经过人工审核后才写回正文。

## 范围

本次交付拆成两个互相衔接的子项目：

1. **创作方法层**：在小说项目中保存 premise、Story Bible、卷结构、章节表、时间线、伏笔和修订清单。
2. **章节执行层**：创建一个使用现有 Workflow 节点的章节创作 DAG，并用确定性测试验证规划、写作、审阅、写回和记忆提取边界。

不新增第三方模型、不自动接受 AI 草稿、不把全书规划强行塞进一次 Workflow Run。全书流程由作者逐章推进，章节 Workflow 负责一次章节的可审阅闭环。

## 默认示例小说

- 书名：《雾港来信》
- 类型：都市悬疑 / 成长
- 目标篇幅：3–5 万字
- 结构：3 幕、14 章、2 卷
- 一句话 premise：旧录音修复师林岚收到一盘来自十五年前的录音，里面有已故父亲的求救声；她必须查清录音来源，并面对父亲当年真正隐藏的真相。

题材、书名和故事内容都放在示例项目内，不能改变 Novel Studio 对其他项目的默认行为。

## 用户流程

```text
premise → Story Bible → 三幕大纲 → 卷/章节表
       → 选择一章 → Context → Plan → Write
       → 角色/逻辑/文风检查 → 合并意见 → Rewrite
       → Human Review → 写回 Markdown → Memory/Canon
       → 下一章 → 全稿修订 → 导出
```

### 项目资料阶段

示例项目必须包含：

- `story/premise.md`：故事前提、主题、叙事视角、目标篇幅和禁写事项。
- `story/outline.md`：三幕结构和 14 章的目标、冲突、转折、结尾钩子。
- `story/volumes.yaml`：两卷及其章节路径，引用必须指向真实章节或为空。
- `story/timeline.yaml`：已发生事件和章节引用。
- `story/artifacts.yaml`：至少一条可追踪伏笔及其回收状态。
- `characters/`：林岚和三个重要配角的结构化设定。
- `world/`：雾港、旧录音修复店、十五年前事故现场等地点/规则资料。
- `prompts/`：规划、写作、三类批评、重写和记忆提取的项目级提示词。

### 章节执行阶段

专属流程 `flow_middle_novel_authoring` 使用已注册节点：

```text
input.chapter
 → context.load
 → ai.prompt(plot-planner)
 → ai.prompt(writer)
 → ai.critic(character-critic) ┐
 → ai.critic(logic-critic)     ├→ logic.merge
 → ai.critic(style-critic)    ┘       → ai.prompt(rewrite)
                                      → human.review
                                      → chapter.write
                                      → memory.extract
```

图片节点保持可选，不成为正文闭环的前置条件。`human.review` 是唯一允许作者确认写回的边界。

## 数据与安全边界

- Markdown 章节是正文 source of truth；SQLite 只保存索引、运行记录和修订证据。
- Canon/Memory 提取只产生候选事实，不能绕过人工审阅静默修改 Canon。
- 所有 Workflow 节点必须通过现有 `workflowSchema` 和 `validateWorkflow`。
- 所有卷、时间线和伏笔引用必须能被完整性检查解析。
- 不修改用户当前已有的示例或未提交内容；新示例使用独立目录。

## 测试验收

1. 新流程 JSON 通过 schema 和 Workflow validation，无未知节点、缺失输入、端口错误或环路。
2. 流程文件被 `WorkflowService.list/read` 识别，名称和 ID 稳定。
3. 确定性 Provider 可以跑通第一章的章节闭环；运行在人工审阅前不得写回章节。
4. 审阅通过后才产生章节写回 Revision，正文仍是有效 Markdown。
5. Memory 提取结果不会直接变成 Canon fact；完整性检查没有悬空卷/时间线/伏笔引用。
6. 示例项目能被打开并索引，章节数、角色数、伏笔数和时间线事件数与资料文件一致。
7. 现有测试、类型检查和构建不回归。

## 非目标

- 本次不实现自动生成 3–5 万字全文。
- 本次不替用户决定最终剧情、不自动发布或联网投稿。
- 本次不重构现有 Workflow 编辑器或 Provider 系统。
- 本次不提交 `.novel/project.db`、模型缓存或生成图片二进制。

