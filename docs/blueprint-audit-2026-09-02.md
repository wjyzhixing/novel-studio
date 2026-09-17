# Novel Studio 蓝图集成审计（2026-09-02）

## 2026-09-03 增量复核

- Electron 黄金路径首段现已稳定通过真实窗口验证：临时 fixture 项目打开、章节列表/章节、编辑器/右侧面板显示，以及 Agent Chat 经 Context manifest 返回 assistant 结果。此前 Chat 偶发误报“尚未配置 Provider”的根因是 Renderer 组件在 reload 后短暂持有旧的空 Provider 快照；Chat 操作边界现会向 Main 重新读取权威项目配置后再发起请求。该修复不改变 Provider 存储或默认选择逻辑。
- Electron 黄金路径第二段已通过真实窗口验证：Quick Action 生成 Suggestion 后，真实 UI 完成 Accept 写入与第二次 Suggestion 的 Reject；AI 输出仍先落为待确认 Suggestion。
- Electron 黄金路径第三段已通过真实窗口验证：Canon Proposal 经底部 Canon Review UI 完成 Apply/Revert，并显示 `reverted` 状态；同时修复 preload/Renderer 的 Canon Revert 方法名漂移。
- Electron 黄金路径现已通过完整本地 fixture 窗口链路：Workflow 两次人工暂停/恢复、Illustration Studio 提案/生成/刷新/插入/删除，以及临时目标章节导入、HTML 导出、备份创建和 Telemetry 启用/撤销均通过；总计 14 个顺序步骤全部 passed。
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
- 章节 1–20 的核心数据流继续保持闭环；章节 21–35 的结论不变：完整 Electron 黄金路径、Community Workflow 的市场/签名发布与外部代码隔离、国际化/无障碍完整验收、发布签名/更新和 schema rollback 仍是未完成或部分能力。

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
| 10 Canon/Memory | 已通基础闭环 | Extract→Proposal→Human Apply/Revert、source/workflow 引用、fact.update、knowledge.update、relation.update、timeline.add、foreshadowing.add、冲突检查、knowledge leak 和章节时间边界均已覆盖，更多确定性冲突规则仍需扩展。 |
| 11 Workflow DAG/Runtime | 部分 | 拓扑/端口校验、并行、取消（含排队 Run）、重试、Human pause/resume、持久化 run、Main 有界 FIFO 队列、排队取消、节点 timeout、重复 Run ID 拒绝、重启中断恢复已接入；内置流程现已实际串联 image.propose→image.generate→image.select→image.insert，并由 runtime smoke 验证两次人工暂停/恢复；节点显式 retry 与 Agent policy maxRetries、变量解析、图片副作用幂等、场景 ID 持久化并传入 Context/Image 节点已进入 Runtime；通用副作用 ledger/完整幂等策略仍不完整。 |
| 12 Agent | 部分 | 内置 Agent、Prompt Pack、Context recipe 和 output schema 基础存在；Memory Extractor 现在通过 Main-owned `structured<T>` parser 校验后才生成 Canon Proposal；已增加类型化 Agent policy（temperature、max output、context recipe、tools、output schema、maxRetries），Workflow AI 节点可覆盖关键参数；独立工具执行、动态 policy 持久化和更细粒度 cost 仍不完整。 |
| 13 Context/RAG | 部分 | Pinned/Structured/Recency/FTS 与 manifest 已有；Recency 按当前章节之前的最近章节提取摘要并参与 budget；检索命中按章节独立进入 ContextItem，Embedding Provider 与 `EmbeddingIndexService` 已接入，按内容哈希增量同步并用余弦相似度排序，失败或未配置时回退 FTS；ProviderSettings 可保存模型发现的 `contextWindow`，Main 按模型窗口、预留输出和安全余量收敛 Context budget；Snapshot 有保留上限、格式/项目 schema/检索算法版本元数据，旧快照兼容读取，Replay 明确标记 `resultStrategy=recompute` 且不复用旧结果，未来格式明确拒绝；跨版本检索结果的更丰富迁移与用户侧 diff 仍需补。 |
| 14 Illustration | 部分 | Art Direction、Visual Identity、scene proposal、独立图片 key、Provider、provenance、预览/删除/插入/Revision 已通；选中场景后 proposal 只读取对应段落并回传 sceneId；严格 Provider 请求现仅发送 model/prompt，variants 在本地循环；资产引用图和真正 UI/E2E 验收、局部重做仍偏基础。 |
| 15 Provider | 部分 | Provider profile 与 secret 分离，文本/图片/Embedding 独立 URL/model/key（Embedding 使用文本 Provider 的独立 model 字段），OpenAI-compatible 文本、图片和 embedding 已接；失效 profile 在项目打开时自动收敛到已配置 profile，严格图片请求、两变体和独立图片连接测试 runtime smoke 已验证；URL 已限制为 HTTPS/本机 HTTP 且拒绝 query 凭据；OpenAI-compatible/Anthropic/Gemini 均有统一 `structured<T>` Main 侧 parser 入口；模型窗口可发现并参与 Context budget，原生 response schema 和更多 Provider 元数据仍待补。 |
| 16 Version/Diff/Audit | 部分 | AI 编辑、图片插入、Canon Apply 有 Revision/审计；已增加项目级命名 Checkpoint（文件快照、恢复后索引重建）；Diff 面板现可选择完整历史、显示 actor/source/path，并按段落展示逐字符新增/删除标记，删除正文后的历史只读保护已接入；完整 patch、所有破坏性操作 actor 追踪仍需补。 |
| 17 搜索/Palette | 部分 | FTS、Command Palette、章节搜索、索引修复已有；Palette 现可通过 typed `story.searchAll` 搜索实体、时间线、故事条目和关系，并分别定位 Story Bible 或 Graph 检查器；更完整的正文/设定统一索引仍缺。 |
| 18 导入导出/备份 | 部分 | zip backup/restore 已接入 Welcome/Workbench UI，并保留空目录、路径穿越和 manifest 校验；Markdown/TXT 导入、Markdown/plain/HTML 全章节导出已接入真实 IPC，导出扩展名和项目内覆盖现有安全校验；Checkpoint 已接入顶部 UI；全量 manifest、基于全量包的增量备份和叠加恢复已有 runtime smoke，并新增原始 v2 数据库备份恢复后迁移到 v19 的兼容验收；真实用户项目与发布级备份兼容仍待验收。 |
| 19 安全隐私 | 部分 | safeStorage、路径沙箱、IPC 校验、Renderer 无 Node、secret 不入项目存在；已停止复制 Renderer console 内容、限制开发加载错误日志、对 IPC/provider 错误敏感字段脱敏，并在打包模式强制严格 CSP；HTML 导出支持可选清理 PNG/JPEG/WebP/SVG 常见图片元数据，Main AI 请求已按 Provider profile 做滑动窗口限流。导出其他格式的元数据策略、完整网络边界与发布级安全验收仍需补。 |
| 20 性能可靠性 | 部分 | WAL、FTS、单章加载、atomic write、autosave 存在；runtime smoke 已实际核验 1000 章/1000 实体/100k facts fixture、四位编号索引修复、章节窗口化、队列并发和 crash recovery；benchmark 现在输出环境与 p95 并支持预算门禁，但低端设备和真实 UI 滚动基线仍未验证。 |
| 21 测试策略 | 部分 | `tests/` 使用 Vitest；当前全量回归已覆盖 133 个文件/532 项，Statements 仍达到 80% 以上但 Branches 尚未达到 80%，仍缺完整组件/E2E/golden 结果。 |
| 22 Observability | 部分 | Developer Panel 已展示 Workflow 节点状态、错误、输入/输出摘要、provider/model/requestId/context/duration/retry、错误分类和 input/output/total tokens；配置单价时显示 estimated USD cost；现额外展示持久化 Jobs 的状态、attempts、错误和更新时间，并复用 Cancel/Retry；Context Inspector 显示预算、实际用量、检索 query、候选数、选入/截断/省略项；现可通过 typed IPC 导出 metadata-only 诊断 JSON（含 AI invocation audit、剥离 payload 的 sanitized runs），目标路径沙箱、最近 500 条审计上限和敏感字段边界有 smoke 证据；完整日志筛选/压缩包和更丰富的 trace UI 仍待补。 |
| 23 插件体系 | 部分 | 已新增 Main-owned、不可执行 Renderer 插件代码的 Provider/Workflow Node/Importer/Exporter typed contracts 与去重 Registry；签名 manifest 的可信公钥校验、权限预览、依赖检查、原子安装/恢复/卸载已接入 Main IPC 和 Developer Panel；正式发布者公钥、外部代码隔离执行仍未完成。 |
| 24 Community Workflow | 部分 | 已有版本化 JSON schema、导入前权限/依赖预览、敏感字段与 DAG 校验、项目外导出保护，以及 Main 侧原子安装/恢复/卸载；社区市场、签名发布、网络分享和外部代码隔离运行时仍缺。 |
| 25 Design System | 部分 | Dark-first、紫色强调、panel 布局、状态色基础存在；resize/collapse/persist、统一 token/i18n key 尚缺。 |
| 26 无障碍/国际化 | 部分 | 编辑器工具栏、项目完整性弹框和底部工作区已补充语义、焦点管理及键盘路径；节点有属性面板替代纯拖拽，但全局键盘全路径、完整颜色之外状态信号和真正 i18n 尚缺。 |
| 27 Roadmap | 部分 | v0.1–v0.6 主体已超出基础骨架；v0.7 Hardening、v0.8 Graph Advanced、v0.9 Ecosystem、v1.0 Release 未完成。 |
| 28 Sprint 拆分 | 部分 | Sprint 1–11 的核心代码大多有对应实现；Sprint 12 的 backup/migration/E2E/load/security/package 尚未闭环，fixture 生成与用途校验已补齐。 |
| 29 DoD | 部分 | Project/Chapter/AI Edit/Canon/Workflow/Image 的基础 DoD 可追踪；`verify-runtime.mjs --long` 已证明 migration、损坏项目修复（含缺失源文件恢复）、章节导入/HTML 导出与路径拦截、Checkpoint 恢复、队列、恢复和规模索引闭环；低端设备 Performance、Release、完整安全验收没有证据。 |
| 30 风险/技术债 | 部分 | 主要架构红线遵守；富文本 roundtrip、双源冲突、Provider API 变化、缺失文件恢复仍需 fixture 和运行记录。 |
| 31 发布更新 | 未通 | 已新增并通过代码级 `release-preflight.mjs`（入口、安全配置、CSP、schema、secret 边界检查）；Telemetry 已具备 Main-owned 默认关闭、明确同意/撤销、本地 metadata-only 事件白名单和 500 条上限，但仍未实现安装包、签名/notarization、自动更新 channel 和网络传输策略。 |
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
2. P1：实体/Timeline/Relation/Asset 项目文件的结构与引用完整性报告已补齐；原始 v2 数据库备份恢复→v19 迁移、增量新增/删除恢复已有测试和 runtime 证据。仍需真实用户项目与发布级备份兼容验收。基础 Import/Export UI、migration-v1、broken-project repair、Lore 源文件报告和增量备份 fixture 已通。
3. P1：继续完善 Developer/Context Inspector 的日志筛选、压缩导出和更丰富 trace 视图；当前已展示 context manifest、provider request id、duration、retry、错误分类。
4. P1：`tiny-cn`、`conflict-cn`、`image-heavy` 已生成并由验证器检查规模/冲突/图片 sidecar；本机 arm64 16 GiB 三次长篇 benchmark 的 repair/chapterList/integrity p95 为 612/12/358 ms，仍需真实用户项目与低端设备性能现场证据。
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
5. 第 23/24/31 章：插件签名/权限预览/安装卸载/回滚与 Community Workflow 的本地安全安装第一阶段已实现；正式发布者签名、社区市场/网络分享、外部代码隔离、安装包签名 notarization 和自动更新仍待补。Telemetry opt-in 的默认关闭、明确同意/撤销、本地 metadata-only 事件白名单和上限已实现，但网络传输策略未启用。
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
- 仍不能标记为“全部完成”的章节：第 3/5/6/8/9/11–16/18–20/22–35 中的部分高级能力，以及第 21 测试策略、第 24 Community Workflow 的市场/发布/隔离部分、第 31 发布更新。项目 manifest 现在具备连续版本 migration runner 和失败原文恢复测试，数据库迁移失败会校验回到起始版本并关闭失败连接；当前 v1 尚无活跃升级步骤，跨版本备份恢复证据仍缺失。当前最重要的证据缺口是真实 Provider/用户项目现场、低端设备基线、安装包签名/公证/自动更新和生态插件权限链路；隔离 fixture 的 Electron 连续黄金路径已通过。

### 第三十一切片（Community Workflow 纯数据包）

- 已实现 `novel-studio.community-workflow` v1：Workflow、Prompt、变量、权限和扩展依赖均走 shared zod schema。
- Main-owned service 提供 preview/install/export；安装前拒绝缺失依赖、DAG 错误、敏感字段和未知顶层包字段，不读取或执行外部 JS；项目内写回使用 atomic write，导出禁止覆盖项目目录。
- Workflow Editor 已接入导入确认和导出入口；当前证据为 Community Workflow 4 项服务测试、UI contract、全量 55 个测试文件/186 项测试、typecheck、build 通过。社区市场、签名发布、网络分享和外部运行时隔离仍未完成。
- 更新安全基础层已接入 shared update manifest schema、`assessUpdate` 和 Main-side SHA-512/大小验证；新增下载后校验再原子落盘的安全暂存函数，校验失败不会替换旧工件。Telemetry 现有本地 metadata-only 事件白名单、同意门和 500 条保留上限，不含正文/secret；真实更新 channel、安装切换、签名、公证、服务器、版本回滚、Telemetry 网络传输和安装后验收仍保持未完成。
- 编辑器格式工具栏已为核心图标按钮补齐 aria-label/title、键盘按钮语义和 `aria-pressed` 状态；项目完整性弹框已补充初始焦点、Tab/Shift+Tab 焦点循环、Esc 关闭和关闭后焦点恢复；Command Palette 已补充 dialog/listbox/option 语义及当前选项暴露；Provider 设置和图片预览弹框已补充 dialog 语义、焦点循环和关闭后焦点恢复；Graph 实体节点已支持 Tab 聚焦、Enter/Space 激活和可见 focus ring。这只完成 Writer、健康面板、命令面板、Provider 设置、图片预览和 Graph 节点的一段无障碍切片，完整 UI i18n、键盘全路径和端到端无障碍验收仍未完成。
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
- 当前状态为“本地 fixture 黄金路径已通、产品级验收仍部分”：真实窗口操作已适配 Chat/Suggestion/Canon/Workflow/Illustration/备份导入导出和 Telemetry 启用/撤销；该 harness 仍不替代真实 Provider、真实用户项目和完整发布级 Electron E2E。
- 验证：`npm run typecheck`、`node scripts/verify-runtime.mjs --long`、`node scripts/verify-ui-contract.mjs`、三个 `node --check`、`git diff --check` 通过；未运行 test/build。
- 本轮追加真实窗口首段：通过 CDP 仅调用公开 `window.novelAPI.project.open`、reload 触发 bootstrap、DOM selector 打开章节，`project-open/chapter-visible/chapter-open/workbench-visible` 全部 passed；这只是首段证据，后续工作区操作仍未覆盖。
- Chat 窗口适配已完成输入框/发送按钮/assistant 或错误状态的分层诊断，但因当前 runner 仍通过 reload 触发 bootstrap，真实运行出现间歇性 Welcome 恢复竞态；Chat 尚未计入通过证据，下一步改为单次 UI 最近项目打开流程后再验收。
- 后续验证完成：runner 通过 DOM selector 和公开 preload 完成 Chat、Suggestion、Canon、Workflow、Illustration 及备份/导入/导出连续操作；Workflow 证据包含 `firstPause/resumedReview/selectedImage/completed`，备份步骤证据包含 `imported/exported/backupCreated/chapterCount`。所有证据为 metadata-only，未调用真实 Provider。

### 第三十四切片（旧 schema 迁移可观测性，2026-09-03）

- `DatabaseService` 现在记录迁移起始版本、最终版本、实际应用的版本与名称，以及 `up_to_date`/`migrated` 状态；迁移仍保持逐版本事务，不改变既有 SQL 和人工数据边界。
- `ProjectService.checkIntegrity()` 通过 typed `ProjectIntegrity.migration` 返回该报告，项目完整性面板展示 `v旧 → v新` 和本次应用数量。数据库失败事务现会校验恢复到起始版本并关闭失败连接；manifest 迁移失败会恢复原文。该证据仍不替代跨版本备份恢复和发布级回滚验收。
- 旧 `migration-v1` fixture（其 SQLite 实际 user_version 为 2）的 runtime 核验已增加 v2→v19、17 个迁移、首尾版本和状态断言。

### 第三十五切片（全量 manifest 与增量备份，2026-09-03）

- 全量备份现在附带项目外生成的 `backup-manifest.json`，记录文件 SHA-256；恢复后会移除内部 manifest，不污染项目源文件。
- 增量备份以全量包为基准，只打包变更/新增文件，并记录删除清单与基准 manifest hash；恢复时先解压全量包，再叠加增量包并安全删除已移除文件。
- 增量基准必须是带 manifest 的全量包，路径清单经过安全校验；当前不支持增量链，也不等于云端同步或发布级跨版本兼容。
- runtime 已验证全量/增量创建、变更章节叠加恢复和 manifest 不落入恢复项目；UI 已通过 typed preload/IPC 暴露两条操作路径。

### 第三十六切片（Command Palette 焦点隔离，2026-09-04）

- Command Palette 打开时聚焦搜索框，Tab/Shift+Tab 在 dialog 内循环，关闭或 Escape 后恢复触发前焦点。
- 焦点查询限定在 `dialogRef` 内，结果项继续通过 `listbox`/`option` 和 `aria-activedescendant` 暴露，不把键盘焦点交给非 Tab stop 的结果节点。
- 已通过 Command Palette accessibility contract 与 typecheck；完整全局键盘路径、真实 Electron 无障碍树和端到端现场验收仍保持未完成。

### 第三十七切片（Electron 黄金路径生命周期稳定性，2026-09-05）

- 真实 Electron fixture runner 的 14 个顺序步骤全部通过：项目/章节、选区、Chat、Diff、Suggestion、Canon、Workflow 人工暂停/恢复、Illustration、备份导入导出、通知布局和 Telemetry 同意撤销。
- 修复了 `runStep()` 成功返回后遗留超时定时器的问题；稳定 launcher 等待 Vite/Electron 退出，CDP 与图片 fixture server 使用有界关闭，避免报告打印后进程不退出。
- 当前运行结果为 `node scripts/golden-path-electron.mjs` exit code 0。该证据仅覆盖临时 fixture/mock Provider；真实用户项目、真实 Provider、低端设备和发布安装仍未完成。

### 第三十八切片（跨章节 Workflow Retry 目标保持，2026-09-05）

- 右侧 Workflow 面板新增纯逻辑回归测试：已有 Run 被锁定后，切换到另一章节仍保留原 Run；Retry/Resume 继续由该 Run 的历史 `relPath` 决定，不从当前编辑器章节猜测。
- 无锁定 Run 时仍按当前章节选择最近记录，兼容首次打开和历史列表加载场景。
- 已通过 `tests/workflow-panel-selection.test.ts` 聚焦测试；随后在 `node scripts/golden-path-electron.mjs` 的临时 Electron 窗口中制造失败 Run、切换章节、点击 Retry，并以 metadata-only 状态确认目标路径仍保持不变。该证据覆盖 fixture/mock Provider，不替代真实用户项目现场验收。

### 第三十九切片（项目源文件引用完整性，2026-09-05）

- `ProjectService.checkIntegrity()` 现在除了验证 Relation/Timeline 的字段 schema，还会校验关系两端实体、Timeline 章节、参与实体和地点实体是否存在且类型正确，并按 `file#list[index].field` 定位问题。
- `repairIndexes()` 使用同一套引用校验，在重建索引前报告将被跳过的悬空源项，避免“修复成功但数据静默消失”。
- 新增项目服务回归测试覆盖结构合法但引用悬空的 Relation/Timeline 源文件，以及 metadata 合法但图片文件缺失的 Asset sidecar；健康检查和 repair 都会定位 `#relPath`。

### 第四十切片（旧版本备份与增量备份兼容，2026-09-05）

- 新增备份回归测试：原始 migration-v1（SQLite user_version=2）项目打包后恢复，再由 `ProjectService.open()` 自动迁移至 v19；同时验证增量备份新增文件和删除文件的叠加恢复。
- `verify-runtime.mjs` 现在先打包原始 v2 fixture，再执行恢复/打开，metadata-only 报告 `legacyBackupMigration.fromVersion=2`、`migratedTo=19`、`status=migrated`，避免先迁移再打包造成虚假证据。
- 仍未宣称真实用户项目、跨发布版本安装包和签名备份的兼容性已完成。

### 第四十一切片（Context 检索结果迁移策略，2026-09-05）

- `ContextReplayResult.compatibility` 现在暴露来源格式、来源检索版本、来源项目 schema，以及 `resultStrategy: recompute` 和 `sourceResultReusable: false`；调用方不会误把旧检索结果当作当前结果直接复用。
- 旧 Snapshot Replay 继续保留可解释 notes，明确按当前 Embedding/FTS 索引重新计算来源与预算；runtime smoke 已验证旧格式/旧检索版本/旧项目 schema 的迁移标记和未来版本拒绝。
- 当前仍缺跨版本检索结果的逐条用户侧迁移 diff 与真实项目现场验收。

### 第四十二切片（长篇性能基线输出，2026-09-05）

- `benchmark-runtime.mjs` 新增运行环境元数据、min/p50/p95/max/average 统计，以及按 repair/chapterList/integrity 分项的可选预算门禁；超过预算时返回非零退出码。
- 本机单次 smoke：darwin/arm64、8 CPU、16 GiB，repair 261ms、chapterList 7ms、integrity 204ms；该结果仅是可重复 fixture 参考，不代表低端设备或 UI 滚动性能。

### 第四十三切片（Graph Studio 关系编辑现场验收，2026-09-05）

- 真实 Electron fixture runner 新增 Graph Studio 关系闭环：通过 typed preload 创建关系，打开 Graph Studio 后从关系列表选择关系，修改关系类型与 metadata，保存后以 preload metadata-only 校验持久化结果。
- 随后重新选择同一关系确认编辑表单回显修改后的类型和 metadata，再通过界面删除，并以 `listRelations()` 确认关系已删除。
- 该证据覆盖 fixture/mock Provider 和临时项目，不替代真实用户项目、真实 Provider 或发布安装验收。

### 第四十四切片（损坏 Story 源文件的可恢复性报告，2026-09-05）

- `ProjectService.repairIndexes()` 现在对无法解析的实体 YAML、Relation YAML 和 Timeline YAML 按文件报告，不再因为单个损坏源文件抛出异常导致项目完整性修复中断。
- 修复只跳过无法安全索引的条目，保留原始源文件，并将路径写入 `invalidSourceFiles`；结构合法但引用悬空的 Relation/Timeline 继续按字段路径报告。
- 新增项目服务回归测试覆盖损坏实体源、损坏 Relation/Timeline 列表，验证检查发现、修复完成、原文保留和索引不误写。真实用户项目现场与 UI 人工验收仍需继续补充。
- `verify-runtime.mjs --long` 现新增独立临时项目现场证据：`sourceRecovery.detected/reportedDuringRepair/originalEntityPreserved/validIndexesRemainUsable` 均为 `true`。

### 第四十五切片（Story Bible Timeline 现场验收，2026-09-05）

- Timeline 编辑器现暴露稳定的现场验收 selector；黄金路径通过真实 Electron UI 创建/选择事件，修改参与实体、发生地点、原因、结果和描述。
- 保存后同时用 `listTimeline()` metadata-only 校验数据持久化，并重新选择事件验证表单回显，最后通过 UI 删除并确认源数据已移除。
- 该切片补齐了事件参与者、地点、原因/结果字段的真实 UI/E2E 证据；真实用户项目与复杂旧 Timeline 数据仍需继续验收。

### 第四十六切片（Context Replay 用户侧迁移差异，2026-09-05）

- Context Inspector 现在将 Replay 兼容性从临时消息提升为持久区块，展示来源格式、检索版本、项目 schema、迁移状态、重算策略和迁移 notes。
- 每条来源差异拥有稳定标识并展示新增/移除/变化及 token 前后值；旧结果仍明确不可复用，当前 Embedding/FTS 索引负责重算。
- Electron 黄金路径制造章节变更后回放 Context，现场确认兼容性区块可见且检测到 2 条逐来源差异，随后恢复原始章节内容；仍不替代真实用户项目的跨发布版本迁移验收。

### 第四十七切片（Developer Inspector 状态筛选与 Trace 视图，2026-09-05）

- Developer / Workflow Inspector 新增 Runs 与 Jobs 状态筛选，长运行记录不再只能依赖手动滚动查找。
- 节点详情明确标识 metadata-only trace，集中展示 provider/model/requestId、token/cost、Context 摘要、错误分类和脱敏日志；完整 input/output 仍只显示截断摘要。
- 新增 UI 契约测试覆盖筛选入口和 trace 区域；与既有诊断导出安全边界保持一致，不增加正文、API Key 或 Provider secret 的持久化。
- 初次真实 Electron 验收发现失败节点没有 diagnostics 时字段整块消失；现改为始终显示元数据字段，缺失值使用 `—`，避免失败 Run 无法诊断。
- 本轮已通过 `npm test -- --run tests/developer-observability.test.ts`、`npm run typecheck`、`npm run build`、`node --check scripts/golden-path-electron.mjs`、`node scripts/golden-path-electron.mjs`（19 步全部通过）和 `git diff --check`；仍不能替代真实 Provider、真实用户项目或发布级完整 UI/E2E 验收。

