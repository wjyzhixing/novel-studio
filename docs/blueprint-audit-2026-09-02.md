# Novel Studio 蓝图集成审计（2026-09-02）

## 2026-09-03 增量复核

- Electron 黄金路径首段现已稳定通过真实窗口验证：临时 fixture 项目打开、章节列表/章节、编辑器/右侧面板显示，以及 Agent Chat 经 Context manifest 返回 assistant 结果。此前 Chat 偶发误报“尚未配置 Provider”的根因是 Renderer 组件在 reload 后短暂持有旧的空 Provider 快照；Chat 操作边界现会向 Main 重新读取权威项目配置后再发起请求。该修复不改变 Provider 存储或默认选择逻辑。
- Electron 黄金路径第二段已通过真实窗口验证：Quick Action 生成 Suggestion 后，真实 UI 完成 Accept 写入与第二次 Suggestion 的 Reject；AI 输出仍先落为待确认 Suggestion。
- Electron 黄金路径第三段已通过真实窗口验证：Canon Proposal 经底部 Canon Review UI 完成 Apply/Revert，并显示 `reverted` 状态；同时修复 preload/Renderer 的 Canon Revert 方法名漂移。
- Electron 黄金路径现已通过完整本地 fixture 窗口链路：Workflow 两次人工暂停/恢复、Illustration Studio 提案/生成/刷新/插入/删除，以及临时目标章节导入、HTML 导出和备份创建均通过；总计 10 个顺序步骤全部 passed。
- 开放格式切片已补齐 Lore 独立 Markdown 源：Story Bible 保存 Lore 会同步 `world/lore/<artifactId>.md`，索引修复在统一 `story/artifacts.yaml` 缺失时可从该源重建；runtime smoke 已验证保存、源文件内容和重建结果。
- 项目完整性切片已增加源文件 schema 报告：健康面板与 `repairIndexes()` 会列出无效 Lore Markdown，保留原文件并避免静默丢弃；runtime smoke 已验证损坏源文件被报告。
- 源文件校验已扩展到实体 YAML、Timeline YAML、Relation YAML 和 `story/artifacts.yaml`，报告会定位到文件及列表项索引；当前 repair 对这些异常源仍以保留并报告为主，后续补逐类恢复报告。
- Asset sidecar 校验已接入共享 `imageAssetMetadataSchema`：检查和 repair 会拒绝非法 Asset ID、项目外路径、非图片 MIME 或缺失 provenance 字段，并在 `invalidSourceFiles` 中定位 sidecar。
- 右侧 Agent 的“总结”快捷动作已补齐真实 Context 链路：先按当前章节、选中场景和选区调用 `context.build`，再将 `ContextResult.text` 交给 Provider；同时更新 Context Inspector 和 Snapshot 列表。Context 构建失败会在 Provider 调用前明确反馈。
- Provider 设置的“连接 / 模型能力 / 费用与密钥”已从视觉 Tab 改为真正分区渲染；文本、Embedding、图片模型及两套 Key 不再同时堆在一个表单中，保存/测试 IPC 和独立 secret 存储保持不变。
- 当项目没有默认 Provider 时，首次保存 profile 会自动写入默认引用；已有默认 profile 时保存不会隐式切换，避免覆盖用户当前选择。
- Main `AiService.saveProfile()` 已移除隐式切换默认的副作用；runtime smoke 已验证“保存保持原默认、显式选择才切换”。
- 旧 Workflow Run 无法唯一恢复章节路径时，“用当前章节重新运行”现在真正启动当前章节的默认 Workflow；仍有明确历史路径的失败 Run 才走原目标 Retry。
- 本次未运行 `test` 或 `build`；`node scripts/golden-path-electron.mjs` 已通过 10 个步骤，包含项目/章节/工作台、Chat-Context、Suggestion、Canon、Workflow、Illustration、备份/导入/导出。
- 真实 Provider/Image Provider 未在本次用现场密钥调用；运行时结果仅证明 fixture 协议、数据边界和幂等行为。
- 章节 1–20 的核心数据流继续保持闭环；章节 21–35 的结论不变：完整 Electron 黄金路径、插件/Community Workflow、国际化/无障碍完整验收、发布签名/更新和 schema rollback 仍是未完成或部分能力。

依据：`Novel-Studio-完整开发蓝图-v1.0.docx`，结合当前源码静态核验。验证约束：未运行 test/build；已运行 `npm run typecheck`、`node scripts/golden-path-electron.mjs` 与 `git diff --check`。

状态含义：`已通` 表示存在真实文件/SQLite/IPC/UI 闭环；`部分` 表示有基础实现但缺少蓝图要求的完整能力；`未通` 表示当前仍没有对应产品链路。

## 章节核验

