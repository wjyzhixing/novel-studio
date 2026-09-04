# Novel Studio 持续开发流程

本流程以《Novel-Studio-完整开发蓝图-v1.0.docx》为需求基线，目标是逐章节核验并持续打通真实数据流，不以页面存在或 mock 成功作为完成标准。

## 一、每个切片的固定循环

1. **定位**：标记蓝图章节、用户场景、领域对象、源文件、SQLite 表、Main service、IPC/preload、Renderer 入口和 Workflow 节点。
2. **定义不变量**：写清楚成功、失败、取消、重启、删除、回退和权限边界；明确哪些数据必须保留。
3. **建立红灯**：优先在真实服务边界增加 runtime smoke 或最小集成验证；先确认它能稳定暴露当前缺口。
4. **实现**：只改当前切片涉及的边界；正文/设定/图片仍以 Markdown/YAML/JSON/图片为源，SQLite 只做可重建索引、状态和审计。
5. **闭环 UI**：Renderer 只经 preload；所有 `Result` 都必须显示成功、失败、等待或取消状态；AI 只能落 Suggestion/Proposal/Asset，不能无审计改 Canon。
6. **验证**：按风险选择 runtime、fixture、静态 UI contract、人工 UI；不把静态检查冒充 E2E。
7. **审计**：更新蓝图章节矩阵、数据流、剩余缺口和可重复命令；记录未完成证据。

## 二、阶段顺序

### P0 数据与恢复底座

项目/章节、Story Bible、Timeline/Relation、Canon、Asset、Revision、Notes、Checkpoint、Backup、Migration 和完整性修复。验收重点是源文件与索引一致、删除/移动不产生悬空引用、重开可恢复。

当前已完成：章节删除引用清理、章节移动路径迁移、章节场景 sidecar 与索引回链、失效 Provider profile 收敛、实体删除 Canon 保护。

### P0 AI Native 闭环

Provider → Context manifest → Agent → Chat/AI Edit → Suggestion → Accept/Reject → Revision；Memory Extract → Canon Proposal → Human Apply/Revert。先验证真实请求契约和错误脱敏，再做模型扩展。

### P0 Workflow First

Workflow schema/端口 → DAG 校验 → 有界队列 → 节点执行 → 超时/取消/重试 → Human pause/resume → 产物回写 → Run/Node 审计。任何产物都必须能定位输入、输出、Provider、耗时和错误类别。

### P1 UI 黄金路径

按用户动作逐条核验：

`创建/打开项目 → 打开章节 → Provider 设置 → 文本/图片连接测试 → Agent Chat → 选中文字操作 → Suggestion Accept/Reject → Canon Review → Workflow Review → 图片选择/插入 → Illustration Studio 删除/刷新 → Checkpoint/Backup → Import/Export`。

每条路径都要有可见状态和失败恢复；静态 UI contract 只作为快速门，最终仍需组件/E2E/人工证据。

### P1 长篇可靠性

Migration、损坏项目修复、1000 章/1000 实体/100000 facts、FTS、窗口化列表、低端设备性能、强杀恢复和导出安全。

### P2 能力完善与发布

跨版本 Embedding/RAG 的结果迁移、完整 Inspector/诊断包、i18n/accessibility、插件签名/权限、Community Workflow、安装包签名、公证、更新、schema rollback、telemetry opt-in。Embedding 基础链路已完成：Provider → 内容哈希索引 → 余弦检索 → Context/FTS fallback；Context budget 会按已发现模型窗口收敛，Snapshot 按章节/项目保留上限清理，并记录格式/项目 schema/检索算法版本，旧快照兼容读取、未来格式拒绝。Token/cost 基础闭环已完成：Provider usage → Workflow diagnostics → Developer Panel；未配置单价时只展示 token。

## 三、统一数据流红线

```text
Renderer UI
  → typed preload/contextBridge
  → Main IPC + Zod
  → Domain Service
  → Markdown/YAML/JSON/图片源 + SQLite 索引/状态/审计
  → Result / runtime event
  → Renderer 可见状态
```

