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

跨版本 Embedding/RAG 的结果迁移、完整 Inspector/诊断包、i18n/accessibility、插件签名/权限、Community Workflow、安装包签名、公证、更新、实际 telemetry 事件策略。Embedding 基础链路已完成：Provider → 内容哈希索引 → 余弦检索 → Context/FTS fallback；Context budget 会按已发现模型窗口收敛，Snapshot 按章节/项目保留上限清理，并记录格式/项目 schema/检索算法版本，旧快照兼容读取、未来格式拒绝。Token/cost 基础闭环已完成：Provider usage → Workflow diagnostics → Developer Panel；未配置单价时只展示 token。Telemetry 的默认关闭、明确同意和撤销设置已完成，当前不执行网络上报。

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
3. Context 预算裁剪、token/cost 统计和可复现检索记录（预算裁剪、token/cost、Context Snapshot Replay、Snapshot retention、Embedding/RAG 基础链路、动态 context window、旧快照兼容/未来版本拒绝、跨版本检索重新计算和逐条来源差异均已完成）。
4. AI 调用审计包、migration rollback、插件/Community Workflow 和发布能力（基础 retrieval trace、AI metadata audit、诊断 JSON 已完成；Command Palette 实体快速打开已完成第一批）。

### 2026-09-03 开发增量

- Electron 黄金路径首段已通过：项目/章节/工作台打开后，Agent Chat 会先用 Main 权威项目配置校正 Renderer 的短暂旧快照，再经 Context manifest 调用 mock Provider 并显示 assistant 结果；未使用真实 API Key。
- Electron 黄金路径第二段已通过：Quick Action 生成 Suggestion 后，真实 UI 完成 Accept 写入与第二次 Suggestion 的 Reject；正文修改仍经过人工动作，未把 AI 输出直接写入 Canon。
- Electron 黄金路径第三段已通过：Canon Proposal 经底部 Canon Review UI 完成 Apply，再完成 Revert 并显示 `reverted` 状态；同时修复 preload 暴露 `canon.revert` 与 Renderer 误调用 `canon.revertProposal` 的合约漂移，并补充撤回异常反馈。
- Electron fixture 黄金路径现已完整通过：Workflow 两次人工暂停/恢复、Illustration Studio 提案/生成/刷新/插入/删除、跨章节 Retry、临时目标导入、HTML 导出、备份创建和 Telemetry 启用/撤销均完成；`golden-path-electron.mjs` 共 15 个顺序步骤全部 passed。该证据不包含真实 Provider 网络调用。
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
- Workflow：右侧面板现在锁定已选中的 Run；切换到其他章节不会改写 Retry/Resume 的历史 `relPath`，只有没有锁定 Run 时才按当前章节选择记录。
- 备份兼容：原始 SQLite v2 项目先打包、再恢复并由当前应用迁移至 v19；增量备份新增/删除文件的叠加恢复也纳入回归测试和 runtime smoke，真实用户项目兼容仍需现场验收。
- Context 兼容：Replay 现在显式返回来源版本、`resultStrategy=recompute` 和 `sourceResultReusable=false`，旧检索结果只作为差异基线，不直接复用。
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

2026-09-08 增量：SQLite migration 失败路径现在会在事务回滚后校验 `PRAGMA user_version` 是否恢复到起始版本，并关闭失败连接；错误会明确标注回滚结果。新增失败后重新打开数据库的回归测试，证明部分 migration 不会留下表或版本副作用。该证据仍不替代跨版本备份恢复与发布级安装验收。

2026-09-09 增量：Main 进程的窗口加载失败、渲染进程退出和扩展配置/恢复日志统一经过 `redactSensitive`；诊断安全测试新增 `access_token`、`refresh_token`、URL 多参数和含数字 Base64 图片 data URL 场景。发布清单中的生产日志最终人工审查仍保留未完成状态。

2026-09-09 更新编排切片：依据蓝图 §31 增加 Main-owned `UpdateService`，清单入口和工件地址均要求无凭据 HTTPS；按 stable/beta、平台/架构、最低版本和 semver 选择更新，下载使用现有流式大小上限、SHA-512 校验和 atomic write。新增 typed `update:check/download/cancel/event` IPC，Renderer 以 IDE 风格状态卡展示检查、可用版本、release notes、进度、取消和失败重试。该切片只负责校验后安全暂存，不执行安装切换；更新服务器、签名、公证、自动更新和回滚仍未完成。

2026-09-10 项目打开索引同步切片：发现新建或打开含有 Markdown 章节、但 `.novel/project.db` 尚无 `documents` 行的项目，会在完整性面板显示“磁盘章节数与索引数不一致”。新增 Main 侧项目生命周期边界，在 `project:create` 和 `project:open` 成功后调用 `ChapterService.rebuildIndex()`，确保磁盘章节进入可重建的 SQLite/FTS 派生索引；正文和其他项目源文件仍不被改写。新增服务级回归测试覆盖默认章节、重新打开后新增章节，以及指定用户项目的 Electron smoke（使用临时副本），结果为 `warnings=0`、`chaptersIndexed=chaptersOnDisk=1`。真实用户项目现场的数据库同步只在用户实际打开项目时发生，原项目源文件未被修改。

2026-09-09 v0.8 Graph/Timeline 前置切片：Foreshadowing 底部面板增加生命周期 dashboard，统一显示总量、各状态计数、回收进度和证据覆盖率；无章节证据的条目会显式提示，状态摘要按钮可直接驱动现有筛选。统计是 Renderer 侧不可变派生数据，不修改 Canon 或项目源文件，并由纯函数测试覆盖空项目与混合状态。

