# Novel Studio v0.7

AI-native desktop novel writing IDE prototype built with Electron + React + TypeScript.

开发主线依据《Novel-Studio-完整开发蓝图-v1.0.docx》（v0.1 Shell → v1.0，禁止跳步）。

## 当前进度

- [x] v0.1 Shell：三栏 UI / Tiptap 编辑器 / mock 数据 / IPC 边界
- [x] Sprint 1 Project Foundation：项目创建/打开/最近列表、novel.yaml schema（zod）、
      项目根路径沙箱（PATH_DENIED 防穿越）、原子写、SQLite（node:sqlite + WAL + 迁移框架 v2）、
      typed IPC（Result<T, AppError>）、欢迎页与崩溃恢复（最近项目自动重开）
- [x] Sprint 2 Chapter Authoring：章节 CRUD（`chapters/NNN-slug.md`）、Markdown 为唯一正文源、
      Tiptap ↔ Markdown 双向转换（markdown-it + turndown）、debounce autosave（800ms）+ 脏标记、
      状态栏实时字数与保存状态、FTS5（trigram）全文搜索（短查询 LIKE 兜底）、
      ⌘K Command Palette v1（导航/动作/搜索）
- [x] Sprint 3 Story Bible：Entity model、Character/Place/Org/Item 表单、aliases、Timeline、YAML 源文件
- [x] Sprint 4-5 AI Writing：Provider profile/secret、SSE streaming、AI Diff/Suggestion、revision、Accept/Reject/Cancel/Retry
- [x] Sprint 6-7 Context/Canon：三层 Context Engine、token budget、Context Inspector、Fact Proposal、Conflict、Apply/Revert
- [x] Sprint 8-10 Workflow：React Flow 编辑器、DAG 校验、Runtime、并行/retry/timeout/cancel、Human pause/resume、内置 Novel Flow
- [x] Sprint 11-12 Illustration/Hardening：资产 provenance、Illustration Studio、backup/restore、migration fixture、安全审计

## Included

- IDE-style three-column Chapter Writer UI
- Tiptap 3 rich text editor
- Story Bible / chapter explorer mock data
- Agent prompt UI with Electron preload IPC
- Chapter workflow status + runnable persisted Runtime
- Canon conflict panel + diff preview
- AI illustration placeholder scene
- Secure Electron boundary: `contextIsolation: true`, `nodeIntegration: false`, preload API
- Expansion point for React Flow workflow editor (`@xyflow/react` installed)

## Run

```bash
pnpm install
pnpm dev
```

or:

```bash
npm install
npm run dev
```

## Architecture direction

```text
renderer (React)
   |
preload contextBridge
   |
Electron main IPC
   |-- project files
   |-- SQLite (next)
   |-- LLM providers (next)
   `-- image providers (next)
```

## Verification

```bash
pnpm typecheck
pnpm test
pnpm run build
```

The default test suite uses deterministic providers and temporary local projects; it never requires a real model API key.

## 打包安装包

```bash
# 按当前系统打包
npm run dist

# Windows x64 NSIS 安装程序（请在 Windows 上执行）
npm run dist:win

# macOS DMG（请在 macOS 上执行）
npm run dist:mac
```

安装包会输出到 `release/`。当前配置默认未签名；macOS 首次打开可能需要在“系统设置 → 隐私与安全性”中允许打开，Windows 也可能显示 SmartScreen 未识别发布者提示。正式发布时再配置代码签名与公证证书。