| 章节 | 状态 | 当前证据 / 缺口 |
| --- | --- | --- |
| 1 产品原则 | 部分 | Human-gated Canon、Local-first、Open Format、Reversible 已落地；长篇规模与完整 Workflow First 仍需 hardening。 |
| 2 核心场景 | 部分 | 创建项目→写章→AI→Proposal→Apply→插图→正文→导出具备真实服务链路；长篇 runtime smoke 已覆盖 migration/修复/导入导出；Renderer 直开时菜单 bridge 缺失会降级到欢迎页，正常 Electron preload 路径仍缺整条 UI E2E 证据。 |
| 3 五大工作区 | 部分 | Writer/Story/Workflow/Images/Graph Studio 已有；Graph 关系编辑和 Timeline 分组/过滤已补，仍缺完整高级探索。 |
| 4 技术架构 | 已通 | Renderer 通过 preload；Main 持有 fs/SQLite/provider/secret；Workflow Runtime 与 React Flow 分离。 |
| 5 Electron 架构 | 部分 | IPC 白名单、Zod 校验、window-open/navigation/redirect/webview 拦截和打包模式严格 CSP header 已接入；Renderer 现可在菜单 preload 缺失时安全降级；有界队列与持久化 Workflow jobs 已接入，worker/完整后台 JobManager、网络白名单和最终人工审查需补。 |
| 6 项目文件格式 | 部分 | novel.yaml、Markdown/YAML/JSON、图片 sidecar 和 Lore 独立 Markdown 源已存在；实体/Timeline/Relation/Artifact/Asset sidecar schema 异常现在可定位报告；全项目 import/export 仍缺。 |
| 7 数据库模型 | 部分 | documents/entities/facts/relations/timeline/proposals/revisions/workflow/assets/settings/jobs 等核心表存在；时间线实体悬空引用现可检测；jobs 已记录 queued/running/waiting_human/succeeded/failed/cancelled、attempts/error；新增 `embeddings` 可重建索引表（向量、模型、内容哈希和派生预览），`context_snapshots` 含格式/项目 schema/检索版本索引字段；token/cost 作为 Workflow diagnostics 记录，未单独建表。 |
| 8 Chapter Writer | 部分 | Markdown 主文件、autosave、atomic write、AI Suggestion/Diff、图片 Asset ID、Revision 存在；图片 DOM 属性顺序回链已加固；章节内场景 sidecar、稳定 scene ID、场景 CRUD/范围/排序和移动删除回链已接入；卷树已使用 `story/volumes.yaml` 分组，章节移动/删除会维护卷归属；场景级编辑/强杀恢复仍不完整；Revision Diff 已支持逐段对齐和逐字符新增/删除标记。 |
| 9 Story Bible | 部分 | Character/Place/Org/Item、Artifact、Timeline CRUD 与文件同步存在；关系编辑回显、实体/章节过滤、时间分组、Event 参与者/地点/原因/结果和伏笔证据已接通；更高级探索与异常旧数据修复报告仍需补。 |
| 10 Canon/Memory | 已通基础闭环 | Extract→Proposal→Human Apply/Revert、source/workflow 引用、冲突检查存在；同一属性的 temporal scope 已支持非重叠历史值，relation.update、knowledge leak、更多确定性冲突规则仍需扩展。 |
| 11 Workflow DAG/Runtime | 部分 | 拓扑/端口校验、并行、取消（含排队 Run）、重试、Human pause/resume、持久化 run、Main 有界 FIFO 队列、排队取消、节点 timeout、重复 Run ID 拒绝、重启中断恢复已接入；内置流程现已实际串联 image.propose→image.generate→image.select→image.insert，并由 runtime smoke 验证两次人工暂停/恢复；节点显式 retry 与 Agent policy maxRetries、变量解析、图片副作用幂等、场景 ID 持久化并传入 Context/Image 节点已进入 Runtime；通用副作用 ledger/完整幂等策略仍不完整。 |
| 12 Agent | 部分 | 内置 Agent、Prompt Pack、Context recipe 和 output schema 基础存在；Memory Extractor 现在通过 Main-owned `structured<T>` parser 校验后才生成 Canon Proposal；已增加类型化 Agent policy（temperature、max output、context recipe、tools、output schema、maxRetries），Workflow AI 节点可覆盖关键参数；独立工具执行、动态 policy 持久化和更细粒度 cost 仍不完整。 |
| 13 Context/RAG | 部分 | Pinned/Structured/Recency/FTS 与 manifest 已有；检索命中按章节独立进入 ContextItem，Embedding Provider 与 `EmbeddingIndexService` 已接入，按内容哈希增量同步并用余弦相似度排序，失败或未配置时回退 FTS；ProviderSettings 可保存模型发现的 `contextWindow`，Main 按模型窗口、预留输出和安全余量收敛 Context budget；Snapshot 有保留上限、格式/项目 schema/检索算法版本元数据，旧快照兼容读取、旧检索版本会迁移到当前版本，未来格式明确拒绝；跨版本检索结果迁移策略仍需补。 |
| 14 Illustration | 部分 | Art Direction、Visual Identity、scene proposal、独立图片 key、Provider、provenance、预览/删除/插入/Revision 已通；选中场景后 proposal 只读取对应段落并回传 sceneId；严格 Provider 请求现仅发送 model/prompt，variants 在本地循环；资产引用图和真正 UI/E2E 验收、局部重做仍偏基础。 |
| 15 Provider | 部分 | Provider profile 与 secret 分离，文本/图片/Embedding 独立 URL/model/key（Embedding 使用文本 Provider 的独立 model 字段），OpenAI-compatible 文本、图片和 embedding 已接；失效 profile 在项目打开时自动收敛到已配置 profile，严格图片请求、两变体和独立图片连接测试 runtime smoke 已验证；URL 已限制为 HTTPS/本机 HTTP 且拒绝 query 凭据；OpenAI-compatible/Anthropic/Gemini 均有统一 `structured<T>` Main 侧 parser 入口；模型窗口可发现并参与 Context budget，原生 response schema 和更多 Provider 元数据仍待补。 |
| 16 Version/Diff/Audit | 部分 | AI 编辑、图片插入、Canon Apply 有 Revision/审计；已增加项目级命名 Checkpoint（文件快照、恢复后索引重建）；Diff 面板现可选择完整历史、显示 actor/source/path，并按段落展示逐字符新增/删除标记，删除正文后的历史只读保护已接入；完整 patch、所有破坏性操作 actor 追踪仍需补。 |
| 17 搜索/Palette | 部分 | FTS、Command Palette、章节搜索、索引修复已有；Palette 现可通过 typed `story.search` 搜索实体并按实体类型打开 Story Bible、自动选中目标；统一 action registry 和更完整的全局搜索范围仍缺。 |
| 18 导入导出/备份 | 部分 | zip backup/restore 已接入 Welcome/Workbench UI，并保留空目录、路径穿越和 manifest 校验；Markdown/TXT 导入、Markdown/plain/HTML 全章节导出已接入真实 IPC，导出扩展名和项目内覆盖现有安全校验；Checkpoint 已接入顶部 UI；全量 manifest、基于全量包的增量备份和叠加恢复已有 runtime smoke，仍需真实用户项目与发布级备份兼容验收。 |
| 19 安全隐私 | 部分 | safeStorage、路径沙箱、IPC 校验、Renderer 无 Node、secret 不入项目存在；已停止复制 Renderer console 内容、限制开发加载错误日志、对 IPC/provider 错误敏感字段脱敏，并在打包模式强制严格 CSP，导出 metadata 清理和 rate limit 仍需补。 |
| 20 性能可靠性 | 部分 | WAL、FTS、单章加载、atomic write、autosave 存在；runtime smoke 已实际核验 1000 章/1000 实体/100k facts fixture、四位编号索引修复、章节窗口化、队列并发和 crash recovery，低端设备基线仍未验证。 |
| 21 测试策略 | 未通 | `tests/` 有文件和 Vitest 配置，但本轮按要求未运行；当前以独立 runtime smoke 覆盖 migration、Provider 请求、图片连接测试、Checkpoint、Workflow 恢复和 load fixture，仍缺可证明的 80% coverage、组件/E2E/golden 结果。 |
| 22 Observability | 部分 | Developer Panel 已展示 Workflow 节点状态、错误、输入/输出摘要、provider/model/requestId/context/duration/retry、错误分类和 input/output/total tokens；配置单价时显示 estimated USD cost；现额外展示持久化 Jobs 的状态、attempts、错误和更新时间，并复用 Cancel/Retry；Context Inspector 显示预算、实际用量、检索 query、候选数、选入/截断/省略项；现可通过 typed IPC 导出 metadata-only 诊断 JSON（含 AI invocation audit、剥离 payload 的 sanitized runs），目标路径沙箱、最近 500 条审计上限和敏感字段边界有 smoke 证据；完整日志筛选/压缩包和更丰富的 trace UI 仍待补。 |
| 23 插件体系 | 部分 | 已新增 Main-owned、不可执行 Renderer 插件代码的 Provider/Workflow Node/Importer/Exporter typed contracts 与去重 Registry；尚未实现签名插件包、权限预览、安装/卸载和依赖检查。 |
| 24 Community Workflow | 未通 | 仅有 `.novelflow.json` 本地文件，没有安装、权限预览、依赖检查、模板分享链路；Registry 暂不加载外部代码。 |
| 25 Design System | 部分 | Dark-first、紫色强调、panel 布局、状态色基础存在；resize/collapse/persist、统一 token/i18n key 尚缺。 |
| 26 无障碍/国际化 | 部分 | 部分按钮有 aria-label、节点有属性面板替代纯拖拽；键盘全路径、颜色之外状态信号、真正 i18n 尚缺。 |
| 27 Roadmap | 部分 | v0.1–v0.6 主体已超出基础骨架；v0.7 Hardening、v0.8 Graph Advanced、v0.9 Ecosystem、v1.0 Release 未完成。 |
| 28 Sprint 拆分 | 部分 | Sprint 1–11 的核心代码大多有对应实现；Sprint 12 的 backup/migration/E2E/load/security/package 尚未闭环。 |
| 29 DoD | 部分 | Project/Chapter/AI Edit/Canon/Workflow/Image 的基础 DoD 可追踪；`verify-runtime.mjs --long` 已证明 migration、损坏项目修复（含缺失源文件恢复）、章节导入/HTML 导出与路径拦截、Checkpoint 恢复、队列、恢复和规模索引闭环；低端设备 Performance、Release、完整安全验收没有证据。 |
| 30 风险/技术债 | 部分 | 主要架构红线遵守；富文本 roundtrip、双源冲突、Provider API 变化、缺失文件恢复仍需 fixture 和运行记录。 |
| 31 发布更新 | 未通 | 已新增并通过代码级 `release-preflight.mjs`（入口、安全配置、CSP、schema、secret 边界检查）；仍未实现安装包、签名/notarization、自动更新 channel、schema rollback、telemetry opt-in。 |
| 32 仓库结构 | 部分 | 单 Electron app 结构清晰；尚未拆 packages/contracts、project-core 等可复用包，也不影响当前 MVP。 |
| 33 IPC 合约 | 已通基础 | shared contract→preload→main→Result 链路已覆盖主要功能；jobs/asset/settings/secret 独立 namespace 尚未完全按草案拆出。 |
| 34 Schema 示例 | 部分 | zod domain schema、workflow、fact、asset provenance、章节场景 sidecar、Event 和伏笔证据 schema 存在；更完整的 schema version migration fixture 与旧数据报告仍需补。 |
| 35 开发顺序/禁止事项 | 部分 | 当前实现顺序基本遵守；下一阶段应先 hardening/import-export/fixtures，再做生态和发布，避免继续堆 UI mock；结构化输出现已纳入 Provider/Agent 主链。 |

## 当前真实数据流

```text
Renderer
  → typed preload/contextBridge
  → Main IPC + Zod
  → Project/Story/Chapter/AI/Image/Workflow services
  → Markdown/YAML/JSON/图片（内容源） + SQLite（索引/状态/审计）
  → Result<T> / runtime event
  → Renderer 状态与可见反馈
```

当前已打通的主工作流：

```text
章节输入
 → Context manifest
 → Plan/Write
 → Character/Logic/Style critics（并行）
 → Merge/Rewrite
 → Human Review pause/resume
 → Memory Extract
 → Canon Proposal（人工 Apply/Revert）
 → Image Proposal/Generate
 → Select
 → Insert Asset ID 到 Markdown
 → Revision / 可回退
```

## 仍需按优先级推进