### 第四十八切片（Workflow 取消 UI 现场验收，2026-09-08）

- 黄金路径新增真实 UI 取消步骤：点击 `Run Chapter Review` 后等待按钮切换为 `Cancel Workflow`，再点击取消，使用 `listRuns(false)` 校验最终状态为 `cancelled`，并确认按钮恢复为可重新运行状态。
- 同步修复黄金路径选区坐标计算：多行 Range 改用首个/末个 `ClientRect`，避免用整体包围盒中线落到空白行导致拖选偶发失败；这只影响 Electron 验收 harness，不改变产品选区逻辑。
- 本地 Electron fixture 黄金路径现为 20 步全部通过，证据包含 `workflow-cancel-ui.started/cancelled/uiReady=true`；超时与图片幂等仍由 runtime smoke 覆盖。该证据仍不替代真实 Provider、真实用户项目或发布级安装验收。
- 2026-09-08：数据库 migration 失败处理新增回滚后 `user_version` 校验与失败连接关闭，并补充“失败后可重新打开且不残留部分迁移表”的回归证据；跨版本备份恢复、签名/公证和自动更新仍未完成。

### 第四十九切片（项目生命周期章节索引同步，2026-09-10）

- 真实用户项目现场复现：打开 `/demo/未命名文件夹` 后，章节文件存在但 SQLite `documents` 索引为空，项目完整性面板报告 `chaptersOnDisk=1 / chaptersIndexed=0`。
- 根因是 `ProjectService.open/create` 只准备项目和源目录，章节索引由 `ChapterService` 独立维护，生命周期 IPC 没有触发重建。
- 新增 Main 侧 `project-open-service` 边界；`project:create` 和 `project:open` 成功后同步章节 SQLite/FTS 派生索引。新增回归测试覆盖新建默认章节、重新打开后新增章节和 IPC 接线。
- Electron smoke 在用户项目临时副本上通过，完整性结果为 `warnings=0`、`missingFiles=0`、`invalidSourceFiles=0`、`chaptersIndexed=chaptersOnDisk=1`；该同步只写派生数据库，不改 Markdown/YAML/Canon。真实用户项目原始源文件未修改。

### 第五十切片（RightPanel 固定文案国际化，2026-09-10）

- RightPanel 的工具面板 aria label、Context 空状态/Inspector/Snapshots、Replay 标题、Workflow 描述/加载/恢复/人审提示、失败节点重试和选区输入提示改为 Renderer-owned locale key。
- `zh-CN`/`en-US` 均提供对应文案；模型提示词和章节内容仍保留项目内容语言，不把用户给 Agent 的自然语言指令误当成界面文案翻译。
- 新增 `tests/right-panel-i18n.test.ts`，验证关键 key 的双语存在性和固定中文 UI 字符串不再直接写入组件；聚焦 i18n/RightPanel/布局回归 10 项通过、typecheck/build/diff 检查通过。
- 该切片只完成右侧工作区固定文案的一部分，ChatWorkspace、WorkflowEditor、Story Bible 和完整键盘/无障碍现场验收仍保持未完成。

### 第五十一切片（RightPanel 动态元数据与操作文案国际化，2026-09-11）

- Context 检索元数据、回放差异、选区验证状态、Suggestion 操作、Workflow 运行上下文/状态和 Outline 空状态接入 `zh-CN`/`en-US` locale key。
- Agent Chat 的按钮 aria-label、快捷操作、Suggestion 审核按钮及 Workflow 人工审核按钮不再直接写死界面文案；插值文案统一通过 `formatUiText()` 处理。
- 新增/扩展 RightPanel i18n 契约测试；聚焦 i18n、RightPanel 布局和已有 UI 测试 10 项通过，typecheck、build、diff check 通过。
- 仍有少量服务端错误原文、节点 ID、模型生成提示词按数据或用户输入保留；ChatWorkspace、WorkflowEditor、Story Bible 及完整键盘/无障碍现场验收仍未完成。

### 第五十二切片（独立 Chat 工作区固定文案国际化，2026-09-11）

- 独立 Chat 的返回入口、工作区说明、会话管理、空状态、上下文来源、项目/章节/场景/选区 scope、输入框及发送/停止按钮接入 Renderer-owned locale key。
- 选区与会话的业务数据、用户输入和模型生成内容保持原样；action 内部继续使用稳定原始值，避免英文 UI 切换后操作分支失效。
- 新增 `tests/chat-workspace-i18n.test.ts`，验证独立工作区 key 的双语存在性和 shell 固定标签不直接写入组件；相关 Chat 测试与 typecheck 通过。
- Chat 操作反馈、Canon/Workflow/Illustration action 详情及 WorkflowEditor/Story Bible 的完整国际化仍需继续。

### 第五十三切片（WorkflowEditor 固定文案国际化，2026-09-11）

- WorkflowEditor 的编辑器标题、加载/保存/校验、社区 Workflow 导入导出、Properties/Variables 面板、变量字段、节点属性和 Agent Policy 字段接入 `zh-CN`/`en-US` locale key。
- Properties 折叠按钮、表单控件和删除变量的 aria-label/title 也改为 locale 文案；Workflow 节点和变量实际数据仍保持项目内容，不被 UI locale 改写。
- 新增 `tests/workflow-editor-i18n.test.ts`，并更新 Community Workflow UI 契约；相关测试、typecheck 已通过。
- WorkflowEditor 动态错误/导入确认反馈、节点目录固定 label、Story Bible 及完整双语 Electron 验收仍待继续。

### 第五十四切片（Story Bible 实体工作区固定文案国际化，2026-09-11）

- Story Bible 实体工作区标题、人物/地点/组织/物品新建入口、搜索框、实体空状态和编辑/新建表单标题接入 `zh-CN`/`en-US` locale key。
- 实体类型名称通过 locale 映射展示；实体名称、别名、字段值和项目源数据保持原样，不因 UI locale 被改写。
- 新增 `tests/story-bible-i18n.test.ts`，并同步更新导航契约；相关时间线黄金路径、导航/i18n 测试和 typecheck 已通过。
- Timeline、Plot/Foreshadowing/Lore 表单、字段标签、动态错误反馈及完整双语 Electron 验收仍待继续。

### 第五十五切片（Story Bible 实体字段类型本地化，2026-09-11）

- 实体字段目录的固定标签通过 locale 映射展示，人物、地点、组织、物品字段在英文界面不再沿用中文字段名。
- 映射仅作用于 UI label，不改变字段 key、已保存实体值或结构化源文件格式，保持项目数据兼容性。
- Story Bible 实体、导航和 Timeline 相关测试共 6 项通过，typecheck 通过；Timeline/Artifact 表单及动态反馈仍待继续。

### 第五十六切片（Story Bible Timeline/证据表单固定文案国际化，2026-09-11）

- Timeline 的新建入口、搜索、实体/章节筛选、排序、空状态、事件字段和保存/删除入口接入 `zh-CN`/`en-US` locale key。
- Foreshadowing 证据编辑器的标题、添加/移除入口和说明接入 locale key；事件标题、章节路径、实体名称与证据内容仍保持项目数据原样。
- Story Bible 实体、导航和 Timeline 相关测试 6 项通过，typecheck 已通过；Artifact 其余字段、动态错误反馈和完整双语 Electron 验收仍待继续。

### 第五十七切片（Story Bible Artifact 表单固定文案国际化，2026-09-11）

- Plot、Foreshadowing、Lore、Notes 条目类型、新建/编辑标题、空状态、标题/Notes 字段及保存/删除入口接入双语 locale key。
- Artifact 字段 key、状态值、证据内容和项目源数据保持不变；字段 label 继续通过 UI locale 映射展示。
- Story Bible/导航/Timeline 相关测试 6 项通过，typecheck 已通过；Artifact 动态错误反馈和完整双语 Electron 验收仍待继续。

### 第五十八切片（Story Bible Timeline/Artifact 国际化范围核对，2026-09-11）

- 复核确认 Timeline/Artifact 的固定显示文案已基本接入 locale key；加载、保存、删除、校验反馈仍保留较多组件内动态拼接，作为下一步明确缺口。
- 项目数据与 API 错误详情继续按原始内容保留，避免将用户内容或服务端诊断误当作 UI 文案翻译。
- 相关 Story Bible、导航和 Timeline 测试 6 项通过，typecheck 通过；服务错误细粒度翻译、Story Bible 全部动态反馈和双语 Electron 验收仍待继续。

### 第五十九切片（Story Bible 动态反馈国际化，2026-09-11）

- Story Bible 的实体/时间线/Artifact 加载、保存、删除、证据校验成功和失败反馈接入双语 locale key，并统一使用插值格式化错误详情。
- API 返回的错误详情作为 `{error}` 原文保留，UI 只负责提供稳定的本地化上下文，不改变诊断信息。
- Story Bible/导航/Timeline 相关测试 6 项通过，typecheck 已通过；完整双语 Electron 验收和其他工作区动态反馈仍待继续。

### 第六十切片（Illustration Studio 固定文案与反馈国际化，2026-09-11）

- Illustration Studio 的工作台标题、步骤、Prompt/资产操作、预览无障碍标签以及刷新、提案、保存、生成、插入、删除反馈接入 `zh-CN`/`en-US` locale key。
- 场景内容、Prompt、图注、Provider/model、Asset ID 和 API 错误详情仍按项目/服务原文显示；locale 只覆盖 Renderer-owned UI 文案。
- 新增 `tests/illustration-studio-i18n.test.ts`，先验证缺失 key 和硬编码失败，再完成迁移并通过；本切片还需经过全量测试、typecheck、build 验证。
- Illustration Studio 仍有少量场景提示/数据标签未完全细化，真实 Provider、双语 Electron 现场验收和蓝图整体完成度仍未完成。

### 第六十一切片（WorkflowEditor 动态反馈与节点目录国际化，2026-09-11）

- WorkflowEditor 的加载、保存、校验、布局、Community Workflow 导入/导出反馈，以及依赖确认中的 UI 上下文接入双语 locale key；Workflow 名称、依赖 ID、权限、路径和校验详情继续保留原始数据。
- 节点目录的固定节点名称改为 locale key，新增节点仍通过当前界面语言生成可见标签；节点类型、端口和用户编辑后的节点名称不被翻译逻辑改写。
- 扩展 `tests/workflow-editor-i18n.test.ts`，覆盖动态反馈和节点目录双语契约；聚焦测试与 typecheck 已通过。
- 完整全量验证、真实双语 Electron 现场验收、节点目录其他动态状态和蓝图整体完成度仍待继续。

### 第六十二切片（独立 Chat action 标签与反馈国际化，2026-09-11）

- ChatWorkspace 的复制、引用、追问、生成、Diff、Canon、Illustration、Workflow 等消息 action 标签接入双语 locale；内部仍使用稳定 action ID，英文界面切换不会破坏业务分支。
- 新建/归档会话、复制引用、Note、Canon 提案、章节读取、选区变化、Diff 创建和草稿拒绝等反馈统一接入 locale，并保留 API 错误详情及模型/用户内容原文。
- 扩展 `tests/chat-workspace-i18n.test.ts` 覆盖 action 标签与动态反馈；聚焦测试和 typecheck 已通过。
- 完整全量验证、真实双语 Electron 现场验收、其他工作区动态反馈和蓝图整体完成度仍待继续。

### 第六十三切片（Graph Studio 固定文案与反馈国际化，2026-09-11）

- Graph Studio 的图谱标题、搜索/筛选、实体类型、布局/邻域操作、Properties 折叠、关系编辑表单和画布提示接入双语 locale。
- 实体名称、关系类型、关系 ID、别名和元数据仍按 Story Bible 数据原样显示；节点无障碍标签使用当前 locale 的实体类型文案。
- 图谱加载、关系加载、JSON 校验、保存、删除、端点填入等操作反馈接入双语 locale；API 错误详情作为插值原文保留。
- 新增 `tests/graph-i18n.test.ts`，并同步更新 Graph accessibility 契约；聚焦测试和 typecheck 已通过，完整全量验证及真实双语 Electron 验收仍待继续。

### 第六十四切片（Provider Settings 动态反馈国际化，2026-09-11）

- ProviderSettings 的加载、切换、删除、保存、密钥状态、文本/Embedding/图片连接测试反馈接入双语 locale，并统一保留 Provider 名称、模型信息和 API 错误详情。
- Provider 设置弹框标题、关闭入口、Tab 和 Provider 操作入口开始使用 locale key；密钥值和配置数据不进入 UI 翻译层。
- 新增 `tests/provider-settings-i18n.test.ts`，覆盖双语 key 与动态反馈硬编码门禁；聚焦测试和 typecheck 已通过。
- Provider 表单其余字段标签/placeholder、完整双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第六十五切片（Developer Inspector 动态反馈国际化，2026-09-11）

- Developer / Workflow Inspector 的诊断导出、运行记录/后台任务读取、取消/重试、Telemetry 同意、扩展权限/安装/卸载反馈接入双语 locale。
- Inspector 顶部标题、说明、Telemetry 与扩展权限入口接入 locale；Run/Job/Node ID、状态、诊断字段、路径和错误详情仍按元数据原文显示。
- 新增 `tests/developer-panel-i18n.test.ts`，覆盖 Inspector 动态反馈及顶部文案；聚焦测试和 typecheck 已通过。
- Inspector 其余列表字段、完整双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第六十六切片（BottomPanel 工作区文案国际化，2026-09-11）

- BottomPanel 的面板调整/折叠无障碍标签、Notes/Outline/AI Chat 提示、伏笔摘要与筛选状态、Diff 历史空状态和 Revision 反馈接入双语 locale。
- 章节路径、伏笔标题/状态/证据、Revision 内容和服务端错误详情仍保持项目数据或诊断原文；locale 只覆盖 Renderer-owned UI 文案。
- 新增 `tests/bottom-panel-i18n.test.ts`，已完成红绿验证并通过 typecheck；全量测试、构建和真实双语 Electron 现场验收仍待继续。

### 第六十七切片（ScenePanel 场景管理文案国际化，2026-09-11）

- ScenePanel 的场景标题、数量、段落范围、管理入口、表单字段、空状态、删除确认和按钮文案接入 `zh-CN`/`en-US` locale。
- 场景名称、摘要、段落位置和 store 返回的业务状态消息仍保持项目数据/业务原文，不改变场景结构或正文内容。
- 新增 `tests/scene-panel-i18n.test.ts`，已完成红绿验证；全量测试 96 个文件、312 项通过，typecheck、build 和 `git diff --check` 均通过。
- ScenePanel 的业务错误反馈仍由 store 产生，完整双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第六十八切片（Sidebar 章节/卷管理文案国际化，2026-09-11）

- Sidebar 的章节菜单、删除确认、章节标题编辑、卷归属、未分卷、卷创建/删除/重命名、创建占位符和 Workflow/Graph/Illustration 入口接入双语 locale。
- 用户项目名称、章节标题、卷名、路径和故事数据保持原样；仅 Renderer-owned UI 文案随 locale 切换。
- 新增 `tests/sidebar-i18n.test.ts`，完成红绿验证；全量测试 97 个文件、313 项通过，typecheck、build 和 `git diff --check` 均通过。
- Sidebar 由 store 产生的业务操作错误反馈、完整双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第六十九切片（Developer Inspector 列表字段国际化，2026-09-11）

- Developer / Workflow Inspector 的 Jobs、Runs、Nodes 标题、状态筛选、空状态、取消/重试、章节缺省、创建时间、诊断 trace、Input/Output/Log 和扩展说明接入双语 locale。
- Run/Job/Node ID、状态元数据、模型/Profile/Request、token 数量、费用、错误详情及日志内容保持原始诊断数据；仅 UI label 随 locale 切换。
- 扩展 `tests/developer-panel-i18n.test.ts`，完成红绿验证；全量测试 97 个文件、313 项通过，typecheck、build 和 `git diff --check` 均通过。
- Developer 列表仍有少量诊断字段（Profile/Model/Request 等）可进一步细化，完整双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第七十切片（Developer Inspector 状态与诊断标签国际化，2026-09-11）

- Developer Inspector 的 Jobs/Runs/Nodes 状态显示改为按 locale 映射，补齐筛选项、取消/重试按钮、空状态、加载状态、章节缺省、创建时间、trace、Input/Output/Log 和扩展安全说明。
- 状态值、运行 ID、诊断元数据、token、费用和日志仍保持结构化数据原文，避免 UI 翻译改变运行记录或诊断含义。
- 扩展 `tests/developer-panel-i18n.test.ts`，完成红绿验证；全量测试 97 个文件、313 项通过，typecheck、build 和 `git diff --check` 均通过。
- Profile/Model/Request 等诊断字段标题以及完整双语 Electron 现场验收仍待继续。

### 第七十一切片（Command Palette 入口与项目检查反馈国际化，2026-09-11）

- Command Palette 的对话框无障碍标签、输入占位符、结果列表分组、搜索状态、空状态和键盘操作提示接入双语 locale。
- 索引修复与项目完整性检查的成功、警告和失败反馈接入双语 locale；索引数量、警告详情和服务端错误作为动态数据原样保留。
- 新增 `tests/command-palette-i18n.test.ts`，完成红绿验证；全量测试 98 个文件、314 项通过，typecheck、build 和 `git diff --check` 均通过。
- Command action registry 中的动作名称/提示以及完整双语 Electron 现场验收仍待继续。

### 第七十二切片（Command action registry 双语搜索与展示，2026-09-11）

- Command action registry 改为保存稳定的 `labelKey`/`hintKey`，Command Palette 按当前 locale 展示动作名称和提示。
- 动作搜索同时使用当前语言的 label/hint 与稳定 action ID，英文界面可以直接搜索英文动作文案，不改变 action ID 和执行分支。
- 扩展 `tests/command-palette-i18n.test.ts`，完成红绿验证；全量测试 98 个文件、315 项通过，typecheck、build 和 `git diff --check` 均通过。
- Action registry 的更多命令语义搜索和完整双语 Electron 现场验收仍待继续。

### 第七十三切片（UpdateCard 更新状态国际化，2026-09-11）

- UpdateCard 的更新入口、检查中、已是最新、可用版本、下载进度、已下载和失败状态接入双语 locale。
- 网络、清单、完整性和暂存失败原因通过 locale key 映射；版本号、release notes、字节数和底层状态保持原始更新数据。
- 新增 `tests/update-card-i18n.test.ts`，并兼容既有 UpdateCard UI 契约；全量测试 99 个文件、316 项通过，typecheck、build 和 `git diff --check` 均通过。
- 更新状态的真实 Electron 现场验收和蓝图整体完成度仍待继续。

### 第七十四切片（全局 NotificationCenter 文案国际化，2026-09-11）

- 全局 NotificationCenter 的通知容器和关闭按钮无障碍标签接入 `zh-CN`/`en-US` locale，通知消息、进度和类型不做翻译，继续保留业务原文。
- 新增 `tests/notification-center-i18n.test.ts`，并兼容既有通知模型和组件契约；全量测试 100 个文件、317 项通过，typecheck、build 和 `git diff --check` 均通过。
- 通知视觉样式、真正的 Electron 双语现场验收和蓝图整体完成度仍待继续。

### 第七十五切片（Welcome 项目启动文案国际化，2026-09-11）

- Welcome 页面品牌说明、项目名称占位符、项目目录选择、示例载入和最近项目移除入口接入 `zh-CN`/`en-US` locale。
- 项目名称、项目路径、最近项目标题和业务错误通知保持原始项目数据；新增最近项目移除按钮的无障碍标签。
- 新增 `tests/welcome-i18n.test.ts`，完成红绿验证；全量测试 101 个文件、318 项通过，typecheck、build 和 `git diff --check` 均通过。
- Welcome 的真实双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第七十六切片（Story Bible 表单文案国际化，2026-09-11）

- Story Bible 实体表单的名称、别名、角色/类型、Visual Identity、字段占位符、状态和 Notes 接入双语 locale；Timeline 的事件分组空值、关联实体空状态、打开章节和侧边摘要同步接入。
- Plot/Foreshadowing/Lore 字段标签、证据章节/摘录/说明、章节选择和多选框无障碍标签接入 locale；字段 key、实体名、事件标题、章节路径和证据内容保持项目数据原样。
- 扩展 `tests/story-bible-i18n.test.ts`，完成红绿验证；全量测试 101 个文件、319 项通过，typecheck、build 和 `git diff --check` 均通过。
- Story Bible 动态错误详情、真实双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第七十七切片（Illustration Studio 表单提示国际化，2026-09-11）

- Illustration Studio 的提案字段标签、Visual Setup/Scene Proposal/Review & Insert 说明、Art Direction 默认值与占位符、Prompt/图注占位符、变体单位和 seed 缺省值接入双语 locale。
- 图片 Prompt、场景标题/描述、视觉锚点、资产 ID、Provider/model、路径和生成结果保持业务数据原样；只翻译 Renderer-owned UI 文案。
- 扩展 `tests/illustration-studio-i18n.test.ts`，完成红绿验证；全量测试 101 个文件、320 项通过，typecheck、build 和 `git diff --check` 均通过。
- Illustration Studio 的动态错误详情、真实图片 Provider 和双语 Electron 现场验收、蓝图整体完成度仍待继续。

### 第七十八切片（Backup 与 Import/Export 操作国际化，2026-09-11）

- BackupActions 的创建全量/增量备份、恢复、索引修复按钮，以及目录选择、成功和失败反馈接入双语 locale；索引修复摘要的章节/实体/关系/Embedding 单位也按 locale 格式化。
- ImportExportActions 的导入、导出入口、文件选择提示、章节导入和全量导出反馈接入双语 locale；格式值、路径、章节标题和底层错误详情保持原始数据。
- 新增 `tests/backup-import-export-i18n.test.ts`，完成红绿验证；全量测试 102 个文件、322 项通过，typecheck、build 和 `git diff --check` 均通过。
- 真实用户项目备份兼容性、发布级备份验收和蓝图整体完成度仍待继续。

### 第七十九切片（Canon Review 操作国际化，2026-09-11）

- Canon Review 的标题、待审核数量、刷新、空状态和 Apply/Reject/Revert 操作接入双语 locale。
- Canon 应用/撤回过程与成功反馈接入 locale；提案类型、subject/predicate/object、源文档范围、Workflow Run ID 和底层错误详情保持原始数据。
- 新增 `tests/canon-review-i18n.test.ts`，完成红绿验证；全量测试 103 个文件、324 项通过，typecheck、build 和 `git diff --check` 均通过。
- Canon Review 的真实双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第八十切片（MarkdownMessage 复制操作国际化，2026-09-11）

- MarkdownMessage 的复制按钮和复制成功状态接入 Chat locale key，支持中英文界面切换。
- Markdown/HTML 渲染内容仍按模型或用户原文显示，不改变既有安全清洗逻辑。
- 新增 `tests/markdown-message-i18n.test.ts`，完成红绿验证；全量测试 104 个文件、326 项通过，typecheck、build 和 `git diff --check` 均通过。
- Chat 消息操作的真实双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第八十一切片（SelectionToolbar 操作国际化，2026-09-11）

- SelectionToolbar 的工具栏无障碍标签、润写/改写/扩写/缩写/续写/解释/翻译/选中/取消选中按钮及标题接入双语 locale。
- 显示文案按当前 UI 语言切换，但选区事件仍传递稳定的内部原始 action label，保持选中与取消选中互斥逻辑和 Agent 分支兼容。
- 扩展 `tests/selection-toolbar.test.tsx`，完成红绿验证；全量测试 104 个文件、327 项通过，typecheck、build 和 `git diff --check` 均通过。
- 选区操作的真实双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第八十二切片（Checkpoint 操作文案国际化，2026-09-11）

- Checkpoint 的创建/恢复入口、占位符、空状态、确认提示、文件数量及读取/创建/恢复反馈接入双语 locale。
- Checkpoint 名称、项目文件覆盖行为、路径和底层错误详情保留业务数据；恢复确认继续明确提示会覆盖项目内容文件。
- 新增 `tests/checkpoint-actions-i18n.test.ts`，完成红绿验证；全量测试 105 个文件、329 项通过，typecheck、build 和 `git diff --check` 均通过。
- Checkpoint 的真实双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第八十三切片（EditorPane 编辑器文案国际化，2026-09-11）

- EditorPane 的空章节提示、场景缺省名、正文格式工具栏及标题/加粗/斜体/列表/引用/撤销/重做/清除选区高亮等无障碍标签接入双语 locale。
- AI 修改预览操作、字数单位和图片资产缺失占位图/alt/title 接入 locale；章节正文、场景名、资产 ID 和 Markdown 内容保持原始业务数据。
- 新增 `tests/editor-pane-i18n.test.ts` 并更新编辑器无障碍契约，完成红绿验证；全量测试 106 个文件、331 项通过，typecheck、build 和 `git diff --check` 均通过。
- EditorPane 的真实双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第八十四切片（ProviderSettings 配置界面文案国际化，2026-09-11）

- ProviderSettings 的连接、模型、计费与密钥字段标签、默认 profile 名、删除 profile 无障碍标签、密钥状态提示和操作按钮接入双语 locale。
- URL、模型名、协议名称、价格单位、Provider 名称和底层错误详情保留配置/诊断数据原样；密钥仍使用原有独立安全存储链路。
- 扩展 `tests/provider-settings-i18n.test.ts`，完成红绿验证；全量测试 106 个文件、331 项通过，typecheck、build 和 `git diff --check` 均通过。
- ProviderSettings 的真实双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第八十五切片（ScenePanel 默认场景文案国际化，2026-09-11）