2026-09-09 v0.8 Graph 邻域探索切片：Graph Studio 增加“聚焦邻域/显示全图”操作；选中实体后仅保留其一跳关系及关联实体，清除聚焦恢复完整图谱。过滤在 Renderer 侧通过不可变派生函数完成，不改变 Story Relation 数据；覆盖有向关系两端、孤立节点和空聚焦状态测试。

2026-09-09 §26 国际化基础切片：新增 Renderer-owned UI locale contract，支持 `zh-CN`/`en-US`，非法或缺失值安全回退中文；locale 通过独立 localStorage key 持久化，与项目 manifest 的内容语言分离。顶部 Shell 已接入界面语言选择器、项目健康、命令搜索、模型提示、连接状态、字数和 Focus Mode 文案；完整工作区文案迁移和端到端键盘验收仍待继续。

2026-09-09 §26 locale 订阅切片：将 UI locale 提升为 Renderer 全局订阅源，并广播变更事件；Welcome 和 Sidebar 的项目创建/打开、恢复、最近项目、Explorer/Chapters/Story Bible 等主入口文案开始消费 i18n key。项目内容语言未被改写；其余工作区文案迁移和端到端无障碍验收仍待继续。

2026-09-04 Community Workflow 数据包切片：依据蓝图 §24 增加 `novel-studio.community-workflow` v1 纯 JSON 包格式，包含 Workflow、Prompt、变量、权限和扩展依赖元数据。导入前执行严格 schema/DAG/依赖校验，敏感字段（secret、API key、token、password 等）和任意未知包字段拒绝；通过 atomic write 写入项目 `workflows/`，失败不会替换已有文件。导出仅允许写到项目目录外，并使用 canonical path 防止 macOS `/tmp` 符号链接绕过。Main 提供 preview/install/export typed IPC，Renderer 仅通过 preload 调用；Workflow Editor 提供权限/依赖预览后的导入确认和数据包导出。该切片仍不包含社区市场、网络分享、签名发布或外部代码执行。

2026-09-04 更新安全基础层：新增 stable/beta update manifest schema，限制平台/架构、最低版本和不带凭据的 HTTPS 工件地址；Main 侧新增 SHA-512 与文件大小校验及版本选择函数，发布预检会确认这些安全原语存在。真实下载 channel、签名、公证、更新服务器和安装后回滚仍需发布环境与人工验收，当前不宣称自动更新已完成。

2026-09-04 无障碍切片：编辑器格式工具栏改为显式 `button type="button"`，为标题、强调、列表、引用、撤销/重做和选区清除提供 aria-label/title；标题、粗体、斜体、列表、任务列表和引用使用 `aria-pressed` 暴露当前状态，工具栏自身使用 `role="toolbar"`。项目完整性弹框新增初始焦点、Tab/Shift+Tab 焦点循环、Esc 关闭及关闭后焦点恢复；底部工作区新增 `tablist`/`tabpanel` 语义、选中状态和箭头/Home/End 键盘导航；Command Palette 暴露 dialog/listbox/option 语义及当前选项；Provider 设置弹框补充 dialog 语义、焦点循环和关闭后焦点恢复；图片预览 modal 补充焦点循环、Esc 关闭和关闭后焦点恢复；Graph 实体节点支持 Tab 聚焦、Enter/Space 选中及可见 focus ring。颜色仍只作为视觉增强，不承担唯一状态信号；完整全局 i18n key 迁移和端到端键盘审查仍待补。

2026-09-04 Command Palette 焦点隔离切片：命令面板打开时将焦点移入搜索输入，Tab/Shift+Tab 在面板内循环，关闭或 Escape 后恢复打开前焦点；通过 `dialogRef` 限定可聚焦元素范围，避免键盘焦点离开模态面板。该切片只覆盖静态契约，完整全局键盘路径和 Electron 无障碍现场验收仍待补。