1. P0：补真实用户项目/Provider 现场验收、跨章节 Workflow Retry 和异常路径证据；Graph 关系编辑回显、引用完整性与 workflow node run 基础证据已通。
2. P1：补全实体/Timeline/Relation/Asset 等项目文件 schema 校验、跨版本迁移和增量备份兼容验收；基础 Import/Export UI、migration-v1、broken-project repair、Lore 源文件报告和增量备份 fixture 已通。
3. P1：实现 Developer/Context Inspector，展示 context manifest、provider request id、duration、retry、错误分类。
4. P1：新增 tiny-cn、conflict-cn、image-heavy；用脚本生成 long-cn 1000 章/100k facts 作为非 test 性能检查入口。
5. P2：补跨版本检索结果迁移、Graph/Timeline 高级可视化、typed extension points、i18n/accessibility、发布更新。

## 验证记录

- `npm run typecheck`：通过。
- `git diff --check`：通过。
- `test`：按用户要求未运行。
- `build`：按用户要求未运行。
- 尚未声称真实 Provider/Image API 在本轮被重新调用；API Key 未写入文件或本审计文档。

## 本轮增量核验

### Context Snapshot / Retrieval Replay（本阶段新增）

- 新增数据库迁移 v14：`context_snapshots`；SQLite 保存索引，快照正文保存在 `.novel/cache/context-snapshots/*.json`。
- `ContextService.build()` 保存规范化 request、manifest、检索 trace、预算裁剪结果及 request/result hash。
- 新增 typed IPC：`context:snapshot-list`、`context:snapshot-read`、`context:snapshot-replay`。
- Context Inspector 展示最近快照；Replay 不调用 Provider，可判断当前章节/Story Bible 变化是否改变 Context。
- runtime smoke 已验证：快照可列出、可读取、同输入稳定回放、章节前缀变化可被检测；版本化迁移后 `migrationUserVersion=18`。
- Snapshot 已增加按章节 100 条、全项目 500 条的保留策略，清理 SQLite 索引及对应快照文件；并记录格式/项目 schema/检索算法版本，旧快照兼容读取、未来格式拒绝；Embedding/RAG 基础链路和动态 context window 已完成，跨版本检索结果迁移和更完整的诊断包体验仍待补齐。

### Story Bible 结构化字段（本阶段新增）

- `storyArtifactInputSchema` 现在按条目类型校验关键字段：Foreshadowing 必须有 `setup`、`target`，状态只能是五种生命周期状态；Lore/Rule 必须有 `scope`、`rule`；Plot 的已知字段也会做基础类型校验。
- 未知扩展字段仍保留，兼容已有项目和未来字段；校验发生在 StoryService 与 IPC 共用 schema 边界。
- runtime smoke 已验证合法伏笔可通过，非法状态/缺少目标和不完整 Lore 会被拒绝。
- Event 已增加 `causes/effects/locationId` 结构化字段，数据库迁移推进至 v15，并由 StoryService、timeline.yaml、repairIndexes 和章节移动回写链路共同维护。
- runtime smoke 已验证 v15 旧 fixture 可正常迁移并保持原有时间线/引用完整性。
- 仍未完成：独立 foreshadowing 表、伏笔证据/章节回链 UI、Event 参与者编辑器。
- 新增独立 `foreshadowing` 生命周期索引及 `story:list-foreshadowing` typed IPC；保存/删除 Story Artifact 会同步索引，旧项目首次读取会回填，Bottom Panel 已改为读取该索引。
- runtime smoke 已验证按状态查询、结构化字段和章节回链。
- Bottom Panel 已改为按生命周期状态查询独立索引，支持状态筛选、证据摘要和关联章节跳转；Story Bible 表单已支持关联章节字段。
- runtime smoke 已验证按状态查询、结构化字段和章节回链；旧项目读取时会回填索引。
- 仍未完成：事件参与者编辑器、证据专用编辑器、迁移 repair 对异常旧数据的报告。
- Timeline 已支持事件参与者多选、地点实体选择、原因和结果字段编辑，并保留章节跳转；runtime smoke 已验证事件结构字段在实体引用清理后仍保留。
- 仍未完成：证据专用编辑器、异常旧数据报告，以及真实 Electron 黄金路径的完整人工操作证据。
- `checkIntegrity()` 现在报告结构化 Story Bible 条目错误数，`repairIndexes()` 返回 `invalidStoryArtifacts`；无效 Foreshadowing 保留在内容源/通用表中，不会静默进入生命周期索引。
- Bottom Panel 的 Foreshadowing 状态筛选、证据摘要、章节跳转和 Timeline Event 参与者/地点编辑已完成；runtime smoke 已验证异常数据被报告且不进入索引。

- 图片资产删除现在按稳定 Asset ID 对当前路径、`./` 前缀和带标题引用做清理，并为每个受影响章节创建 `asset-delete:<assetId>` Revision；删除后不会保留已知的 Markdown 孤儿引用。
- Markdown 编辑器往返保留 `"<assetId>"` 标题标记；资产读取失败时显示“图片资产不可用”占位图，不再显示空 `src` 裂图，也不会阻断整章加载。
- Illustration Studio 的生成、刷新、插入、删除均有状态反馈；删除后从 Main 重新读取资产列表。
- Sidebar 章节菜单的动态定位已移出 React `style={{...}}` 属性，release preflight 的 Renderer inline-style 检查通过。
- 本轮允许验证：`npm run typecheck`、`git diff --check`、`node --check scripts/verify-runtime.mjs`、`node scripts/verify-runtime.mjs --long`、`node scripts/release-preflight.mjs` 均通过。
- 本轮未运行 test/build；当前 Electron 人工 UI 检查未通过，因为可见窗口是 Electron 默认欢迎页而非 Novel Studio，故 UI/E2E 仍不能标记为已验收。
- 后续人工核验已能启动真实 Electron 窗口并加载 Novel Studio；实际观察到项目/章节列表、Workflow waiting_human 状态、Revision 逐段 Diff 和 Illustration Studio 工作台。该证据确认启动链与 preload 基础可用，但尚未覆盖完整黄金路径，因此 UI/E2E 仍保持“部分”。
- 本阶段新增 Canon temporal scope 规则：非重叠历史值允许并存，重叠且值不同才阻断 Apply；runtime smoke 已验证两种情况。
- `generate-fixtures.mjs` + `verify-fixtures.mjs` 已验证 tiny-cn、conflict-cn、image-heavy、migration-v1、broken-project 五类 fixture；长篇 long-cn 仍由 `--long` 单独生成并核验。
- repairIndexes 现在返回 `restoredSources`，会为缺失的最小项目源文件创建空安全默认内容；导出只允许匹配格式扩展名且禁止写入当前项目根目录内。

## 本次完整核验增量（2026-09-02）

本次按第 1–35 章重新检查了“源码入口 → Main service → IPC/preload → Renderer 状态 → 内容源/SQLite/审计”的闭环。结论不是所有章节都已达到蓝图的最终 DoD：核心 MVP 数据链路已能由运行时 smoke 证明，UI 端到端、发布、生态和高级 RAG 仍然是明确缺口。

### 已确认的真实闭环

| 链路 | 证据 | 结论 |
| --- | --- | --- |
| 项目/章节 | `ProjectService` 读写 `novel.yaml` 与 `chapters/*.md`，`ChapterService` 原子保存并更新 SQLite/FTS，preload 暴露 typed IPC | 已通基础闭环 |
| Story Bible | Entity/Timeline/Artifact/Relation 通过 Main service 写 SQLite，并同步 YAML；删除实体时清理关系和时间线实体引用 | 已通，删除 Canon 主体有保护 |
| Canon | Extract/Proposal/Check/Apply/Revert 使用 facts/proposals/revisions；静态冲突与 temporal scope 均有 runtime 证据 | 已通基础闭环 |
| Agent/AI Edit | Context manifest 进入 Agent；AI Edit 先落 `ai_suggestions`，Accept 才写正文并创建 Revision | 已通 Human-gated 闭环 |
| 图片 | scene proposal → 严格 `model + prompt` 请求 → 本地资产/sidecar/SQLite → 选择 → Markdown Asset ID → 读取/删除/Revision | 已通基础闭环 |
| Workflow | built-in flow 通过两次 Human pause/resume 到 image insert；队列、取消、timeout、重启恢复、输入/输出摘要均有 smoke 证据 | 已通运行时基础闭环 |
| 备份/修复/导出 | backup/checkpoint/repair/import/export 有路径安全和临时项目恢复证据 | 已通基础闭环 |

### 本次发现并修复的断点