- ScenePanel 新建场景时的默认名称接入双语 locale，中文界面使用“新场景”，英文界面使用“New scene”。
- 用户已有的场景标题、摘要、段落范围和排序仍作为项目数据原样保存，不因界面语言切换而改写。
- 扩展 `tests/scene-panel-i18n.test.ts`，完成红绿验证；全量测试 106 个文件、331 项通过，typecheck、build 和 `git diff --check` 均通过。
- ScenePanel 的真实双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第八十六切片（Story Bible 动态反馈复核，2026-09-11）

- 复核 Story Bible 的实体、Timeline、Artifact 加载/保存/删除、证据校验和异常反馈，均已通过 `storyFeedbackMessages` 与 `useUiText`/插值函数输出双语文案。
- 章节路径、实体名称、事件内容、证据摘录和服务端错误详情继续作为项目/诊断数据原样保留；未发现需要改变数据语义的固定反馈。
- 追加 ScenePanel 默认名称测试覆盖；聚焦 Story Bible/ScenePanel 测试 2 个文件、4 项通过，typecheck 和 `git diff --check` 通过；此前同一工作区全量测试 106 个文件、331 项及 build 已通过。
- Story Bible/ScenePanel 的真实双语 Electron 现场验收和蓝图整体完成度仍待继续。

### 第八十七切片（App 外壳状态与导航文案国际化，2026-09-11）

- App 顶部项目菜单、备份/增量备份/索引修复入口、左右栏折叠提示、启动/加载状态、保存状态、模型缺省提示、语言选项和 Focus Mode 快捷键说明接入双语 locale。
- Workflow 写回冲突提示继续保留目标章节路径等动态数据；项目标题、模型名、语言配置和布局状态不被翻译或改写。
- 新增 `tests/app-shell-i18n.test.ts`，同步更新受影响的静态菜单/i18n 契约；受影响测试 3 个文件、6 项通过，typecheck、build 和 `git diff --check` 通过。
- 串行全量测试完成 107 个文件、332 项通过；其中聚合运行时 `workflow-run-store-behavior` 出现一次既有状态隔离失败，单独运行该文件 3 项通过，需后续继续治理测试隔离稳定性。
- App 外壳的真实双语 Electron 现场验收、测试隔离稳定性和蓝图整体完成度仍待继续。

### 第八十八切片（Workflow Job 列表确定性排序修复，2026-09-11）

- 修复 `WorkflowRunStore.listJobs()` 仅按时间排序导致同一时间戳下旧 Job 被返回、最新 queued Job 被遮蔽的问题。
- 查询增加 `rowid DESC` 作为同时间戳的稳定次序；新增回归测试覆盖相同时间戳下最新插入 Job 的返回行为。
- 聚焦测试 4 项通过；单文件串行全量测试 107 个文件、334 项通过，typecheck、build 和 `git diff --check` 均通过。
- Workflow 真实 Electron 运行验收、测试隔离的其他边界和蓝图整体完成度仍待继续。

### 第八十九切片（RightPanel 运行反馈国际化，2026-09-11）

- RightPanel 的 Workflow 执行/取消/重试/恢复、Context 回放、Canon Proposal、章节读取、旧 Diff、图片写回和总结反馈接入双语 locale。
- 动态路径、运行 ID、章节内容、Proposal 数量、token 数量和底层错误详情继续保留原始业务/诊断数据；仅稳定的界面提示文案随 UI 语言切换。
- 扩展 `tests/right-panel-i18n.test.ts`，完成红绿验证；串行全量测试 107 个文件、334 项通过，typecheck、build 和 `git diff --check` 均通过。
- RightPanel 的真实双语 Electron 现场验收、Workflow 运行反馈边界和蓝图整体完成度仍待继续。

### 第九十切片（异常 Story Bible 数据完整性明细，2026-09-11）

- `ProjectService.checkIntegrity()` 与 `repairIndexes()` 现在返回无效 Story Bible 条目的稳定 ID、类型、标题及 Zod 字段校验问题，不再只返回聚合数量。
- 项目完整性弹框展示可定位的异常条目明细；不向 Renderer 暴露 `fields_json` 或正文内容，修复仍保留无效 `artifacts.yaml` 源文件并跳过其派生索引。
- 新增项目服务回归测试与项目健康面板契约测试；串行全量测试 107 个文件、336 项通过，typecheck、build 和 `git diff --check` 均通过。
- 真实损坏用户项目的 Electron 现场操作证据、迁移异常数据的更细粒度修复建议和蓝图整体完成度仍待继续。

### 第九十一切片（指定用户项目完整性 Electron 验收，2026-09-11）

- `scripts/golden-path-user-project.mjs` 增加完整性报告中的异常 Story Bible 明细输出，继续保持只读验收，不调用 repair、保存或导入操作。
- 对 `demo/未命名文件夹` 完成真实 Electron 连续验收：项目打开、章节列表、编辑器、右侧面板和完整性检查全部通过；报告为 1/1 章节已索引、0 个 warning、0 个缺失源文件、迁移状态 `up_to_date`。
- 用户项目 golden-path 契约测试通过；串行全量测试 107 个文件、336 项通过，typecheck、build 和 `git diff --check` 均通过。
- 指定用户项目的损坏数据修复演练、真实 Provider、完整交互黄金路径和蓝图整体完成度仍待继续。

### 第九十二切片（Electron 黄金路径稳定性与 Replay 文案修复，2026-09-11）

- Electron/CDP 黄金路径支持 `NOVEL_STUDIO_CDP_PORT`，避免固定端口误连残留实例；拖选前等待编辑器完成 `contenteditable` 挂载并显式聚焦，CDP 释放鼠标事件声明 `buttons: 0`。
- Context Replay 的“使用当前索引重算”接入双语 locale；Workflow/Developer 验收断言兼容中文状态和按钮文案，不再因界面语言误报失败。
- 新端口运行 `NOVEL_STUDIO_CDP_PORT=9244 node scripts/golden-path-electron.mjs` 通过 20 个顺序步骤：选区、Chat/Replay、独立 Chat 返回高亮、Suggestion、Canon、Workflow 人工审核/跨章节 Retry/取消、Illustration、Timeline、Graph、备份导入导出、通知布局、Telemetry 和 Developer Inspector 全部 passed。
- 本轮聚焦契约测试、typecheck、`git diff --check` 通过；仍不替代真实 Provider、真实用户项目损坏修复演练、低端设备和发布安装验收。

### 第九十三切片（App 顶栏固定文案国际化，2026-09-11）

- 顶栏项目菜单标签和状态栏 Context 使用量标签接入 Renderer-owned locale，中文/英文界面不再依赖组件内固定字符串。
- 项目名称、Context 数值、模型名和语言值继续作为业务/诊断数据原样展示，不参与翻译或改写。
- 扩展 `tests/app-shell-i18n.test.ts` 完成红绿验证；全量测试 107 个文件、336 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过。
- 第 26 章仍需完整键盘全路径、真实双语 Electron 无障碍树和跨工作区人工验收；蓝图整体仍未完成。

### 第九十四切片（右侧 Agent 折叠按钮语义复核，2026-09-11）

- 保留顶部原有 `Bot` 图标及其 active/collapsed 视觉效果，右侧面板继续采用整栏收起，不恢复会占用工作区的折叠 rail。
- 为折叠按钮补充 `aria-pressed`，让展开/收起状态与实际布局状态一致；新增 RightPanel 布局契约回归测试。
- 聚焦测试 6 项通过，typecheck 和 `git diff --check` 通过；真实双语 Electron 无障碍树和蓝图整体完成度仍待继续。

### 第九十五切片（VolumeService 生命周期与归属回归覆盖，2026-09-11）

- 补充真实临时项目测试，覆盖卷创建/改名/删除、章节文件存在性校验、章节跨卷迁移、移出、排序及带章节删除保护。
- 全量测试 107 个文件、338 项通过；完整覆盖率基线为 Statements 70.59%、Lines 78.45%，仍低于 80% 门槛，未通过调低阈值规避。
- `volumes.yaml` 仍由项目初始化写入 `version: 1` 的稳定结构，现有 legacy 无 version 兼容测试继续通过；蓝图整体完成度仍待继续。

### 第九十六切片（SafeStorageSecretStore 安全边界覆盖，2026-09-11）

- 新增 OS 安全存储适配器测试，覆盖加密载荷落盘与重新加载、删除、加密不可用时拒绝持久化、损坏存储降级为空以及 MemorySecretStore 合约。
- 全量覆盖率提升至 Statements 71.14%、Lines 78.99%、Functions 73.53%、Branches 56.38%；`secret-store.ts` 达到 100% 行覆盖，整体仍未达到 80% 门槛。
- 全量测试 108 个文件、342 项通过；typecheck 和 `git diff --check` 仍需在本轮结束前复核，蓝图整体完成度仍待继续。

### 第九十七切片（RevisionService 回退安全分支覆盖，2026-09-11）

- 新增 RevisionService 生命周期测试，覆盖 Revision 创建/查询/按章节列表、成功回退生成逆向 Revision，以及章节发生后续修改时拒绝覆盖。
- 同时覆盖未找到 Revision 和未配置章节回退能力的错误边界；全量测试 109 个文件、344 项通过，typecheck 与 `git diff --check` 通过。
- 覆盖率仍需下一轮继续提升，尤其是 Renderer `app-store`、共享 diff、ExtensionRegistry 和 WorkflowRuntimeService；蓝图整体完成度仍待继续。

### 第九十八切片（共享 Diff 段落与字符算法覆盖，2026-09-11）

- 新增共享 diff 行为测试，覆盖空文本、相同文本、Unicode 字符、插入/删除内容保真、段落 changed/added/removed 分类、CRLF 归一化和段落尾部对齐。
- 全量测试 110 个文件、348 项通过，typecheck 与 `git diff --check` 通过；未修改 diff 算法实现，仅用公开 API 固化现有行为。
- 总体覆盖率仍需继续提升，下一优先为 Renderer `app-store`、ExtensionRegistry 和 WorkflowRuntimeService；蓝图整体完成度仍待继续。

### 第一百切片（ExtensionRegistry 描述符与权限边界覆盖，2026-09-11）

- 新增 ExtensionRegistry 行为测试，覆盖 Manifest 注册替换、Provider/Workflow Node/Importer/Exporter 描述符注册与查询、快照脱敏结构、权限预览、依赖缺失和未知能力错误。
- 覆盖扩展卸载后的注册表状态清理；依赖阻止卸载的签名包路径继续由既有 `extension-package` 测试覆盖。
- 聚焦测试 3 项、全量回归 111 个文件/353 项通过；修正测试桩类型后 typecheck 与 `git diff --check` 通过。蓝图整体完成度仍待继续。

### 第一百零一切片（Workflow 审核草稿输入安全校验，2026-09-11）

- `approvedDraftFromInput` 现在只接受通过 `isDraftOutput` 的审核草稿，拒绝带说明性前缀、非法 mode/target、空 sourceNode 等伪草稿，避免未经验证的内容进入章节写回。
- 新增 WorkflowRuntimeService helper 边界测试，并覆盖无章节路径、无写回输出等完成态判断；先验证失败再修复实现。
- 聚焦测试 7 项、全量测试 111 个文件/354 项通过，typecheck 与 `git diff --check` 通过；真实 Provider 和完整 Electron 审核现场仍待继续。

### 第一百零二切片（ChatWorkspace 浏览器交互验收边界盘点，2026-09-11）

- 复核 ChatWorkspace 的会话切换/新建/重命名/归档、选区 scope、流式发送/取消及消息 action 均依赖浏览器 DOM 与真实 preload 回调；当前 Node 测试仅能覆盖静态壳和独立的 chat-session 纯函数，不能把静态渲染当成交互验收。
- 明确下一步需要在 Electron/浏览器测试环境补交互证据，重点覆盖选区保持、流式 delta/done/error、独立 Chat 返回和消息 action；本轮未引入未经验证的 UI 依赖。
- WorkflowRuntimeService 安全校验的全量回归仍为 111 个文件、354 项通过；蓝图整体完成度仍待继续。

### 第一百零三切片（ChatWorkspace Electron 交互黄金路径，2026-09-11）

- 使用独立 CDP 端口运行真实 Electron fixture，完成独立 Chat 打开、选区 scope 展示、Draft 流式结果、Diff action、返回编辑器及选区高亮恢复验收。
- 同一条 20 步黄金路径继续通过 Suggestion/Canon/Workflow/Illustration/Timeline/Graph/备份导入导出/Notification/Telemetry/Developer Inspector，结果 `ok: true`，所有步骤 `passed`。
- 该证据覆盖 fixture/mock Provider，不替代真实 Provider、真实用户项目损坏修复、低端设备性能和发布安装签名验收；蓝图整体完成度仍待继续。

### 第一百零四切片（长篇损坏项目修复与规模核验，2026-09-11）

- 运行 `node scripts/verify-runtime.mjs --long` 成功：临时损坏项目修复后 warning 清零，1 个章节和 1 个实体索引恢复，原始损坏源文件保留；迁移 v2→v19、增量备份、Workflow、图片幂等、引用清理和 1000 章/1000 实体/100000 facts 均通过。
- 该验证不改写仓库或指定用户项目，仍不替代真实损坏用户项目的可恢复副本演练和发布级备份兼容性验收。

### 第一百零五切片（运行时性能基线复测，2026-09-11）

- `npm run benchmark:runtime -- --iterations=3` 成功，环境为 darwin/arm64、8 CPU、16 GiB；repair 平均 453ms（p95 478ms）、chapterList 平均 11ms（p95 12ms）、integrity 平均 339ms（p95 443ms），预算门禁通过。
- 结果仅代表本机临时 fixture，低端设备、真实 Electron UI 滚动性能和长时间运行稳定性仍无证据；蓝图整体完成度仍待继续。

### 第一百零六切片（macOS ARM64 安装包实产物，2026-09-11）

- 执行 `npm run dist:mac` 成功，生成 `release/Novel Studio-0.1.0-arm64.dmg`；构建过程包含 production build、Electron 重建和 DMG 生成。
- `node scripts/verify-packaging-artifacts.mjs --platform mac` 通过，产物约 120.5 MB，存在且体积合理；该校验不等于安装验证。
- electron-builder 明确报告当前机器没有 Developer ID Application 身份，DMG/应用未完成签名；公证、安装后启动和自动更新仍待真实发布环境完成。

### 第一百零七切片（Windows/macOS 安装产物统一门禁，2026-09-11）

- `npm run verify:artifacts` 通过，当前 `release/` 根目录实际包含 `Novel Studio Setup 0.1.0.exe`（约 99.8 MB）和 `Novel Studio-0.1.0-arm64.dmg`（约 120.5 MB），Windows NSIS 与 macOS DMG 产物均满足体积门槛。
- Windows 产物为既有构建结果，当前 macOS 机器未重新构建 Windows 安装包；产物存在检查不等于跨平台安装验证。
- 发布签名、公证、安装后启动、更新通道和回滚仍需具备证书与目标平台环境后完成；蓝图整体完成度仍待继续。

### 第九十九切片（App Store 场景与卷操作覆盖，2026-09-11）

- 扩展 `app-store` 测试，覆盖场景加载、选择、创建、更新、排序、删除全链路，以及卷创建/更新/归属/移出/删除和失败提示。
- 全量覆盖率提升至 Statements 73.83%、Lines 81.90%、Functions 76.41%、Branches 57.77%；行覆盖已超过 80%，语句/分支/函数门槛仍需继续补齐。
- 全量测试 110 个文件、350 项通过；修正测试输入字段后，聚焦测试 8 项、typecheck 与 `git diff --check` 均通过，蓝图整体完成度仍待继续。

### 第一百零八切片（Electron 依赖安全审计与安装环境边界，2026-09-11）

- Electron 已从 `38.8.6` 升级至 `39.8.10`，`package.json` 与 `pnpm-lock.yaml` 已一致；类型检查、全量测试（111 个文件/354 项）、production build、打包配置和既有安装产物门禁均通过。
- `pnpm audit --audit-level high` 仍报告 `extract-zip@2.0.1` 的 2 个 high 漏洞，路径为 `electron → extract-zip`；上游当前没有可用的修复版本，不能通过强制覆盖版本伪装为已修复，发布前需持续跟踪 Electron 上游依赖更新。
- Electron 39.8.10 的 npm 包已安装但本机二进制缺失；执行安装脚本时因访问 `github.com` DNS `ENOTFOUND` 失败。`pnpm install --store-dir .pnpm-store` 可完成锁文件安装，但无法在离线/受限网络下恢复二进制。
- 当前 `release/` 中的 Windows NSIS 与 macOS ARM64 DMG 仍可通过存在性/体积校验；Electron 现场黄金路径和重新生成安装包需在可访问 Electron 下载源的环境复验。安全审计、签名、公证、安装后启动和自动更新仍未闭环，蓝图整体完成度仍待继续。

### 第一百零九切片（Workflow 写回人工审核边界，2026-09-11）

- 修复 `approvedDraftFromInput()` 接受裸 `DraftOutput` 的绕过路径：`chapter.write` 现在只接受带 `approve`/`edit` 动作且通过完整 draft 校验的输入，AI 生成的裸草稿不能直接写回正文。
- 更新 `workflow-writeback` 与 `workflow-runtime-service` 回归断言；先验证裸草稿断言失败，再完成最小实现修复，聚焦测试 2 个文件/12 项通过。
- 全量测试 111 个文件/354 项通过，`npm run typecheck` 与 `git diff --check` 通过；测试类型夹具同步改为 `relPath: undefined`，与共享 `WorkflowRun` 合约一致。
- 该切片强化 Human-gated 写回，但真实 Provider、完整 Electron 人工审核路径和蓝图整体发布门禁仍需继续验收。

### 第一百一十切片（更新清单有界读取与错误分类，2026-09-11）

- 新增 Main-owned `fetchUpdateManifest()`：更新清单响应限制为 256 KiB，流式读取超限即拒绝，JSON 解析失败不会继续进入 schema 或下载流程。
- `UpdateManifestFetchError` 将网络不可达/非 2xx 与清单格式/大小错误区分开，`UpdateService.check()` 分别返回 `network` 或 `manifest`，避免更新卡片误导用户。
- 新增更新清单 fetch 测试，覆盖无效 JSON、超大 `content-length` 和网络错误；更新编排聚焦测试 11 项、typecheck 已通过。真实更新服务器、签名、公证、安装切换和版本回滚仍未完成。

### 第一百一十一切片（App Store 场景状态清理，2026-09-11）

- 修复 Renderer `app-store` 在无活动章节时只清空场景列表、不清空上一章节 `sceneMessage` 的状态残留；关闭项目或切换到空编辑区后不会继续展示过期场景错误。
- 新增回归测试覆盖场景列表、选中场景和错误反馈的同步清理；先验证旧提示残留导致断言失败，再完成最小状态修复。
- 全量测试 112 个文件/359 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 通过；真实低端设备 UI 滚动、完整无障碍路径和发布级验收仍待继续。

### 第一百一十二切片（Suggestion 接受异常反馈，2026-09-11）

- 修复 `app-store.acceptPendingSuggestion()` 未捕获 preload/IPC Promise reject 的问题；建议应用失败现在返回 `false`、保留待审核建议，并通过统一 `notice` 展示可读错误。
- 新增回归测试覆盖异常抛出路径，确认不会产生未处理 Promise 或错误清空待审核内容；先验证异常直接冒泡，再完成最小捕获修复。
- 全量测试 112 个文件/360 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 通过；真实 Provider、低端设备和完整发布级 UI/E2E 验收仍待继续。

### 第一百一十三切片（最近项目移除异常反馈，2026-09-11）

- 修复 `app-store.removeRecent()` 忽略 IPC Result 失败及直接抛错的问题；最近项目移除失败现在保留列表状态，并通过统一 `notice` 给 Welcome 页面可见反馈。
- 新增回归测试覆盖 Promise reject 路径，先验证异常冒泡，再完成 Result/异常双路径处理；不会因为失败而误刷新或静默吞掉错误。
- 全量测试 112 个文件/361 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 通过；真实项目启动、低端设备和发布级 UI/E2E 验收仍待继续。

### 第一百一十四切片（关闭项目失败保护，2026-09-11）

- 修复 `app-store.closeProject()` 在自动保存失败或关闭 IPC 抛错时直接 reject 的问题；失败时保留当前工作区、章节和未保存内容，并展示“关闭项目失败”通知。
- 新增回归测试覆盖保存失败路径，确认不会调用项目关闭 IPC，也不会错误切换到 Welcome；先验证异常冒泡，再完成最小捕获修复。
- 全量测试 112 个文件/362 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 通过；真实 Electron 关闭项目现场、低端设备和发布级验收仍待继续。

### 第一百一十五切片（删除章节异常反馈，2026-09-11）

- 修复 `app-store.deleteChapter()` 未捕获章节删除 IPC Promise reject 的问题；删除失败时保留当前章节和编辑器正文，并显示删除失败通知。
- 新增回归测试覆盖锁定章节/删除异常路径，确认不会误清空编辑状态或继续刷新章节列表；先验证异常冒泡，再完成最小捕获修复。
- 全量测试 112 个文件/363 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 通过；真实 Electron 删除失败现场、低端设备和发布级验收仍待继续。

### 第一百一十六切片（自动保存异常收敛与关闭保护，2026-09-11）

- 修复 `app-store.saveActiveChapter()` 在保存 IPC Promise reject 时状态永久停留 `saving` 的问题；现在会收敛到 `error`、保留正文并显示保存失败通知。
- `closeProject()` 在自动保存后检查最终状态，保存未成功时停止关闭项目，避免未保存内容丢失；成功关闭路径保持原有状态清理和最近项目刷新。
- 新增回归测试覆盖保存异常与关闭保护；全量测试 112 个文件/364 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 通过。真实 Electron 崩溃恢复、低端设备和发布级验收仍待继续。

### 第一百一十七切片（数据库关闭失败上下文保护，2026-09-11）

- 修复 `ProjectService.close()` 先清空 `current` 再关闭数据库的顺序问题；数据库关闭失败时项目上下文仍保留，调用方可重试关闭，不会出现 Renderer 仍在工作区但 Main 已无项目的分裂状态。
- 新增真实临时 SQLite 回归测试，模拟数据库 busy/close 失败并验证项目仍可读，恢复正常关闭后再释放上下文。
- 全量测试 112 个文件/364 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过；发布签名、公证、低端设备和真实 Provider 验收仍待继续。

### 第一百一十八切片（Gemini API Key 请求头隔离，2026-09-11）

- Gemini Provider 的列模型、普通对话和流式对话请求不再把 API Key 拼入 URL query，统一通过 `x-goog-api-key` 请求头发送，避免密钥进入代理或访问日志。
- 新增 Provider 回归断言，覆盖 URL 不含 `key=`、请求头包含密钥以及流式 `alt=sse` 参数仍保留；先验证旧实现失败，再完成最小实现修复。
- 聚焦测试 10 项、全量测试 112 个文件/365 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过；真实 Provider、代理日志和发布级安全验收仍待继续。

### 第一百一十九切片（Main AI 请求速率限制，2026-09-11）

- 新增 Main-owned 滑动窗口 `RequestRateLimiter`，按 Provider profile 隔离计数，限制突发 AI 请求并返回可重试的 `RATE_LIMITED` 错误及 `retryAfterMs`。
- `AiService` 的 chat、stream、structured、embedding、模型探测和 Embedding 探测均统一经过限流；限制不依赖 Renderer，不能通过绕过 UI 直接调用 IPC 规避。
- 新增限流器边界测试与 AiService 集成回归；全量测试 113 个文件/367 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。真实多进程/代理级限流、Provider 配额和发布环境验收仍待继续。

### 第一百二十切片（导出图片元数据隐私清理，2026-09-11）

- `ChapterService.exportAll()` 新增可选 `cleanImageMetadata` 导出选项；HTML 导出内嵌图片前由 Main 清理 PNG 的文本/EXIF 块、JPEG 的 EXIF/注释段、WebP 的 EXIF/XMP 块以及 SVG 的 metadata/注释，不修改项目原始资产。
- Import/Export UI 增加双语“清理图片元数据”开关，默认开启；Markdown/TXT 导出不内嵌图片，仍保持原有正文导出语义。
- 新增图片格式清理单测、HTML 导出集成测试和 UI locale 契约；清理模块聚焦覆盖率达到 Statements 80%、Branches 81.81%、Functions 100%、Lines 96.15%；全量测试 114 个文件/373 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过。真实带 EXIF 的多格式图片、导出后应用兼容性和发布级隐私验收仍待继续。

### 第一百二十一切片（App Store 项目生命周期覆盖，2026-09-11）

- 新增 Renderer `app-store` 的项目启动恢复、已有项目工作区加载、新建项目输入校验及成功创建回归测试，覆盖真实的 preload 返回值与状态转换，不改变业务实现。
- `app-store.ts` 聚焦覆盖率由 Statements 42.67% 提升至 71.46%、Lines 49.66% 提升至 81.2%；全量覆盖率提升至 Statements 77.16%、Branches 60.39%、Functions 80.43%、Lines 85.5%，仅 Functions 达到 80%，Statements/Branches 的全面门禁仍未通过。
- 全量测试 114 个文件/383 项通过，`npm run typecheck` 和 `git diff --check` 通过；`app-store` 其余错误/场景/卷分支、ChatWorkspace 组件交互及完整组件/E2E 覆盖仍待继续。

