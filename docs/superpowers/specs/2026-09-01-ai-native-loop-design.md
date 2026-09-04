# AI Native 创作闭环设计

## 目标

让右侧 Ask Agent、Quick Actions 和 Workflow AI 节点共享真实的 Provider、Context、Agent 配置与流式执行链路；保留 Suggestion/Diff、Canon 审计和 Provider secret 隔离。

## 设计

- `ContextService` 负责按当前章节、选区、Story Bible、Canon、Timeline 和搜索结果生成可审计的 `ContextManifest`。
- `AgentService` 负责内置 Agent 的 system prompt、模型参数、输出策略和 prompt 文件加载；不允许业务 UI 直接拼 provider 判断。
- `AiService` 暴露同步 chat 与流式 stream；Chat 会话由 Renderer 保存展示，Main 只执行请求，不持有会话 UI 状态。
- Ask Agent 使用流式 Chat；Quick Actions 使用同一 Agent 链但输出进入 AI Suggestion/Diff；Workflow 节点使用节点配置指定 Agent，并持久化节点输出。
- Provider profile 与 secret 分离：profile 写入项目 `.novel/project.db`/`novel.yaml`，secret 只写系统 safeStorage。
- 图片 Provider 使用独立 `ImageProvider`，先支持 OpenAI-compatible 图片接口；无真实 Provider 时明确返回配置错误，不再伪造 SVG 成功结果。

## 验收标准

1. 当前项目默认 Provider 可用于 Ask Agent、Quick Actions 和 Workflow AI 节点。
2. Ask Agent 请求包含 Context Manifest，并支持增量 delta、完成、错误、取消。
3. Agent prompt 来自版本化 prompt 文件；不同 Agent 有明确职责。
4. AI 改正文只生成 Suggestion，Accept 后形成 revision，Reject 不改正文。
5. UI 不再展示静态 Claude 名称或伪造图片生成成功。
6. 所有请求错误通过统一 Result/DomainError 返回，不泄露 API key。
