# Electron 黄金路径验收层设计

## 目标

为 Novel Studio 建立一个稳定、可重复的本地 Electron 黄金路径验收层，用同一个临时 fixture 项目连续验证蓝图中的核心工作流：项目/章节打开、Provider 状态、Chat、选区 Suggestion、Canon、Workflow 人工暂停恢复、Illustration Studio、Markdown 写回，以及备份导入导出。

本阶段只使用本地 fixture Provider 和临时目录，不使用真实 Provider、API Key 或网络服务；不改变用户项目数据，不提交代码。

## 当前问题与范围

当前已有 `scripts/dev-stable.mjs`，但它只负责固定端口启动 Vite/Electron，无法稳定创建目标项目、执行连续 UI 操作、验证源文件结果，也没有失败步骤和证据产物。现有 `tests/golden-path.test.ts` 是 Main Service 集成链路，不证明 Renderer、preload 和 Electron 窗口真实连通。

本阶段范围：

- 固定的临时 fixture 项目和确定性状态入口。
- 稳定 Electron 启动协议：固定 URL、可识别窗口、可控退出、启动超时和日志脱敏。
- 黄金路径步骤协议：每一步有名称、前置条件、动作、断言和结构化结果。
- 只读证据摘要：步骤状态、当前项目/章节、Markdown/资产/Canon/Workflow/备份结果；不保存正文、prompt、data URL 或 secret。
- 在现有允许的验证命令中增加 harness 静态契约和 runtime 接口检查。

不在本阶段范围：真实网络 Provider 验证、macOS 签名/公证、完整跨平台 E2E、插件安装、Community Workflow、性能基线和测试覆盖率达标。

## 设计

### 1. 分层结构

```text
fixture factory
  ├─ 临时项目/章节/工作流/Provider 状态
  └─ 本地 deterministic service doubles
        ↓
stable Electron launcher
  ├─ 固定 Renderer URL
  ├─ preload 白名单
  └─ 启动/退出/超时边界
        ↓
golden-path runner
  ├─ UI 操作适配器
  ├─ 步骤断言
  └─ metadata-only evidence writer
        ↓
allowed verification gates + blueprint audit
```

fixture factory 只负责建立可重建的项目文件和初始状态；业务逻辑仍由 Main Service 和 typed preload IPC 执行。Runner 不直接访问 Renderer 的 Node 能力，也不把业务写入 SQLite 以外的旁路状态。所有正文、图片二进制和密钥都只存在于临时 fixture 生命周期内。

### 2. 步骤协议

黄金路径使用不可变步骤结果：

```ts
type GoldenStepResult = {
  id: string
  label: string
  status: 'passed' | 'failed' | 'skipped'
  durationMs: number
  evidence: Record<string, string | number | boolean | null>
  error?: string
}
```

Runner 按顺序执行步骤；某步骤失败时停止依赖它的后续步骤，写入脱敏结果并以非零退出码结束。Evidence 只允许摘要字段，例如 `chapterOpened: true`、`suggestionAccepted: true`、`assetCount: 1`、`markdownContainsAsset: true`，禁止正文、完整模型输入输出、Authorization、`sk_` 字符串和 data URL。

### 3. 首批黄金路径

第一批只覆盖已有实现且能形成闭环的路径：

1. 创建/打开 fixture 项目并打开 fixture 章节。
2. 检查 Provider 配置状态，不执行真实连接测试。
3. 在 Chat 中提交基于当前章节/选区的请求，确认 Context Inspector 有 manifest 摘要。
4. 生成 Suggestion，执行 Accept 和 Reject 各一次，确认正文变化只来自显式 Accept。
5. 创建 Canon Proposal，执行 Apply，再执行 Revert，确认 Revision/Canon 状态可见。
6. 启动内置 Workflow，确认在 Review 和 Image Selection 两个人工节点暂停，并通过 Resume 走到 Image Insert。
7. 在 Illustration Studio 生成 fixture 资产，插入 Markdown，再删除资产，确认引用和源文件同步清理。
8. 导出 HTML/备份，导入到临时目标目录，确认图片/章节摘要存在且不覆盖原项目。

真实 Provider 现场配置另行执行，不能混入本地黄金路径，也不能将密钥写入证据。

### 4. 失败与恢复

- 启动失败：报告端口、入口和阶段，不输出环境变量或命令行 secret。
- UI 元素缺失：记录步骤 ID 和可见区域摘要，后续步骤标记 skipped。
- IPC 返回错误：保留脱敏后的 DomainError message，确保 runner 退出前释放 Electron/Vite。
- Workflow waiting_human：只允许对当前 Run 调用 Resume/Retry，不能根据当前 UI 章节猜历史目标。
- 图片失败：报告 HTTP 状态和已脱敏 provider message，不保存响应正文中的 token、data URL 或完整 prompt。

## 文件边界

- 修改 `scripts/dev-stable.mjs`：抽取可复用的启动/停止边界，支持 fixture runner 使用。
- 新增 `scripts/golden-path-fixture.mjs`：创建和清理临时项目，输出 metadata-only 初始状态。
- 新增 `scripts/golden-path-runner.mjs`：顺序执行步骤、统一超时/清理、输出结构化证据。
- 修改 `scripts/verify-ui-contract.mjs`：检查 launcher/runner 的安全边界和步骤协议。
- 修改 `scripts/verify-runtime.mjs`：检查 fixture 初始化和证据脱敏规则，不替代 Electron 操作。
- 更新 `docs/blueprint-audit-2026-09-02.md`、`docs/development-process.md`：记录阶段状态、证据强度和剩余缺口。

## 验收标准

- 同一命令可在临时目录创建 fixture 并在结束时清理；不改变当前项目文件。
- 失败时能定位到具体步骤，进程和临时服务能退出。
- 证据 JSON 不包含正文、prompt、API Key、Authorization、data URL 或完整节点 payload。
- Runner 只通过公开的 Electron/preload/UI 边界工作；不在 Renderer 引入 Node/fs/SQLite/network。
- 允许的 `npm run typecheck`、`node scripts/verify-runtime.mjs --long`、`node scripts/verify-ui-contract.mjs`、`git diff --check` 全部通过。
- 审计文档明确区分“本地 fixture/runtime 证据”和“真实 Electron/真实 Provider 证据”，不把前者标为完整完成。

## 非目标与后续

本阶段不会宣称第 21 章测试策略完成，也不会用本地 runner 代替组件测试、真实 Electron 连续点击或发布验收。第一阶段完成后，下一条业务切片优先补 Story Bible 的证据专用编辑器和 Event 参与者编辑，再处理跨版本检索迁移、插件权限链和发布更新。
