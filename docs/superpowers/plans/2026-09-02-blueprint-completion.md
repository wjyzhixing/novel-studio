# Blueprint Completion Implementation Plan

> **For agentic workers:** 按阶段执行，每个阶段完成后运行允许的静态验证。

**Goal:** 按蓝图 1–35 章把当前 Novel Studio 从核心闭环推进到可恢复、可诊断、可扩展的本地创作产品。

**Architecture:** Markdown/YAML/JSON/图片继续作为项目内容源，SQLite 作为可重建索引、运行状态和审计层；Renderer 只访问 typed preload；所有 AI/图片结果都经过 Suggestion、Proposal、Asset 或 Revision 的人工门。

**Constraints:** 不运行 test/build；不得把 API Key 写入源码、项目文件、日志或文档；每阶段以 `npm run typecheck` 与 `git diff --check` 作为当前允许的验证门。

## 阶段 1：持久化与恢复

- 将 BackupService 接入 Welcome/Workbench UI。
- 创建备份只能写到项目目录外。
- 恢复必须选择空目录，校验路径穿越和 `novel.yaml`，成功后由用户显式打开。
- 索引修复继续只重建文件派生表，不触碰 Canon、Revision、Workflow history。
- 增加迁移版本检查和损坏项目的可见错误信息。

## 阶段 2：Developer / Context Inspector

- 展示最近 Workflow Run、节点状态、错误、输入输出摘要。
- 展示每次 Agent 的 Context manifest、provider/model/request id、耗时和重试。
- 诊断导出默认排除 secret 和正文。

## 阶段 3：长篇可靠性

- 增加 tiny-cn、conflict-cn、image-heavy、migration-v1、broken-project fixture。
- 提供 long-cn 生成脚本和不依赖真实 Provider 的性能检查入口。
- 补全文本检索预算、分页/虚拟化和损坏索引恢复。

## 阶段 4：Graph / Timeline Advanced

- Graph 关系编辑、删除、边详情和文件源同步。
- Timeline 事件可视化、实体过滤、章节跳转。
- Foreshadowing 状态和回收期限面板化。

## 阶段 5：导入导出与发布边界

- Markdown/TXT import、Markdown/plain/HTML export。
- typed Provider/Workflow Node/Importer/Exporter extension points。
- i18n/accessibility 完整键盘路径。
- 安装包、签名、自动更新和 telemetry opt-in 的发布检查清单。

当前已完成 typed contracts、Main-owned registry、权限预览、依赖校验和 Ed25519 manifest 签名校验；`ExtensionPackageStore` 已提供仅 manifest 的原子持久化安装/恢复/卸载能力，可信公钥读取、安装/卸载 IPC 和 Developer Panel 入口也已接入。外部代码发现/执行隔离、正式发布者公钥和发布级回滚验收仍待实现。

## 当前进度

- [x] 核心 Provider、AI Edit、Canon、Image、Workflow 基础闭环
- [x] Graph Studio 基础关系闭环
- [x] 阶段 1：Backup UI 与恢复入口、完整性检查
- [x] 阶段 2：Developer / Context Inspector 基础面板与诊断元数据
- [x] 阶段 3：fixtures 生成器与长篇查询/统计基础
- [ ] 阶段 4：Graph/Timeline 高级能力（关系编辑、时间分组/过滤已完成第一批）
- [ ] 阶段 5：导入导出已完成第一批；插件与发布待做