### 第一百二十二切片（Community Workflow 未注册节点隔离，2026-09-11）

- 修复 Workflow Runtime 对未知节点类型默认“成功透传”的安全缺口；共享校验现在要求节点类型属于 Main-owned 内置执行器白名单，未知/未注册类型返回 `UNKNOWN_NODE`，不会进入执行或写盘流程。
- Community Workflow 安装新增回归测试，确认伪造 `community.execute-code` 节点在替换已有 Workflow 前被 `VALIDATION_FAILED` 拒绝；运行时超时/重试 smoke fixture 改用合法的 `utility.transform` 类型，测试语义不变。
- 聚焦测试 4 个文件/26 项、全量测试 114 个文件/385 项通过；`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。真正的社区市场、签名发布、已注册扩展节点运行时接入和发布级隔离验收仍待继续。

### 第一百二十三切片（Main-owned Workflow Node Runtime 接入，2026-09-11）

- `WorkflowRuntimeService` 现在接收 `ExtensionRegistry`，对已注册的 Main-owned Workflow Node 调用其 typed handler；节点执行仍运行在 Main 进程，Renderer 和社区包不会获得可执行代码入口。
- Workflow 校验支持传入额外的已注册节点类型；Community Workflow 安装只放行 Registry 已登记的 handler，未知类型仍在写盘前返回 `VALIDATION_FAILED`。新增 Registry 查询与 Runtime/安装回归测试，覆盖实际 handler 调用而非成功透传。
- 全量测试 114 个文件/387 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。扩展包的正式发布者签名、运行时权限授予/撤销、社区市场和发布级隔离验收仍待继续。

### 第一百二十四切片（扩展依赖 SemVer 范围校验，2026-09-11）

- 修复扩展依赖只检查 ID、不检查版本范围的问题；`ExtensionRegistry` 现在统一校验精确版本、`^` 和 `~` 依赖范围，缺失依赖与版本不兼容分别给出明确的 `VALIDATION_FAILED` 信息。
- `ExtensionPackageStore` 与 Community Workflow 安装共用该依赖校验，版本不满足时不会注册、写入或替换目标 Workflow；新增扩展 Registry 与 Community Workflow 回归测试。
- 全量测试 114 个文件/389 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。正式发布者签名、公钥轮换、运行时权限授予/撤销、社区市场和发布级隔离验收仍待继续。

### 第一百二十五切片（Community Workflow 权限批准门禁，2026-09-11）

- 修复 Community Workflow 权限只展示、不由 Main 强制批准的问题；安装接口现在必须携带与包声明完全一致的用户批准权限集合，缺失、重复或额外权限都会返回 `VALIDATION_FAILED`。
- 同步更新 shared API contract、preload、IPC schema 和 WorkflowEditor：用户确认预览后将批准权限传入 Main，直接绕过 UI 的安装调用无法绕过权限门禁；无权限包保持兼容。
- 全量测试 114 个文件/390 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。权限授予的持久化/撤销、正式发布者签名、公钥轮换、社区市场和发布级隔离验收仍待继续。

### 第一百二十六切片（扩展 Handler 卸载撤销，2026-09-11）

- 修复卸载扩展 Manifest 后仍保留其 Workflow handler 的生命周期漏洞；第三方 Workflow handler 现在必须声明所属 `extensionId`，所属扩展不存在时禁止注册，卸载 Manifest 会同步撤销关联 handler。
- Runtime 仍只执行当前 Registry 中有效的 Main-owned handler；新增卸载后查询失败与孤立 handler 注册失败回归测试，内置无归属 handler 保持兼容。
- 全量测试 114 个文件/391 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。权限授予持久化/撤销、正式发布者签名、公钥轮换、社区市场和发布级隔离验收仍待继续。

### 第一百二十七切片（签名扩展包权限预览与安装批准，2026-09-11）

- 修复签名扩展包安装只验证签名、不要求用户批准权限的问题；`ExtensionPackageStore` 新增 Main-owned 权限预览，安装时必须携带与 Manifest 完全一致的批准权限集合。
- 新增 `extension:preview` IPC；Developer Panel 在安装前展示名称、版本和请求权限，用户确认后才将批准集合传回 Main。直接绕过 Renderer 的安装调用仍无法绕过权限门禁。
- 全量测试 114 个文件/392 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。权限授予持久化/撤销、正式发布者签名、公钥轮换、社区市场和发布级隔离验收仍待继续。

### 第一百二十八切片（扩展安装 IPC 权限确认闭环，2026-09-11）

- 扩展包安装现在通过 Main-owned `extension:preview` 读取并验证签名 Manifest，再由 Developer Panel 展示权限并确认；确认结果随安装请求传入 Main，安装写盘前再次校验 Manifest 与批准集合。
- 更新 Extension API contract、preload、IPC 参数 schema 及 Developer Panel 双语确认文案；无权限包保持无感兼容，权限包无法通过旧的单参数调用或直接 IPC 绕过确认。
- 全量测试 114 个文件/392 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。权限撤销后的持久化状态管理、正式发布者签名、公钥轮换、社区市场和发布级隔离验收仍待继续。

### 第一百二十九切片（扩展 Manifest 升级时 Handler 撤销，2026-09-11）

- 修复同一扩展重新注册新 Manifest 时旧 Workflow handler 继续留在 Registry 的状态泄漏；Manifest 替换现在同步撤销该扩展的旧 handler，新版本必须重新 provision 后才能执行。
- 保留内置无归属 handler 的兼容性；新增升级撤销回归测试，覆盖旧 handler 查询失败和扩展生命周期绑定。
- 全量测试 114 个文件/393 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。正式发布者签名、公钥轮换、权限持久化策略、社区市场和发布级隔离验收仍待继续。

### 第一百三十切片（Workflow Handler 权限子集校验，2026-09-11）

- Workflow Node handler 现在可声明自身所需权限；Registry 注册时要求这些权限必须是所属扩展 Manifest 已声明权限的子集，带权限 handler 必须绑定 `extensionId`，重复权限或越权请求都会被拒绝。
- 该校验位于 Main-owned Registry 边界，不能通过 Renderer 或社区 Workflow 配置绕过；扩展卸载/Manifest 替换时既有 handler 撤销逻辑继续生效。
- 全量测试 114 个文件/394 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。正式发布者签名、公钥轮换、权限持久化策略、社区市场和发布级隔离验收仍待继续。

### 第一百三十一切片（WorkflowRuntimeService 异常路径覆盖，2026-09-11）

- 新增真实临时项目回归测试，覆盖后台 `start` 完成任务、失败 Run 使用新章节路径 Retry、旧 Run 缺少章节路径 Resume 拒绝，以及 Context 节点缺少章节输入时的 validation 错误分类。
- 全量 coverage 提升至 Statements 78.09%、Branches 61.42%、Functions 81.37%、Lines 86.17%；`WorkflowRuntimeService` Statements 提升至 73.92%，未降低 coverage 门槛。
- 全量测试 114 个文件/398 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs` 和 `git diff --check` 均通过。Renderer 组件覆盖、真实 Electron/E2E、低端设备与发布级验收仍待继续。

### 第一百三十二切片（Renderer app-store 显式失败分支与 Agent 折叠入口，2026-09-11）

- 新增 Renderer `app-store` 对章节、场景和卷操作的显式 IPC `{ ok: false }` 回归测试，确认失败不会更新本地集合，并统一写入可见的章节/场景/卷错误提示；聚焦测试 25 项通过。
- 恢复右侧 Agent 面板折叠后的 30px Bot 窄栏入口；点击 Bot 可重新展开面板，并补齐 hover、active、focus-visible 状态，避免折叠后失去恢复入口。右侧布局与顶部菜单回归测试共 33 项通过。
- `app-store` 聚焦覆盖率提升至 Statements 80.39%、Lines 83.89%（Branches 60.92%）；全量 coverage 本次因并发 SQLite/临时目录资源竞争触发 6 个既有长测试超时，不能据此宣称全量 coverage 通过。改用单 worker 顺序执行后，全量测试 114 个文件/399 项通过；`npm run typecheck`、`npm run build` 和 `git diff --check` 通过。Renderer 组件/E2E、真实 Provider、低端设备与发布级验收仍待继续。

### 第一百三十三切片（UI Contract 国际化漂移修复与全量覆盖率复测，2026-09-12）

- 修正 `scripts/verify-ui-contract.mjs` 对已国际化组件的过时固定中文断言，改为校验稳定的 locale key、行为标识和数据边界；`node scripts/verify-ui-contract.mjs` 现 89 项全部通过，且继续明确“静态契约不能替代真实组件/E2E”。
- 使用单 worker 顺序模式复测全量 coverage：114 个文件、399 项测试通过；Statements 78.78%、Branches 61.94%、Functions 81.47%、Lines 86.38%。总体 Statements/Branches 仍未达到 80% 门槛，未通过修改阈值规避。
- `node scripts/verify-runtime.mjs` 通过，覆盖迁移 v2→v19、项目修复、Provider/Embedding、Context、Workflow、场景、图片、备份、Checkpoint 和诊断链路。真实 Electron 黄金路径因当前 Electron 39 postinstall 二进制下载网络超时而未启动，未将其记为 UI 验收通过；真实用户工程、真实 Provider、低端设备与发布级验收仍待继续。

### 第一百三十四切片（ChatWorkspace 流式与选区状态边界，2026-09-12）

- 新增 Renderer 纯状态模型 `chat-workspace-model.ts`，将 Chat 消息回合创建、delta 累加、done 最终结果、error 收敛、取消收敛、历史过滤和持久化消息清洗从组件副作用中抽离；全部返回新数组/对象，不修改已有会话状态。
- ChatWorkspace 现在只把“菜单确认过、快照属于当前章节且文本非空”的选区传入 Context 请求；未确认的普通拖选、跨章节旧快照和无快照内容均回退为整章上下文。会话恢复与切换也统一经过消息清洗。
- 修复取消生成的终态漏洞：Provider 尚未发出终止事件时，点击停止也会结束本地 streaming 行、保留已有增量并显示双语取消反馈；待返回的 stop 函数不会在取消后重新占用状态。
- 新增 `tests/chat-workspace-model.test.ts`，覆盖 7 个纯逻辑边界；聚焦 Chat 测试 4 个文件、12 项通过。全量测试 115 个文件、406 项通过。
- `npm run test:coverage -- --run --no-file-parallelism --maxWorkers=1` 通过：Statements 78.90%、Branches 62.27%、Functions 82.39%、Lines 86.23%；总体 Statements/Branches 仍低于 80%，未调低门槛。
- `npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron/Playwright 现场、真实 Provider、指定用户工程、低端设备和发布签名/公证仍未验收；当前 Electron 二进制缺失的阻断保持不变。

### 第一百三十五切片（ChatWorkspace 动态文案国际化边界，2026-09-12）

- 将 ChatWorkspace 的消息类型从内部枚举 ID 映射为双语 locale 文案，避免界面直接显示 `draft`、`canon-proposal` 等实现字段；重命名/归档快捷按钮也改为 locale 文案，并补齐无障碍名称。
- 新增独立 `chatWorkspaceMessages` locale 区域，保留 `chatMessageActions()` 的稳定 action ID 和已存储会话数据格式，不翻译或改写用户内容。
- 新增国际化回归断言，覆盖快捷按钮、七种消息类型和中英文差异；先验证旧硬编码失败，再完成修复。聚焦 Chat 测试 3 个文件、12 项通过。
- 全量测试 115 个文件、407 项通过；覆盖率 Statements 78.91%、Branches 62.29%、Functions 82.31%、Lines 86.25%，总体 Statements/Branches 仍低于 80%，未调低门槛。
- `npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron/Playwright、真实 Provider、指定用户工程、低端设备及发布签名/公证仍未验收，Electron 二进制缺失阻断保持不变。

### 第一百三十六切片（Community Workflow 权限持久化与异常回滚，2026-09-12）

- 新增 Main-owned `ExtensionPermissionStore`，以 JSON 原子写入持久化已批准的扩展权限；应用重启时仅恢复同一扩展、同一版本的授权，Manifest 升级或卸载会撤销旧授权，损坏的权限文件按 fail-closed 处理。
- `WorkflowRuntimeService` 执行已注册扩展节点前强制检查权限，未批准或版本不匹配时不会调用 handler；扩展包加载、安装和卸载均接入授权恢复/撤销。
- 修复安装替换和卸载的异常回滚边界：权限持久化失败时恢复旧目录、旧 Manifest 和旧 Registry 授权；新增 2 项失败路径回归测试，聚焦扩展权限/包/Registry/Runtime 共 34 项通过。
- 单 worker 全量测试 116 个文件、416 项通过；coverage 为 Statements 79.34%、Branches 62.61%、Functions 82.6%、Lines 86.64%，总体 Statements/Branches 仍未达到 80% 门槛，未调低门槛规避。
- `npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron/Playwright、真实 Provider、指定用户工程、低端设备、社区市场/正式签名、公钥轮换及 macOS 签名公证仍未验收。

### 第一百三十七切片（扩展发布者公钥轮换边界，2026-09-12）

- 可信扩展公钥配置支持 `active` / `retired` 状态；active key 可用于预览和新安装，retired key 仅允许恢复磁盘上已有的已安装包，防止轮换期间旧扩展全部失效，也防止继续发布新包使用旧 key。
- 扩展加载、卸载和异常回滚允许读取 retired key；新包验证仍默认拒绝 retired/未知 key。原有无 `status` 配置继续按 active 兼容处理。
- 新增公钥验证和包恢复回归测试；聚焦扩展包、包存储、Registry 共 29 项通过。全量测试 116 个文件、418 项通过。
- `npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron/Playwright、真实 Provider、指定用户工程、正式社区市场、更新清单签名、公钥发布流程、低端设备及 macOS 签名公证仍未验收。

### 第一百三十八切片（更新清单发布者签名校验，2026-09-12）

- 更新清单 schema 现在必须包含 Ed25519 发布者签名；Main 在选择可用更新前验证签名，清单被篡改、签名缺失、未知 key 或 retired key 均不会进入下载流程。
- 新增稳定的更新清单签名 payload 与 Main-owned 验证器，并复用可信发布者 key 的 active/retired 轮换语义；更新下载仍额外执行 HTTPS、声明大小和 SHA-512 校验后才原子写入。
- release preflight 增加更新清单发布者签名门禁；更新相关聚焦测试 7 个文件/29 项通过。
- 全量测试 116 个文件、420 项通过；coverage 为 Statements 79.3%、Branches 62.71%、Functions 82.35%、Lines 86.67%，总体 Statements/Branches 仍未达到 80% 门槛。`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`（89 项）、`node scripts/release-preflight.mjs` 和 `git diff --check` 均通过。
- 当前应用内置可信 key 配置仍为空，因此没有配置发布者时更新/扩展安装会安全禁用；真实更新服务器、正式公钥发布与轮换流程、真实 Electron 安装切换/回滚、真实 Provider、低端设备及 macOS 签名公证仍未验收。

### 第一百三十九切片（更新清单发布签名命令，2026-09-12）

- 新增 `scripts/sign-update-manifest.mjs` 和 `npm run sign:update-manifest`，使用外部 Ed25519 私钥将 unsigned manifest 转换为签名清单；脚本严格校验清单字段、HTTPS、版本、SHA-512、大小和发布时间。
- 签名命令拒绝覆盖输入清单或私钥文件，使用临时文件原子写入，stdout 仅输出结果路径和 key ID，不输出私钥内容；release preflight 增加该命令存在性和外部私钥边界检查。
- 新增真实临时密钥回归测试，验证生成清单可由 Main 验证器验签；发布相关聚焦测试 4 个文件/22 项通过。
- 全量测试 117 个文件、421 项通过；coverage 为 Statements 79.3%、Branches 62.71%、Functions 82.35%、Lines 86.67%，总体 Statements/Branches 仍未达到 80% 门槛。
- `npm run typecheck`、`npm run build`、`node --check scripts/sign-update-manifest.mjs`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`（89 项）、`node scripts/release-preflight.mjs` 和 `git diff --check` 均通过。正式私钥保管/CI、公证、安装切换与回滚、真实 Electron/Provider、低端设备及平台安装验收仍未完成。

### 第一百四十切片（已下载更新的受控安装入口，2026-09-12）

- `UpdateService` 新增无参数 `install()`：只有当前服务完成完整性校验并产生的 ready artifact 才能交给 Main 注入的系统安装器；未 ready、取消或安装器报错均返回可恢复的 `installation` 失败状态，不接受 Renderer 任意路径。
- 新增 `update:install` shared IPC、preload bridge 和 Main handler；生产 Main 使用 Electron `shell.openPath()` 打开已暂存的 `.dmg`/`.exe`，由平台安装器完成后续安装，应用本身不替换正在运行的文件。
- UpdateCard 在 ready 状态显示“安装更新”按钮，并补齐中英文失败文案；新增服务、IPC、UI 回归测试覆盖未就绪拒绝、成功安装、安装器失败和 ready UI。
- 全量单 worker 测试 117 个文件、424 项通过；`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`（89 项）、`node scripts/release-preflight.mjs` 和 `git diff --check` 均通过。真实 Electron 安装切换/回滚、macOS Developer ID 签名公证、Windows/macOS 安装后启动及发布 CI 仍待平台验收。

### 第一百四十一切片（可信扩展公钥轮换状态持久化，2026-09-12）

- 修复可信公钥配置解析丢弃 `active`/`retired` 状态的问题；从磁盘加载的 retired key 现在会继续按“仅允许恢复既有安装包”的策略处理，新旧无 status 配置保持兼容。
- 新增回归测试覆盖磁盘配置解析后的 retired 状态保留；聚焦扩展包/包存储测试 2 个文件、21 项通过。
- 全量单 worker 测试 117 个文件、425 项通过；`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`（89 项）、`node scripts/release-preflight.mjs` 和 `git diff --check` 均通过。正式发布 key、CI 密钥保管、真实 Electron/平台安装和公证仍待验收。

### 第一百四十二切片（章节虚拟列表几何兼容性，2026-09-12）

- 修复 Sidebar 章节虚拟列表使用 typed `attr()` 计算占位高度和窗口偏移的问题；目标 Chromium 对该写法支持不稳定，可能使虚拟滚动占位高度失效。
- 占位总高度、行高和渲染窗口偏移现在由 React 注入明确 CSS 变量，保留章节分组、拖拽、定位当前章节和 overscan 行为；新增契约测试防止回退到 `attr()` 算术。
- 全量单 worker 测试 118 个文件、426 项通过；`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过。低端设备真实滚动帧率和真实 Electron 现场仍待验收。

### 第一百四十三切片（Electron 归档 symlink 路径穿越缓解，2026-09-12）

- `pnpm audit --audit-level high` 发现 Electron 安装依赖 `extract-zip@2.0.1` 的两个 symlink 路径穿越 advisory；由于上游没有可用修复版本，新增仓库内 pnpm patch，遇到 symlink 条目直接拒绝，不再创建链接。
- `package.json`/`pnpm-lock.yaml` 固定该 patch，`release-preflight` 增加补丁存在性和拒绝逻辑门禁；冻结锁文件离线安装已验证实际应用到 Electron 依赖。
- 新增依赖安全回归测试；全量单 worker 测试 119 个文件、427 项通过，`npm run build`、`node scripts/release-preflight.mjs` 和 `git diff --check` 均通过。`pnpm audit` 仍会按上游版本元数据报告 2 个 high，需发布签核确认补丁与供应链证据；签名、公证和平台安装验收仍未完成。

### 第一百四十四切片（IPC 嵌套错误详情脱敏，2026-09-12）

- 修复 `toAppError()` 只脱敏顶层错误 message、原样转发 `DomainError.details` 的问题；现在递归清理嵌套字符串、敏感字段名对应的值、循环引用和过深对象，同时保留安全诊断上下文。
- 新增回归测试覆盖嵌套 Bearer、data URL 和安全字段保留，避免错误详情成为绕过 IPC 脱敏的路径。
- 全量单 worker 测试 119 个文件、428 项通过；`npm run typecheck`、`npm run build`、`node scripts/release-preflight.mjs` 和 `git diff --check` 均通过。`pnpm audit` 的 extract-zip 上游 advisory 已由仓库 patch 缓解但仍待发布签核，真实 Electron/Provider、签名公证和平台安装仍待验收。

### 第一百四十五切片（发布门禁与本机长篇性能复核，2026-09-12）

- 复核 `npm run verify:release`、`verify:packaging` 和 `verify:artifacts`：Windows NSIS 与 macOS arm64 DMG 产物均存在且体积合理，代码级发布门禁通过。
- 复核 `npm run benchmark:runtime -- --iterations=1`：当前 macOS arm64/16 GiB 环境 fixture 的 repair 275ms、chapterList 7ms、integrity 200ms；结果仅作为本机对照，不替代低端设备与真实 UI 滚动基线。
- 依赖安全补丁、错误详情脱敏和发布检查新增门禁后，全量单 worker 测试 119 个文件、428 项通过；`npm run typecheck`、`npm run build`、`npm run verify:release` 和 `git diff --check` 均通过。`pnpm audit` 仍报告 extract-zip 上游元数据 advisory，真实签名、公证、平台安装和跨机器性能分布仍待验收。

### 第一百四十六切片（Agent/Chat 纯逻辑覆盖与全量覆盖率达标，2026-09-12）

- 补齐 AgentService 的 fallback 提示词、项目提示词读取失败回退、策略工具副本和上下文消息构造测试；补齐 Chat 意图/操作分派、选区目标、Canon 提案安全解析、会话 key/不可变更新和 Diff 预览行为测试，并覆盖 AI mock profile fallback 与 Agent stream 的上下文回写。
- 全量单 worker 测试 121 个文件、437 项通过；coverage 达到 Statements 80.04%（4317/5393）、Branches 63.66%、Functions 83.42%、Lines 87.37%，未修改覆盖率门槛。
- `npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run verify:release` 和 `git diff --check` 均通过。真实 Electron/Playwright、真实 Provider、指定用户工程、低端设备及签名/公证/平台安装仍未验收。

### 第一百四十七切片（Image Prompt Agent 契约与项目 Prompt Pack，2026-09-12）

- 按蓝图第 12 章补齐独立的 `image-prompt` Agent：加入共享 Agent ID 校验、Main-owned fallback prompt、`image-prompting` Context recipe、`ImagePrompt@1` 输出策略及项目初始化时的版本化 `agent-image-prompt.md`。
- 新增回归测试确认旧实现会拒绝该 Agent，随后覆盖策略、fallback、项目 scaffold 和现有 Workflow Agent 校验；聚焦测试 36 项通过，全量测试 121 个文件、438 项通过。
- `npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`、独立执行的 `npm run verify:release` 和 `git diff --check` 均通过。Image Prompt Agent 已可作为 `ai.*` Workflow 节点的合法配置；真实 Provider 输出质量、真实 Electron/Playwright 和发布签名/公证仍未验收。

### 第一百四十八切片（图片 Prompt 独立 Workflow 节点，2026-09-12）

- 按蓝图第 11/14 章将图片提示词处理拆成独立的 `image.prompt` Main-owned 节点，加入 Workflow 校验白名单和内置 Novel Flow；流程现在明确为 `Image Proposal → Image Prompt → Generate Illustration → Select Illustration → Insert Illustration`。
- Runtime 新增场景提案归一化边界：去除提示词空白、清理 negative prompt、过滤非法 visual context；缺少有效提示词时返回可定位的 validation 错误，不会进入图片 Provider 或写回。
- 新增内置 DAG、归一化函数回归测试；全量单 worker 测试 121 个文件、440 项通过。`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`、串行 `npm run verify:release` 和 `git diff --check` 均通过。真实图片 Provider 输出质量、Electron/Playwright、跨平台签名公证和实际安装仍未验收。

### 第一百四十九切片（Image Prompt 节点 Runtime 边界，2026-09-12）

- 将 `image.prompt` 加入 Main-owned Workflow 节点白名单和内置 DAG，Runtime 在进入 Image Provider 前独立校验并归一化场景提案；无有效 `suggestedPrompt` 时以 `VALIDATION_FAILED` 终止该节点，避免空提示词继续执行。
- 保留已有人工门：`image.prompt` 只处理场景提案，不生成图片、不选择资产、不写回章节；后续仍必须经过 `image.generate → image.select → image.insert`。
- 新增失败优先的 Runtime/内置 DAG 回归测试；全量单 worker 测试 121 个文件、440 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`、串行 `npm run verify:release` 和 `git diff --check` 均通过。真实 Provider、Electron/Playwright、签名公证和平台安装仍未验收。

### 第一百五十切片（Importer/Exporter 扩展点接入章节服务，2026-09-12）

- 按蓝图第 18/23 章将已注册的 typed Importer/Exporter 从仅描述对象接入 `ChapterService`：内置 Markdown/TXT/HTML 路径保持不变，非内置扩展名由 Registry 路由到 Main-owned handler。
- 扩展导入/导出执行前校验所属扩展权限；导入结果限制为有效标题与不超过 2MB 的 Markdown，导出结果仅允许字符串或 `Uint8Array`，所有文件仍通过 atomic write 写入。Main 启动时将共享 Registry 注入章节服务，Renderer 不获得扩展可执行代码。
- 新增真实临时项目回归测试覆盖 `.novelbook` 导入和 `novel-json` 导出，并覆盖 Importer/Exporter 权限必须绑定 Manifest 且为声明子集；全量单 worker 测试 121 个文件、442 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`、`npm run verify:release` 和 `git diff --check` 均通过。扩展格式的 Renderer 选择器、真实第三方扩展包、跨平台安装及签名公证仍未验收。