2026-09-05 Electron 黄金路径生命周期切片：真实窗口 15 步 fixture runner 已验证项目/章节打开、选区工具条与拒绝、Agent Chat、独立 Chat/Diff、Suggestion Accept/Reject、Canon Apply/Revert、Workflow 两次人工暂停恢复、跨章节 Retry、Illustration、导入导出备份、长通知布局和 Telemetry 同意撤销。修复 runner 超时定时器未清理导致报告输出后 Node 仍挂起的问题；稳定启动器现在等待 Vite/Electron 子进程退出并在超时后 SIGKILL，CDP WebSocket 与 fixture HTTP server 的关闭均有界等待。此次证据仍只使用临时 fixture/mock Provider，不等同于真实用户项目、真实 Provider 或发布级安装验收。

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
2026-09-05 Graph Studio 现场验收：黄金路径先通过 typed preload 建立 fixture 实体和关系，再从 Graph Studio 关系列表进入编辑，修改关系类型与 JSON metadata，保存后分别用界面回显和 `listRelations()` 做 metadata-only 校验，最后从界面删除并确认持久化删除。该步骤仅覆盖临时 fixture/mock Provider。
2026-09-05 项目完整性异常恢复：先以损坏实体 YAML、Relation YAML、Timeline YAML 编写失败测试，再让 `repairIndexes()` 逐文件捕获解析错误并返回 `invalidSourceFiles`。验证修复流程不中断、原始源文件不被覆盖、合法索引不因坏文件误写；悬空引用继续用字段级路径报告。
2026-09-05 Story Bible Timeline 现场验收：为 Timeline 编辑器补充稳定 selector，在真实 Electron 中创建并选择事件，修改参与者、地点、原因、结果和描述；通过 `listTimeline()` 和再次打开表单验证持久化与回显，再从 UI 删除事件。
2026-09-05 Context Replay 迁移差异：将来源版本、项目 schema、重算策略和迁移 notes 固定展示在 Inspector，并为每条来源差异提供稳定标识；黄金路径先修改章节制造差异，回放后校验 UI 显示迁移策略和逐来源差异，再恢复原始章节。
2026-09-05 Developer Inspector 可观测性：先补失败契约测试，再增加 Runs/Jobs 状态过滤和 metadata-only trace 区块；筛选只作用于 Renderer 内存展示，诊断导出仍由 Main 负责脱敏和路径沙箱。
2026-09-05 Developer Inspector 真实验收：在 Electron fixture 中实际切换 Run/Job 的 failed 筛选，选择 Run 与节点并检查 metadata-only trace。发现失败节点缺少 diagnostics 时字段整块隐藏，改为统一显示 Profile/Model/Request/token/cost/Context/error category，缺失值显示 `—`。完整黄金路径 19 步通过；证据仍限于临时 fixture/mock Provider。
2026-09-08 Workflow 取消现场验收：新增真实 Electron UI 步骤，点击运行后等待 Cancel 按钮，再点击取消并以 `listRuns(false)` 验证 `cancelled`，最后确认 UI 恢复可运行。同步将选区拖拽坐标改为 Range 首末 client rect，解决多行文本整体包围盒中线导致的偶发选区失败。黄金路径 20 步通过，证据仍限于临时 fixture/mock Provider。
2026-09-08 发布清单同步：Workflow 的取消、超时、幂等行为已分别由 Electron UI 取消步骤和 runtime smoke 覆盖，勾选为“本地 fixture 已验收”，并保留真实 Provider/用户项目/低端设备发布验收边界。

2026-09-09 §26 i18n 工作区增量：底部工作区 tab、笔记保存状态/操作、独立 Chat 入口、项目完整性弹框的核心状态文案已接入 Renderer-owned `useUiText()`；右侧 Agent 的 Chat 取消反馈也使用统一 key。中英文 locale contract 与静态集成测试保持通过，完整工作区文案迁移和真实 Electron 双语键盘验收仍待继续。

2026-09-09 §26 i18n 右侧面板增量：Agent/Workflow tab、Ask Agent、独立 Chat、选区验证/取消、Workflow 运行/取消入口已消费统一 i18n key；核心 UI 文案迁移通过全量 Vitest、typecheck、build 与 diff 校验。右侧诊断详情、Suggestion/Context/Workflow 状态及真实 Electron 双语键盘验收仍待继续。

2026-09-09 §26 i18n 状态反馈增量：右侧 Agent/Workflow 的 Provider 前置提示、章节/选区校验、Suggestion 接受/拒绝/重试反馈已接入统一 key；全量 81 个测试文件、248 项测试及构建通过。诊断详情和其余动态 Workflow 状态文案仍待迁移。

2026-09-09 §26 i18n Context 增量：右侧 Context Inspector 的标题、检查注入内容、全部展开/收起入口已接入统一 key；全量测试与构建再次通过。Context 详情、Workflow 状态和完整双语 Electron 验收仍待继续。

2026-09-09 §26 i18n 完整性摘要增量：项目完整性弹框的标题、副标题、关闭按钮、检查状态及数据库 schema 状态文字已接入统一 key，避免 schema 信息出现突兀的中英混排；全量测试与构建通过。完整弹框详情和其余动态诊断文案仍待迁移。

2026-09-09 §26 i18n 完整性详情增量：项目完整性的问题分组、最近一次修复标题及底部修复/重新检查动作已接入统一 key；全量测试与构建通过。统计卡片及动态错误详情仍保留后续迁移项。

2026-09-09 Electron 黄金路径回归修复：CDP 拖选的 `mouseMoved` 事件补充 `buttons: 1`，修复 Electron 中正文选区偶发为空导致 BubbleMenu 不出现的问题；Workflow 运行/取消验收改用稳定 `data-running` 属性，不再依赖本地化按钮文字。重新执行黄金路径 20 步全部通过，选区、Chat/Context、Suggestion、Canon、Workflow、插图、Graph、备份导入导出、通知布局、Telemetry 和 Developer Inspector 均有通过证据。

2026-09-09 UI 合约本地化修复：`verify-ui-contract.mjs` 中 Focus Mode、项目完整性、卷树检查改为验证稳定 i18n key，不再因界面中文被迁移为可切换文案而误报；UI 合约与 `verify-runtime.mjs --long` 均通过。

2026-09-09 发布门禁复核：`npm run verify:release`、`verify:packaging`、`verify:artifacts` 全部通过；当前 `release/` 中 Windows NSIS 安装包与 macOS arm64 DMG 均存在且体积有效。该证据只证明本地产物与配置可用，签名、公证、实际安装和跨平台现场验收仍未完成。

2026-09-09 蓝图验收回归：`verify-ui-contract.mjs` 修正为检查稳定 i18n key 后全部通过；`verify-runtime.mjs --long`、Electron 黄金路径 20 步、全量 Vitest（81 文件/248 项）和 typecheck 均通过。当前仍未将本地 fixture 证据等同于真实用户项目、真实 Provider、低端设备或发布安装验收。

