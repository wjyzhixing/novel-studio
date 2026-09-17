# Novel Studio 发布前检查清单

本清单对应蓝图第 19、23、24、31 章。它是发布门禁，不代表当前版本已经全部满足。

可运行 `node scripts/release-preflight.mjs` 做代码级只读预检；依赖审计使用 `pnpm audit --audit-level high`（本仓库以 `pnpm-lock.yaml` 为锁文件），预检通过不代表已完成平台签名或发布验收。

## 当前已具备

- Renderer 通过白名单 preload IPC，不暴露 `ipcRenderer`、Node fs 或 SQLite。
- Provider secret 使用系统安全存储，不进入项目文件、导出正文或诊断摘要。
- Community Workflow v1 仅允许纯 JSON 数据包导入/导出；导入前校验 Workflow/DAG/依赖并拒绝敏感字段和任意脚本，导出路径禁止覆盖当前项目。
- 更新 manifest 已具备 stable/beta channel、平台/架构、最低版本、无凭据 HTTPS 地址、Ed25519 发布者签名和 SHA-512/大小校验；Main 已增加“流式下载、大小上限、签名与工件校验后原子落盘”的安全暂存函数，并通过 `UpdateService`/typed IPC 提供检查、兼容性选择、进度、取消和失败重试状态。真实 channel 服务、安装切换和版本回滚仍未完成。
- 更新清单读取现在限制为 256 KiB，并将无效 JSON/超大响应与网络失败区分为 manifest/network 状态；清单仍会在 `UpdateService` 入口经过严格 schema 校验。
- 已提供 `npm run sign:update-manifest -- --input ... --output ... --key ... --key-id ...` 离线发布签名命令；私钥仅从外部文件读取，不写入仓库、清单日志或输出内容。正式发布者密钥保管、CI 签名和公证仍需发布环境完成。
- 项目路径有根目录沙箱和路径穿越检查。
- Markdown/YAML/JSON/图片作为内容源，SQLite 可通过索引修复重建。
- 备份恢复、完整性检查、migration fixture 和损坏项目修复入口已存在。
- 旧 schema 打开时会在项目完整性报告中显示迁移起止版本、应用迁移数量和状态；fixture 生成器现在提供 `migration-v0`（仅 settings、user_version=0）和 `migration-v1`（user_version=2），两者均覆盖到当前最新数据库迁移（当前 v20）。
- 数据库待执行 migration 现在以单事务提交，后续 migration 失败会整体回滚；`tests/database.test.ts` 已覆盖“前一条已执行、后一条失败”场景。项目 manifest 已接入连续版本 migration runner、原文快照和原子失败恢复，`tests/project-service.test.ts` 已覆盖迁移批次失败后 `novel.yaml` 原文不变；当前 v1 暂无活跃 manifest migration，未来具体升级步骤仍需逐项验收。
- 全量备份带文件 hash manifest，增量备份可基于全量包恢复变更/新增/删除；已通过 fixture smoke，发布前仍需真实项目、失败中断和跨版本兼容验收。
- Lore Markdown 源文件具备 schema 校验、损坏报告和从源重建索引能力；无效源文件不会被静默覆盖。
- 图片 Asset sidecar 具备共享 provenance schema 校验；非法路径、MIME、ID 或缺失字段会进入完整性报告。
- Provider、Workflow Node、Importer、Exporter 已有 Main-owned typed contracts/Registry；扩展权限声明现在使用白名单 schema、要求用途说明并只提供脱敏预览；Registry 仍不发现或执行任意外部 JS。
- 已增加 Main-side `ExtensionPackageStore`：只读取并验证签名 manifest，使用 staging/quarantine 原子替换，支持上一已验证版本回滚，并在回滚时同步恢复权限授权；启动恢复和卸载失败时保留一致性。可信公钥配置、active/retired 公钥轮换、安装/卸载/回滚 IPC、Developer Panel 入口和“未配置发布者时禁用安装”已接入。当前仍不发现或执行外部扩展代码，运行时隔离和正式发布者公钥发布流程仍需补齐。
- 已用 Main service 现场读取 `demo/未命名文件夹`（人类）及其嵌套人类学工程：卷文件、untitled/现有章节均可加载，完整性报告无 missing files、invalid source files 或 warnings；这属于本地用户项目验收证据，不替代真实 Electron/Provider 发布级 E2E。
- `node scripts/verify-runtime.mjs` 已实际打开并验证 `migration-v0`（v0→当前）与 `migration-v1`（v2→当前）两条数据库迁移路径；这仍是临时 fixture 的 Main Service 验收，不替代跨版本真实用户项目验证。
- `node scripts/verify-runtime.mjs --long` 已在当前机器完成一次可重复规模 smoke：1000 章、1000 实体、100000 facts；本次 repair/list/integrity 分别为 257/8/216 ms。跨机器 timing 分布与低端设备滚动基线仍待补齐。
- 2026-09-08 再次运行 `node scripts/verify-runtime.mjs --long`：迁移、备份恢复、完整性修复、Workflow、图片幂等和长篇索引全部通过；本次 1000 章/1000 实体/100000 facts 的 repair/list/integrity 分别为 285/7/215 ms。该结果仍只是本机 runtime smoke，不替代低端设备与真实 UI 滚动基线。
- `npm run benchmark:runtime -- --iterations=3` 现在输出 platform/arch/Node/CPU/内存、min/p50/p95/max/average，并支持 `--budget-repair=...`、`--budget-chapterList=...`、`--budget-integrity=...` 门禁；当前 darwin/arm64 16 GiB 三次结果 p95 为 repair 612 ms、chapterList 12 ms、integrity 358 ms，仍需在低端设备和真实 UI 滚动场景采集基线。
- `npm run dist:mac` 已在当前 macOS arm64 环境生成可交付的未签名 DMG；`npm run verify:packaging` 已验证 Windows NSIS x64 与本地 Electron 分发配置。
- `npm run verify:artifacts` 已验证当前 `release/` 根目录同时存在可交付体积的 Windows `.exe` 和 macOS `.dmg`；该检查不替代签名、公证或实际安装测试。
- Electron 已拒绝新窗口、导航、重定向和 webview 附加；开发日志不复制 Renderer console 正文。
- Electron 安装工具链中的 `extract-zip@2.0.1` 已通过仓库内 pnpm patch 拒绝 symlink 条目，避免归档 symlink 路径穿越；`pnpm audit` 仍按上游版本元数据报告该 advisory，需在发布签核中保留补丁应用证据。
- IPC 错误边界会对 Bearer、`sk_` 和 query secret 进行脱敏。
- `DomainError.details` 现在也会递归脱敏，保留安全诊断上下文但不让嵌套 Bearer、token、敏感字段或 data URL 穿过 IPC。
- 打包模式通过 Electron response header 强制 `script/style/connect/frame/object/form` CSP；开发模式仍保留 Vite 本地调试所需连接能力。
- Provider/Image Base URL 只允许 HTTPS（或 localhost 回环 HTTP），并拒绝 URL 内凭据与 query secret。
- Telemetry 同意状态由 Main-owned 服务持久化，默认关闭；Developer Inspector 只有在用户明确点击启用后才允许开启，并提供撤销同意，当前不执行任何网络上报。