### 第一百五十一切片（扩展格式 Renderer 入口，2026-09-12）

- Project/Chapter IPC 现在允许 Renderer 请求已注册 Importer 的扩展名，并允许已注册 Exporter 的安全格式标识；Main 会再次与 Registry 快照交叉校验，拒绝任意扩展名/格式，保留 Markdown/TXT/HTML 内置路径。
- 导入文件对话框动态合并已注册扩展名；导出操作区通过 `extensions.list()` 动态显示扩展 Exporter 按钮，保存对话框使用对应扩展名，随后 `chapter:export` 仍在 Main 侧验证格式并路由到受信任的 Main-owned handler。
- 新增扩展 IPC/导入导出 UI 契约回归测试；聚焦测试 2 个文件、7 项通过。全量单 worker 测试 121 个文件、443 项通过；`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`、`npm run verify:release` 和 `git diff --check` 均通过。
- 真实第三方扩展包执行、真实 Electron/Playwright、Provider、低端设备滚动基线、跨平台安装以及签名/公证仍未验收。

### 第一百五十二切片（右侧 Agent 折叠入口视觉恢复，2026-09-12）

- 修复右侧 Agent 面板折叠后 Bot 入口被顶部对齐的问题；窄 rail 现在使用整高布局并垂直居中，保留原 Bot 图标及 hover、active、focus-visible、按下反馈。
- 折叠入口补充 `aria-pressed` 状态语义，与顶部 Agent toggle 保持一致；新增右侧布局回归契约测试。
- 聚焦测试 2 个文件、10 项通过；`npm run typecheck` 和 `git diff --check` 均通过。真实 Electron 窗口视觉验收仍未完成。

### 第一百五十三切片（项目级 IDE 布局折叠状态持久化，2026-09-12）

- 按 Design System 的 `Panels: resize / collapse / persist layout` 要求，将左侧目录栏和右侧 Agent 栏的折叠状态纳入项目布局存储；既有面板宽度、底部面板高度/状态继续按项目恢复。
- 增加布局 hydration gate：切换项目时先读取并应用目标项目布局，目标项目完成加载前禁止旧状态写回，避免跨项目污染 localStorage。
- 新增布局持久化回归契约；3 个相关测试文件、14 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过。真实 Electron 多项目重开视觉验收仍未完成。

### 第一百五十四切片（布局 hydration 写回竞态修复，2026-09-12）

- 修复项目切换时布局读取 effect 与持久化 effect 的竞态：加入 `layoutReadyFor` hydration gate，只有目标项目的布局已完成读取后才允许写入对应 key，避免旧项目的面板尺寸/折叠状态污染新项目。
- 新增回归断言覆盖 hydration gate；右侧 Agent/顶部菜单/导航相关 3 个测试文件、14 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过。
- 真实 Electron 多项目切换、重启后的视觉布局验收仍未完成。

### 第一百五十五切片（全局 Story Bible 搜索，2026-09-12）

- Command Palette 的非空查询现在同时搜索章节、Story Bible 实体、Timeline Event 和 Story Artifact；结果数量按类别限制，摘要长度有界，并通过 typed IPC 从 Main 侧查询。
- 实体结果会打开对应实体并聚焦；Timeline、Plot、Foreshadowing、Lore、Note 结果会导航到对应 Story Bible 区域，避免只能搜索章节正文。
- 新增 `StorySearchResult` 共享类型、`story:search-all` IPC、StoryService 搜索实现和回归契约测试；全量单 worker 测试 121 个文件、447 项通过。
- `npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron/Playwright 的搜索交互、Provider、低端设备滚动基线、跨平台安装及签名/公证仍未验收。

### 第一百五十六切片（Graph Studio 多跳邻域探索，2026-09-12）

- Graph Studio 的聚焦邻域从固定一跳扩展为可选 1/2/3 跳；过滤逻辑使用有界 BFS，只展示指定层数内的实体和关系，保留无聚焦时的完整图行为。
- 新增邻域层数选择控件、稳定测试选择器和中英文 i18n 文案；默认仍为一跳，清除聚焦后可继续查看全图。
- 新增回归测试覆盖多跳扩展、无关分支隔离和非法层数钳制；全量单 worker 测试 121 个文件、449 项通过。
- `npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。Graph 的真实 Electron 交互、低端设备滚动基线、完整无障碍现场及蓝图其他高级能力仍未验收。

### 第一百五十七切片（异常旧源文件结构化修复报告，2026-09-12）

- `ProjectIntegrity` 和 `ProjectRepairResult` 新增 `invalidSourceDetails`，按源文件聚合 schema/引用定位；保留原有 `invalidSourceFiles` 字段，兼容已有 IPC 调用方。
- 完整性检查和索引修复现在都明确报告无法安全解析或跳过重建的旧源文件及字段位置；修复仍不会覆盖损坏源文件，只重建可验证的数据。
- 项目完整性弹框新增按文件展示的异常源明细，区分文件级 schema 错误与 `relations[0].fromId` 等字段级引用错误，避免旧数据被静默忽略。
- 新增服务和 UI 回归测试；全量单 worker 测试 121 个文件、450 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron 现场、低端设备、完整无障碍验收及蓝图其他发布能力仍未完成。

### 第一百五十八切片（右侧工作区键盘导航，2026-09-12）

- 右侧 Agent、Workflow、Outline 改为标准 tablist 的 roving tabindex：只有当前 tab 进入 Tab 顺序，非当前 tab 使用 `tabIndex=-1`。
- 在 tab 获得焦点时支持 ArrowLeft/ArrowRight 循环切换，以及 Home/End 跳转首尾；切换后同步聚焦目标按钮，并为三个内容面板补齐 `aria-controls`。
- 新增键盘导航契约测试；全量单 worker 测试 122 个文件、451 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron 无障碍树、跨工作区键盘现场和蓝图其他高级能力仍未验收。

### 第一百五十九切片（Story Bible Quick Open 直达，2026-09-12）

- Command Palette 命中 Story Bible 的 Timeline Event 或 Story Artifact 后发出聚焦事件；Workbench 保存命中 ID 并传入 Story Bible，避免打开后还需要手动切换章节或模块。
- Story Bible 完成数据加载后自动选择并滚动到对应 Timeline 或 Artifact；无效或已不存在的命中会被安全忽略，不影响常规 Story Bible 加载。
- 新增 Quick Open 聚焦回归测试；聚焦测试 2 个文件、7 项通过，全量单 worker 测试 123 个文件、452 项通过。
- `npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron/Playwright 的搜索到目标定位现场、Provider、低端设备、跨平台安装及签名/公证仍未验收。

### 第一百六十切片（Community Workflow Prompt Pack 往返，2026-09-12）

- 修复 Community Workflow 安装时丢弃 `prompts` 的问题：每个 Prompt 以纯文本保存到项目 `prompts/community/<workflowId>/<promptId>.md`，并由同目录 `manifest.json` 保存受控的 ID、名称和文件映射；不执行包内代码，也不把 Prompt 内容写入 SQLite 或日志。
- Community Workflow 导出现在会读取已安装的同 Workflow Prompt Pack，保留 Prompt ID、名称和模板，实现“导入 → 项目内持久化 → 再导出”的数据往返；缺失或损坏的历史 Prompt 条目会被安全跳过，工作流仍可导出。
- 新增安装文件、导出往返回归测试；聚焦测试 1 个文件、9 项通过，全量单 worker 测试 123 个文件、453 项通过。
- `npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。正式 Community Workflow 市场、发布者 key、外部代码隔离执行、真实 Electron/Provider 与跨平台发布验收仍未完成。

### 第一百六十一切片（Community Workflow Prompt Pack 预览，2026-09-12）

- 导入预览现在返回 Prompt 名称列表，而不只是数量；Workflow Editor 的确认提示会显示即将写入项目的 Prompt Pack，用户可以在确认前识别内容范围。
- Prompt 预览复用现有双语 i18n 边界，未改变数据包执行策略或权限审批逻辑。
- 新增预览和 UI 契约回归测试；聚焦测试 3 个文件、13 项通过，全量单 worker 测试 123 个文件、454 项通过；`npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实社区市场、发布者 key、外部代码隔离执行、真实 Electron/Provider 与跨平台发布验收仍未完成。

### 第一百六十二切片（Chat 动作国际化解耦，2026-09-12）

- Chat Workspace 的消息操作从“比较中文显示文字”改为稳定的 `ChatActionId`（如 `copy`、`apply-selection`、`open-workflow`）；显示标签仍由当前 UI locale 负责，因此切换英文后复制、引用、Diff、Canon、插图和 Workflow 操作继续命中相同逻辑。
- `chatDraftTarget` 同时接受稳定 ID，选区缺失时仍明确返回 `missing-selection`，不改变正文安全门。
- 新增稳定动作 ID 和 Chat Workspace 国际化契约回归测试；全量单 worker 测试 123 个文件、456 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron 双语交互、Provider 与跨平台发布验收仍未完成。

### 第一百六十三切片（Chat Workspace 文案边界，2026-09-12）

- Chat Workspace 的默认会话标题、新会话标题、追问/续写快捷提示和 Agent Note 标题全部改为通过双语 i18n key 生成，避免英文界面残留中文硬编码。
- 新增 ChatWorkspace 文案边界回归断言，确认关键文案中英文均存在且不相同，并确认源码不再直接嵌入这些本地化字符串。
- 全量单 worker 测试 123 个文件、457 项通过；`npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron 双语交互、Provider 与跨平台发布验收仍未完成。

### 第一百六十四切片（右侧 Agent 文案边界，2026-09-12）

- 右侧 Agent/Workflow 面板的会话默认标题、选区自定义/解释提示、快捷操作发送给模型的指令和章节总结指令全部改为双语 i18n key；英文界面不再把这些内部中文提示发送给 Provider。
- 右侧 Chat 消息作者和消息类型标签复用稳定的 `ChatMessageKind` 到 i18n 映射，不再直接渲染内部 kind 值。
- 新增 RightPanel 回归测试覆盖会话标题、快捷提示、总结提示和消息类型边界；全量单 worker 测试 123 个文件、458 项通过；`npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron 双语交互、Provider 与跨平台发布验收仍未完成。

### 第一百六十五切片（Bottom Panel Revision Diff 文案边界，2026-09-12）

- Bottom Panel 的 Revision/Diff 标题、历史列表无障碍标签、段落状态、原文/修改后列标题、增删状态和不可回退提示全部改为双语 i18n key，避免 Diff 区域中英文混排和硬编码文案。
- 新增 Bottom Panel 国际化契约，覆盖 Revision Diff 的动态段落状态文案及历史回退入口；既有逐段 Diff 算法、字符级增删标记和回退逻辑保持不变。
- 聚焦测试 1 个文件、1 项通过；全量单 worker 测试 123 个文件、459 项通过；`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过。真实 Electron 双语视觉验收、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百六十六切片（Developer Inspector 预览文案边界，2026-09-12）

- Developer Inspector 的字符串、数组、Context、对象和空值预览现在通过 locale 文案格式化，英文界面不再混入“字符/数组/对象”等中文提示。
- 新增 Developer Panel i18n 回归覆盖预览格式文案；Workflow 诊断数据、metadata-only 约束和 Inspector 只读行为保持不变。
- 聚焦测试 1 个文件、2 项通过；全量单 worker 测试 123 个文件、459 项通过；`npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron 双语视觉验收、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百六十七切片（Graph Studio 元数据校验国际化，2026-09-12）

- Graph Studio 的关系元数据非对象错误从组件内硬编码中文改为 `graphMetadataObjectExpected` locale key；英文界面不再在错误反馈中混入中文。
- 新增 Graph Studio i18n 契约覆盖该 key，并先验证旧硬编码断言失败，再完成迁移；聚焦测试 1 个文件、2 项通过，`npm run typecheck` 通过。
- 构建、全量单 worker 测试、UI contract 与 `git diff --check` 仍待本切片结束时复核；真实 Electron 双语视觉验收、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百六十八切片（Story Bible 字段目录国际化边界，2026-09-14）

- Story Bible 的实体与 Artifact 字段目录不再保存中文显示名作为组件中间值，改为稳定的 `UiTextKey`；项目数据字段名和表单读写逻辑保持不变。
- 追加回归断言，禁止字段目录重新引入中文显示名；聚焦 Story Bible i18n 测试 4 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 123 个文件、460 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实 Electron 双语视觉验收、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百六十九切片（Foreshadowing 生命周期状态国际化，2026-09-14）

- Bottom Panel 的 Foreshadowing 状态、回收期限和旧版证据展示改为 locale key；`planned/planted/echoed/resolved/abandoned` 等稳定数据值继续用于筛选和存储，不发送翻译后的显示文案到数据层。
- 新增 Bottom Panel i18n 契约覆盖五种状态和动态标签，并先验证旧中文显示片段失败，再完成迁移；聚焦测试 1 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 123 个文件、460 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实 Electron 双语视觉验收、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百七十切片（Selection Action 稳定 ID 与双语 Prompt，2026-09-14）

- SelectionToolbar 现在按当前 UI locale 生成润写、改写、扩写、缩写、续写、解释和翻译 prompt，同时通过稳定 `actionId` 传递动作语义；Editor/RightPanel 不再比较中文显示 label 来决定选中、取消选中或触发 Agent。
- 保留已有 selection action label、互斥显示和正文选区安全门；兼容旧事件时仍可使用 `action` 字段，但新事件同时提供 `actionId`。
- 新增回归契约覆盖双语 prompt 路由和稳定 actionId；聚焦 Selection/RightPanel 测试 3 个文件、7 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 123 个文件、460 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实 Electron 双语选区交互、Provider、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百七十一切片（Command Palette 索引修复摘要国际化，2026-09-14）

- Command Palette 的索引修复成功摘要改为 locale 模板，章节、实体、事件、故事条目、资产、Embedding 清理和恢复源文件数量均通过插值生成；英文界面不再混入中文数量单位。
- 新增 Command Palette i18n 契约覆盖动态摘要字段，并先验证旧中文拼接断言失败，再完成迁移；聚焦测试 1 个文件、2 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 123 个文件、460 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实 Electron 双语命令操作、Provider、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百七十二切片（RightPanel 局部 Diff Prompt 国际化，2026-09-14）

- RightPanel 创建局部 Diff 时的“仅保留第 N 个修改区域”说明改为 `suggestionRegionPrompt` 双语模板；原始 suggestion prompt 和区域编号继续作为插值，不改变 Diff 生成逻辑。
- 新增 RightPanel i18n 契约禁止中文区域提示硬编码，并先验证旧拼接断言失败，再完成迁移；聚焦测试 1 个文件、3 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 123 个文件、460 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实 Electron 双语选区/Diff 交互、Provider、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百七十三切片（项目生命周期 Store 通知国际化，2026-09-14）

- app-store 的启动、最近项目、创建/打开项目及示例载入反馈统一通过当前 UI locale 生成；保留错误码和 Provider/文件系统返回的详情，不改变 Store 状态流转。
- 新增 Store 生命周期 i18n 契约，禁止这些反馈在 Store 内直接硬编码；聚焦测试 2 个文件、27 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 124 个文件、462 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实 Electron 双语生命周期操作、Provider、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百七十四切片（章节与卷基础反馈国际化，2026-09-14）

- app-store 的章节列表、卷列表、章节打开和章节新建失败反馈改为通过当前 UI locale 生成；IPC 错误码和详情保持原样，读取卷失败路径不再固定中文。
- 扩展 Store 生命周期 i18n 契约覆盖章节/卷核心反馈，并先验证旧硬编码断言失败，再完成迁移；聚焦测试 2 个文件、27 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 124 个文件、462 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实 Electron 双语编辑路径、Provider、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百七十五切片（章节编辑反馈国际化，2026-09-14）

- app-store 的章节重命名、移动、删除成功/失败反馈改为通过当前 UI locale 生成；章节路径、Revision、Canon、Workflow 保留逻辑不变。
- 扩展 Store 生命周期 i18n 契约并先验证旧硬编码断言失败，再完成迁移；聚焦测试 2 个文件、27 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 124 个文件、462 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实 Electron 双语编辑路径、Provider、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百七十六切片（场景与卷操作反馈国际化，2026-09-14）

- app-store 的最近项目移除、项目关闭、建议应用、自动保存、场景 CRUD/排序以及卷 CRUD/归属/排序反馈统一通过当前 UI locale 生成；IPC 错误详情和原有状态更新逻辑保持不变。
- 扩展 Store i18n 契约并先验证旧硬编码断言失败，再完成迁移；聚焦测试 2 个文件、27 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 124 个文件、462 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实 Electron 双语编辑路径、Provider、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百七十七切片（Workflow/诊断运行元数据国际化，2026-09-14）

- RightPanel 两处 Workflow 运行卡片的 Run、输入章节、场景、整章和写回目标标签改为 locale key；Developer Panel 的 Profile、Model、Request、token、费用、Context 和错误分类标签也统一由 locale 生成。
- 新增 RightPanel/Developer Panel i18n 契约，先验证固定运行元数据硬编码断言失败，再完成迁移；聚焦测试 2 个文件、5 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 124 个文件、462 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实 Electron 双语诊断路径、Provider、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百七十八切片（Main 日志安全入口收敛，2026-09-14）

- 新增 `redactLogMessage()` 作为 Main 动态日志统一入口：先规范化空白并限制长度，再复用 secret、Authorization、query token 和图片 data URL 脱敏；所有当前 Main 动态错误日志均使用该入口，Renderer console 不会复制到 Main 日志。
- 新增日志边界回归测试，覆盖 Bearer 脱敏、多行归一化和长度上限；聚焦测试 2 个文件、11 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 124 个文件、463 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；真实发布日志审查、Provider、低端设备滚动基线与蓝图其他发布能力仍未完成。

### 第一百七十九切片（扩展包上一版本回滚闭环，2026-09-14）

- `ExtensionPackageStore` 在已验证包替换成功后保留上一版本隔离副本，新增原子 `rollback()`，同时恢复磁盘 manifest、Main 注册表和上一版本的权限授权；失败时恢复当前版本。
- 新增 `extension:rollback` typed IPC 和 Developer Panel Rollback 入口，回滚继续经过签名校验、依赖校验和用户确认；未配置可信发布者时安装仍安全禁用。
- 新增回滚及 IPC/UI 回归测试；聚焦测试 3 个文件、20 项通过，`npm run typecheck` 通过。
- 全量单 worker 测试 124 个文件、464 项通过，`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）、`npm run typecheck` 和 `git diff --check` 均通过；外部代码隔离执行、正式发布者公钥、真实平台安装与签名公证仍未完成。

### 第一百八十切片（扩展包卸载清理回滚残留，2026-09-14）

- 修复 `ExtensionPackageStore.uninstall()`：成功卸载后清理替换流程留下的隐藏上一版本目录和回滚权限快照，避免旧版本残留被后续安装误用。
- 回滚元数据清理属于卸载提交后的尽力清理；清理失败不会重新进入已删除安装目录的恢复分支，也不会把已完成的卸载报告成失败。新增正常清理与清理失败回归测试。
- 全量单 worker 测试 124 个文件、466 项通过，`npm run build`、`npm run typecheck` 和 `git diff --check` 均通过；外部代码隔离执行、正式发布者公钥、真实平台安装与签名公证仍未完成。

### 第一百八十一切片（备份恢复 staging 原子提交，2026-09-14）

- `BackupService` 的全量和增量恢复改为先在目标同父目录创建 staging，完成解压、路径校验、manifest 移除和项目 schema 校验后再交换目录；校验失败只清理 staging，不会留下半恢复项目。
- 目录交换失败时恢复原目标目录；旧目标清理失败按提交后的尽力清理处理，避免已完成恢复被错误报告为失败。新增恢复校验失败目标目录保持为空的回归测试。
- 全量单 worker 测试 124 个文件、467 项通过，`npm run build`、`npm run typecheck` 和 `git diff --check` 均通过；跨版本备份恢复现场、真实用户项目和发布级验收仍未完成。

### 第一百八十二切片（备份 manifest 内容完整性校验，2026-09-14）

- 新式全量/增量备份恢复会在项目 schema 校验通过后，按 `backup-manifest.json` 中的 SHA-256 清单逐文件校验内容；缺失或被篡改的章节等文件会拒绝恢复，且 staging 失败不会污染目标目录。
- 保留旧式无 `backup-manifest.json` 备份的兼容恢复路径，既有 `migration-v1` fixture 仍可正常升级；新增篡改内容回归测试。
- 全量单 worker 测试 124 个文件、468 项通过，`npm run build`、`npm run typecheck` 和 `git diff --check` 均通过；跨版本备份恢复现场、真实用户项目和发布级验收仍未完成。

### 第一百八十三切片（右侧 Agent/Workflow 溢出基线，2026-09-14）

- RightPanel 的 `.right-scroll` 明确设置 `min-width: 0`、`overflow-x: hidden` 和 `overflow-y: auto`；长 Agent/Workflow 步骤名称继续在卡片内换行，并在内容超出高度时保持纵向滚动。
- 收紧 RightPanel 布局契约测试，避免被其他选择器的同名 CSS 属性误满足；聚焦测试 1 个文件、9 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过。
- 当前证据是静态布局契约，低端设备真实滚动帧率和 Electron 视觉现场仍待验收。

### 第一百八十四切片（长篇规模 runtime 基线复测，2026-09-14）

- `node scripts/verify-runtime.mjs --long` 通过：临时 fixture 包含 1000 章、1000 实体和 100000 facts，修复后索引与完整性检查均干净；本次 repair/list/integrity 分别为 544/14/584ms。
- `npm run benchmark:runtime -- --iterations=3` 通过：本机 macOS arm64、8 CPU、16 GiB，repair 平均 424ms（p95 548ms）、chapterList 平均 10ms（p95 11ms）、integrity 平均 347ms（p95 467ms），预算门禁通过。
- 该证据仅用于本机可重复 fixture 对照，不替代低端设备、真实 UI 滚动帧率或跨机器性能分布验收。

### 第一百八十五切片（更新检查取消过期下载，2026-09-14）

- 修复 `UpdateService.check()` 与下载并发时的状态竞争：开始新的清单检查会先中止进行中的旧工件下载，旧下载只能进入 `cancelled`，不会在新检查结果之后发出过期 `ready`。
- 新增回归测试覆盖“下载中重新检查得到 up_to_date”场景；全量单 worker 测试 124 个文件、470 项通过，`npm run build`、`npm run typecheck` 和 `git diff --check` 均通过。
- 真实更新 channel、平台安装切换、自动回滚、签名公证和安装后启动仍需发布环境验收。

### 第一百八十六切片（备份 manifest 文件集合校验，2026-09-14）

- manifest-backed 全量/增量恢复现在对 staging 中的实际文件集合做双向比对；归档内多出的旧文件或未声明文件会拒绝恢复，声明文件缺失也会拒绝恢复，随后才执行 SHA-256 内容校验。
- 新增未声明文件回归测试；旧式无 manifest 备份兼容路径及 `migration-v1` 恢复仍通过。
- 全量单 worker 测试 124 个文件、471 项通过，`npm run build`、`npm run typecheck` 和 `git diff --check` 均通过；真实跨版本备份现场与发布级验收仍未完成。

### 第一百八十七切片（备份 manifest 错误边界，2026-09-14）

- 修复损坏 `backup-manifest.json` 的解析边界：无效 JSON 现在统一返回 `INVALID_PROJECT` 和稳定的“备份 manifest JSON 无效”提示，不再把原始 `SyntaxError` 泄漏到上层。
- 新增损坏 manifest 回归测试；旧式无 manifest 迁移备份保持兼容。
- 全量单 worker 测试 124 个文件、472 项通过，`npm run build`、`npm run typecheck` 和 `git diff --check` 均通过。

### 第一百八十八切片（发布预检回归，2026-09-14）

- 重新执行 `npm run verify:release` 与 `node scripts/verify-ui-contract.mjs`：打包配置、现有 Windows NSIS/macOS DMG 产物、生产 CSP/导航防护、更新清单签名与 89 项 UI contract 全部通过。
- 预检仍明确为代码级/本地产物检查，不等同于真实平台签名、公证、安装启动、自动更新切换或 Electron 现场验收；发布清单中的相关项目保持未勾选。

### 第一百八十九切片（备份归档符号链接拒绝，2026-09-14）

- `BackupService` 在调用 `unzip` 前读取归档 Unix 文件类型，发现符号链接条目立即以 `PATH_DENIED` 拒绝，避免恢复阶段跟随外部路径；既有绝对路径/`..` 路径检查继续保留。
- 新增符号链接归档回归测试，验证拒绝发生在 staging 解压前且目标目录保持为空。
- 全量单 worker 测试 124 个文件、473 项通过，`npm run build`、`npm run typecheck` 和 `git diff --check` 均通过；真实跨平台归档工具链仍需发布环境复核。

### 第一百九十切片（更新过期事件抑制，2026-09-14）

- 收紧 `UpdateService` 的下载代次边界：被新检查或新下载淘汰的旧任务仍向调用方返回 `cancelled`，但不会再向 Renderer 事件流发送旧的 `idle/progress/ready`，避免覆盖新清单状态。
- 新增并发事件顺序断言；全量单 worker 测试 124 个文件、473 项通过，`npm run build`、`npm run typecheck` 和 `git diff --check` 均通过。
- 真实更新服务器、平台安装切换、自动回滚、签名公证和安装后启动仍需发布环境验收。

### 第一百九十一切片（依赖安全审计复核，2026-09-14）