2026-09-09 测试覆盖率基线：新增 `npm run test:coverage` 与 V8 JSON/文本报告配置；补充场景服务路径安全、CRUD、重排和索引同步测试后，真实运行 82 个测试文件、252 项测试通过，场景服务 Lines 达 94.20%，全局 Statements 54.98%、Lines 62.93%、Branches 41.15%、Functions 54.47%，仍未达到蓝图 §21 的 80% 目标。主要缺口集中在 Renderer 组件、Provider/Image/Workflow 服务，后续按高价值路径补充测试，不通过排除目录伪造门禁。

2026-09-09 选区动作稳定化：Selection Action 增加唯一 `id`，BubbleMenu 输出 `data-action`，黄金路径改用稳定 selector 触发“选中/改写”，保留现有中文 label、Prompt 和“选中/取消选中”互斥逻辑；类型检查与 Electron 黄金路径 20 步通过。
2026-09-11 §26 i18n 独立 Chat 增量：独立 Chat 工作区的 shell、会话管理、上下文来源、scope chips、输入与发送/停止入口接入 Renderer-owned `useUiText()`；action 分支仍使用稳定原始 action 值，确保切换英文 locale 后点击行为不漂移。新增 ChatWorkspace i18n 契约测试并通过相关测试与 typecheck；操作反馈和其余工作区的完整双语验收仍待继续。
2026-09-11 §26 i18n WorkflowEditor 增量：WorkflowEditor 标题、保存/校验、社区 Workflow 导入导出、Properties/Variables 及节点 Agent Policy 表单接入 Renderer-owned `useUiText()`，并覆盖折叠按钮和字段 aria-label/title。新增 WorkflowEditor i18n 契约测试，相关测试与 typecheck 通过；动态错误反馈、节点目录 label 和其余工作区双语验收仍待继续。
2026-09-11 §26 i18n Story Bible 增量：Story Bible 实体工作区标题、实体类型、新建/搜索/空状态和表单标题接入 Renderer-owned `useUiText()`；实体名称、别名和字段数据仍按项目原文展示。新增 Story Bible i18n 契约测试，相关导航/Timeline 测试与 typecheck 通过；Timeline/Artifact 表单和完整双语验收仍待继续。
2026-09-11 §26 i18n Story Bible 字段增量：实体字段目录通过 locale 映射展示，字段 key 与实体源数据保持不变；人物/地点/组织/物品字段在英文界面显示对应英文标签。Story Bible 实体、导航和 Timeline 相关测试及 typecheck 通过，Timeline/Artifact 表单迁移仍待继续。
2026-09-11 §26 i18n Story Bible Timeline 增量：Timeline 新建/筛选/排序/空状态、事件字段、保存删除入口及伏笔证据编辑器固定文案接入 Renderer-owned `useUiText()`；事件与证据内容仍按项目数据展示。相关 Story Bible/导航/Timeline 测试与 typecheck 通过，Artifact 其余字段和动态反馈仍待继续。
2026-09-11 §26 i18n Story Bible Artifact 增量：Plot/Foreshadowing/Lore/Notes 的条目类型、新建/编辑、空状态、标题/Notes 与保存删除入口接入 Renderer-owned `useUiText()`；Artifact 字段 key、状态值和源数据保持不变。相关 Story Bible/导航/Timeline 测试与 typecheck 通过，动态错误反馈和完整双语验收仍待继续。
2026-09-11 §26 i18n Story Bible Artifact/Timeline 范围核对：Artifact 类型、表单字段和证据入口与 Timeline 固定显示继续统一使用 locale key；加载/保存/删除的动态反馈仍存在组件内拼接，已明确列为下一步。项目源数据和 API 错误详情保持原样，相关测试与 typecheck 通过。
2026-09-11 §26 i18n Story Bible 动态反馈：实体/Timeline/Artifact 的加载、保存、删除、证据校验成功/失败反馈接入 locale key，API 错误详情作为插值原文保留；相关 Story Bible/导航/Timeline 测试与 typecheck 通过，完整双语 Electron 验收仍待继续。

2026-09-14 §26 i18n Workflow/诊断元数据：RightPanel Workflow 运行卡片和 Developer Panel 诊断详情中的固定运行标签改为 locale key，动态 Run ID、路径、模型值和错误内容保持原文；相关 i18n 契约、全量测试、typecheck、build 与 UI contract 通过，真实 Electron 双语诊断路径仍待验收。

2026-09-14 扩展包卸载回滚残留：卸载成功后清理上一版本目录与回滚权限快照；元数据清理失败按提交后尽力清理处理，避免已完成卸载进入错误恢复分支。补充 2 个回归场景，全量 124 个测试文件/466 项、typecheck 与 build 通过。

2026-09-14 备份恢复原子提交：全量/增量备份先在 staging 目录完成解压、路径与项目 schema 校验，再交换到空目标目录；校验失败不留下半恢复文件。新增失败恢复回归测试，全量 124 个测试文件/467 项、typecheck 与 build 通过。

2026-09-14 备份 manifest 完整性：恢复新式全量/增量备份时按 manifest 的 SHA-256 逐文件校验，拒绝内容篡改；旧式无 manifest 备份保持兼容。新增篡改归档回归测试，全量 124 个测试文件/468 项、typecheck 与 build 通过。

2026-09-14 RightPanel 溢出基线：右侧 Agent/Workflow 内容区补充 `min-width: 0`、横向隐藏和纵向滚动约束，长步骤名在栏内换行；收紧布局契约测试，typecheck 与 build 通过，真实低端设备/Electron 滚动现场仍待验收。

2026-09-14 长篇 runtime 基线复测：`verify-runtime.mjs --long` 通过 1000 章/1000 实体/100000 facts，repair/list/integrity 为 544/14/584ms；3 次 benchmark 平均 424/10/347ms。仅作为本机 fixture 对照，不替代低端设备和真实 UI 验收。