## 发布前必须补齐

- [ ] 生产 CSP、窗口导航拦截和远程内容白名单完成最终人工审查（代码级严格 CSP 已接入）。
- [x] 生产日志统一通过 Main 侧安全日志格式化入口，压平并限制动态文本长度，再 redact secret、Authorization 和图片 data URL；Renderer console 不会复制到 Main 日志。
- [ ] 外部插件运行时具备签名校验、权限预览、依赖锁定、卸载/回滚和隔离执行；当前仅完成已验证 manifest 的安装管理，不执行外部代码。
- [ ] 安装包完成 macOS notarization/signing 及目标平台安装验证。
- [ ] 自动更新 channel、安装切换和版本回滚完成（清单签名、工件完整性校验和安全暂存已完成）。
- [ ] 数据库/项目 schema 迁移有完整升级、失败回滚和备份恢复证据（数据库事务回滚已覆盖：失败批次会校验恢复到起始 `user_version` 并关闭失败连接；项目 manifest 迁移失败恢复已覆盖；具体未来 manifest 升级步骤和跨版本备份恢复仍待验收）。
- [x] Workflow 队列取消、超时和幂等行为完成本地 fixture UI/E2E 与 runtime 验收；真实 Provider、真实用户项目和低端设备仍需发布级验收。
- [x] telemetry 默认为关闭，启用前有明确同意和可撤销设置；已实现 Main-owned、本地 metadata-only 事件白名单与 500 条上限，撤销后停止记录，当前仍不执行网络传输。
- [ ] 导入、导出、Provider、图片生成、Workflow 关键路径完成组件/集成/E2E 验收（隔离 fixture 的 Electron 黄金路径已通过；真实 Provider、真实用户项目和发布级 E2E 仍待验收）。
- [x] 1000 章、1000 实体、100000 facts fixture 完成可重复性能基线（`benchmark:runtime --iterations=3`；本机 darwin/arm64/16 GiB，repair p95 392 ms、chapterList p95 11 ms、integrity p95 253 ms）。
- [ ] 记录不同机器上的 `verify-runtime.mjs --long` timing 分布，并补充真实 UI 滚动基线。
- [ ] 章节列表窗口化已实现，仍需完成低端设备滚动基线。
- [ ] `npm audit`、安全审查、人工发布签核完成。
- [ ] 全量测试分支覆盖率达到 80% 以上（当前基线 66.34%，语句覆盖 80.85%）。

## 2026-09-03 开发流程增量

- 已建立本地 Electron 黄金路径 harness 的生命周期、临时 fixture 和 metadata-only 步骤协议。
- 当前证据已证明隔离 fixture 的 10 步连续 Electron UI 操作、fixture 创建/清理和证据脱敏契约；真实 Provider、真实用户项目和发布级完整 E2E 仍保持未勾选。
- 2026-09-04 重新运行隔离 Electron 黄金路径：14 个步骤全部通过，包含选区工具栏、独立 Chat 返回后高亮恢复、Suggestion/Canon/Workflow 人工动作、图片插入删除、备份导入导出、通知布局以及 Telemetry 启用/撤销；首次运行的偶发选区等待在第二次重跑中通过，仍需持续稳定性与真实项目验收。