- 删除 Story Bible 实体原来只清理关系，可能遗留 Timeline `entityIds`；现在会同步更新 SQLite 与 `story/timeline.yaml`。
- 含 Canon facts 的实体原来可以直接删除；现在会返回 validation 错误，避免 Canon 产生悬空主体。
- 完整性检查现在新增 Timeline 悬空章节引用计数；实体引用和章节引用都会出现在 warnings。
- Workflow 状态错误原来只在右侧 Agent tab 的 message 中可见；现在 Workflow tab 也显示状态消息、失败节点错误和 Retry 入口。
- `scripts/verify-runtime.mjs` 新增上述实体删除保护/时间线回链清理的运行时验收。
- 章节移动现在会同步迁移 Timeline、Notes、Revision、AI Suggestion、Workflow Run 和 Context summary 的路径引用；runtime smoke 已验证五项引用均指向新路径。
- 项目打开时若 manifest 指向已不存在且没有可替代 profile 的 Provider ID，现在会持久化收敛为 `null`；runtime smoke 已验证 `staleProfileCleared=true`，避免 Chat/Workflow 继续触发“Provider profile 不存在”。
- 章节删除产生的 Zustand notice 现在由 App 顶部状态条统一渲染，服务层成功/失败结果不再停留在不可见状态。
- 新增 `scripts/verify-ui-contract.mjs`，静态核验五大工作区、preload namespace、选区传递、Suggestion/Workflow/插图动作、Provider 双 key 配置及 Renderer 安全边界；它不能替代真实组件/E2E 验收。

### 尚未闭环的章节级缺口

1. 第 5/20/21/29 章：没有真实低端设备性能基线，也没有可引用的组件/E2E/golden-path 运行结果；本次遵守约束未运行 test/build。
2. 第 6/7/9 章：章节删除后的 Timeline `chapterRelPath` 已会自动解除并写回 YAML，章节移动的关联路径也会同步迁移；更多 lore/规则/Event 的严格 schema 仍缺。
3. 第 12/13/22 章：token/cost 基础闭环已实现（OpenAI-compatible/Anthropic/Gemini usage 解析、可选单价、Workflow diagnostics、Developer Panel）；Memory Extractor 已走统一 structured parser；Context retrieval trace、Embedding/RAG 基础链路、动态 context window、Snapshot 版本兼容与 metadata-only 诊断 JSON 已实现；跨版本检索结果迁移和完整诊断包体验仍待补。
4. 第 15 章：失效 Provider profile 已能自动收敛，但 profile 列表读取仍是运行时 JSON 解析，Anthropic/Gemini 只有基础 adapter，`listModels`/原生结构化能力仍待完善；统一 Main-owned `structured<T>` parser 入口已接通；真实 Provider/Image 网络验证不写入本审计证据。
5. 第 23/24/31 章：插件签名/权限预览/安装卸载/回滚、Community Workflow、安装包签名 notarization、自动更新/schema rollback、telemetry opt-in 未实现。
6. 第 25/26 章：设计 token、完整 i18n、键盘全路径、无障碍语义和状态反馈仍需系统验收。

### 可重复核验命令（不含 test/build）

```bash
npm run typecheck
git diff --check
node --check scripts/verify-runtime.mjs
node scripts/verify-runtime.mjs --long
node scripts/generate-fixtures.mjs /tmp/novel-studio-fixtures
node scripts/verify-fixtures.mjs /tmp/novel-studio-fixtures
node scripts/release-preflight.mjs
```

本次实际结果：`typecheck`、`diff --check`、脚本语法、runtime smoke（含长篇规模）均通过；未运行 test/build，未将任何 API Key 写入项目、日志、fixture 或本报告。

补充结果：`node scripts/verify-ui-contract.mjs` 通过，确认 UI 关键调用链的静态契约完整；真实 UI/E2E 仍按发布门禁标记为未完成。

真实本地 Renderer 核验发现 `window.novelMenu` 不存在时 App 根组件会崩溃；已将菜单桥改为可选订阅，并在无 `novelAPI` 时落到带提示的 Welcome 页面。该路径已通过本地开发 Renderer DOM 复核；正常 Electron preload 仍需单独人工黄金路径验收。

本轮开发切片已补齐 Provider、Agent Chat、Suggestion、Story Bible、Illustration Studio 的 IPC 异常收尾：异常时 busy/streaming 状态复位，成功、失败、取消均有可见反馈；未改变正文/Canon/图片的人工确认边界。

第二开发切片已补齐 Revision 历史展示：当前章节显示该章节历史，无当前章节时显示项目级历史；每条记录包含 source、actor、时间和 relPath；正文不存在时保留 Diff 但隐藏回退动作，回退刷新使用服务返回的目标路径。

第三开发切片已补齐 Context 预算决策记录：Manifest 记录预算/实际 token、被省略来源和截断条目的原始估算；裁剪排序使用优先级加原始顺序，runtime smoke 已验证总量不超过预算且同时存在截断与省略记录。

章节删除切片的 runtime 结果：`chapterRemoved=true`、`timelineDetached=true`、`noDanglingChapterRefs=true`、`notesRemoved=true`、`revisionCaptured=true`、`factsPreserved=true`。Renderer 删除入口增加确认框，并在成功/失败时显示状态。

## 开发切片增量（2026-09-02 · Workflow Variables）

- 蓝图第 11 章的 Workflow 变量已进入 Runtime：`{{name}}` 支持字符串嵌入、完整值替换、数组/对象递归替换。
- 变量来源遵循“运行时 overrides 优先于 workflow.variables.defaultValue”；变量名限制为字母开头的字母/数字/`_`/`.`/`-`，缺失变量在执行前拒绝，避免把模板原样发送给 Provider。
- `NodeExecutionContext.config` 现在接收解析后的配置副本；图片 prompt、variants、aspectRatio、AI temperature/maxOutputTokens、condition 等节点配置均使用解析结果。
- Workflow Editor 属性面板新增 Variables：可新增、删除、编辑名称/类型/默认值；保存后写回 `.novelflow.json`，节点内可使用 `{{name}}`。
- 新增 runtime smoke：默认值、运行时覆盖、未知变量拒绝；静态 UI contract 同步检查变量编辑入口。
- 本切片验证：`npm run typecheck`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`、`git diff --check` 均通过；未运行 test/build。

## 开发切片增量（2026-09-02 · Workflow Effects）

- Workflow 每个节点现在拥有稳定 `idempotencyKey = runId:nodeId`，并通过 `NodeExecutionContext` 传给 Main-owned 节点执行器。
- 图片生成节点将幂等键写入资产 provenance；同一 Workflow Run 的重试会复用已有资产，不重复调用 Image Provider。
- 图片插入节点在带幂等键的重试中检测现有 Asset 引用，避免重复写入 Markdown 和重复创建 Revision。
- 新增 runtime smoke：同一图片请求 Provider 只调用一次、返回同一 Asset，且正文只保留一条图片引用。
- 注意：Provider 请求中仍只发送 `model`/`prompt`；幂等键仅存在本地 Runtime/资产 provenance，不会发送给严格图片 API。

## 开发切片增量（2026-09-02 · Persistent Jobs UI）

- 新增 `jobs:list` typed IPC namespace；Renderer 不接触 SQLite，Developer Panel 通过 preload 读取 JobRecord。
- Workflow 入队前创建 `queued` Job；Run/Node 状态持久化时同步更新 Job 的状态、最大 attempts 和首个错误。
- Developer Panel 展示 Job 列表；queued/running 可 Cancel，failed/cancelled 可 Retry；waiting_human 不显示 Cancel，避免把人工暂停误当作可取消后台进程。
- 新增 v13 migration smoke，验证 queued 可见、崩溃恢复后的 Job 为 failed 并保留错误。

## 本次复核记录（2026-09-02 追加）

本次重新读取蓝图原文并执行了允许的跨边界核验，未运行 `test` 或 `build`，也未使用真实 Provider Key。

| 核验层 | 结果 | 证据 | 结论 |
| --- | --- | --- | --- |
| 文档章节 | 35 章逐项对照 | 本文件章节矩阵 + 蓝图 DOCX 原文 | 核心 MVP 已通；高级能力、生态、发布和完整 E2E 仍明确标为部分/未通 |
| Main Service / SQLite / 文件源 | 通过 | `node scripts/verify-runtime.mjs` | Markdown/YAML/JSON/图片为内容源，SQLite 索引/状态/审计可重建；删除、移动、修复、恢复有运行时证据 |
| Provider / Image Adapter | 通过 fixture | runtime `strictBody`、`tokenCost`、`modelDiscovery`、`imageConnectionTest` | 图片请求只发 `model/prompt`，变体由本地循环；未把真实网络结果冒充 fixture 结果 |
| Workflow Runtime | 通过 fixture | runtime `builtInWorkflow`、`queue`、`timeout`、`nodeRetry`、`recovery`、`jobsPersistence` | DAG、变量、队列、取消、超时、重试、Human pause/resume、崩溃恢复和图片幂等已形成基础闭环 |
| Renderer / preload 合约 | 通过静态门禁 | `node scripts/verify-ui-contract.mjs`：30 项通过 | 关键入口、选区、Suggestion、图片动作、状态反馈和安全边界存在；静态检查不等于 E2E |
| 直接 Vite Renderer | 按预期降级 | `http://localhost:5175/` 显示 `novelAPI` 缺失提示 | 这是无 preload 的安全降级页，不作为产品 E2E 证据 |
| Electron 真实黄金路径 | 部分 | 隔离 fixture 的真实 Electron 窗口 runner 已完成 10 步连续操作并通过；真实用户项目、真实 Provider 和发布级 E2E 尚未验收 | 继续补真实 Provider/用户项目现场，以及 Graph 拖拽、跨章节 Retry、键盘/无障碍和异常路径 |
| fixtures / 发布前检查 | 通过 | `verify-fixtures.mjs`、`release-preflight.mjs`、`node --check`、`git diff --check` | fixture 覆盖 tiny/conflict/image-heavy/migration-v1/broken；发布签名、公证、安装、自动更新仍未实现 |