2026-09-14 更新并发状态：新一轮更新检查开始前取消进行中的旧下载，避免过期工件在新检查后进入 ready；新增并发回归测试，全量 124 个测试文件/470 项、typecheck 与 build 通过。真实平台安装切换仍待发布环境验收。

2026-09-14 备份 manifest 文件集合校验：恢复时双向比对归档实际文件与 manifest 声明，拒绝未声明或缺失文件，再校验 SHA-256 内容；新增额外文件回归测试，全量 124 个测试文件/471 项、typecheck 与 build 通过。

2026-09-14 备份 manifest 错误边界：损坏 JSON 统一转换为 `INVALID_PROJECT` 稳定提示，避免原始解析异常穿透；新增回归测试，全量 124 个测试文件/472 项、typecheck 与 build 通过。

2026-09-14 发布预检回归：`verify:release` 与 UI contract 89 项全部通过；本地产物和代码级安全检查不替代真实签名、公证、安装及 Electron 现场验收。

2026-09-14 备份符号链接安全：恢复前通过 zip Unix 文件类型检查拒绝 symlink，避免 `unzip` 还原后跟随外部路径；新增回归测试，全量 124 个测试文件/473 项、typecheck 与 build 通过。

2026-09-14 更新过期事件抑制：旧下载被新检查/新下载淘汰后不再发送过期 idle、progress 或 ready，避免覆盖当前更新状态；补充事件顺序回归，全量 124 个测试文件/473 项、typecheck 与 build 通过。

2026-09-14 依赖安全审计复核：`pnpm audit --audit-level high` 仍报告 extract-zip 上游 2 个 high advisory；仓库 patch 已拒绝 symlink 条目并有测试/预检覆盖，发布签核继续保留该风险。

2026-09-14 Workflow 运行卡片长文本：节点 ID、错误和日志子项补充最小宽度与强制换行约束，避免右栏横向溢出；新增布局契约测试，typecheck 与 build 通过，真实多分辨率现场仍待验收。

2026-09-14 项目完整性超时边界：定位 `ProjectHealthPanel` 无限等待 IPC 导致 loading 卡死的根因，加入完整性检查/索引修复 15 秒超时与操作代次保护；超时后展示可重试错误且忽略迟到响应。全量单 worker 测试 124 个文件/476 项、typecheck、build 与 diff check 通过，真实 Electron 故障注入仍待验收。

2026-09-14 Explorer 长列表整体滚动：定位 Sidebar `overflow:hidden` 裁掉多卷章节和 Story Bible 的问题；保留虚拟章节窗口，同时让 Sidebar 负责纵向滚动并隐藏横向溢出。全量单 worker 测试 124 个文件/477 项、build 与 diff check 通过，低端设备滚动基线仍待验收。

2026-09-14 Provider Mock 显式边界：定位 `AiService` 对 `profile_mock` 的隐式兜底，改为仅允许显式 fixture 选项启用；生产 Main 默认拒绝未配置 Mock profile，避免正常用户路径获得虚假 AI 成功。同步让完整性弹框卸载时使待返回操作失效，避免迟到响应更新已关闭 UI。全量单 worker 测试 124 个文件/478 项、typecheck、build 与 diff check 通过，真实 Provider 连接仍待验收。

2026-09-14 全局 IDE 通知桥：新增 `notifyGlobal()` 事件桥，App 统一校验并消费通知，RightPanel 局部反馈同步进入右下角 `NotificationCenter`，并保留面板内上下文；修复 action/system 同步 effect 误删 `global-*` 通知的问题。右侧折叠继续保留原 Bot 图标及两态 hover/可访问交互。聚焦通知、右栏布局测试 17 项、typecheck、build 与 UI contract 通过，真实 Electron 视觉验收仍待继续。

2026-09-14 全 Renderer 反馈统一通知：CanonReview、DeveloperPanel、IllustrationStudio、ProjectHealthPanel、ProviderSettings 与 RightPanel 全部通过 `useGlobalMessage()` 同步到右下角 NotificationCenter，同时保留原面板内状态文案。新增全局 feedback surface 契约；全量 125 个测试文件/481 项、typecheck、build、UI contract 与 diff check 通过，真实 Electron 视觉验收仍待继续。

2026-09-14 Workflow 输入上下文 envelope：Runtime 新增 typed `NodeInputEnvelope`，统一向节点提供 `value`、已解析 `context` 和此前 `outputs`；AI 节点直接消费该边界，原 input 形状与 Human pause/resume、retry、cancel 兼容。Workflow Runtime/Service 聚焦测试 24 项、typecheck 与 diff check 通过，全量回归与真实 Provider/Electron 验收仍待继续。
2026-09-14 Workflow 运行级 side-effect 状态复用：成功节点将幂等键与输出写入 `WorkflowRun.sideEffects`，恢复/重试时先复用已持久化副作用并跳过 executor；补充成功复用回归，相关聚焦测试 40 项、全量单 worker 131 文件/521 项、typecheck、build、UI contract 与 diff check 通过。该切片仍不等同于跨进程 ledger，副作用完成与持久化之间的崩溃窗口及空结果标记仍待继续。

2026-09-14 右下角全局通知定位：修复 NotificationCenter 仍停留在顶部的问题，改为右下角固定堆叠并限制整体高度；多行文本和左侧状态竖线继续垂直居中、自动换行。通知相关 6 项、typecheck、build 与 diff check 通过，真实 Electron 多分辨率视觉验收仍待继续。

