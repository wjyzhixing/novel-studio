# Novel Studio 发布前检查清单

本清单对应蓝图第 19、23、24、31 章。它是发布门禁，不代表当前版本已经全部满足。

可运行 `node scripts/release-preflight.mjs` 做代码级只读预检；预检通过不代表已完成平台签名或发布验收。

## 当前已具备

- Renderer 通过白名单 preload IPC，不暴露 `ipcRenderer`、Node fs 或 SQLite。
- Provider secret 使用系统安全存储，不进入项目文件、导出正文或诊断摘要。
- 项目路径有根目录沙箱和路径穿越检查。
- Markdown/YAML/JSON/图片作为内容源，SQLite 可通过索引修复重建。
- 备份恢复、完整性检查、migration fixture 和损坏项目修复入口已存在。
- 旧 schema 打开时会在项目完整性报告中显示迁移起止版本、应用迁移数量和状态；`migration-v1` fixture 已覆盖 v2→v19。
- 全量备份带文件 hash manifest，增量备份可基于全量包恢复变更/新增/删除；已通过 fixture smoke，发布前仍需真实项目、失败中断和跨版本兼容验收。
- Lore Markdown 源文件具备 schema 校验、损坏报告和从源重建索引能力；无效源文件不会被静默覆盖。
- 图片 Asset sidecar 具备共享 provenance schema 校验；非法路径、MIME、ID 或缺失字段会进入完整性报告。
- Provider、Workflow Node、Importer、Exporter 已有 Main-owned typed contracts/Registry；Registry 不发现或执行任意外部 JS。
- Electron 已拒绝新窗口、导航、重定向和 webview 附加；开发日志不复制 Renderer console 正文。
- IPC 错误边界会对 Bearer、`sk_` 和 query secret 进行脱敏。
- 打包模式通过 Electron response header 强制 `script/style/connect/frame/object/form` CSP；开发模式仍保留 Vite 本地调试所需连接能力。
- Provider/Image Base URL 只允许 HTTPS（或 localhost 回环 HTTP），并拒绝 URL 内凭据与 query secret。

## 发布前必须补齐

- [ ] 生产 CSP、窗口导航拦截和远程内容白名单完成最终人工审查（代码级严格 CSP 已接入）。
- [ ] 生产日志统一 redact secret、Authorization、正文和图片 data URL。
- [ ] 外部插件包具备签名校验、权限预览、依赖锁定、卸载和回滚。
- [ ] 安装包完成 macOS notarization/signing 及目标平台安装验证。
- [ ] 自动更新 channel、版本回滚和下载完整性校验完成。
- [ ] 数据库/项目 schema 迁移有升级、失败回滚和备份恢复证据。
- [ ] Workflow 队列取消、超时和幂等行为完成 UI/E2E 验收。
- [ ] telemetry 默认为关闭，启用前有明确同意和可撤销设置。
- [ ] 导入、导出、Provider、图片生成、Workflow 关键路径完成组件/集成/E2E 验收（隔离 fixture 的 Electron 黄金路径已通过；真实 Provider、真实用户项目和发布级 E2E 仍待验收）。
- [ ] 1000 章、1000 实体、100000 facts fixture 完成可重复性能基线。
- [ ] 记录不同机器上的 `verify-runtime.mjs --long` timing 分布，并补充真实 UI 滚动基线。
- [ ] 章节列表窗口化已实现，仍需完成低端设备滚动基线。
- [ ] `npm audit`、安全审查、人工发布签核完成。

## 2026-09-03 开发流程增量

- 已建立本地 Electron 黄金路径 harness 的生命周期、临时 fixture 和 metadata-only 步骤协议。
- 当前证据已证明隔离 fixture 的 10 步连续 Electron UI 操作、fixture 创建/清理和证据脱敏契约；真实 Provider、真实用户项目和发布级完整 E2E 仍保持未勾选。