- 使用仓库实际锁文件执行 `pnpm audit --audit-level high`，结果仍报告 Electron 间接依赖 `extract-zip@2.0.1` 的 2 个 high symlink advisory；上游当前没有可用修复版本。
- 仓库 pnpm patch 已针对该依赖拒绝 symlink 条目，`tests/dependency-security.test.ts`、release preflight 和现有构建链均覆盖补丁存在性；不把上游 advisory 隐瞒为零漏洞，继续保留发布签核项。

### 第一百九十二切片（Workflow 运行卡片长文本布局，2026-09-14）

- RightPanel Workflow 运行卡片及其节点子项补充 `min-width: 0`、`overflow-wrap: anywhere` 和 `word-break: break-word`；长节点 ID、错误详情和日志在卡片内换行，不再撑出右侧面板。
- 新增精确布局契约测试，聚焦测试 1 个文件、10 项通过；`npm run typecheck`、`npm run build` 和 `git diff --check` 均通过。
- 真实 Electron 多分辨率及低端设备滚动现场仍待验收。

### 第一百九十三切片（项目完整性检查超时边界，2026-09-14）

- 定位到 `ProjectHealthPanel` 直接等待完整性/索引修复 IPC、没有超时保护的问题；Main 或文件系统异常时 Renderer 会永久停在 loading。
- 新增 `withTimeout()`，完整性检查与索引修复均设置 15 秒上限，并以操作代次忽略超时后迟到的旧 IPC 结果；超时会进入可重试的错误状态，不再卡死。
- 新增超时行为与 UI 契约测试；全量单 worker 测试 124 个文件、476 项通过，`npm run typecheck`、`npm run build`、`git diff --check` 均通过。真实 Electron 中的故障注入仍待验收。

### 第一百九十四切片（Explorer 长列表整体滚动，2026-09-14）

- 定位到章节虚拟列表只限制了单卷 viewport，而 Sidebar 本身仍为 `overflow:hidden`；多卷/长章节会把后续卷和 Story Bible 入口裁掉。
- Sidebar 改为纵向滚动、横向隐藏，保留章节列表虚拟化和长文本换行；新增回归契约验证 Explorer 超出视口时仍可访问全部内容。
- 聚焦测试 2 项通过；全量单 worker 测试 124 个文件、477 项通过，`npm run build` 与 `git diff --check` 通过。低端设备真实滚动帧率仍待验收。

### 第一百九十五切片（Provider Mock 显式边界，2026-09-14）

- 定位到 `AiService` 对 `profile_mock` 的隐式兜底：项目 Provider 配置失效时可能静默返回确定性内容，掩盖真实 Provider 未配置问题。
- Mock Provider 现在只有在构造 `AiService` 时显式传入 `allowDeterministicMock: true` 才可用；生产 Main 初始化保持默认关闭，正常用户路径会收到“Provider profile 不存在”。完整性弹框的待返回操作也会在卸载时失效，避免迟到响应更新已关闭的 UI。
- 新增边界回归测试；全量单 worker 测试 124 个文件、478 项通过，`npm run typecheck`、`npm run build`、`git diff --check` 均通过。真实 Provider 连接仍需发布级验收。

### 第一百九十六切片（全局 IDE 通知桥，2026-09-14）

- 新增 `notifyGlobal()` 事件桥；App 统一接收并校验通知类型、消息与持续时间，在右下角 `NotificationCenter` 展示可换行、可关闭的通知。
- RightPanel 的 Agent/Workflow/上下文操作反馈保留原面板状态，同时同步进入全局通知；通知同步不会再误删 `global-*` 项。
- 保留右侧折叠入口的原 `Bot` 图标、折叠 rail、hover 与键盘可访问状态；聚焦测试、typecheck、build 与 UI contract 均通过，真实 Electron 视觉验收仍待继续。

### 第一百九十七切片（全 Renderer 反馈统一通知，2026-09-14）

- 将 CanonReview、DeveloperPanel、IllustrationStudio、ProjectHealthPanel、ProviderSettings 与 RightPanel 的局部反馈统一切换到 `useGlobalMessage()`；原有面板内 `role=status` 上下文继续保留。
- 通知桥仍校验消息、类型和持续时间，action/system 生命周期同步只清理自身通知，不影响其他全局通知。
- 新增全局反馈 surface 契约；全量单 worker 测试 125 个文件、481 项通过，`npm run typecheck`、`npm run build`、UI contract 与 `git diff --check` 均通过。真实 Electron 视觉和跨窗口通知验收仍待继续。

### 第一百九十八切片（Workflow 输入上下文 envelope，2026-09-14）

- Runtime 为每个节点建立 typed `NodeInputEnvelope`：`value` 保留当前节点输入，`outputs` 保留此前节点输出，`context` 统一承载已解析的 Context manifest。
- AI 节点直接序列化同一 envelope 交给 Agent/Provider，避免 Plan/Write/Critic/Rewrite 各自拼接上下文；旧 `input` 仍保留，Human pause/resume、retry、cancel 状态语义不变。
- 新增 envelope 回归测试；Workflow Runtime/Service 聚焦测试 24 项通过，`npm run typecheck` 与 `git diff --check` 通过；全量测试和真实 Provider/Electron 验收仍需继续。

### 第一百九十九切片（右下角全局通知定位，2026-09-14）

- 定位到全局通知仍使用 `top: 56px`，与用户要求的 VS Code 右下角提示不一致；改为 `position: fixed; bottom: 20px; right: 20px`，并限制通知堆叠高度，超出时由通知容器纵向滚动。
- 多行消息继续使用最小宽度、自然换行和强制断词；指示竖线保持 `align-self: center`，不会再顶部对齐。
- 新增右下角定位契约；通知相关 6 项测试通过，`npm run typecheck`、`npm run build`、`git diff --check` 均通过，真实 Electron 多分辨率视觉验收仍待继续。

### 第二百切片（Graph 选中实体检查与邻接探索，2026-09-14）