2026-09-14 Graph 高级关系探索：补齐选中实体检查器，展示实体类型、别名、备注与入/出向邻接关系；点击邻接项可切换到邻居，聚焦按钮复用有界多跳 BFS，不触碰持久化数据。新增纯逻辑/UI 契约测试共 6 项，聚焦 Graph 测试 10 项、typecheck、build、UI contract 与 diff check 通过，真实 Electron 视觉和低端设备基线仍待验收。

2026-09-14 Graph 键盘激活：修复 GraphBlock 只有键盘语义、没有明确选择回调的问题；节点通过稳定实体 ID 调用统一选择路径，鼠标与 Enter/Space 均可打开实体检查器，保留完整实体元数据。Graph accessibility/inspector 聚焦测试 7 项、typecheck、build 与 diff check 通过，真实 Electron 键盘现场仍待验收。
2026-09-14 稳定 Electron 入口诊断：确认 `out` 主进程/preload 已生成，实际缺失的是 npm Electron 的 macOS 原生 binary；`pnpm rebuild electron` 在下载源连接超时后失败。稳定启动脚本新增跨平台路径解析和分层错误提示，避免把运行时缺失误报为 out 产物缺失；路径契约、typecheck、build、UI contract 与 diff check 通过，真实 Electron 现场仍待外部下载恢复。
2026-09-14 Timeline 日期国际化：轨道轴线日期通过当前 UI locale 和 UTC 格式化，不再直接依赖系统区域设置；新增中英文日期回归测试，Timeline 数据与选择逻辑不变。
2026-09-14 完整性超时工具分支覆盖：为 `withTimeout()` 补充成功、底层失败、超时后的迟到 resolve/reject 测试，确认完整性弹框不会被迟到 IPC 结果改写；相关测试 9 项、typecheck 与 diff check 通过。覆盖率当前 Statements 80.21%、Branches 64.3%，整体分支目标仍待继续补齐。
2026-09-14 Illustration Prompt 边界：补充 `compileImagePrompt()` 的可选方向、实体视觉身份、结构化字段和空锚点测试；空白 `visualAnchors` 现在 trim/filter 后才发送给 Provider，避免生成无意义的 `Visual anchor:` 行。Image Prompt/ImageService 聚焦 12 项、typecheck 通过。
2026-09-14 Canon Knowledge Leak：为 `knowledge.*` 事实增加可解释的章节边界 warning；当 `validFrom` 晚于可解析的 source chapter 时报告 `knowledge-leak`，但保持 Proposal 人工门禁和 Apply 的 error-only 阻断策略。Canon/Workflow 聚焦测试 33 项、typecheck、build 与 diff check 通过。
2026-09-14 Provider/Context 合约覆盖：补充 Provider URL 的 HTTPS/本机 HTTP 与凭据/query 拒绝，以及 Context window/reserved output budget 边界测试；共享 AI 合约聚焦 3 项通过。
2026-09-14 Timeline 轨道可视化：在现有 Timeline 筛选、分组和编辑路径上增加只读轨道概览；有效故事时间映射为可点击点位，未填写或无法解析的时间单独列出，所有点位与标题均保留键盘 focus 语义。新增模型/UI 契约测试，聚焦测试 2 文件/6 项、typecheck、build、UI contract 与 diff check 通过；真实 Electron 多分辨率与低端设备滚动现场仍待验收。
2026-09-14 Canon 故事时间数值比较：统一使用章节序号比较 `validFrom`/`validTo` 和历史范围，修复 `chapter:10` 与 `chapter:2` 的字符串排序错误；补充无效范围及数值不相交范围回归，Canon/Review/Project 聚焦 28 项、build 与 diff check 通过。
2026-09-14 Canon Relation Proposal 闭环：`relation.update` 现在保存变更前后关系快照，Apply 才写入 Story Relation，Revert 恢复旧关系；新增 `canon:propose-relation` typed IPC/preload 和 CanonReview 独立关系摘要，避免按事实字段渲染导致崩溃。聚焦 18 项、typecheck、build 与 diff check 通过，真实 Electron 视觉路径仍待验收。
2026-09-14 Graph 关系提案入口：Graph Studio 对已有关系提供 Human-gated Canon 提案按钮，编辑内容仅进入待审核队列；CanonReview 复用 Apply/Revert 闭环并对关系摘要安全渲染。Graph/Canon 聚焦 15 项、typecheck、build、UI contract 与 diff check 通过，真实 Electron 点击路径仍待验收。
2026-09-14 Canon Fact Update 闭环：`fact.update` 现在保存前后事实快照，Apply 更新 Canon fact，Revert 恢复原事实和 source；Chat 携带合法事实 ID 时走更新提案，无 ID 仍走新增提案。Chat/Canon/Memory 聚焦 22 项、typecheck、build、UI contract 与 diff check 通过，真实 Electron 审核现场仍待验收。
2026-09-14 Canon Timeline Add 闭环：`timeline.add` 现在进入待审核 Proposal，Apply 才写入 `story/timeline.yaml`，Revert 删除事件；新增 `canon:propose-timeline` typed IPC/preload 和 CanonReview 时间线摘要。聚焦 20 项、typecheck、build 与 diff check 通过，真实 Electron 审核现场仍待验收。
2026-09-14 Canon Foreshadowing Add 闭环：`foreshadowing.add` 现在进入待审核 Proposal，Apply 复用 StoryArtifact 校验并同步伏笔源，Revert 删除条目；新增 `canon:propose-foreshadowing` typed IPC/preload 和 CanonReview 伏笔摘要。聚焦 21 项、typecheck、build 与 diff check 通过，真实 Electron 审核现场仍待验收。
2026-09-14 Canon Knowledge Update 类型闭环：`knowledge.*` 事实更新显式标记为 `knowledge.update`，普通事实保留 `fact.update`；共享 Apply/Revert、source 追踪和 leak warning 规则。Chat/Canon 聚焦 24 项、typecheck、build 与 diff check 通过，真实 Electron 审核现场仍待验收。
2026-09-14 Context Recency 层：recipe 新增默认兼容的 `recencyLimit`，当前章节之前的最近章节摘要按优先级参与预算，并在 manifest candidateCounts 中记录；读取历史章节失败只跳过单项。Context/Replay/Chat 聚焦 15 项、typecheck、build 与 diff check 通过，真实长篇低端设备性能仍待验收。