- Renderer 不直接访问 Node fs、SQLite、网络或 secret。
- API Key 只进系统安全存储；不得出现在项目、fixture、日志、审计或错误消息。
- AI 输出默认是 Suggestion、Proposal 或 Asset；Canon 和正文必须经过人工确认。
- 破坏性操作必须可回退、可 Diff、可审计；历史记录不能被“修复索引”静默清除。
- 文件路径必须在项目沙箱内校验；导出和备份不得覆盖项目内容。

## 四、每阶段验收门

允许执行：

```bash
npm run typecheck
git diff --check
node --check scripts/verify-runtime.mjs
node scripts/verify-runtime.mjs --long
node scripts/verify-ui-contract.mjs
node scripts/generate-fixtures.mjs /tmp/novel-studio-fixtures-audit
node scripts/verify-fixtures.mjs /tmp/novel-studio-fixtures-audit
node scripts/release-preflight.mjs
```

按当前约束不运行 `test` 和 `build`。真实 Provider 验证使用用户现场配置，但密钥不写入任何持久化证据；没有现场 UI/E2E 证据的章节继续标记为“部分”，不能凭静态代码标记完成。

## 五、当前执行队列

### 2026-09-03 复核补充

右侧“总结”快捷动作已纳入 Context Engine：当前章节/场景/选区先生成可回放的 Context manifest，再调用文本 Provider；结果仍只显示为摘要，不改写正文。Provider 设置的连接、模型能力、费用与密钥也已真正按 Tab 隔离渲染；项目没有默认 Provider 时，首次保存 profile 会自动设为默认。相关链路已加入 UI contract，且通过 typecheck 和静态差异检查。下一步仍以真实 Electron 黄金路径为证据边界，不能用 fixture 或静态检查替代人工/E2E 验收。

1. Writer/Agent/Canon/Illustration UI 黄金路径的人工核验和异常状态闭环（图片章节相对路径、旧 Workflow Run 章节路径恢复、工作台布局持久化、Timeline 引用边界校验、Focus Mode 和场景元数据底座已完成；真实 Electron E2E 仍待验收）。
2. 删除/移动后 Revision 与 Workflow 历史的展示和恢复策略（本轮已完成 Revision 历史列表、路径显示、删除正文后的只读保护和路径正确回退）。
3. Context 预算裁剪、token/cost 统计和可复现检索记录（预算裁剪、token/cost、Context Snapshot Replay、Snapshot retention、Embedding/RAG 基础链路、动态 context window、旧快照兼容/未来版本拒绝已完成；跨版本检索结果迁移和逐条差异仍待补）。
4. AI 调用审计包、migration rollback、插件/Community Workflow 和发布能力（基础 retrieval trace、AI metadata audit、诊断 JSON 已完成；Command Palette 实体快速打开已完成第一批）。

### 2026-09-03 开发增量