### 当前整体数据流判定

```text
章节 Markdown / Story YAML / Asset 文件
  → Main Service（校验、原子写、索引）
  → SQLite（FTS、Canon、Revision、Workflow Job/Run、Asset metadata、审计）
  → Context manifest + retrieval trace
  → Agent / Provider Adapter
  → Suggestion / Canon Proposal / Image Asset / Workflow Node Output
  → Human Review / Apply / Select
  → Revision + 源文件回写
  → typed IPC Result / runtime event
  → Renderer 状态反馈
```

这条主数据流在 runtime smoke 层面是通的。不能标记为“完整完成”的部分主要是产品级证据或后续能力，而不是已发现的主链路断裂：真实 Electron E2E、Embedding/RAG 的动态 context window 与跨版本能力、完整插件/Community Workflow、i18n/accessibility、低端设备基线、安装包签名/自动更新和 schema rollback。

### 下一轮核验顺序

1. 固化 Electron Playwright/人工黄金路径，逐动作记录成功、失败、取消和恢复状态。
2. 补 migration-v1、broken-project、image-heavy 的 UI 可视化修复入口与结果展示。
3. 补 Story Bible 事件参与者、伏笔证据专用编辑器和 Graph/Timeline 高级筛选。
4. 再处理 Embedding/RAG 动态 context window/跨版本能力、诊断包体验、插件权限与发布能力；不以新增 mock 挪高完成度。

### 本切片完成（项目完整性面板）

- 工作台顶部新增“项目健康”入口，展示章节、实体、关系、Canon facts、图片资产、无效设定和悬空引用统计。

## 2026-09-03 真实窗口核验补充

本次没有运行 `test` 或 `build`，也没有调用真实 Provider。已启动 `npm run dev:stable` 并通过桌面窗口观察到真实 Electron 工作台：项目标题、章节树、编辑器、右侧 Agent/Workflow/Outline、底部面板、Illustration Studio 入口和持久化 `waiting_human` Workflow 记录均能加载，说明启动链和 preload 基础可用。

允许的非测试核验均通过：

- `npm run typecheck`
- `node scripts/verify-runtime.mjs --long`
- `node scripts/verify-ui-contract.mjs`
- `node scripts/release-preflight.mjs`
- `git diff --check`

本次新增的产品级结论：

- Runtime 数据流已能证明：源文件 → Main 校验/服务 → SQLite 派生索引/状态 → Context/Provider/Workflow → Proposal/Asset → 人工确认 → Markdown/Revision 回写；图片请求只发送 `model` 和 `prompt`，变体在本地循环。
- Workflow 基础闭环已能证明：章节输入 → Context → AI 节点 → Review pause → Memory/Canon Proposal → Image Proposal → Image Generate → Image Select pause → Image Insert；但还没有完整真实 Electron 逐点击击证据。
- Provider 旧 profile ID 在项目打开时会与当前已配置 profile 对账并回退；Provider 设置现已增加“未保存/已修改 profile 不发送测试请求”的前置提示，避免把临时 ID 传给 Main 后出现误导性的 `Provider profile 不存在`。这不是 Provider 请求格式错误，而是配置尚未持久化的流程边界。
- 图片连接测试现在携带当前编辑的 `profile.id`，Main/图片 adapter 会校验并只对该 profile 发起一次性测试，不会临时改写项目默认 profile；runtime smoke 与 UI contract 均已覆盖这一边界。
- 当前桌面控制通道可读取完整无障碍树和截图，但点击操作本轮不稳定；因此第 2、8、11、14、15、16、18、25、26、29 章的 UI/E2E 状态继续保持“部分”，不能用静态 UI contract 代替人工验收。

### 当前剩余阻断与顺序

1. P1：补稳定的 Electron 点击/断言 harness，按黄金路径逐步记录成功、失败、取消、恢复和跨章节切换。
2. P1：继续在真实窗口验收 Provider 保存、默认绑定、文本/图片/Embedding 测试；当前未保存 profile 已在 UI 层阻止测试请求并给出先保存提示。
3. P1：完成图片生成/刷新/插入/删除、选中文字 → Agent/Suggestion、Canon Review、Workflow Resume/Retry 的人工 UI 验收。
4. P2：再进入高级 Graph/Timeline、跨版本 RAG、插件权限、i18n/accessibility 和发布签名链路。
- 面板通过现有 typed preload 调用 `checkIntegrity()` / `repairIndexes()`；失败、检查中、健康、发现问题和修复结果均有可见状态。
- 修复结果展示重建数量、恢复的源文件及保留的无效设定；明确不修改正文、Canon、Revision 或 Workflow 历史。
- `verify-runtime.mjs` 新增 `integrityPanel` 不变量：能发现索引不一致、报告缺失源文件、报告恢复源文件，修复后重新检查无原始警告。
- 项目完整性同时检查 `embeddings` 派生表：按章节 Markdown SHA-256 区分过期与悬空向量；修复只清理失效记录，不凭空生成向量，下一次 Context 构建再按配置 Provider 增量重建。
- `verify-runtime.mjs` 新增 Embedding 完整性不变量：1 条过期 + 1 条悬空记录被识别，修复清理 2 条且复检干净；健康面板展示总量、分类问题和清理结果。
- `verify-runtime.mjs` 新增 Snapshot retention 不变量：同一章节写入 101 条后只保留 100 条，列表与 SQLite 保留数一致。
- `verify-runtime.mjs` 新增动态 Context Window 不变量：profile 窗口 4096、预留输出 1024、256 安全余量时，5000 请求预算收敛为 2816；无窗口时保持回退预算。
- Command Palette 已增加 Story Entity 搜索结果；选择结果会通过 App → StoryBible 的显式 props 打开对应分区并聚焦实体，`verify-ui-contract.mjs` 已加入该契约。
- `verify-ui-contract.mjs` 当前 40 项通过；`npm run typecheck`、runtime smoke、`git diff --check`、脚本语法检查通过。

### 第二切片完成（Command Palette 与全局快捷键）

- `⌘/Ctrl+K` 与 `⌘/Ctrl+P` 打开统一 Command Palette；`⌘/Ctrl+Shift+P` 打开 Workflow Editor。
- `⌘/Ctrl+S` 触发当前章节 autosave flush，`⌘/Ctrl+J` 收起/展开底部面板，`⌘/Ctrl+\\` 切换 Agent/Workflow 右侧页签。
- `⌘/Ctrl+Enter` 只触发已有 Agent Chat；没有选区时显示提示，不绕过 Suggestion、Canon Proposal 或人工确认。
- `⌘/Ctrl+1..5` 导航 Writer、Story、Workflow、Images、Graph；切换时会清理互斥工作区状态。
- Command Palette 新增 Workflow、Illustration Studio、Provider 设置和项目完整性动作，仍通过现有组件回调进入页面。
- 静态 UI contract 增加快捷键契约检查；未将快捷键路径冒充真实 Electron E2E。

### 第三切片增量（Workflow 默认流程路由）

- 右侧“运行章节流程”现在优先读取 `novel.yaml` 的 `defaultWorkflow`，未配置时才回退到内置 `flow_builtin_novel`。
- 解决 Workflow Editor 保存自定义默认流程后，实际运行入口仍硬编码内置流程的数据流断点。
- `verify-ui-contract.mjs` 增加默认流程路由检查；真实 Electron E2E 仍未验收，当前不将静态契约视为端到端证据。

### 第四切片增量（伏笔证据与章节回链编辑）