2026-09-14 右侧 Agent 折叠入口回归：移除右侧页签内重复的 Bot 折叠按钮和窄栏入口，恢复顶栏原有 Bot 图标作为唯一收起/展开控制；收起时右侧栏从工作区网格完全移除，避免出现重复图标和不一致交互。RightPanel/顶栏聚焦测试 15 项、typecheck、build 与 diff check 通过，真实 Electron 视觉验收仍待继续。

2026-09-14 Context Inspector Recency 展示：将候选计数从 P/S/M 扩展为 P/S/R/M，R 表示最近章节候选；旧版 manifest 缺少 recency 字段时按 0 展示，保持 Replay/历史数据兼容。聚焦 Context/RightPanel 测试 20 项、typecheck、build、UI contract、diff check 与单 worker 全量 131 文件/518 项通过，真实长篇性能与 Electron 视觉验收仍待继续。

2026-09-14 Developer Inspector 诊断增量：新增按开始时间排序的节点 Trace 时间线、大小写不敏感的日志筛选与可滚动换行展示；诊断服务新增 gzip JSON 导出，并复用既有 metadata-only 脱敏、路径沙箱和 typed IPC 边界。新增 trace/filter 与 gzip 安全回归，聚焦 4 个文件/16 项及 typecheck 通过；完整测试、构建、runtime smoke、UI contract 和真实 Electron 视觉仍需本轮最终复核。

2026-09-14 Fixture 用途校验增量：验证器现在对 `tiny-cn`、`conflict-cn`、`image-heavy` 分别检查章节/人物规模、伤势冲突场景与伏笔条目、图片文件和 sidecar 的完整回链，避免只凭目录存在误判 fixture 可用。新增 2 项回归测试通过；该证据仍不替代真实用户项目和低端设备性能验收。

2026-09-14 长篇性能基线复测：在当前 darwin/arm64、Node v22.22.2、8 CPU、16 GiB 环境运行 3 次 `benchmark:runtime`，repair/chapterList/integrity 的 p95 分别为 612/12/358 ms，预算门禁通过。该数据用于跨机器对照，不等同于低端设备或真实 UI 滚动帧率验收。

2026-09-14 发布 metadata 校验增量：产物验证器现在会读取已存在的 electron-builder 更新清单，校验引用文件的存在性、大小、SHA-512 和路径安全；发现并修正现有 macOS 清单中的文件名漂移，`verify:artifacts`/`verify:release` 通过。`dist:mac` 仍被缺失的 Electron 原生分发目录阻塞，未将其当作重新打包或签名公证证据。

2026-09-14 Workflow Memory 提案幂等增量：定位 `memory.extract` 重试会重复调用模型并创建 `fact.add` Proposal 的问题；同一 `workflowRunId` 与章节存在已有提案时现在直接复用，避免重复 Canon 待审核项。Memory/Workflow/Canon 聚焦 28 项、typecheck 与 diff check 通过；通用 side-effect ledger、空结果标记及其他副作用仍待继续。

2026-09-14 Workflow 章节写回幂等增量：章节写回重试现在按 `workflow:<runId>`、目标章节和最终正文匹配已有 Revision，命中后复用 Revision ID，避免重复审计记录；未命中仍保留原有人工审核门禁和章节保存流程。Workflow/Memory/Writeback 聚焦 21 项、typecheck 与 diff check 通过；通用 side-effect ledger 和崩溃窗口原子提交仍待继续。

