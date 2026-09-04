<div align="center">

<img src="assets/novel-studio-icon.svg" alt="Novel Studio" width="96" />

# Novel Studio

**面向长篇创作的 AI 原生桌面写作 IDE**

把灵感、世界观、章节、AI 协作与视觉资产，组织成一个可持续写作的工作空间。

[项目推广介绍](PROJECT_INTRODUCTION.md) · [架构文档](docs/ARCHITECTURE.md) · [问题反馈](https://github.com/wjyzhixing/novel-studio/issues)

![Status](https://img.shields.io/badge/status-active%20development-ea580c?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-desktop-47848f?style=flat-square&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-133%20passing-16a34a?style=flat-square)

</div>

> [!WARNING]
> **项目仍处于积极开发阶段。** 当前版本适合体验产品方向、参与开发和验证写作工作流，不代表稳定发行版。数据请自行备份，正式发布前也不会承诺跨平台安装包的签名与公证状态。

## 这是什么

Novel Studio 是一个本地优先（local-first）的 Electron 桌面应用原型，目标是让长篇小说创作拥有类似 IDE 的工程化体验：正文保持 Markdown 可读，世界观与关系结构化保存，AI 输出可审阅、可撤销，工作流可以运行、暂停和恢复。

它不是一个“把文字丢给聊天机器人”的单页工具，而是围绕长篇创作的长期一致性建立工作台。

## 当前开发状态

项目已经完成从 Shell 到 AI 写作、故事圣经、上下文/Canon、工作流、插画资产和安全加固的主线验证。当前重点是继续收敛桌面体验、扩展系统与发布质量。

| 模块 | 状态 | 已验证内容 |
| --- | --- | --- |
| 项目与章节 | ✅ 可用 | 创建/打开/最近项目、章节 CRUD、Markdown 正文源、自动保存 |
| 故事圣经 | ✅ 可用 | 角色、地点、组织、物品、时间线、别名与 YAML 源文件 |
| AI 写作 | ✅ 可用 | Provider、流式响应、Diff、建议、接受/拒绝/重试/取消 |
| Context / Canon | ✅ 可用 | 三层上下文、Token 预算、事实提案、冲突检查与回滚 |
| Workflow | ✅ 可用 | DAG 校验、并行、重试、超时、取消、人工暂停/恢复 |
| 插画与资产 | ✅ 可用 | 场景资产、来源追踪、Illustration Studio、备份/恢复 |
| 桌面发布 | 🚧 进行中 | macOS/Windows 打包链路已验证，签名与公证待正式发布阶段 |

## 目录结构

```text
src/
├── main/                 # Electron 主进程、IPC 与领域服务
├── preload/              # 安全的 contextBridge API
├── renderer/             # React 写作工作台
└── shared/               # 主进程与渲染进程共享类型
assets/                   # 应用图标与静态资源
demo/                     # 可读的示例小说项目（运行数据库已忽略）
fixtures/                 # 测试用项目与迁移样本
scripts/                  # 稳定启动、验证、打包与 Golden Path 脚本
tests/                    # 单元、组件与领域集成测试
docs/                     # 架构、审计与发布记录
```

## 本地运行

环境要求：Node.js 22+、pnpm 10+（也支持 npm）。

```bash
pnpm install
pnpm dev
```

验证代码、测试和生产构建：

```bash
pnpm typecheck
pnpm test
pnpm build
```

默认测试使用确定性 Provider 和临时项目，不需要真实模型 API Key，也不会读取你的个人小说目录。

## 架构一览

![Novel Studio architecture](docs/novel-studio-architecture.png)

```text
React Renderer → typed contextBridge → Electron Main / Domain Services
                                             ├─ Markdown + YAML project files
                                             ├─ SQLite / FTS5 index
                                             ├─ AI provider adapters
                                             └─ Workflow runtime + asset services
```

更完整的边界、数据模型和安全约束见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 打包

```bash
npm run dist       # 当前系统
npm run dist:mac   # macOS DMG
npm run dist:win   # Windows x64 NSIS
```

产物输出到 `release/`，该目录已加入 `.gitignore`。当前配置默认未签名；正式发布前会补充代码签名、公证和自动更新策略。

## 参与开发

欢迎通过 Issue 讨论产品方向、Bug、写作工作流和平台适配。提交代码前请先阅读架构文档，并确保：

1. 外部输入在边界处完成校验。
2. 文件访问遵守项目根路径沙箱。
3. IPC 保持类型安全并返回统一的 `Result<T, AppError>`。
4. 新功能补充测试，不提交本地 `.novel` 数据库、缓存、日志或构建产物。

提交前建议运行：

```bash
pnpm typecheck && pnpm test && pnpm build
```

## 相关文档

- [项目推广介绍](PROJECT_INTRODUCTION.md)
- [系统架构](docs/ARCHITECTURE.md)
- [开发流程](docs/development-process.md)
- [安全加固报告](docs/hardening-report.md)
- [发布准备清单](docs/release-readiness-checklist.md)
- [完整开发蓝图](Novel-Studio-完整开发蓝图-v1.0.docx)

## 许可

项目当前处于早期开发阶段，许可证与正式发行条款尚未确定。未经项目维护者确认，请不要将其作为商业发行版分发。