- 修复 Foreshadowing `relatedChapters` 数组在表单中被通用格式化为 JSON、保存后语义不稳定的问题。
- 伏笔编辑器现在使用多选章节控件，保存时写入结构化字符串数组；旧项目的逗号/换行格式仍可读取并转换。
- `setup`、`target`、`payoffDeadline`、`status`、`evidence`、`relatedChapters` 和 Notes 形成完整编辑闭环；生命周期索引仍由 Main `StoryService` 维护。

### 第五切片增量（Graph 探索筛选）

- Graph Studio 在已有实体类型筛选上增加实体名称/alias 搜索和关系类型搜索。
- 筛选只作用于 React Flow 的可见节点/边，不写回实体、关系或 SQLite；选中项离开筛选结果时自动清理视图选择状态。
- 增加静态契约检查，确认探索筛选没有绕过 `saveRelation` 形成隐式数据修改。

### 第六切片增量（Context Replay 差异定位）

- Context Replay 现在由 Main `ContextService` 按 source 比较旧/新 manifest，返回新增、移除、内容/预算变化三类差异及 token 变化。
- RightPanel Context Inspector 展示差异来源和 token 前后值；只展示 metadata，不复制正文到诊断或日志。
- runtime smoke 已增加“发生变化且存在逐项差异”的不变量；静态 UI contract 同步检查差异展示。

### 第七切片增量（统一 Command Action Registry）

- 将 Command Palette 的操作项集中到 Renderer 内部的类型化 registry，统一操作 ID、标题、快捷键提示和 query 匹配规则。
- Palette 继续把操作、章节、实体和全文搜索合并展示；未提供页面回调的操作不会被暴露为不可执行项。
- 修复 registry 切换后的新建章节 ID 回归：标题输入回车和图标判断均使用 `new-chapter`。
- `verify-ui-contract.mjs` 当前 40 项通过；`npm run typecheck`、`node scripts/verify-runtime.mjs`、脚本语法检查和 `git diff --check` 均通过。
- 该切片只证明 Renderer 静态契约和 Main/runtime smoke，不替代真实 Electron 黄金路径验收。

### 第八切片增量（原生菜单与 Palette/快捷键路由统一）

- Main 原生菜单的 Workflow、Illustration Studio、Provider 设置入口改为发送统一的 Command Action ID；App 不再为同一入口维护另一套字符串。
- `open-workflow` 的 `⌘/Ctrl+Shift+P` 元数据进入 registry；原有安全 UI 路由和互斥工作区清理保持不变。
- 新增 UI contract：原生菜单 action 必须通过 registry ID 进入 Renderer；当前 41 项静态契约通过，类型检查和 diff 检查通过。
- 仍未将菜单点击、快捷键、Palette 选择声称为真实 Electron E2E；需要稳定窗口 harness 才能完成最终验收。

### 第九切片增量（Palette 异步错误反馈）

- Command Palette 的章节/实体并行搜索现在具备 loading、部分 Result 错误和 Promise 异常的可见反馈，并在查询变化或关闭时清理旧状态。
- “修复项目索引”和“检查项目完整性”的 IPC 抛错也会回到全局 notice，不再形成未处理 Promise rejection。
- UI contract 当前 42 项通过；该验证仍是静态契约，不替代真实 Electron 操作验收。

### 第十切片增量（伏笔结构化证据编辑）

- Foreshadowing 新增 `evidenceItems` 结构：每条证据包含 `chapterRelPath`、`quote` 和 `note`，并由共享 Zod schema 在 IPC/Main 边界校验。
- Story Bible 编辑器支持选择章节、填写摘录、补充说明、添加/移除多条证据；缺少章节或摘录时禁止提交。
- 保留旧版 `evidence` 文本字段，避免老项目读取或保存时丢失兼容信息；结构化证据仍写入 `story/artifacts.yaml` 内容源，SQLite 生命周期索引继续作为可重建派生索引。
- runtime smoke 已验证合法证据可持久化、非 `chapters/` 路径被拒绝；UI contract 当前 43 项通过。

### 第十一切片增量（伏笔证据查询与章节回链）

- Foreshadowing 生命周期查询现在从 `story_artifacts.fields_json` 回读结构化 `evidenceItems`，不把证据复制成 SQLite 的唯一事实源。
- Bottom Panel 展示证据摘录、说明和来源章节，并可直接打开对应章节；旧版纯文本证据仍单独显示。
- runtime smoke 已验证证据先写入 Artifact 源数据，再经生命周期查询返回；UI contract 当前 44 项通过。

### 第十二切片增量（Graph 关系失败恢复）

- Graph Studio 的关系加载、保存、删除现在统一捕获 IPC 抛错；加载状态通过 `finally` 复位，失败原因显示在关系面板中。
- 关系编辑仍使用现有 `saveRelation/deleteRelation` Main 服务和 `story/relations.yaml` 内容源，不因 UI 错误处理新增旁路状态。
- UI contract 当前 45 项通过，runtime smoke 与类型检查通过；真实 Graph 交互仍需 Electron 黄金路径证据。

### 第十三切片增量（Timeline 高级检索与排序）

- Timeline 浏览新增事件内容搜索，可匹配标题、描述、原因、结果和章节回链。
- 支持按故事时间或最近修改排序；故事时间使用可解析日期排序，未定/不可解析时间稳定置后，并以标题作为稳定 tie-breaker。
- 过滤和排序只作用于 Renderer 视图，不修改 Timeline 源数据；当前 UI contract 46 项通过，runtime smoke 与类型检查通过。

### 第十四切片增量（Context/RAG 跨版本重建）

- Snapshot 规范化时保留原始 format、project schema 和 retrieval version；回放不把旧版本直接伪装成当前结果。
- 旧 retrieval version 回放会使用当前 Embedding/FTS 索引重新计算候选来源、预算和截断结果，并在 Inspector notice 中说明迁移路径。
- 未来格式/检索版本仍明确拒绝；runtime smoke 已验证旧版本 `v0 → v1` 的实际重建说明和未来版本拒绝，UI contract 当前 49 项通过。

### 第十五切片增量（Graph 关系元数据闭环）

- Graph 选中关系时回填 `metadata` JSON；保存前要求 JSON 对象，拒绝数组和标量并给出可见提示。
- 更新/删除/取消编辑后清理元数据编辑态；关系仍经现有 typed IPC 和 `story/relations.yaml` 源文件同步。
- UI contract 当前 50 项通过，类型检查和 runtime smoke 通过；仍需真实 Electron 交互证据。

### 第十六切片核验（Electron 启动与黄金路径证据）

- 使用开发启动入口成功打开真实 Electron 窗口，窗口标题为 Novel Studio；现场可见项目/章节列表、当前 Provider 模型、Workflow `waiting_human`、Revision Diff、Illustration Studio、Graph Studio 和 Timeline 入口。
- 这次尝试进行逐动作点击时，开发热更新重载了 Electron 实例，桌面控制句柄失效；因此只能确认启动/preload/首屏可用，不能确认完整黄金路径的连续点击、输入、保存和恢复。
- 本次不使用真实 Provider 或 API Key；Electron 黄金路径仍标记为“部分”，后续需要固定 dev server/禁用 HMR 或专用自动化 harness 后再验收。

### 第十七切片增量（稳定 Electron 验收入口）

- 新增 `npm run dev:stable`：仅清理本项目已知开发端口上的 `electron-vite dev` 进程，固定 Renderer 端口 `5173` 并关闭 Renderer HMR。
- `verify-ui-contract.mjs` 当前 51 项通过；`npm run typecheck`、脚本语法检查和 `git diff --check` 通过。
- 稳定入口在当前受限环境下已成功完成主进程/preload 编译和 Renderer 启动；桌面控制层仍报告 Electron 实例变化，连续点击尚未取得可靠 E2E 证据，不能标记黄金路径完成。

### 第十八切片增量（无 Watcher 的 Electron 验收模式）

- `dev:stable` 改为独立启动无 HMR 的 Vite Renderer（`vite.stable.config.ts`）和现有 `out/main/index.js` Electron 主进程，避免 electron-vite 主进程 watcher 在 UI 验收期间重启实例。
- 启动前仅清理监听固定本地端口且命令匹配本项目的开发进程；缺少 `out` 主进程/preload 产物时明确失败，避免验收过期或不完整代码。
- 静态门禁当前 51 项通过，入口脚本语法和类型检查通过；实际连续点击仍受桌面控制层实例变化影响，黄金路径继续标记为“部分”。

### 第十九切片（旧 Workflow Run 章节路径恢复）