2026-09-15 Developer Diagnostics 最终验证：在源 checkout 直接运行 `npm test`，145 个测试文件/625 项全部通过；`npm run typecheck`、`npm run build`、`node scripts/verify-runtime.mjs`、`node scripts/verify-ui-contract.mjs` 与 `git diff --check` 均以 exit 0 完成。Runtime smoke 覆盖迁移至 v20、metadata-only 诊断导出、fixture 清理与安全边界；Build 仅保留依赖侧 Rollup `@__PURE__` 注释提示。真实 Electron 原生 binary/视觉验收仍单独保留，不以这组命令替代。
2026-09-14 Workflow 跨进程 side-effect ledger：新增 SQLite v20 `workflow_side_effects` 表和原子 claim/complete/release；同一幂等键只允许一个执行者，其他执行者等待成功结果，租约过期后可接管，长任务每 20 秒续租；`undefined`、`null`、空数组等输出均保留语义。Runtime 接入 ledger，旧 Run 的内嵌状态继续兼容。新增 ledger/Runtime 回归，聚焦执行 47 项、全量单 worker 131 文件/523 项、typecheck、build、UI contract 与 diff check 通过；外部副作用完成与 ledger 提交之间的崩溃窗口仍需更强原子协议。
2026-09-14 Workflow 重启恢复与 active Run 隔离：定位 `listRuns()` 轮询期间 `recoverInterrupted()` 把本进程正在 Retry 的 Run 误判为崩溃，导致 Retry 状态被覆盖；恢复器现在排除当前 controller 持有的 Run，并在确认中断时释放 orphan side-effect claim。相关聚焦测试 20 项、全量单 worker 131 文件/524 项、typecheck、build、UI contract 与 diff check 通过。
2026-09-14 Runtime 验收器迁移版本解耦：新增 SQLite v20 后定位 `scripts/verify-runtime.mjs` 仍硬编码 v19，导致完整运行时验收失败；现改为读取 `MIGRATIONS` 最新版本并校验从 v2 到当前版本的连续迁移数量。`node scripts/verify-runtime.mjs`、typecheck、build、UI contract 与 diff check 通过。
2026-09-14 long-cn Fixture 独立验收：补充 `scripts/verify-fixtures.mjs --long`，在显式请求时校验 1000 个四位章节文件、1000 个实体文件和 100000 条 facts，避免只生成长篇 fixture 而没有规模断言；新增自动化回归，typecheck、build、UI contract 与 diff check 通过。低端设备和真实 UI 性能仍需现场基线。
2026-09-14 Workflow ledger 提交窗口保护：成功节点先持久化 Run 级 side-effect 输出，再提交跨进程 ledger；ledger 完成失败时不再走普通重试/释放 claim 路径，避免已发生的 Provider/写回副作用被重复执行。新增完成失败回归，聚焦 Runtime 13 项通过；这只是应用内恢复保护，外部副作用与 SQLite 仍不具备跨系统原子提交。
2026-09-14 卷源文件恢复与旧格式兼容：项目完整性/索引修复纳入 `story/volumes.yaml`，缺失时恢复 `version: 1` 的空卷文件；VolumeService 兼容旧卷条目的 `chapters`、缺失 order 和审计时间字段。新增 Project/Volume 回归 22 项通过；不可安全推导的损坏内容仍保留并报告。
2026-09-14 卷源损坏的完整性报告：项目完整性检查和索引修复现在校验 `story/volumes.yaml` 的 YAML/schema；损坏卷源会进入 invalid source 明细且保留原文，兼容旧格式的内容先经过同一归一化逻辑，不误报为损坏。Project/Volume 聚焦测试 23 项通过。

2026-09-14 图片生成并发幂等：定位 ImageService 仅检查已落库资产、无法覆盖并发请求的窗口；同一 `idempotencyKey` 现在复用 in-flight Promise，Provider 只执行一次，失败后释放 key 允许后续重试。Image/Workflow 聚焦 23 项、typecheck 与 diff check 通过；跨进程通用 ledger 仍待继续。

2026-09-14 Workflow RunStore 原子保存：定位 Workflow、Node、Job 三组状态写入缺少事务、Job 失败会留下半更新记录的问题；`save()` 现在先完成序列化，再以 `BEGIN IMMEDIATE/COMMIT` 原子提交，异常回滚并保留原始错误。Workflow Store/Runtime 聚焦 29 项、typecheck 与 diff check 通过；跨进程 side-effect ledger 仍待继续。
2026-09-14 Illustration Studio Visual Bible：新增独立的参考资产选择状态与最多 20 个 Asset ID 的去重/上限模型；参考图选择不影响待插入图片，刷新/删除资产会清理失效引用，生成请求会保留 references provenance。Illustration/i18n 聚焦 15 项、typecheck 通过；真实 Provider 参考图 wire contract 与 Electron 视觉验收仍待继续。
2026-09-14 Visual Bible 长列表布局：参考资产选择区增加固定最大高度与纵向滚动，避免大量图片资产挤压 Prompt/生成区；新增样式契约回归，聚焦 Illustration 测试 16 项通过。
2026-09-14 Chapter autosave 草稿恢复：定位保存失败/崩溃后正文只存在 Renderer 内存的问题；新增项目+章节作用域的有界本地草稿记录，重开时仅恢复更新版本并自动走现有 autosave，匹配保存成功后清理。Autosave/App Store 聚焦 28 项、typecheck 通过；真实 Electron 重启现场仍待验收。
2026-09-14 Context Replay 差异摘要：在已有逐 source diff 上增加新增/移除/变更计数和 token 净变化，缺失 token 安全按 0，未改变回放重算和数据源边界。Context/RightPanel 聚焦 8 项、typecheck 通过；真实 Electron 多分辨率视觉验收仍待继续。
2026-09-14 Illustration Asset Review 收藏持久化：修复收藏只存在组件内存、重进工作台丢失的问题；新增按项目存储的校验/去重/上限模型，并保持与插入及参考图选择独立。Image/Illustration 聚焦 8 项、typecheck 通过；真实 Electron 项目切换/重启仍待验收。
2026-09-14 Context Snapshot 版本摘要：复用现有 ContextSnapshotSummary 的 format/retrieval/project schema 版本，在快照回放按钮中增加本地化紧凑展示，帮助用户提前识别迁移重算。Context/RightPanel 聚焦 6 项、typecheck 与 diff check 通过；真实 Electron 窄栏视觉仍待验收。

2026-09-15 Chat 选区边界回归：补充独立 Chat 组件契约，确认已确认选区才进入顶部 scope 和请求上下文，普通拖选保持整章上下文；右侧 Bot 折叠/展开入口与 `0px` 折叠列的布局契约继续通过。临时副本全量 145 个测试文件/625 项通过，覆盖率 Statements 81.45%、Branches 67.38%；分支 80% 门槛仍未达成。由于原工程目录的 macOS 访问控制，typecheck、lint、UI contract 在等价临时副本验证，真实 Electron 视觉仍待验收。
