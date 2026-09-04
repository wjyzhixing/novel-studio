# Desktop Packaging Design

## Goal

为 Novel Studio 增加可重复执行的 Windows 和 macOS 安装包脚本，并与现有 `electron-vite build` 构建流程保持一致。

## Chosen approach

使用 `electron-builder` 作为安装包层，复用现有 `npm run build` 产出的 `out/` 目录，不引入 Electron Forge。这样可以分别生成 Windows NSIS 安装程序和 macOS DMG，并保留按当前平台打包的统一入口。

## Commands and artifacts

- `npm run dist:win`：构建后生成 Windows x64 NSIS 安装程序。
- `npm run dist:mac`：构建后生成 macOS DMG，架构跟随当前机器。
- `npm run dist`：构建后按当前操作系统选择目标。
- 所有产物输出到 `release/`，不将安装包混入 `out/`。

## Packaging configuration

- 应用入口继续使用 `out/main/index.js`。
- 打包资源包含 `out/` 和现有 `assets/`，确保图标与运行时资源可用。
- Windows 使用现有 PNG 图标生成 NSIS 安装程序。
- macOS 使用现有 PNG 图标生成 DMG；未配置签名和公证时允许本地未签名构建。
- `release/` 加入 `.gitignore`，避免提交大体积产物。
- 不修改应用业务代码和项目数据格式。

## Verification

- 运行 `npm run typecheck`。
- 运行现有相关测试。
- 运行 `npm run build`，确认 Electron 主进程、preload 和 renderer 都能构建。
- 在当前 macOS 环境运行 `npm run dist:mac`，确认 DMG 生成；Windows 目标配置通过静态检查，Windows 机器上运行 `npm run dist:win` 生成 NSIS 安装程序。

## Constraints

- 不包含用户项目目录、`demo/`、测试文件或开发缓存。
- 默认不要求 Apple Developer 或 Windows 代码签名证书。
- 正式发布签名、公证和自动更新不在本次范围内。