- 发现：真实 Electron 首屏曾展示“旧 Workflow Run 缺少章节路径，无法恢复，请重新运行”。旧 `waiting_human` 状态可能没有顶层 `relPath`，导致图片选择/人工审核无法继续。
- 修复：`WorkflowRunStore.get/list/recoverInterrupted` 读取状态时调用 `normalizeLegacyRun`。仅当节点 `input/output` 或运行输出中存在且仅存在一个格式合法的 `chapters/**/*.md` 路径时，才回填顶层 `relPath`；回填记录 `relPathSource: legacy-node-output` 并持久化。不会从当前选中章节猜路径。
- 安全失败：没有路径或出现多个候选路径时保持缺失状态，`resume()` 继续拒绝，避免把错误章节套入旧 Run。
- UI：成功迁移时显示“已从旧 Workflow 节点输出恢复章节路径，可继续人工审核”；原有 Resume 校验和人工确认边界不变。
- 验证：`npm run typecheck` 通过；`node scripts/verify-ui-contract.mjs` 通过（新增旧 Run 唯一路径迁移契约）；`git diff --check` 通过；未运行 test/build。TS 运行时探针未执行，因为项目未安装 `tsx`，未安装新依赖。

### 本次完整蓝图复核结论（第 1–35 章）

章节矩阵已逐章重读蓝图原文并映射到源码入口、Main service、IPC/preload、Renderer 和内容源/SQLite。核心本地创作闭环（章节→Context→AI Suggestion/Proposal→人工确认→Canon/Revision、Workflow DAG→Human pause/resume、图片 Asset→Markdown 插入）已有真实服务和 runtime smoke 证据；不能称为“全部完成”的项目级门禁仍是完整 Electron E2E、低端性能基线、真实 Provider 现场验收记录、插件/Community Workflow、i18n/accessibility、打包签名/自动更新/schema rollback。

整体数据流没有发现 Renderer 直连 fs/db/network/secret 的主链路越界；主要风险集中在历史数据兼容、真实 Electron 连续操作证据和高级能力缺失，而不是把 mock 页面误当成真实闭环。`out/` 未因本切片手工覆盖，源码验证以 typecheck/UI contract 为准；需要运行打包产物时应重新走用户明确允许的构建流程。

### 第二十切片（章节 Markdown 图片路径闭环）

- 发现：章节文件位于 `chapters/`，图片文件位于项目根 `assets/`；插入时写 `assets/scenes/...` 会被标准 Markdown 渲染器解析为 `chapters/assets/scenes/...`，导致正文出现裂图或只有 title。
- 修复：`ImageService.insertIntoChapter` 对章节写入 `../assets/scenes/...`；删除资产时同时匹配 `../`、`./` 和无前缀的历史引用；`markdownToHtml` 支持相对资产路径并通过 Asset ID 走 `image.readAsset` IPC；HTML→Markdown 也统一写回 `../assets/scenes/...`。AI Suggestion 预览同样经过资产 hydration。
- 保持：图片二进制仍只由 Main 读取，Markdown 仍是正文源；Editor DOM 使用 data-asset-id，不把 data URL 写回正文。
- 验证：更新图片服务回归断言（未运行）；`npm run typecheck`、`node scripts/verify-ui-contract.mjs`、`git diff --check` 通过；未运行 test/build。

### 第二十一切片（工作台布局持久化）

- 发现：三栏宽度、底部面板高度/折叠/最大化状态只保存在 Renderer 内存，重启后丢失，不符合蓝图第 25 章的 persist 要求。
- 修复：App 按项目根路径将布局状态保存到 Renderer `localStorage`；读取时对宽度和高度做边界校验，损坏或越界数据回退默认值；项目切换时先加载对应布局，防止把上一个项目的状态写入新项目。
- 边界：仅保存 UI 布局偏好，不保存正文、Canon、Provider Key 或任何项目敏感数据；localStorage 失败不会影响创作。
- 验证：`npm run typecheck`、`node scripts/verify-ui-contract.mjs`、`git diff --check` 通过；未运行 test/build。

### 第二十二切片（独立 HTML 导出图片闭环）

- 发现：HTML 导出原先使用 `stripMarkdown`，图片只剩图注文本，导出文件无法展示插图。
- 修复：导出使用安全的 Markdown renderer，并在 Main 侧读取项目内 `assets/` 图片，将合法图片内嵌为 base64 data URL；缺失图片生成可见 SVG 占位。导出的 HTML 不依赖项目目录相对路径，也不携带 Provider、Key 或内部项目绝对路径。
- 安全：图片路径只接受 `assets/` 项目相对路径并经项目沙箱解析；Markdown 原生 HTML 仍关闭，避免导出 XSS。
- 验证：新增 `ChapterService.exportAll` 图片内嵌断言（未运行）；`npm run typecheck`、`node scripts/verify-ui-contract.mjs`、`git diff --check` 通过；未运行 test/build。

### 第二十二切片补充验证

- `node scripts/verify-runtime.mjs --long` 通过。
- `importExport.htmlEmbedsImage = true`：runtime smoke 临时写入 PNG 资产后，独立 HTML 导出包含 `data:image/png;base64,...` 图片。
- 同次 smoke 继续通过导入章节、导出章节数、禁止导出覆盖项目内部文件、Checkpoint 恢复、内置 Workflow 人工暂停/恢复、图片幂等和 1000 章规模索引检查。

### 第二十三切片（Timeline 引用边界校验）

- 发现：Timeline UI 对不存在章节只做提示，Main Service 仍会把不存在的章节、参与实体或错误类型地点写入源文件，造成新悬空引用。
- 修复：`StoryService.saveTimelineEvent` 在写 SQLite/YAML 前验证章节文件存在、所有参与实体存在、地点实体存在且类型为 `place`；路径越界仍返回 `PATH_DENIED`。历史旧数据不被静默修改，继续由项目完整性检查报告。
- 验证：新增 StoryService 引用校验回归断言（未运行）；UI contract、typecheck、runtime smoke 和 diff 检查应作为本切片验收门，未运行 test/build。
- 实际验证：`node scripts/verify-runtime.mjs --long` 通过，继续证明时间线结构字段、实体删除回链、章节移动/删除回链、内置 Workflow 和长篇规模索引未被破坏；`npm run typecheck`、`node scripts/verify-ui-contract.mjs`（55 项）、`git diff --check` 通过。

### 第二十四切片（Focus Mode 实际行为）

- 发现：状态栏只有 Focus Mode 文案，没有切换行为；蓝图第 8/25 章要求写作时可聚焦主编辑区。
- 修复：Focus Mode 现在隐藏 Sidebar、左右分隔条、Right Inspector 和 Bottom Panel，仅保留当前主工作区；支持状态栏按钮、`⌘/Ctrl+Shift+F` 切换和 `Escape` 退出，并提供 `aria-pressed` 状态。
- 边界：只改变 Renderer 布局，不修改章节、Story Bible、Workflow 或 Provider 数据；退出后原布局状态仍保留。
- 验证：`npm run typecheck`、`node scripts/verify-ui-contract.mjs`、`git diff --check` 通过；未运行 test/build。

### 第二十四切片验证记录

- UI contract 当前 56 项通过；`npm run typecheck` 和 `git diff --check` 通过。
- 本切片只涉及 Renderer 布局和快捷键，未改变 Main 数据源、IPC 合约或项目文件。

### 第二十六切片（Illustration Studio 消费 sceneId）

- Illustration Studio 提案按钮现在读取当前 Writer 选中的 `selectedSceneId`，经 typed IPC 传入 Main；未选中场景时继续按整章提案，兼容旧项目。
- `ImageService.proposeScene(relPath, sceneId)` 会校验场景属于当前章节，只截取该场景的段落范围，并在 `SceneProposal.sceneId` 回传稳定引用；找不到场景时返回明确错误。
- runtime smoke 已验证 `sceneProposalScoped=true`；UI contract、typecheck、长篇 runtime smoke、release preflight 和 diff 检查通过。Context 与 Workflow 的 sceneId 消费随后已完成，并由 `workflowSceneScope` smoke 验证。

### 第二十七切片（Context / Workflow 消费 sceneId）

- Context 请求新增可选 `sceneId`，Main 校验场景属于当前章节，并将 pinned chapter 限定到场景段落；manifest source 使用 `chapter:<path>#<sceneId>`，未选择场景时保留整章兼容行为。
- Workflow Run 在顶层持久化 `sceneId`；启动时由 RightPanel 经 preload/IPC 传入，Context 节点和 Image Proposal 节点均复用同一个稳定 ID；Retry/Resume 从历史 Run 复用，不从当前 UI 猜测。
- runtime smoke 已验证 `workflowSceneScope.persisted/contextScoped/proposalScoped=true`；未运行 test/build，未调用真实 Provider。

### 第二十八切片（Writer 场景选择可见化）

