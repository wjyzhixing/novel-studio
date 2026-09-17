# Fixture 生成

用于蓝图第 20、21、29 章的本地可靠性核验，不依赖真实 Provider。

```bash
node scripts/generate-fixtures.mjs
node scripts/generate-fixtures.mjs fixtures/projects --long
```

默认生成 `tiny-cn`、`conflict-cn`、`image-heavy`、`migration-v0`、`migration-v1`、`broken-project`；传入 `--long` 额外生成 1000 章、1000 实体、100000 facts 的 `long-cn`。脚本会覆盖指定输出目录下同名 fixture。

生成后可用 `node scripts/verify-fixtures.mjs <目录>` 检查源文件、manifest 和 SQLite 基础结构。该检查不替代应用实际打开迁移：`migration-v0`（仅 settings、user_version=0）和 `migration-v1`（user_version=2）都会明确报告为待应用升级的旧数据库。

`node scripts/verify-runtime.mjs` 会在临时目录执行一次真实 Main Service 核验：`migration-v0`/`migration-v1` 数据库迁移、损坏项目索引修复、章节导入、HTML 导出、Provider URL 安全策略和错误脱敏。它不是 test/build，也不会修改仓库内容。

`npm run benchmark:runtime -- --iterations=3` 会重复执行长篇 Main Service 核验（最多 10 次），输出每次及平均 repair、chapterList、integrity 耗时；使用临时 fixture，结果不代表低端设备或发布级 UI 基线。

追加 `--long` 可额外生成并核验 1000 章、1000 实体、100000 facts 的长篇 fixture；该模式会验证四位章节编号和索引修复后的数量一致，并检查任务队列并发限制、Workflow timeout/中断恢复和修复/列表/完整性检查耗时基线。

`node scripts/release-preflight.mjs` 只读检查发布入口、Electron 安全配置、CSP、schema 和 secret 脱敏；不执行 test/build，也不替代签名、notarization 或 CI 验收。

`npm run sign:update-manifest -- --input unsigned.json --output signed.json --key release-key.pem --key-id key_release` 使用外部 Ed25519 私钥生成签名更新清单；命令不会打印私钥内容，也不会允许输出覆盖输入清单或私钥文件。

`npm run verify:packaging` 检查 Windows NSIS x64、macOS DMG 和 Electron 分发配置；`npm run verify:artifacts` 检查 `release/` 根目录中实际生成的 `.exe`/`.dmg` 安装产物是否存在且体积合理。后者不会把解包目录中的辅助二进制误判为安装包，也不替代签名、公证或实际安装测试。

发布前可直接运行 `npm run verify:release`，依次执行打包配置、实际产物和安全预检三组检查。

更新发布前基础契约位于 `src/shared/update.ts`，工件 SHA-512/大小校验位于 Main 的 `src/main/services/update-verification.ts`；这两者只提供本地验证能力，不会连接更新服务器或替代签名、公证和安装验收。