- Electron 黄金路径首段已通过：项目/章节/工作台打开后，Agent Chat 会先用 Main 权威项目配置校正 Renderer 的短暂旧快照，再经 Context manifest 调用 mock Provider 并显示 assistant 结果；未使用真实 API Key。
- Electron 黄金路径第二段已通过：Quick Action 生成 Suggestion 后，真实 UI 完成 Accept 写入与第二次 Suggestion 的 Reject；正文修改仍经过人工动作，未把 AI 输出直接写入 Canon。
- Electron 黄金路径第三段已通过：Canon Proposal 经底部 Canon Review UI 完成 Apply，再完成 Revert 并显示 `reverted` 状态；同时修复 preload 暴露 `canon.revert` 与 Renderer 误调用 `canon.revertProposal` 的合约漂移，并补充撤回异常反馈。
- Electron fixture 黄金路径现已完整通过：Workflow 两次人工暂停/恢复、Illustration Studio 提案/生成/刷新/插入/删除、临时目标导入、HTML 导出和备份创建均完成；`golden-path-electron.mjs` 共 10 个顺序步骤全部 passed。该证据不包含真实 Provider 网络调用。
- 开放格式切片已完成：Lore 条目保存到 `world/lore/<artifactId>.md`，删除时同步清理；删除统一 `story/artifacts.yaml` 后，`repairIndexes()` 可从 Lore Markdown 恢复 SQLite/统一索引。该链路已纳入 `verify-runtime.mjs --long`。
- 项目完整性切片已完成：`checkIntegrity()` 与 `repairIndexes()` 会校验 Lore Markdown front matter，返回 `invalidSourceFiles`；健康面板展示无效源文件并保留原文件，避免修复过程静默丢数据。
- 源文件校验已扩展到实体、Timeline、Relation 和统一 Story Artifact YAML，并用 `file#list[index]` 定位坏项；当前保持原文件不覆盖，后续再补 Asset sidecar 与逐类修复报告。
- Asset sidecar 已纳入同一校验边界：共享图片 provenance schema 在健康检查和索引修复中生效，损坏 sidecar 会被列出并原样保留。
- 本轮未运行 `test` 或 `build`；Electron runner、类型检查和契约检查已作为本地 fixture 证据，仍不能替代真实 Provider、真实用户项目或发布级完整 UI/E2E 验收。
- Provider 设置：未保存或已修改的 profile 不再进入连接测试流程，并显示先保存提示；图片连接测试通过 typed IPC 指定被编辑的 profile，不临时修改项目默认绑定。
- Agent/Workflow 状态：Context 检查、选区注入验证、Workflow 取消均增加进行中、成功和异常反馈；IPC 抛错时复位为可操作状态。
- Illustration Studio：空图片结果明确报错；插入成功与编辑器刷新失败分开提示；删除成功与资产列表刷新失败分开提示，避免用户因误报重复执行写入或删除。
- Illustration Studio：资产卡片和大图预览在 data URL 损坏时回退到带 Asset ID 的“图片资产不可用”占位，不再显示裂图或空白图片。
- Workflow：启动、Resume、Retry 会先显示即时状态，随后由 Main runtime event 覆盖为最终状态，减少队列或网络等待时的“点击无反应”错觉。
- AI Edit：Suggestion 的取消和 Retry 已统一走可捕获的 IPC 动作，失败会回到面板提示，不再产生未处理 Promise。
- 验证：`npm run typecheck`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs`、`node scripts/release-preflight.mjs`、`git diff --check` 已通过；未运行 `test`/`build`。

本轮已完成：项目完整性可视化面板、全局快捷键/Command Palette 动作，以及右侧章节 Workflow 按 `novel.yaml.defaultWorkflow` 路由。下一轮优先补稳定 Electron UI harness 或人工黄金路径证据，再进入 Story Bible 证据编辑器与高级检索。

随后已完成：伏笔结构化章节回链、Graph 实体/关系探索筛选、Context Snapshot 按来源差异展示、Revision 按段落/字符 Diff、章节图片相对路径闭环、旧 Workflow Run 路径兼容、工作台布局持久化、章节场景 sidecar/CRUD/移动删除回链。下一轮优先处理真实 Electron UI harness 的运行时依赖评估，以及把 sceneId 接入 Context/Workflow/Illustration。

### 本阶段完成

- Context Snapshot 持久化与 Replay 已接通：项目内快照文件、SQLite 索引、typed IPC、Context Inspector、稳定性与变更检测 smoke。
- Context Snapshot 已增加保留策略：每个章节最多 100 条、全项目最多 500 条；新快照写入后同步删除最旧的 SQLite 行和对应文件，清理限定在快照目录内。
- 迁移版本从 v13 推进到 v14；未改变正文、Canon、Revision 和 Workflow 的人工确认边界。
- Story Bible 条目 schema 已增加 Foreshadowing/Lore/Plot 关键字段校验；下一步继续补 Event 结构化字段和独立伏笔生命周期索引。
- Event 已增加 `causes/effects/locationId` 字段并完成 v15 migration、文件同步和旧项目兼容 smoke；独立伏笔生命周期索引仍在当前切片中。
- Foreshadowing 已增加 v16 独立查询索引，保存/删除/Bottom Panel 查询链路、状态筛选、证据摘要和章节跳转已通；下一步补事件参与者、证据专用编辑和异常旧数据报告。
- Event Timeline 已增加参与者多选、地点实体选择、causes/effects 编辑；下一步转入真实 UI 黄金路径和异常旧数据报告。
- 完成异常旧 Story Bible 数据报告：完整性检查与 repair 返回无效条目数量，生命周期索引跳过无效 Foreshadowing，避免默认状态掩盖数据问题。

### 当前切片验收记录

- Renderer 缺少可选菜单 bridge 时，App 不再白屏；无 `novelAPI` 时进入带提示的 Welcome。
- Provider 保存、文本连接测试、图片连接测试、profile/key 状态读取均有进行中、成功、失败反馈，并在异常时复位 busy 状态。
- Agent Chat 的 stream 启动异常、provider error、done、用户取消均会结束 streaming 状态；Suggestion/Memory 提取异常不会卡住操作按钮。
- Story Bible 和 Illustration Studio 的读取、保存、删除、场景提案异常会回到可操作状态并显示错误。
- 验证入口：`node scripts/verify-ui-contract.mjs`、`npm run typecheck`、`git diff --check`；按项目约束不运行 `test`/`build`。
- Diff 面板现在可查看当前章节历史；没有当前章节时查看项目级历史，章节已删除或路径失效的 Revision 只读展示，避免误覆盖。
- Revision 回退成功后按回退结果中的 `relPath` 刷新历史，不再依赖当前选中的章节路径。
- Context Manifest 现在记录 `budgetTokens`、`totalTokens`、`omittedSources`，每个被截断条目标记 `truncated/originalEstimatedTokens`；同一输入按优先级和原始顺序确定性裁剪。
- Provider 已提供 Main-owned `structured<T>` 入口；Memory Extractor 通过 parser/schema 校验结构化输出后才创建 Canon Proposal，避免业务层直接信任模型字符串。
- Context Manifest 额外记录 retrieval trace：query、selectionIncluded、各层候选数、选入来源与省略来源；后续诊断包应直接复用该 trace，不复制完整正文到日志。
- Developer Panel 可导出 metadata-only 诊断 JSON；AI invocation audit 只写调用类型、profile/model/requestId、消息数量/字符数、usage、结果和耗时，Workflow run 导出会剥离完整 input/output。
- 诊断导出使用独立 `diagnostics` IPC namespace；导出目标必须在项目目录外，审计读取最多最近 500 条记录，避免诊断操作反向膨胀项目源数据。
- Agent policy 采用默认类型化策略；Workflow 节点显式配置优先于 policy，policy 优先于全局 retry，参数最终在 Main Runtime 组装，Renderer 只编辑并保存配置，不执行策略。
- Workflow Variables 已接入：Editor 可维护变量默认值，Runtime 用 `{{name}}` 递归解析节点配置，运行时覆盖优先，未知变量执行前拒绝；验证使用 runtime smoke 和静态 UI contract。
- Workflow Effects 已接入：节点使用稳定幂等键；图片生成重试复用已保存资产，图片插入重试不重复写入 Markdown；幂等键不出现在 Provider 请求体。
- Persistent Jobs UI 已接入：`jobs:list` 经 typed IPC 到 Developer Panel；入队即显示 queued，运行/恢复同步状态、attempts、错误；仅 queued/running 可 Cancel，失败/取消可 Retry。
- 章节图片引用已统一为相对章节文件的 `../assets/scenes/...`，编辑器通过 Asset ID hydration 回读，删除兼容历史路径。
- 旧 Workflow Run 仅从唯一显式章节路径恢复 `relPath`，无法确定时安全拒绝，不从当前章节猜测。
- 三栏宽度、底部面板高度/折叠/最大化按项目路径持久化到 Renderer localStorage，并执行边界校验。
- 独立 HTML 导出会在 Main 侧读取项目图片并内嵌 data URL；缺失资产使用可见占位图，且通过项目路径沙箱校验。
- Timeline 新建/编辑事件时由 Main 校验章节文件、参与实体和地点类型；历史悬空数据只报告、不静默删除。
- Focus Mode 隐藏辅助工作区，仅保留当前主工作区，支持状态栏按钮、`⌘/Ctrl+Shift+F` 和 `Escape` 退出。
- 旧 Workflow Run 的章节路径恢复遵循“只恢复唯一显式路径”原则；无法判断时标记不可恢复、阻止 Resume，并引导用当前章节重新运行，避免历史 Run 被错误套用到当前章节。
- 章节场景结构已完成第一阶段：sidecar 使用 `chapters/<chapter>.scenes.yaml`，Main 负责 schema/段落范围/原子写入，Renderer 提供场景列表和 CRUD 状态反馈；场景 CRUD 不修改 Markdown，章节移动/删除同步更新 sidecar 与 `chapter_scenes` 派生索引。

### 本轮蓝图全量复核（2026-09-02）

已重新读取蓝图 DOCX 并逐项核验第 1–35 章。`node scripts/verify-runtime.mjs --long`、`node scripts/verify-ui-contract.mjs`、`node scripts/release-preflight.mjs`、`npm run typecheck` 和 `git diff --check` 通过；按约束未运行 test/build。

当前验收口径：运行时基础闭环已通，核心产品闭环不是 mock；但完整 Electron 黄金路径、真实 Provider 现场结果、低端性能、插件/Community Workflow、i18n/accessibility 完整验收、打包签名/公证/自动更新和 schema rollback 仍保持未完成或部分状态。后续开发必须先补这些证据/能力，再继续扩展 UI。

本轮场景切片验收：`npm run typecheck`、`node scripts/verify-runtime.mjs --long`、`node scripts/verify-ui-contract.mjs` 和 `git diff --check` 通过；runtime 报告 `migrationUserVersion=19`、`sceneStructure.created/persisted/unchangedMarkdown/deleted=true`、章节移动 `sceneRemapped=true`、章节删除 `sceneRemoved=true`。Context 与 Workflow 已消费 `sceneId`，并由 `contextBudget.sceneScoped`、`workflowSceneScope` 记录证据；Writer 选择场景后会定位并选中对应正文范围。

Workflow 恢复规则已加固：Retry 只复用历史 Run 自己的章节路径和场景 ID，不能因用户切换当前章节而改变恢复目标；启动/Retry/Resume 的异常会清理 busy 状态并显示失败原因。当前仍需真实 Electron 验收跨章节切换后的 Retry 点击路径。

章节组织切片已增加卷树：卷元数据写入 `story/volumes.yaml`，Sidebar 按卷分组，章节归属可直接调整；章节移动/删除通过 `ChapterService` 的路径回链接口同步卷文件。runtime 已验证 `volumeTree.created/assigned/remapped/sourcePersisted=true`。

卷树排序已接入：章节拖拽调用 `chapter.move`，卷拖拽调用 `volume.reorder`，跨卷拖拽会同步章节归属。仍需真实 Electron 验收拖拽手势和大章节列表体验。

图片 Provider profile 边界复核：显式缺失 profile 不得回退到首个配置；当前已改为明确拒绝，并由长 runtime smoke 报告 `imageProvider.missingProfileRejected=true`。本切片仍不等同于真实网络 Provider 或完整 Electron E2E 验收。

黄金路径开发增量：stable launcher 现在支持可选 CDP 端口；CDP driver 只使用页面公开 preload 和 DOM selector。当前 runner 已在隔离 fixture 中完成项目/章节/工作台、Chat/Suggestion/Canon/Workflow/Illustration、备份/导入/HTML 导出的连续操作；通过 preload 打开项目后主动 reload 复用现有 bootstrap，避免 Renderer store 留在 Welcome 状态。该链路仍不代表真实 Provider 或发布级完整 E2E。

本轮进一步发现 reload/bootstrap 方案存在间歇性 Welcome 恢复竞态；runner 已通过等待 Main 项目状态与 UI 工作台状态收敛来规避，并完成 Chat 后续工作区步骤验证。

随后完成 Illustration Studio 的第一段 sceneId 消费：选中场景时，Image Proposal 只读取对应段落并回传 `sceneId`；未选中场景仍走整章兼容路径。长篇 runtime smoke 报告 `sceneProposalScoped=true`。随后同一稳定 ID 已接入 Context 请求与 Workflow 输入/图片节点。

### 2026-09-03 迁移报告切片

- 数据库迁移现在保留 typed report：起始/最终 schema 版本、实际应用的版本与名称、迁移状态；项目完整性接口和健康面板共享该报告。
- `migration-v1` fixture（实际起始 user_version 为 2）已核验从 v2 升级到 v19，并确认 17 个迁移按连续版本执行。报告是可观测性，不宣称支持 schema rollback。

### 2026-09-03 增量备份切片

- 以“全量包 manifest → 变更/新增/删除差异 → 基准叠加恢复”为垂直切片，Main 负责哈希、归档、路径校验和恢复，Renderer 只通过 typed preload 触发。
- runtime 已验证变更章节可从全量包与增量包恢复，内部 manifest 不会成为项目源文件；不支持增量链，真实用户项目/跨版本兼容仍需发布验收。