- Writer 点击场景后，Tiptap 会按场景的起止段落建立文本选区并滚动到对应位置；编辑器标题显示当前场景名称。
- 场景选择只改变 Renderer 的选区和操作范围，不自动修改 Markdown；后续 Chat、选区校验、Workflow 和 Illustration 继续复用该选择状态。
- UI contract 与 typecheck 已通过；真实 Electron 点击链路仍需单独验收。

### 第二十九切片（Workflow 恢复目标与状态可见性）

- RightPanel 的 Retry 现在只使用历史 `WorkflowRun.relPath`，不再使用当前选中的章节路径；缺少历史路径时明确拒绝并提示重新运行。
- Workflow 启动、Retry、Resume 的 IPC 异常都会结束 busy 状态并显示错误；运行卡片显示该 Run 的章节和 sceneId/整章范围，便于人工确认恢复目标。
- UI contract 与 typecheck 已通过；真实 Electron 的跨章节切换后 Retry 点击验收仍待补充。

### 第三十切片（章节卷树与归属回链）

- 新增 `story/volumes.yaml` 作为卷元数据源，支持卷创建、重命名、删除保护、排序，以及章节归入/移出卷。
- Sidebar 按卷分组显示章节，章节行可直接切换所属卷；卷内有章节时禁止删除卷。
- `ChapterService` 在章节移动和删除时调用路径引用更新器，确保卷文件不会残留旧章节路径；runtime smoke 已验证创建、持久化、归属和移动回链。

### 第三十一切片（卷树排序交互）

- 章节行支持拖拽到目标章节，调用 `chapter.move` 保存全局章节顺序；拖入具体卷时同时调用卷归属接口。
- 卷标题支持拖拽排序，调用 `volume.reorder` 持久化顺序；Renderer 仅维护交互状态，文件和引用仍由 Main 服务负责。
- typecheck、UI contract 和 diff 检查通过；拖拽在真实 Electron 中的人工验收仍待补充。

### 第二十五切片（旧 Workflow 不可恢复状态的安全降级）

- 复核发现：历史 `waiting_human` Run 可能同时缺少顶层 `relPath`，且节点输入/输出中也没有唯一章节路径。此时不能把当前打开章节猜测为旧 Run 的目标，否则可能恢复到错误章节。
- `WorkflowRunStore.normalizeLegacyRun` 现在只接受节点 input/output 或 outputs 中唯一且通过 `chapters/**/*.md` 校验的路径；成功迁移记录 `relPathSource: legacy-node-output` 并持久化。
- 无法唯一推断的旧 Run 标记 `relPathRecovery: unavailable`；RightPanel 显示原因、阻止 Resume，并提供“用当前章节重新运行”。普通 Run 的 Resume 行为不变。
- `npm run typecheck`、`node scripts/verify-ui-contract.mjs`（旧 Run 唯一路径迁移契约）、`node scripts/verify-runtime.mjs --long`、`node scripts/release-preflight.mjs` 和 `git diff --check` 均通过；未运行 test/build，未调用真实 Provider。

### 本轮完整核验结论（2026-09-02）

- 依据 DOCX 原文重新核对第 1–35 章，章节矩阵、整体数据流和内置 Workflow 已形成可追溯结论。
- 主链路判定为“运行时基础闭环已通”：`Markdown/YAML/JSON/图片 → Main 校验与原子写 → SQLite 派生索引/状态/审计 → Context manifest → Agent/Provider → Suggestion/Proposal/Asset/Node output → Human review/select/apply → Revision/源文件回写 → typed IPC/event → Renderer feedback`。
- 内置 Workflow 已实际验证到：`Chapter Input → Context → Plan → Write → Critics → Merge → Rewrite → Human Review → Memory Extract → Image Proposal → Image Generate → Human Image Select → Image Insert`；包含两次人工暂停/恢复、节点超时、重试、排队取消、重启恢复和图片幂等。
- 仍不能标记为“全部完成”的章节：第 3/5/6/8/9/11–16/18–20/22–35 中的部分高级能力，以及第 21 测试策略、第 24 Community Workflow、第 31 发布更新。当前最重要的证据缺口是真实 Provider/用户项目现场、低端设备基线、安装包签名/公证/自动更新和生态插件权限链路；隔离 fixture 的 Electron 连续黄金路径已通过。
- 未发现 Renderer 直接访问 fs、SQLite、网络或 secret 的主链路越界；未发现图片插入后 Main/Markdown 的已知路径断裂。图片失败时仍需使用真实 Provider 配置在稳定 Electron 窗口中完成现场确认，不能用 fixture 结果替代。
### 第三十二切片（图片 Provider profile 边界，2026-09-03）

- 复核发现：图片 Provider 在显式传入不存在的 profile ID 时仍使用 `profiles[0]` 回退，可能误用另一套 URL、model 或独立 Key。
- 修复：显式 profile 不存在直接返回 `Provider profile 不存在: <profileId>`；只有项目 manifest 中存在明确默认 profile 时才按默认 profile 解析，不再隐式选择第一个 profile。
- 防回归：runtime smoke 增加图片失效 profile 拒绝断言，UI contract 增加静态边界契约。
- 验证：`npm run typecheck`、`node scripts/verify-runtime.mjs --long`、`node scripts/verify-ui-contract.mjs`、`git diff --check` 通过；未运行 test/build，未调用真实 Provider。

### 第三十三切片（黄金路径 harness 底座，2026-09-03）

- 新增稳定 Electron launcher 的可复用生命周期边界，包含固定 Renderer URL、启动超时、既有开发进程清理和异常退出清理。
- 新增临时 fixture 工厂：基于现有 `tiny-cn` fixture 创建隔离项目，输出 metadata-only 初始证据并幂等清理临时目录。
- 新增顺序步骤 runner：每一步返回不可变摘要，前置步骤失败后续步骤标记 skipped，统一超时和证据脱敏。
- 当前状态为“本地 fixture 黄金路径已通、产品级验收仍部分”：真实窗口操作已适配 Chat/Suggestion/Canon/Workflow/Illustration/备份导入导出；该 harness 仍不替代真实 Provider、真实用户项目和完整发布级 Electron E2E。
- 验证：`npm run typecheck`、`node scripts/verify-runtime.mjs --long`、`node scripts/verify-ui-contract.mjs`、三个 `node --check`、`git diff --check` 通过；未运行 test/build。
- 本轮追加真实窗口首段：通过 CDP 仅调用公开 `window.novelAPI.project.open`、reload 触发 bootstrap、DOM selector 打开章节，`project-open/chapter-visible/chapter-open/workbench-visible` 全部 passed；这只是首段证据，后续工作区操作仍未覆盖。
- Chat 窗口适配已完成输入框/发送按钮/assistant 或错误状态的分层诊断，但因当前 runner 仍通过 reload 触发 bootstrap，真实运行出现间歇性 Welcome 恢复竞态；Chat 尚未计入通过证据，下一步改为单次 UI 最近项目打开流程后再验收。
- 后续验证完成：runner 通过 DOM selector 和公开 preload 完成 Chat、Suggestion、Canon、Workflow、Illustration 及备份/导入/导出连续操作；Workflow 证据包含 `firstPause/resumedReview/selectedImage/completed`，备份步骤证据包含 `imported/exported/backupCreated/chapterCount`。所有证据为 metadata-only，未调用真实 Provider。

### 第三十四切片（旧 schema 迁移可观测性，2026-09-03）

- `DatabaseService` 现在记录迁移起始版本、最终版本、实际应用的版本与名称，以及 `up_to_date`/`migrated` 状态；迁移仍保持逐版本事务，不改变既有 SQL 和人工数据边界。
- `ProjectService.checkIntegrity()` 通过 typed `ProjectIntegrity.migration` 返回该报告，项目完整性面板展示 `v旧 → v新` 和本次应用数量。该报告用于诊断升级过程，不等于 schema rollback；失败事务回滚和 rollback 能力仍是发布前缺口。
- 旧 `migration-v1` fixture（其 SQLite 实际 user_version 为 2）的 runtime 核验已增加 v2→v19、17 个迁移、首尾版本和状态断言。

### 第三十五切片（全量 manifest 与增量备份，2026-09-03）

- 全量备份现在附带项目外生成的 `backup-manifest.json`，记录文件 SHA-256；恢复后会移除内部 manifest，不污染项目源文件。
- 增量备份以全量包为基准，只打包变更/新增文件，并记录删除清单与基准 manifest hash；恢复时先解压全量包，再叠加增量包并安全删除已移除文件。
- 增量基准必须是带 manifest 的全量包，路径清单经过安全校验；当前不支持增量链，也不等于云端同步或发布级跨版本兼容。
- runtime 已验证全量/增量创建、变更章节叠加恢复和 manifest 不落入恢复项目；UI 已通过 typed preload/IPC 暴露两条操作路径。
