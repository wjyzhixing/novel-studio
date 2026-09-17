# Secure Update Orchestration Design

## Goal

补齐蓝图 §31 的本地更新编排闭环：Main 进程读取并校验 stable/beta manifest，按当前平台、架构、版本选择更新，安全下载并原子暂存；Renderer 通过 typed IPC 获得可操作状态。应用安装切换、签名、公证和更新服务器不在本切片内。

## Architecture

- `UpdateService` 是无 Electron 依赖的 Main-owned 服务，持有当前版本、平台/架构、channel 和 manifest fetcher。它只暴露检查、下载和取消，所有输入在 shared schema 边界校验。
- `update-verification.ts` 继续负责 HTTPS、大小上限、SHA-512 和 atomic write。下载过程以有限状态事件报告给 Renderer；旧下载完成前不覆盖旧暂存文件。
- preload 仅转发 typed IPC；Renderer 以设置/开发者面板中的紧凑更新卡片展示状态、版本、release notes、进度、重试和取消，不在 UI 读取网络或文件系统。

## State and failure behavior

状态为 `idle | checking | available | downloading | ready | up_to_date | failed`。网络、manifest、平台/版本不兼容和完整性错误均返回脱敏 `Result`；取消回到 `idle`，失败保留可重试的 manifest（若已选择）但不产生可用工件。下载进度只报告字节数，不报告正文或 secret。

## Testing

覆盖 manifest fetch 的非 2xx/非法 JSON、兼容性选择、下载进度、取消、哈希/大小失败不覆盖旧文件，以及 preload/IPC 合约静态检查。使用注入 fetcher 和临时目录，不依赖真实服务器。