- 定位到 Graph Studio 点击实体后只用于邻域聚焦，Properties 区仍停留在关系编辑表单，无法查看实体备注、别名或从当前实体继续探索邻接关系。
- 新增纯函数 `getAdjacentRelations()`：按入向/出向投影邻居，跳过悬空端点，不修改实体或关系源数组；Graph Properties 增加实体检查区，邻接项可继续选择邻居并聚焦图谱。
- 新增 3 项纯逻辑测试与 3 项 UI 契约测试；聚焦 Graph 测试 10 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs` 和 `git diff --check` 通过。真实 Electron 视觉、完整无障碍和低端设备性能验收仍待继续。

### 第二百零一切片（Graph 节点键盘激活，2026-09-14）

- 复核发现 Graph 节点虽然声明了 `role=button`、Tab 和 Enter/Space，但键盘触发的 `.click()` 没有绑定明确的实体选择回调，无法证明会打开实体检查器。
- 节点现在携带稳定 `entityId` 和显式 `onActivate` 回调；鼠标点击与 Enter/Space 共用同一真实实体查找/选择路径，避免构造丢失类型、别名和备注的伪实体。
- 更新 Graph accessibility 契约；相关 Graph 测试 7 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 通过。真实 Electron 键盘现场与完整无障碍树验收仍待继续。

### 第二百零二切片（Timeline 轨道可视化，2026-09-14）

- 新增 `buildTimelineTrack()` 纯函数：对有效故事时间排序并计算稳定的 0–1 横向位置，无效或未填写时间的事件保留在独立的“未指定”区域，不改变 `timeline.yaml` 或既有事件 schema。
- Story Bible Timeline 增加紧凑的 IDE 风格轨道概览；时间点、标题和未定时事件均可点击选择，节点具有稳定 selector、标题和键盘 focus 状态，原有筛选、分组、编辑和章节跳转保持不变。
- 新增时间线模型及 UI 契约测试；聚焦测试 2 个文件、3 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过。真实 Electron 多分辨率视觉、日期本地化和低端设备滚动性能仍待验收。

### 第二百零三切片（稳定 Electron 运行时诊断边界，2026-09-14）

- 定位稳定黄金路径启动失败的真实原因：构建生成的 `out/main/index.js` 与 `out/preload/index.cjs` 均存在，但 Electron npm 包的 macOS 原生 `dist/Electron.app` 未安装；网络权限下执行 `pnpm rebuild electron` 又因下载源连接超时，无法进行现场启动。
- `scripts/dev-stable.mjs` 新增跨平台 `getStableElectronPaths()`，并将“out 产物缺失”和“Electron 原生运行时缺失”拆成稳定、可行动的错误提示；新增路径诊断契约测试，不改变启动生命周期或 Renderer 边界。
- 聚焦测试 2 个文件、2 项通过，`npm run typecheck`、`npm run build`、`node scripts/verify-ui-contract.mjs`（89 项）和 `git diff --check` 均通过；真实 Electron 黄金路径仍被外部 Electron binary 下载超时阻塞，不能以静态证据替代。

### 第二百零四切片（Timeline 日期国际化，2026-09-14）

- Timeline 轨道轴线日期改由 `formatTimelineDate()` 使用当前 UI locale 格式化，并固定 UTC 解释时间戳，避免系统区域设置导致中英文界面显示不一致或跨时区日期漂移。
- 新增中英文日期格式回归测试；Timeline 轨道的事件选择、未指定事件和既有编辑数据流保持不变。
- 聚焦测试 2 个文件、4 项通过，`npm run typecheck` 通过；构建、UI contract、真实 Electron 多语言视觉与低端设备现场仍待最终回归/验收。

### 第二百零五切片（完整性超时工具分支覆盖，2026-09-14）

- 为 `withTimeout()` 补齐完整性检查实际使用的成功、底层 IPC 失败、超时后迟到 resolve 和迟到 reject 四类边界，验证迟到 Promise 不会覆盖已确定的超时结果。
- `tests/project-health-accessibility.test.ts` 现 9 项通过，`npm run typecheck` 和 `git diff --check` 通过；本轮覆盖率基线为 Statements 80.21%、Lines 87.66%、Functions 83.61%、Branches 64.3%，分支覆盖率整体 80% 目标仍未达到。

### 第二百零六切片（Illustration Prompt 锚点清理，2026-09-14）

- 为 `compileImagePrompt()` 增加可选方向、视觉锚点、实体视觉身份/外观和结构化视觉身份的回归覆盖；修复空白 `visualAnchors` 被拼成 `Visual anchor: ` 的 Provider 请求污染，现会先 trim/filter，再加入 prompt。
- 聚焦 Image Prompt/ImageService 测试 2 个文件、12 项通过，`npm run typecheck` 通过；真实图片 Provider 请求和多变体现场仍需发布环境验收。

### 第二百零七切片（Canon Knowledge Leak 规则，2026-09-14）

- `CanonService.check()` 新增确定性 `knowledge-leak` warning：仅对 `knowledge.*` 谓词并且 `validFrom` 与 source document 都可解析章节号时生效；未来章节事实若由更早章节作为证据，返回事实 ID 和可读边界说明。
- 该规则是 warning，不绕过 Human Proposal gate，也不阻断 Apply；普通属性、作者笔记或无法解析章节号不会被误报。Canon/Canon Review/Workflow 相关测试 4 个文件、33 项通过，`npm run typecheck`、`npm run build` 和 `git diff --check` 通过。

### 第二百零八切片（Provider URL 与 Context Budget 合约覆盖，2026-09-14）

- 新增共享 AI 合约回归：Provider 只接受 HTTPS 或本机开发 HTTP，并拒绝远程 HTTP、URL 凭据、query 和 hash；Context budget 覆盖无窗口、保留输出超过窗口和输出预算收敛边界。
- 新增 `tests/shared-ai-contract.test.ts`，3 项通过；本切片未改变 Provider 请求或 Context 计算实现，`npm run typecheck` 与 `git diff --check` 待本切片结束时复核。

### 第二百零九切片（Canon 故事时间数值比较，2026-09-14）

- 修复 Canon 时间范围使用字符串比较导致 `chapter:10` 被排在 `chapter:2` 之前的问题；可解析的章节标识现在按数字序比较，`chapter:9`、`chapters/009-xxx.md` 和 `ch01` 均可识别，无法解析的值仍保持稳定字符串比较。
- 无效的数值范围继续报告 temporal error；数值上不相交的历史范围不再误报 temporal conflict。新增 Canon 回归覆盖范围校验和不相交判断。
- Canon/Review/Project 聚焦测试 28 项通过，`npm run build` 与 `git diff --check` 通过；真实用户项目中的复杂旧时间格式仍需继续验收。

### 第二百一十切片（Canon Relation Proposal 闭环，2026-09-14）

- 将 `relation.update` 从 shared type 占位扩展为完整 Human-gated 流程：提案保存变更前后关系快照，Apply 才调用 StoryService 写入 SQLite/YAML，Revert 恢复 Apply 前关系。
- 新增 `canon:propose-relation` typed IPC/preload 入口；CanonReview 对关系提案使用独立摘要展示，不再按事实的 `subjectId/source` 字段读取，避免打开审核面板时崩溃。
- 新增关系提案 Apply/Revert 回归；Canon/Review/Memory/IPC 聚焦测试 18 项通过，`npm run typecheck`、`npm run build` 与 `git diff --check` 通过。真实 Electron 关系提案视觉路径仍待验收。

### 第二百一十一切片（Graph 关系提案入口，2026-09-14）

- Graph Studio 选中已有关系并编辑后新增“提交 Canon 提案”入口；该操作只提交待审核关系，不直接改写当前关系，失败和非法 metadata 均在面板内反馈。
- CanonReview 已能展示该关系提案并继续执行 Apply/Revert；补充 Graph UI/i18n 契约，聚焦 Graph/Canon 测试 15 项、`npm run typecheck`、`npm run build`、UI contract 与 `git diff --check` 均通过。真实 Electron 点击和多分辨率视觉仍待验收。

### 第二百一十二切片（Canon Fact Update 闭环，2026-09-14）

- 将 `fact.update` 从 shared type 占位扩展为完整 Human-gated 流程：提案保存更新前后的事实快照，Apply 才更新 Canon fact，Revert 恢复原事实及来源；更新自身不会被重复判定为冲突。
- 新增 `canon:propose-fact-update` typed IPC/preload；Chat 结构化 Canon JSON 携带合法 `fact_* id` 时进入更新提案，不带 ID 时保持原有 `fact.add` 语义，来源文档仍绑定当前章节。
- CanonReview 增加事实更新摘要展示；Chat/Canon/Memory 聚焦测试 22 项通过，`npm run typecheck`、`npm run build`、UI contract 与 `git diff --check` 通过。真实 Electron Chat→Review→Apply/Revert 仍待验收。

### 第二百一十三切片（Canon Timeline Add 闭环，2026-09-14）

- 将 `timeline.add` 从蓝图类型示例扩展为 Human-gated Proposal：提交时不写入时间线，Apply 通过 StoryService 写入 `story/timeline.yaml`，Revert 删除本次事件。
- 新增 `canon:propose-timeline` typed IPC/preload 入口；CanonReview 对时间线提案使用独立摘要展示，避免按事实字段读取。
- 新增时间线提案 Apply/Revert 回归；Canon/Review/Memory/IPC 聚焦测试 20 项通过，`npm run typecheck`、`npm run build` 与 `git diff --check` 通过。真实 Electron 时间线审核视觉路径仍待验收。

### 第二百一十四切片（Canon Foreshadowing Add 闭环，2026-09-14）

- 将 `foreshadowing.add` 扩展为 Human-gated Proposal：提交阶段不写入 Story Bible，Apply 复用 `storyArtifactInputSchema` 创建伏笔条目并同步 Artifact/Lore 源，Revert 删除该条目。
- 新增 `canon:propose-foreshadowing` typed IPC/preload 入口；CanonReview 使用独立伏笔摘要，避免按事实字段读取。
- 新增伏笔提案 Apply/Revert 回归；Canon/Review/Memory/IPC 聚焦测试 21 项通过，`npm run typecheck`、`npm run build` 与 `git diff --check` 通过。真实 Electron 伏笔审核视觉路径仍待验收。

### 第二百一十五切片（Canon Knowledge Update 类型闭环，2026-09-14）

- `knowledge.*` 事实更新现在显式标记为 `knowledge.update`，普通事实仍标记为 `fact.update`；两者共享 Human Apply/Revert、来源追踪和确定性冲突检查。
- CanonReview 对两类事实更新使用同一安全摘要，保留 Knowledge Leak warning 逻辑，不允许通过类型名称绕过人工审核。
- 新增领域类型回归；Chat/Canon 聚焦测试 24 项通过，`npm run typecheck`、`npm run build` 与 `git diff --check` 通过。真实 Electron Chat→Canon Review 现场仍待验收。

### 第二百一十六切片（Context Recency 层，2026-09-14）

- Context recipe 新增兼容的 `recencyLimit`（默认 3）；当前章节之前的最近章节会提取前两段摘要，作为独立 `recency` ContextItem 按优先级参与 token budget。
- manifest 的 candidateCounts 记录 Recency 候选数；历史章节读取失败只跳过该项，不影响当前章节 Context，Replay 会通过现有 manifest 差异机制识别增删变化。
- 新增 Recency budget/manifest 回归；Context/Replay/Chat 聚焦测试 15 项通过，`npm run typecheck`、`npm run build`、UI contract 与 `git diff --check` 通过。真实长篇低端设备检索性能仍待验收。

### 第二百一十七切片（右侧 Agent 折叠入口回归，2026-09-14）

- 移除右侧页签内重复的 Bot 折叠按钮和窄栏入口，恢复顶栏原有 Bot 图标作为唯一收起/展开控制；收起时右侧栏从工作区网格完全移除，避免重复入口与视觉状态不一致。
- 更新 RightPanel 布局契约，RightPanel/顶栏聚焦测试 15 项、`npm run typecheck`、`npm run build` 与 `git diff --check` 通过。真实 Electron 视觉验收仍待继续。

### 第二百一十八切片（Context Inspector Recency 展示，2026-09-14）

- Context Inspector 的候选计数从 P/S/M 扩展为 P/S/R/M，R 表示最近章节候选；旧版 manifest 缺少 `recency` 字段时由 Renderer 按 0 展示，保持历史 Replay 数据兼容。
- 新增 RightPanel i18n/兼容回归；Context/RightPanel 聚焦测试 20 项、`npm run typecheck`、`npm run build`、UI contract、`git diff --check` 与单 worker 全量 131 文件/518 项通过。真实长篇性能与 Electron 视觉验收仍待继续。

### 第二百一十九切片（Workflow Memory 提案幂等增量，2026-09-14）

- 定位 `memory.extract` 重试会重复调用模型并创建 `fact.add` Proposal 的问题；同一 `workflowRunId` 与章节存在已有提案时现在直接复用，避免重复 Canon 待审核项。
- 新增 Memory 幂等回归；Memory/Workflow/Canon 聚焦 28 项、`npm run typecheck` 与 `git diff --check` 通过。通用 side-effect ledger、空结果标记及其他副作用仍待继续。

### 第二百二十切片（Workflow 章节写回幂等增量，2026-09-14）

- 章节写回重试现在按 `workflow:<runId>`、目标章节和最终正文匹配已有 Revision，命中后复用 Revision ID，避免重复审计记录；未命中仍保留人工审核门禁和章节保存流程。
- 新增写回幂等回归；Workflow/Memory/Writeback 聚焦 21 项、`npm run typecheck` 与 `git diff --check` 通过。通用 side-effect ledger 和崩溃窗口原子提交仍待继续。

### 第二百二十一切片（图片生成并发幂等，2026-09-14）

- ImageService 在已落库资产检查之外增加请求级 in-flight Promise 去重；同一 `idempotencyKey` 的并发请求共享一次 Provider 执行，失败后释放 key 允许后续重试。
- 新增图片并发幂等回归；Image/Workflow 聚焦 23 项、`npm run typecheck` 与 `git diff --check` 通过。跨进程通用 side-effect ledger 仍待继续。

### 第二百二十二切片（Workflow RunStore 原子保存，2026-09-14）

- 定位 Workflow、Node、Job 三组状态写入缺少事务、Job 失败会留下半更新记录的问题；`WorkflowRunStore.save()` 现在先完成序列化，再以 `BEGIN IMMEDIATE/COMMIT` 原子提交，异常回滚并保留原始错误。
- 新增事务回滚回归；Workflow Store/Runtime 聚焦 29 项、`npm run typecheck` 与 `git diff --check` 通过。跨进程 side-effect ledger 仍待继续。

### 第二百二十三切片（Workflow 运行级 side-effect 状态复用，2026-09-14）

- `WorkflowRun` 新增可选的 `sideEffects` 状态；节点成功后按幂等键保存成功输出，恢复或重试时先恢复节点状态与输出并跳过 executor，降低重复调用 Provider、写回和记忆提案等副作用的风险。
- 旧 Run 没有该字段时继续按原路径执行，保持 JSON 持久化兼容；新增“已持久化成功副作用复用”回归，相关聚焦测试 40 项、全量单 worker 131 文件/521 项、`npm run typecheck`、`npm run build`、UI contract 与 `git diff --check` 均通过。
- 该实现是运行级状态复用，不宣称完成跨进程通用 side-effect ledger；副作用完成到状态持久化之间仍存在崩溃窗口，空结果副作用标记与更强的原子提交语义仍待继续。

### 第二百二十四切片（Workflow 跨进程 side-effect ledger，2026-09-14）

- 新增 SQLite v20 `workflow_side_effects` 表，`WorkflowRunStore` 提供事务内原子 claim、成功 complete 和失败 release；同一幂等键的并发执行只授予一个 claim，运行中的旧 claim 通过 60 秒租约回收。
- Runtime 接入 Main-owned ledger：已成功结果直接复用，其他执行者等待成功结果后恢复节点；`undefined`、`null`、空数组等结果使用显式 `has_output` 保留区分，旧 Run 缺少 ledger 字段时仍兼容原有内嵌状态。
- 新增 ledger Store 与 Runtime 回归，并为长任务增加 20 秒续租；Workflow/Store/Database/Runtime/Service/Image/Memory 聚焦回归合计 47 项，全量单 worker 131 文件/523 项，`npm run typecheck`、`npm run build`、UI contract 与 `git diff --check` 均通过。该实现仍不宣称外部副作用与 ledger 提交跨进程原子，崩溃窗口仍需继续验证。

### 第二百二十五切片（Workflow 重启恢复与 active Run 隔离，2026-09-14）

- 定位 `WorkflowRuntimeService.retry()` 异步排队后，轮询 `listRuns()` 同步触发 `recoverInterrupted()` 的竞态；恢复器现在接收 active Run ID 集合，不会把当前进程仍持有 controller 的运行中 Run 标记为中断。
- 确认真正中断的 Run 后，`recoverInterrupted()` 同时释放该 Run 未完成的 running side-effect claim，使 Retry 能立即重新 claim，而不必等待租约过期；已完成 ledger 结果仍保留并继续复用。
- 新增 active Run 隔离与中断 claim 释放回归；Workflow/Store/Runtime Service 聚焦 20 项，全量单 worker 131 文件/524 项，`npm run typecheck`、`npm run build`、UI contract 与 `git diff --check` 均通过。真实 Electron 崩溃注入和跨进程故障现场仍待验收。

### 第二百二十六切片（Runtime 验收器迁移版本解耦，2026-09-14）

- 新增 side-effect ledger v20 后，`scripts/verify-runtime.mjs` 原有 v19 固定断言会把已成功的迁移链误报为失败；验收器现在从 Main-owned `MIGRATIONS` 读取最新版本，并动态校验 v2→当前版本的应用数量、首尾版本和最终数据库版本。
- 重新执行 `node scripts/verify-runtime.mjs`：完整运行时 fixture 报告 `ok: true`，legacy backup migration 升级到 v20，repair、Provider/Embedding、Context、Workflow、图片、备份和内置 Workflow 检查均通过；`npm run typecheck`、`npm run build`、UI contract 与 `git diff --check` 均通过。
- 该证据仍是临时 fixture 的 Main Service 验收，不替代真实用户工程、真实 Provider、Electron/Playwright、低端设备和发布平台验收。

### 第二百二十七切片（long-cn Fixture 独立验收，2026-09-14）

- `scripts/generate-fixtures.mjs --long` 已能生成长篇规模，但原 `verify-fixtures.mjs` 不读取 `--long`，无法单独证明 fixture 的规模完整性；现在显式开启 long 模式时会校验 1000 个章节、1000 个实体、100000 条 facts，并要求章节文件名保持四位编号。
- 新增 `tests/fixture-verifier.test.ts`，实际生成临时 long-cn 后调用验证器检查上述结果，测试通过；`npm run typecheck`、`npm run build`、UI contract 和 `git diff --check` 均通过。该证据证明可重复 fixture 验收，不替代低端设备真实性能、UI 滚动帧率和跨机器分布。

### 第二百二十八切片（Workflow ledger 提交窗口保护，2026-09-14）

- 定位到节点外部副作用已经成功、但 `completeSideEffect()` 失败时，Runtime 会沿普通 executor 失败路径重试并释放 claim，可能重复创建外部结果。
- 成功输出现在先写入 Run 的持久化 `sideEffects`，再提交跨进程 ledger；ledger 完成失败时当前 Run 立即失败、不重跑 executor、不释放仍可能代表已完成副作用的 claim，后续可从同一 Run 的成功输出恢复。
- 新增完成失败回归：配置 2 次重试仍只执行 1 次、claim 不释放且成功输出已持久化；聚焦 Workflow Runtime 13 项通过。该切片缩小并显式标记崩溃窗口，仍不宣称外部 Provider 与 SQLite 提交具备真正跨系统原子性。

### 第二百二十九切片（卷源文件恢复与旧格式兼容，2026-09-14）

- 定位项目完整性与索引修复的默认源文件清单遗漏 `story/volumes.yaml`，导致卷文件缺失时无法被修复流程恢复。
- 完整性检查现在报告缺失卷源，修复会恢复安全默认 `{ version: 1, volumes: [] }`；VolumeService 同时兼容旧版缺少顶层 version、卷 order/时间字段以及 `chapters` 字段的卷条目，并只对可安全推导的字段做归一化。
- 新增项目修复和 VolumeService 回归；Project/Volume 聚焦 22 项通过。真正类型错误、非法路径或损坏 YAML 仍会保留并报告，不会静默覆盖。

### 第二百三十切片（卷源损坏的完整性报告，2026-09-14）

- 补齐 `story/volumes.yaml` 的完整性校验：存在但 YAML/schema 损坏时，`checkIntegrity()` 与 `repairIndexes()` 均会报告源文件及明细，不再等到侧栏读取时才显示笼统的“格式无效”。
- 校验复用 VolumeService 的旧格式归一化逻辑，因此兼容格式不会被误报；真正损坏的卷源原文保持不变，继续遵守文件源优先和不静默覆盖原则。
- 新增损坏卷源回归；Project/Volume 聚焦测试 23 项通过。

### 第二百三十一切片（Developer Inspector 日志筛选与压缩诊断，2026-09-14）

- Developer Inspector 增加 metadata-only 节点 Trace 时间线：按开始时间排序、展示状态/尝试次数/耗时，缺少时间信息的节点稳定排在末尾。
- 节点日志增加大小写不敏感筛选和可滚动换行展示；筛选仅作用于 Renderer 内存中的已脱敏日志，不改变运行记录或项目源文件。
- 诊断服务增加 gzip JSON 导出，复用已有 Main-owned bundle 构建、路径沙箱和脱敏规则；新增 typed IPC/preload 入口，原 JSON 导出保持兼容。
- 新增 trace/filter 与 gzip 安全回归；聚焦测试 4 个文件、16 项通过，`npm run typecheck` 通过。真实 Electron 视觉、长日志性能和发布级压缩包现场验收仍待继续。

### 第二百三十二切片（核心 Fixture 用途校验，2026-09-14）

- `verify-fixtures.mjs` 不再只判断目录和文件存在：现在对 `tiny-cn` 校验 3 章/2 人物，对 `conflict-cn` 校验左手“完好/重伤”冲突文本及伏笔条目，对 `image-heavy` 校验 30 个图片文件、30 个 sidecar 和全部 sidecar 的图片路径/MIME/资产 ID。
- 新增 fixture profile 回归测试；聚焦测试 1 个文件、2 项通过。该证据证明 fixture 结构可重复验收，不替代真实用户项目、真实 Provider 或低端设备性能现场。

### 第二百三十三切片（发布产物更新元数据校验，2026-09-14）

- `verify-packaging-artifacts.mjs` 现在发现 `latest-mac.yml`、`latest.yml` 或 `latest-linux.yml` 时，会校验其引用文件的路径沙箱、存在性、文件大小和 SHA-512，避免“安装包存在但更新清单指向旧文件”。
- 检查发现现有 macOS metadata 使用了错误的连字符文件名；已将 `release/latest-mac.yml` 对齐实际 `Novel Studio-0.1.0-arm64.dmg`，当前 `npm run verify:artifacts` 和 `npm run verify:release` 均通过。
- `npm run dist:mac` 的构建阶段通过，但重新打包仍因本机缺失 `node_modules/electron/dist` 失败；签名、公证和真实安装仍未宣称完成。
### 第二百三十四切片（Illustration Studio Visual Bible 参考资产，2026-09-14）

- Illustration Studio 增加 Visual Bible 参考资产区：已有图片可多选为角色、场景或风格参考，选择状态与“待插入图片”独立，最多 20 个且去重。
- 生成请求现在携带选中的稳定 Asset ID；资产刷新或删除时自动移除失效引用，生成后的现有 ImageService provenance 会继续保存 references。
- 新增纯逻辑引用选择回归和双语 UI/组件契约；Illustration 聚焦 15 项、全量单 worker、typecheck、build、runtime smoke、UI contract 与 diff check 均通过。真实 Provider 是否支持图片输入、Electron 视觉和多分辨率现场仍待验收。
### 第二百三十五切片（Chapter autosave 草稿恢复，2026-09-14）

- 编辑内容现在以项目根目录与章节路径为作用域写入有界本地草稿记录；损坏、超大或配额失败均不会影响磁盘源文件保存。
- 重开章节时仅当本地草稿时间晚于章节索引更新时间且正文不同时恢复，状态保持 dirty 并自动进入既有 autosave；只有匹配版本成功写盘后才清理草稿。
- 新增存储边界与恢复回归；Autosave/App Store 聚焦 28 项、typecheck 通过。真实 Electron 重启、浏览器存储清理策略与低端设备现场仍待验收。
### 第二百三十六切片（Context Replay 差异摘要，2026-09-14）

- Replay 现在在逐条 source 差异列表上方展示新增、移除、变更数量及 token 净变化；缺少 token 测量时按 0 处理，不改变原有重算语义。
- 摘要由纯逻辑模型生成，UI 使用稳定 selector、双语文案和可换行布局；Context/RightPanel 聚焦 8 项、typecheck 通过。真实 Electron 多分辨率视觉验收仍待继续。
### 第二百三十七切片（Illustration Asset Review 收藏持久化，2026-09-14）

- Asset Review 的收藏现在按项目根目录持久化稳定 Asset ID，项目切换时重新加载；值经过 ID 校验、去重并限制为 200 条。
- 收藏状态与插入选择、Visual Bible 参考图选择独立；删除资产和刷新资产列表会清理失效收藏。
- 新增存储边界及 UI 契约回归；Image/Illustration 聚焦 8 项、typecheck 通过。真实 Electron 项目切换/重启现场仍待验收。
### 第二百三十八切片（Context Snapshot 版本摘要，2026-09-14）

- Context Snapshot 列表现在在回放按钮中展示格式、检索和项目 schema 版本，用户可在回放前识别潜在迁移重算；字段直接复用现有 summary contract。
- 新增双语文案与稳定 selector 回归；Context/RightPanel 聚焦 6 项、typecheck 与 diff check 通过。真实 Electron 窄栏视觉验收仍待继续。

### 第二百三十九切片（项目归档导入导出入口，2026-09-14）

- 蓝图 §18 要求项目级 Import/Export；此前已有安全 ZIP BackupService 和 Welcome 恢复入口，但工作台项目菜单只表达“备份”，用户无法从产品语义上发现项目归档导入/导出能力。
- 新增“导出项目归档/导入项目归档”双语入口，复用现有全量 ZIP manifest、路径穿越/符号链接校验、恢复 staging、项目 schema 与文件 hash 校验；未新增第二套项目格式，也不把 Provider secret 放入归档。
- 新增项目菜单/BackupActions 回归；项目归档 UI 与备份安全聚焦 14 项通过，typecheck 通过。真实用户工程、跨版本发布包兼容、签名归档和 Electron 现场仍待验收。

### 第二百四十切片（核心 Design System Token 层，2026-09-14）

- 按蓝图 §25 增加 dark-first 核心 token 层，集中定义应用/面板/表面/边框/文字/紫色强调/状态色、30px 控件高度、圆角和 140ms 快速动效。
- Renderer 入口先加载 token，再加载现有样式；Workbench 与顶栏背景/边框已消费 token，后续组件迁移可保持视觉兼容并减少散落常量。
- 新增 token 加载与 shell 应用契约测试；Design System 聚焦 1 项通过。完整组件迁移、Light theme、真实多分辨率视觉验收仍待继续。

### 第二百四十一切片（项目归档直接恢复 smoke 证据，2026-09-14）

- runtime smoke 新增全量项目归档的直接恢复路径：创建归档后恢复到隔离空目录，读取章节与 `novel.yaml`，确认项目文件有效且内部不残留 `backup-manifest.json`。
- 当前 smoke 报告 `projectArchive.exported/imported/projectManifestValid/excludesManifestFromProject` 均为 true；增量备份、Checkpoint 和既有路径安全校验仍保持通过。
- 该证据仍基于临时 fixture，不替代真实用户项目、跨发行版本兼容、签名归档和真实安装现场验收。

### 第二百四十二切片（Agent Workflow 面板 Token 接入，2026-09-14）

- Design System token 不再只停留在定义层：右侧 Agent/Workflow 面板已消费面板底色、边框、文字、强调色、控件高度和快速动效 token。
- 保持现有深色 IDE 视觉层级与交互语义，未改变 Agent/Workflow 业务逻辑；新增 token 消费契约测试。
- 聚焦测试通过；完整组件迁移、Light theme、真实多分辨率视觉验收仍待继续。

### 第二百四十三切片（发布配置前置门禁，2026-09-14）

- `verify:packaging` 现在校验 Windows/macOS 安装图标确实存在，并校验 `dist:win`、`dist:mac` 都会先执行应用构建再调用 electron-builder。
- 新增发布配置回归；避免“配置字段存在但输入资源缺失”或“直接打包旧 out 目录”的假通过。
- 该门禁仍不宣称本机已完成签名、公证、Windows 真实构建和安装回滚验收。

### 第二百四十四切片（更新工件路径边界，2026-09-14）

- `UpdateService.download(destination)` 原先会直接接受任意目标路径；虽然当前 IPC 只使用应用更新暂存目录默认路径，但服务层缺少边界保护会让未来调用或误传路径具备任意写入风险。
- 现在配置暂存目录后，目标路径会先规范化并限制在该目录内；越界目标直接返回 `destination` 失败，且不会发起网络下载。
- 新增越界目标回归测试；更新编排 12 项与 `npm run typecheck` 通过。该检查是路径安全门禁，不替代真实安装器切换、回滚和平台现场验收。

### 第二百四十五切片（安装前工件复验，2026-09-14）

- 定位到已校验更新下载完成后，暂存文件可能被删除或替换，而 `install()` 原先仍会直接调用安装器的问题。
- 安装前现在重新读取暂存文件，并按所选清单复验大小与 SHA-512；文件不存在或内容变化时拒绝调用安装器并返回 installation 失败。
- 新增暂存工件消失回归测试；更新编排 13 项、`npm run typecheck` 与 `git diff --check` 通过。真实安装切换、自动回滚和平台安装现场仍待发布环境验收。

### 第二百四十六切片（更新检查并发隔离，2026-09-14）

- 定位到更新清单读取接口不可取消时，旧的并发 `check()` 可能晚于新检查返回，并覆盖当前可用版本与下载选择的问题。
- `UpdateService` 现在为每次检查分配代次；旧代次只返回取消状态，不修改选择、不发过期事件，新检查开始时也会清空旧工件状态。
- 新增并发检查回归测试；更新编排 14 项、`npm run typecheck` 与 `git diff --check` 通过。真实更新服务器并发、安装切换和自动回滚仍待发布环境验收。

### 第二百四十七切片（长篇性能基线门禁，2026-09-14）

- 运行 `npm run benchmark:runtime -- --iterations=3 --budget-repair=1000 --budget-chapterList=1000 --budget-integrity=1000`，在本机 darwin/arm64/16 GiB 环境下连续核验 1000 章、1000 实体、100000 facts fixture。
- 三次结果的 p95 为 repair 392 ms、chapterList 11 ms、integrity 253 ms，预算门禁通过；发布清单已勾选“可重复性能基线”。
- 该证据只覆盖本机 Main Service/fixture 时延，低端设备、跨机器分布和真实 UI 滚动帧率仍未验收。

### 第二百四十八切片（更新清单读取可取消，2026-09-14）

- 更新清单读取现在接收并传递 `AbortSignal`，同时在无 body 和流式 body 两条读取路径检查取消状态；Main 初始化已将检查代次的信号传入清单读取器。
- 新检查开始时会主动中止上一条清单请求，配合已有代次保护，旧请求既不会继续占用可取消的网络读取，也不会覆盖新结果。
- 新增取消传播回归测试；Update 编排/清单读取 18 项、类型检查通过。真实服务器超时、网络代理和平台更新现场仍需发布环境验收。

### 第二百四十九切片（更新清单请求超时，2026-09-14）

- 在可取消读取基础上增加清单请求超时；默认 30 秒，测试可注入更短阈值。
- 超时会中止底层请求并返回可重试的 `network` 失败；用户主动取消和新检查触发的中止仍保持 `idle/cancelled`，不混淆两类状态。
- 新增超时回归测试；更新编排 16 项、类型检查和 `git diff --check` 通过。真实代理、弱网和发布环境超时分布仍待验收。

### 第二百五十切片（覆盖率现状基线，2026-09-14）

- 运行 `npm run test:coverage -- --maxWorkers=1`：137 个测试文件、554 项通过；总语句覆盖 80.85%、函数覆盖 84.21%、行覆盖 88.35%。
- 分支覆盖为 66.34%，低于项目要求的 80%，因此不将整体覆盖率门禁标记为完成；主要缺口集中在未执行组件交互的 `ChatWorkspace`、通知组件和部分 Main 异常分支。
- 本切片只建立真实覆盖率基线，不通过排除文件或降低阈值制造达标结果；后续需要按高风险分支补组件/集成测试。

### 第二百五十一切片（更新清单边界分支测试，2026-09-14）

- 为清单读取补充无效 HTTPS 地址、无 body 超大响应、流式超限响应和 AbortSignal 转发等边界测试，并确认流读取异常时会执行 reader 清理。
- 更新清单读取聚焦测试 7 项通过；这些测试覆盖真实 `fetchUpdateManifest` 公共入口，不修改 coverage 配置。
- 总体分支覆盖率仍需后续全量复测，项目要求的 80% 分支门禁保持未完成。

### 第二百五十二切片（更新服务错误路径测试，2026-09-14）

- 补充默认平台暂存文件名、普通 HTTP 下载失败和更新服务边界状态测试，覆盖成功下载、完整性失败与暂存失败的区别。
- 更新编排聚焦测试由 16 项增至 18 项，全部通过；`npm run typecheck` 与 `git diff --check` 通过。
- 未将聚焦覆盖率外推为全项目覆盖率；整体分支覆盖率仍以全量 coverage 结果为准。

### 第二百五十三切片（Electron 依赖补丁解析验证，2026-09-14）

- 新增打包测试：通过 Electron 实际安装包的依赖解析路径加载 `extract-zip`，检查运行时源码包含 symlink 拒绝逻辑，避免只验证 `package.json` 与 patch 文件声明。
- 打包相关测试 5 项、类型检查与 `git diff --check` 通过；`pnpm audit` 仍会报告该已知上游 advisory，发布清单继续保留人工签核项。

### 第二百五十四切片（更新版本优先级分支测试，2026-09-15）

- 补充 beta 更新 SemVer 预发布标识测试：覆盖数字与字符串标识、标识长度差异、相同预发布版本和稳定版本优先级。
- 更新清单/版本完整性聚焦测试 13 项通过，`npm run typecheck` 与 `git diff --check` 通过；没有改变版本比较实现或放宽 manifest schema。

### 第二百五十五切片（更新超时兜底分支，2026-09-15）

- 补充底层读取器忽略 abort、但延迟返回清单时的超时回归，确保 `UpdateService` 仍返回 network 失败而不接受迟到结果。
- 移除同步 manifest schema 解析阶段不可能被定时器打断的冗余超时分支，保留真实异步边界处理。
- 更新相关聚焦测试 39 项通过，`npm run typecheck` 与 `git diff --check` 通过。

### 第二百五十六切片（更新通知 Token 迁移，2026-09-15）

- 更新通知卡片的面板、边框、文字、状态色、控件高度和动效现在统一消费 Design System token，保留原有右下角 VS Code 风格布局与状态层级。
- 新增通知 surface 的 token 契约测试；Design System/Update UI 聚焦测试 6 项、类型检查和 `git diff --check` 通过。
- 完整组件 token 迁移、Light theme 和真实多分辨率视觉验收仍待继续。

### 第二百五十七切片（Electron 补丁验证路径解耦，2026-09-15）

- 将 `extract-zip` 补丁验证测试从写死 Electron 版本目录改为从项目实际 `node_modules/electron` 入口解析，升级依赖版本时仍验证真实安装链。
- 打包相关测试 5 项、`npm run typecheck` 与 `git diff --check` 通过；未改变安全补丁内容或放宽审计条件。

### 第二百五十八切片（全局 Notification Token 统一，2026-09-15）

- 全局右下角 notification surface 现在统一消费 Design System 的面板、边框、文字、强调色、成功/警告/错误色与动效 token。
- 保留左侧状态竖线垂直居中、多行消息换行、下方滚动和关闭按钮交互；仅统一视觉变量。
- 新增全局 notification token 契约；Notification/Design System 聚焦测试 9 项、类型检查和 `git diff --check` 通过。

### 第二百五十九切片（项目完整性面板 Token 统一，2026-09-15）

- 项目完整性弹框统一消费 Design System 的面板、边框、控件高度、强调色、成功/警告/错误色和动效 token。
- 保留完整性结果、迁移摘要、错误详情、修复按钮和失败超时逻辑，仅统一视觉层级与 hover 行为。
- 新增 health dialog token 契约；Design System/Project Health 聚焦测试 12 项、类型检查和 `git diff --check` 通过。

### 第二百六十切片（Provider 设置 Token 统一，2026-09-15）

- Provider 设置面板的 surface、边框、表单控件、Tab、主按钮和 hover 状态统一消费 Design System token。
- 保留连接/模型/密钥分 Tab、默认 profile 和未保存 profile 防护等既有业务逻辑，仅收敛 IDE 视觉变量。
- 新增 Provider 设置 token 契约；Design System/Provider 聚焦测试 7 项、类型检查和 `git diff --check` 通过。

### 第二百六十一切片（Developer Inspector Token 统一，2026-09-15）

- Developer Inspector 的运行列表、详情面板、工具栏、筛选控件和节点选中态统一消费 Design System token。
- 保留运行/节点诊断数据、日志滚动、状态筛选和扩展权限逻辑，仅统一 surface、边框、控件高度与 hover 状态。
- 新增 Developer Inspector token 契约；Design System/Developer 聚焦测试 8 项、类型检查和 `git diff --check` 通过。

### 第二百六十二切片（Renderer 边界 lint 接入，2026-09-15）

- 新增 `lint:boundaries` 检查，禁止 Renderer 直接导入 `node:`/`electron` 模块或直接使用 `ipcRenderer`/`ipcMain`，确保特权能力继续经由受限 preload bridge 访问。
- `npm run lint`、安全配置契约测试 2 项、`npm run typecheck` 与 `git diff --check` 均通过；该检查覆盖静态边界，不替代真实 Electron 安全现场验收。

### 第二百六十三切片（第二个旧数据库 schema fixture，2026-09-15）

- fixture 生成器新增 `migration-v0`：仅创建早期 `settings` 表并保持 `user_version=0`，用于验证从初始数据库到当前版本的完整迁移链；原有 `migration-v1` 继续覆盖从 `user_version=2` 开始的升级路径。
- fixture verifier、SQLite 回归测试均确认两个旧版本可被识别并由 `DatabaseService` 自动升级到当前版本；聚焦测试 8 项、`npm run lint`、`npm run typecheck` 与 `git diff --check` 通过。
- 该证据覆盖本地 fixture 迁移，不替代真实跨版本用户项目、备份恢复和发布包升级验收。

### 第二百六十四切片（运行时迁移 smoke 覆盖 v0，2026-09-15）

- `scripts/verify-runtime.mjs` 现在会在临时项目中实际打开 `migration-v0`，断言从 `user_version=0` 依次应用全部 migration 到当前版本；原有 `migration-v1` v2→当前路径保持不变。
- 运行时 smoke 报告 `ok: true`，两条迁移报告均为 `migrated` 并到达 v20；脚本未写入仓库。该证据仍不替代真实跨版本用户项目和发布包升级验收。

### 第二百六十五切片（迁移 fixture 接入发布门禁，2026-09-15）

- 新增 `verify:fixtures` 临时目录包装器：每次发布校验都会重新生成并验证 `migration-v0`/`migration-v1`，执行结束后清理临时目录，不污染仓库 fixture 或用户项目。
- `verify:release` 与 `release-preflight` 均检查该入口；fixture 命令、发布预检相关测试 4 项、`npm run lint`、`npm run typecheck` 和 `git diff --check` 通过。
- 该门禁仍是本地 schema 迁移验证，不替代真实跨版本项目、备份恢复、签名公证和平台安装验收。

### 第二百六十六切片（发布流程执行迁移 fixture 校验，2026-09-15）

- `verify:release` 现在按打包配置、安装产物、临时迁移 fixture、代码级安全预检的顺序执行；迁移 fixture 校验失败会阻止发布流程继续。
- 实际执行 `npm run verify:release` 返回成功，Windows NSIS/macOS DMG 产物、`migration-v0`/`migration-v1` fixture 和 15 项发布预检均通过；仍不替代签名、公证和真实安装验收。

### 第二百六十七切片（更新兼容性拒绝路径回归，2026-09-15）

- 为 `UpdateService.check()` 补充有效签名清单但不适用于当前客户端时的 `channel`、`platform`、`minimum-version` 三类回归；状态事件仍按 `checking → up_to_date` 发出，且不会残留可下载清单。
- 更新编排聚焦测试 22 项通过；全量单 worker 测试 137 个文件、574 项通过，`npm run lint`、`npm run typecheck` 和 `git diff --check` 均通过。
- 该证据覆盖本地更新决策分支，不替代真实更新服务器、安装切换、自动回滚和签名发布验收。

### 第二百六十八切片（全量覆盖率复测，2026-09-15）

- 在新增更新回归后重新执行 `npm run test:coverage -- --maxWorkers=1`：137 个测试文件、574 项通过；Statements 81.18%、Functions 84.21%、Lines 88.65%、Branches 66.89%。
- 整体分支覆盖仍低于蓝图 80% 要求，主要缺口继续集中在 `ChatWorkspace`、`EditorPane` 及部分 Main 异常路径；不降低阈值、不排除模块，并保留该项未完成状态。

### 第二百六十九切片（全局搜索关系结果定位 Graph，2026-09-15）

- `StoryService.searchAll()` 新增关系类型检索，支持关系类型、metadata 和两端实体名匹配，并返回带实体名称的关系标题。
- Command Palette 选择关系结果后打开 Graph Studio；Graph 接收稳定关系 ID，待数据加载完成后自动填充关系编辑器和边详情，保留现有 Story Bible/时间线定位行为。
- Story/IPC/Graph 聚焦测试 17 项、`npm run typecheck`、`npm run lint` 和 `git diff --check` 通过；真实 Electron 点击搜索结果的现场验收仍待继续。

### 第二百七十切片（全局搜索关系回归闭环，2026-09-15）

- 全量回归确认关系搜索类型扩展未破坏既有 IPC、Story Bible、Command Palette 或 Graph 流程：137 个测试文件、576 项通过。
- 本切片的证据仍来自 Node/静态契约与服务测试；真实 Electron 搜索点击、Graph 边选中和多分辨率视觉现场仍需继续验收。
### IPC Namespace 补齐（2026-09-15）

- 按第 33 章 API / IPC 草案新增独立 `settings:get`、`settings:set` 与 `secret:has`、`secret:set`、`secret:remove` typed channels。
- preload 和 Renderer 类型声明现在提供 `settings`、`secret` namespace；旧 `ai.*secret` 接口保留，避免现有 Provider 设置页面破坏性迁移。
- Main 侧对 key/value 进行 Zod 校验；settings 仍写入项目 SQLite settings 表，secret 仍经现有 Main-owned SecretStore 路径，不进入 Renderer 或项目文件。
- 契约验证：`tests/settings-secret-ipc-contract.test.ts`、`npm run typecheck`、`npm run lint`、`git diff --check`。

### Jobs 控制闭环（2026-09-15）

- `jobs` namespace 新增 typed `cancel`、`retry` 和 `onEvent`；取消/重试按 Job ID 解析持久化 Workflow，而不是让 Renderer 直接操作运行时内部对象。
- Retry 会复用历史 Run 的章节路径，并拒绝缺少历史路径的旧 Job；运行事件同时通过 `workflow-runtime:event` 和 `jobs:event` 推送。
- 聚焦回归：4 个文件、36 项通过；`npm run typecheck`、`npm run lint`、`git diff --check` 通过。
- Developer Inspector 已切换到 `jobs.cancel/retry/onEvent`，任务状态会随事件实时更新，不再绕过 Jobs namespace 调用 Workflow Runtime 控制方法。

### Light Theme Token 基础（2026-09-15）

- `tokens.css` 新增明确的浅色语义色板，并支持 `data-theme="light"` 强制启用。
- 未显式指定 dark 时跟随 `prefers-color-scheme: light`；默认仍保持深色 IDE 主题，控件尺寸、圆角和动效 token 不变。
- `tests/design-system.test.ts` 6 项、`npm run typecheck`、`npm run lint`、`git diff --check` 通过；尚未完成所有历史组件的 token 化及完整浅色视觉验收。
- 顶部 Shell 新增持久化主题选择：跟随系统、深色、浅色；选择会写入本地偏好并通过根节点 `data-theme` 应用，默认仍为深色。
- Shell/Design System 聚焦回归 10 项通过；完整历史组件浅色适配与多分辨率视觉验收仍待继续。
- Welcome、Topbar、Sidebar、Editor、Bottom Panel、Statusbar 等核心表面已增加显式/系统浅色覆盖，避免主题切换后核心工作区残留整块深色背景。
- Design System 聚焦回归现为 8 项通过；仍有历史业务面板和插画预览等硬编码颜色，完整浅色视觉验收未完成。

### 跨平台打包入口增强（2026-09-15）

- 在保留原有 `dist:win` / `dist:mac` 的基础上，新增 `dist:win:x64`、`dist:mac:arm64` 和 `dist:mac:universal`，每个入口均先执行生产构建再调用 electron-builder。
- `verify-packaging-config.mjs` 现在检查这些平台入口及其目标架构参数；`npm run verify:packaging` 已通过。
- 这只完善本地打包入口与配置门禁，不代表已完成 Windows/macOS 实际安装、签名或 notarization 验收。

### 高频业务面板浅色适配（2026-09-15）

- 右侧 Agent/Workflow 卡片、插图预览模态框、备份/导入导出/Checkpoint 控件已增加显式浅色与系统浅色覆盖，表面、边框、文字统一引用语义 token。
- Design System 回归现为 9 项通过；仍有少量历史业务样式和插画内容本身的深色装饰色，完整多分辨率视觉验收仍待继续。

### 全局搜索正文统一结果（2026-09-15）

- `StoryService.searchAll()` 现在同时检索 `documents_fts` 中的章节标题与正文，返回稳定 `document` 类型、章节路径和有界 snippet。
- Command Palette 使用 Story 全局搜索结果打开正文，保留旧 `search:project` IPC 作为兼容 API；设定、时间线、关系与正文在同一结果模型内呈现。
- Story/Palette/IPC 聚焦回归 19 项通过，`npm run typecheck`、`npm run lint`、`git diff --check` 通过。

### 更新安装失败可重试（2026-09-15）

- `UpdateService.install()` 在安装器失败时保留已通过 SHA-512 校验的暂存工件，并返回明确的 `install_failed` 状态；UpdateCard 可直接再次执行“安装更新”。
- 若暂存工件被删除或篡改，仍返回普通安装失败，不会调用安装器；新增重试与工件保留回归。
- 更新编排与 UpdateCard 聚焦测试 28 项、`npm run typecheck`、`npm run lint`、`git diff --check` 通过；真实平台安装、签名、公证、安装后回滚仍未验收。

### 时间线视觉无障碍文案国际化（2026-09-15）

- Story Bible 时间线概览的 `aria-label` 改为由 `storyTimelineOverview` locale key 提供，移除组件内硬编码英文文案。
- 中英文 locale、时间线 golden-path 契约、`npm run typecheck`、`npm run lint` 和 `git diff --check` 均通过；完整 Electron 键盘与多分辨率视觉验收仍待继续。

### 时间线分组日期本地化（2026-09-15）

- 时间线列表分组标题不再直接展示 ISO 时间字符串，新增 `formatTimelineGroupLabel` 按当前 UI locale 输出可读日期；空值和非法日期保留安全回退文案/原文。
- 时间线模型与 Story Bible 聚焦回归 5 项、`npm run typecheck`、`npm run lint`、`git diff --check` 通过；真实 Electron 多语言视觉验收仍待继续。

### 仓库级 CI 质量门禁（2026-09-15）

- 新增 `.github/workflows/ci.yml`，在 push 和 pull request 上执行依赖锁定安装、typecheck、Renderer 边界 lint、单元/集成测试、生产构建、打包配置校验和 release preflight。
- CI 不注入签名/公证凭据，也不把代码级预检冒充真实平台安装或发布验收；Playwright E2E、签名、公证和平台安装仍保持未完成状态。
- 新增 CI 配置契约测试 2 项，另经 `npm run typecheck`、`npm run lint`、`git diff --check` 验证。

### Electron Golden Path 接入 CI（2026-09-15）

- 新增 `e2e:electron` 脚本，并将现有基于 CDP、临时 fixture 和真实 Electron 主进程的 golden path 接入 CI；Ubuntu 使用 `xvfb-run` 提供无头桌面环境。
- CI 先构建产物再执行 golden path，golden path 自带 CDP、Vite、图片 fixture 服务和临时项目清理；配置契约、生命周期清理和用户工程只读契约共 4 项通过。
- 本地仅完成入口与配置验证；当前机器 Electron 原生运行时缺失时不能冒充现场通过，跨平台签名、公证、安装后启动仍待发布环境验收。

### 跨平台安装包构建 workflow（2026-09-15）

- 新增手动触发的 `.github/workflows/package.yml`：Windows runner 执行 NSIS x64，macOS runner 执行 ARM64 DMG，并分别校验安装包及更新元数据后上传 artifact。
- workflow 明确关闭自动签名发现，不读取或注入 Apple/Windows 签名凭据；因此只提供 unsigned 构建产物，签名、公证、安装后启动和自动更新回滚仍需正式发布环境验收。
- CI workflow 契约测试 3 项、YAML 语法检查、`npm run typecheck`、`npm run lint`、`git diff --check` 通过。

### 更新安装器交接状态（2026-09-15）

- Main 侧成功调用平台安装器后，`UpdateService` 返回明确的 `installing` 状态；UpdateCard 展示“安装器已启动”及系统后续操作提示，不再误显示为仍可安装的 `ready` 状态。
- 安装器失败仍返回可重试的 `install_failed`，暂存工件继续接受完整性校验；更新编排、UI 和 i18n 聚焦测试 30 项、`npm run typecheck`、`npm run lint`、`git diff --check` 通过。
- 该状态表示已把工件交给系统安装器，不代表安装完成、应用重启成功或自动回滚已验收。

### IPC 错误序列化边界（2026-09-15）

- 为 `toAppError()` 增加 IPC 契约回归：普通异常统一为 `INTERNAL`，DomainError 保留错误码、重试标记和脱敏详情。
- 错误详情树现在对 BigInt、循环引用、过深嵌套和异常 getter 做安全归一化，避免错误处理本身再次抛错或产生无法跨 Electron IPC 传输的值。
- 未知异常的字符串转换现在也有兜底，即使异常对象自定义 `toString()` 抛错，IPC 仍返回 `INTERNAL`，不会在错误转换阶段再次抛出。
- `tests/error-serialization.test.ts` 5 项通过；该证据覆盖错误对象归一化与敏感信息脱敏，不替代真实 Electron 多进程序列化现场验收。

### Fixture 与长篇运行时复核（2026-09-15）

- `node scripts/verify-runtime.mjs --long` 通过：临时 fixture 的清理、Provider/Embedding、迁移 v0/v1、损坏项目修复、导入导出、备份、Context、Workflow、图片、快照和 1000 章/1000 实体/100000 facts 规模核验均返回 `ok: true`。
- `npm run verify:fixtures`、`node scripts/verify-ui-contract.mjs`、`node scripts/release-preflight.mjs` 及 fixture/benchmark 契约测试通过；本机 benchmark 三次 p95 为 repair 7242ms、chapterList 36ms、integrity 3337ms，因冷启动波动较大，不能标记低端设备性能达标。
- 真实 Electron golden path 当前仍未取得现场结果：沙箱外运行确认仓库 Electron 原生二进制缺失，`pnpm rebuild electron`/安装脚本未落盘 `Electron.app`；这属于本机依赖获取阻塞，不将其误记为应用流程通过或失败。

### 全局通知反馈覆盖补齐（2026-09-15）

- Chat、Story Bible、Graph Studio 和 Workflow Editor 中此前仅显示在面板内的反馈，现在统一通过 `useGlobalMessage()` 发布到右下角 Notification Center，同时保留面板内 `role="status"` 文案，兼顾 IDE 风格全局提醒与当前操作上下文。
- 全局通知契约测试扩展到全部主要消息面板；通知仍使用可换行、垂直居中的 VS Code 风格布局，并由 Notification Center 负责生命周期与自动消失。
- 相关组件/i18n 聚焦回归 15 项、`npm run typecheck`、`npm run lint` 和 `git diff --check` 通过；真实 Electron 多分辨率通知堆叠视觉验收仍待继续。

### 全局通知状态语义统一（2026-09-15）

- `notifyGlobal()` 现在会在未显式指定类型时，根据成功、警告和失败文案推断 `success`、`warning` 或 `error`；显式类型始终优先，避免所有面板反馈都呈现为同一种 info 颜色。
- 新增状态颜色推断与显式覆盖回归；全局通知仍由 Notification Center 统一处理自动消失、可访问性 live region 和右下角堆叠布局。

### Graph/Workflow 浅色表面与 Agent 折叠入口统一（2026-09-15）

- Graph/Workflow 的基础工作区、画布、属性栏、表单控件、节点、消息和选中态补充 Design System 语义 token 的浅色覆盖，减少主题切换后残留深色硬编码造成的对比度和层级问题。
- Graph/Workflow 画布内 Properties 折叠入口统一使用原有 Agent `Bot` 图标，并保留展开/折叠状态、hover、focus 和键盘可操作反馈；未改变属性面板宽度与业务状态逻辑。
- 新增 Design System 回归契约；相关聚焦测试 24 项、全量测试 140 个文件/597 项、`npm run typecheck`、`npm run lint` 和 `git diff --check` 均通过。
- 该切片仅覆盖 Graph/Workflow 的基础浅色表面和图标入口，不代表完整历史组件浅色适配、多分辨率视觉验收或真实 Electron 双语验收已完成。

### Story Bible 选择导航无障碍语义（2026-09-15）

- Story Bible 实体类型切换补充 `tablist`、`tab` 和 `aria-selected`，实体列表与 Timeline 可视化选点补充 `aria-pressed`，并为实体类型按钮明确 `type="button"`，让视觉 active 状态同时对辅助技术可见。
- 移除未使用的硬编码英文 `sectionTitles` 常量，继续由 `sectionTitle()` 和 locale key 提供工作区标题；新增 `storyEntityTypes` 双语 key。
- Story Bible/navigation 聚焦测试 10 项、全量测试 140 个文件/598 项、`npm run typecheck`、`npm run lint` 和 `git diff --check` 均通过。
- 该切片覆盖选择导航语义，不代表完整全局键盘路径、真实 Electron 无障碍树或多分辨率现场验收已完成。

### Story Bible 类型 Tab 键盘导航（2026-09-15）

- 实体类型 `tablist` 支持方向键循环切换，Home/End 分别跳转首项和末项；切换后同步更新实体表单并将焦点移动到目标 tab，保持 roving `tabIndex`。
- 新增键盘导航契约，Story Bible/navigation 聚焦测试 9 项、全量测试 140 个文件/598 项、`npm run typecheck`、`npm run lint` 和 `git diff --check` 均通过。
- 该切片只覆盖 Story Bible 实体类型导航，完整全局键盘路径、真实 Electron 无障碍树和现场验收仍未完成。

### Renderer 全局渲染错误兜底（2026-09-15）

- 根 Renderer 现在由 `RendererErrorBoundary` 包裹；工作区组件发生渲染异常时显示 IDE 风格错误卡片和“重试渲染”入口，不再直接留下黑屏。
- 错误兜底只展示异常类型，不将异常正文写入项目、诊断包或 Provider 请求；重试会清除错误状态并重新渲染子树。
- 新增 Renderer Error Boundary 契约；聚焦测试 14 项、全量测试 141 个文件/599 项、`npm run typecheck`、`npm run lint` 和 `git diff --check` 均通过。
- 该切片覆盖 Renderer 渲染级兜底，不替代真实 Electron 异常注入、崩溃恢复和安装后现场验收。

### 启动后后台更新检查（2026-09-15）

- Main 进程在创建首个窗口后延迟 10 秒执行一次更新检查，仅当 `NOVEL_STUDIO_UPDATE_MANIFEST_URL` 已配置时启用；未配置更新源不会发起请求或制造失败提示。
- 调度器为单次、可取消且无 Electron 依赖，应用退出时清理定时器；检查异常不会形成未处理 Promise rejection，也不会阻塞启动生命周期。
- 新增后台检查调度契约测试 3 项，并通过 `npm run typecheck` 与 `git diff --check`；真实更新服务器、签名、公证、安装后重启和回滚仍待发布环境验收。

### 更新源未配置状态语义（2026-09-15）

- 手动检查更新时，Main 现在将未配置更新端点单独映射为 `not-configured`，Renderer 展示明确的“未配置更新源”，不再误报为网络故障。
- 共享状态、UpdateCard、双语文案和更新卡片国际化契约已同步；聚焦更新测试与类型检查通过。

### 第二百七十一切片（全局搜索快捷键冲突修复，2026-09-15）

- 按蓝图第 17 章将 `⌘/Ctrl+Shift+F` 从错误的 Focus Mode 切换改为打开现有 Command Palette 全项目搜索；搜索仍复用 typed `story.searchAll`，覆盖正文、设定、时间线、关系和其他 Story 结果。
- Focus Mode 不再在状态栏提示一个与全项目搜索冲突的快捷键，继续通过状态栏按钮切换，并保留 Escape 退出行为。
- 新增全局快捷键回归契约；聚焦测试 4 个文件、19 项通过，全量测试、`npm run build`、`npm run typecheck`、`npm run lint` 和 `git diff --check` 均通过。真实 Electron 键盘现场与多分辨率搜索视觉验收仍待继续。

### 第二百七十二切片（Provider 原生结构化输出，2026-09-15）

- 新增可选 `ResponseSchema` 合约；`structured()` 在调用 OpenAI-compatible、Anthropic、Gemini Provider 时分别映射为原生 JSON Schema 请求格式，减少结构化结果依赖本地文本解析的风险。
- 未提供 schema 的普通 chat/stream 请求保持原有 payload 行为；schema 仍通过不可变对象展开传递，不写入审计日志或敏感信息。
- Provider 聚焦回归 13 项、全量 Vitest 143 个文件/609 项、`npm run typecheck`、`npm run lint`、`npm run build` 和 `git diff --check` 通过。真实 Provider 网络兼容性矩阵与 Electron 现场验收仍待继续。

### 第二百七十三切片（Memory Extractor 原生输出接线，2026-09-15）

- `MemoryService` 现在将 `memoryExtractionSchema` 转换为命名的 `memory_extraction` JSON Schema，随 `AiService.structured()` 传递到 Provider；本地 Zod 解析仍保留，继续作为最终安全边界。
- 新增 Memory Extractor 调用契约回归，确认 Canon Proposal 的幂等、来源范围和人工审核流程不变；全量单 worker 测试 143 个文件/609 项、`npm run typecheck`、`npm run lint`、`npm run build` 和 `git diff --check` 通过。
- 该切片只接通已实现的结构化 Provider 能力，不代表真实模型一定支持该 schema 方言，也不替代真实 Provider、Electron 和发布环境验收。

### 第二百七十四切片（结构化输出合约边界校验，2026-09-15）

- 新增共享 `responseSchemaSchema`：schema 名称限制为安全的命名格式和长度，schema 根节点必须是 JSON object，序列化体积限制为 200KB；`AiService.structured()` 在请求 Provider 前执行校验。
- 非法 schema 统一返回 `VALIDATION_FAILED / 结构化输出 schema 无效`，不把底层 Zod 校验细节直接暴露给 UI；合法 schema 的 Provider 映射与无 schema 兼容行为保持不变。
- 共享 AI、AiService 聚焦回归 12 项、全量单 worker 测试 143 个文件/610 项、`npm run typecheck`、`npm run lint`、`npm run build` 和 `git diff --check` 通过。真实 Provider schema 方言兼容性与 Electron 现场验收仍待继续。

### 第二百七十五切片（结构化调用审计接线，2026-09-15）

- `AiService.structured()` 现在与普通 Chat/Stream 一样记录 metadata-only invocation audit，包含 profile、模型、消息数量、输入字符数、耗时和成功/失败/取消状态；不记录 prompt、结构化 schema 或 Provider 响应内容。
- 新增 AiService 审计回归，确认结构化请求仍通过统一 Provider 合约和 schema 校验；全量单 worker 测试 143 个文件/610 项、`npm run typecheck`、`npm run lint`、`npm run build` 和 `git diff --check` 通过。
- 该切片只补齐本地可观测性，不代表真实 Provider request ID/usage 在所有结构化协议中都能返回，也不替代真实网络与 Electron 诊断包现场验收。

### 第二百七十六切片（备份归档覆盖一致性，2026-09-15）

- 修复重复创建同一路径备份时 `zip` 更新模式遗留旧文件的问题；全量和增量归档现在都会清理目标旧归档后重新生成，避免恢复时混入未在当前 manifest 声明的历史文件。
- 增量备份禁止覆盖自己的全量基准，避免基准在生成过程中被破坏；新增全量/增量覆盖回归测试。
- Backup 聚焦回归 10 项、全量单 worker 测试 143 个文件/612 项、`npm run typecheck`、`npm run lint`、`npm run build` 和 `git diff --check` 通过。真实跨版本用户项目恢复和发布环境备份验收仍待继续。

### 第二百七十七切片（备份归档原子替换，2026-09-15）

- 全量和增量归档现在先在目标同目录生成带随机后缀的临时 zip，manifest 与内容完整写入后再替换正式目标；异常时清理临时文件，避免生成中断留下半成品或先删除旧归档造成无备份可用。
- 保留跨平台目标覆盖兼容路径，并继续禁止增量归档覆盖全量基准；既有 stale-entry 回归覆盖最终归档内容一致性。
- Backup 聚焦回归 10 项、全量单 worker 测试 143 个文件/612 项、`npm run typecheck`、`npm run lint`、`npm run build` 和 `git diff --check` 通过。真实跨平台 zip 工具、用户项目恢复和发布环境验收仍待继续。

### 第二百七十八切片（增量备份路径规范化，2026-09-15）

- 增量备份目标现在与全量备份共用项目根目录沙箱校验，并对目标最近的现存父目录执行 `realpath` 归一化，修复 macOS `/var` 与 `/private/var` 符号链接导致的项目内路径绕过。
- 新增增量归档项目内路径回归，同时保留全量/增量覆盖一致性、全量基准保护和临时归档替换行为。
- Backup 聚焦回归 11 项、全量单 worker 测试 143 个文件/613 项、`npm run typecheck`、`npm run lint`、`npm run build` 和 `git diff --check` 通过。真实跨平台文件工具、用户项目恢复和发布环境验收仍待继续。

### 第二百七十九切片（覆盖率基线复测，2026-09-15）

- 重新运行 `npm run test:coverage -- --maxWorkers=1`：全量测试 143 个文件/613 项通过，Statements 81.18%、Functions 84.26%、Lines 88.51%，Branches 67.12%。
- 覆盖率仍未达到蓝图/工程要求的分支 80% 门槛；缺口主要集中在 `ChatWorkspace`、`EditorPane`、`WorkflowRuntimeService` 及部分 Main 异常分支，当前不通过排除模块或降低阈值掩盖。
- 本切片只记录真实覆盖率证据并明确后续测试补强方向，不将当前 67.12% 分支覆盖宣称为质量门禁通过。

### 第二百八十切片（独立 Chat 组件渲染烟测，2026-09-15）

- 新增无浏览器依赖的 React SSR 组件烟测，确认独立 Chat 在无 Electron/browser runtime 时仍能输出完整工作区、空对话状态、输入区、会话栏和上下文 Inspector，避免 preload 缺失时直接渲染崩溃。
- 该测试只覆盖初始静态渲染，不冒充点击、streaming、选区持久化或真实 Electron 视觉验收；纯交互模型测试继续覆盖消息事件与确认选区逻辑。
- 新增组件测试后全量单 worker 测试 144 个文件/614 项通过，`npm run typecheck`、`npm run lint` 和 `git diff --check` 通过；分支覆盖率 80% 门槛仍需后续针对真实交互分支补强。

### 第二百八十一切片（Context 未来项目 schema 拒绝，2026-09-15）

- 修复 Context Snapshot 兼容边界：读取快照时现在与未来格式/检索版本一致校验项目 schema；高于当前支持版本的快照明确返回 `VALIDATION_FAILED`，不会被静默标记为迁移后重算。
- 新增回归测试覆盖 v999 项目 schema；旧项目 schema 仍保持当前索引重算路径，未来版本继续拒绝。该修复不改变现有 Snapshot 正文、检索结果或诊断数据边界。

### 第二百八十二切片（Workflow 副作用等待超时持久化，2026-09-15）

- 修复外部 side-effect ledger 返回 `in_progress` 但在等待窗口内始终没有完成时的异常路径：节点现在记录 `io` 错误、标记为 `failed` 并持久化 Run，调用方可以正常看到失败并执行 Retry，不再收到未处理 Promise rejection。
- 当前进程不会释放其他进程持有的 claim，避免把未知中的外部副作用错误地当作可重试空闲状态；原有成功副作用复用与 completion window 防重复执行逻辑保持不变。
- 新增回归测试验证节点错误、Run 最终状态和持久化失败状态；Workflow 聚焦测试 28 项通过。完整验证仍需在本切片结束后执行。

### 第二百八十三切片（Workflow 阻塞节点状态一致性，2026-09-15）

- 修复 DAG 依赖无法满足时的诊断状态：Run 失败现在会优先把仍为 pending 的阻塞节点标记为 failed，写入 `validation` 错误分类和结束时间；不会再把错误错误地写到已失败的上游节点。
- `finish()` 在没有可定位节点时仍能安全持久化 Run，避免空节点状态导致异常；普通成功、取消、人工暂停和节点级错误路径保持不变。
- 新增回归测试验证阻塞节点、上游节点和错误分类；Workflow 聚焦测试 29 项通过。完整验证仍需在本切片结束后执行。

### 第二百八十四切片（发布更新元数据必需校验，2026-09-15）

- 修复 `verify-packaging-artifacts.mjs` 的发布门禁漏洞：安装包存在但对应 `latest.yml`/`latest-mac.yml` 缺失或不可读取时，现在明确失败，不再静默跳过。
- `--platform win` 要求 Windows 清单，`--platform mac` 要求 macOS 清单，`--platform all` 按实际发现的 exe/dmg 平台要求对应清单；不额外要求未构建的平台。
- 平台更新清单现在还必须包含有效的三段式 SemVer `version`；新增双平台无元数据和缺失版本回归测试。打包配置与 CI 合约聚焦测试 10 项通过。完整验证仍需在本切片结束后执行。

### 第二百八十七切片（发布清单绑定实际安装器，2026-09-15）

- 修复更新清单只引用合法 helper/zip 文件也能通过的漏洞：`latest.yml` 必须引用符合命名规则的 `.exe`，`latest-mac.yml` 必须引用对应 `.dmg`；blockmap 等附属文件仍会继续校验 hash/大小。
- 新增 macOS 清单遗漏 DMG 安装器回归测试；打包与 CI 聚焦测试 11 项通过。签名、公证和实际安装启动仍不由该脚本冒充验收。

### 第二百八十五切片（Context Snapshot 完整性校验，2026-09-15）

- 修复快照文件被外部修改后仍可回放的问题：`ContextService.readSnapshot()` 现在重算 request/result hash，并同时与快照正文和 SQLite 索引中的 hash 比对。
- 检测到正文、请求、文件元数据或索引元数据不一致时返回明确的 `Context Snapshot 完整性校验失败`，不会进入 Replay；未来格式/schema/检索版本拒绝和旧版本重算逻辑保持不变。
- 新增篡改快照回归测试；Context/Replay 聚焦测试 9 项通过。完整验证仍需在本切片结束后执行。

### 第二百八十六切片（Workflow Editor 节点键盘激活，2026-09-15）

- Workflow Editor 的自定义节点现在具备 `role=button`、`tabIndex=0` 和 `aria-pressed` 选中态；Enter/Space 会复用编辑器的真实节点选择路径，打开对应 Properties，而不是只改变视觉焦点。
- 增加 `focus-visible` 轮廓，鼠标 ReactFlow 选择、节点拖拽和现有 Bot 折叠入口保持不变；节点 ID 通过受控事件传递给编辑器，不写入 Workflow 数据模型。
- 新增 Workflow Editor 无障碍契约测试；聚焦测试 1 项通过。完整键盘现场、真实 Electron 无障碍树和蓝图整体验收仍需继续。

### 第二百八十八切片（恢复右侧 Agent 原生折叠入口，2026-09-15）

- 恢复顶部栏 Bot 图标作为右侧 Agent 面板始终可见的折叠/展开入口，折叠状态通过 active/collapsed 样式和 `aria-pressed` 同步表达。
- 移除工作区右侧额外窄 rail；折叠时右面板列收为 `0px`，展开时继续使用可调宽度和原有 hover/focus/active 交互。
- 更新右侧面板布局契约测试；聚焦测试 16 项、全量单 worker 测试 145 个文件/622 项、类型检查、lint、build 和 `git diff --check` 通过。真实 Electron 视觉与多分辨率现场验收仍需继续。

### 第二百八十九切片（Chat 选区边界回归，2026-09-15）

- 为独立 Chat 增加组件级契约回归：确认请求和顶部 scope 只消费 `resolveConfirmedChatSelection()` 的已确认选区，普通浏览器拖选不会冒充 Chat 选区；取消选取入口继续绑定到同一持久化选区状态。
- 右侧 Agent/Workflow 的顶部 Bot 折叠入口、`active/collapsed` 状态、`aria-pressed` 和折叠后 `0px` 网格列继续通过布局契约测试；聚焦测试 23 项、临时副本全量测试 145 个文件/625 项通过。
- 覆盖率复测为 Statements 81.45%、Functions 84.45%、Lines 88.74%、Branches 67.38%；分支覆盖仍低于 80% 要求，缺口主要集中在 ChatWorkspace、EditorPane 和 WorkflowRuntimeService。原工程目录的 macOS 访问控制阻止 Node 直接启动，类型检查、lint、UI contract 均在等价临时副本完成；真实 Electron 视觉验收仍需继续。
