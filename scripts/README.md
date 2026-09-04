# Fixture 生成

用于蓝图第 20、21、29 章的本地可靠性核验，不依赖真实 Provider。

```bash
node scripts/generate-fixtures.mjs
node scripts/generate-fixtures.mjs fixtures/projects --long
```

默认生成 `tiny-cn`、`conflict-cn`、`image-heavy`、`migration-v1`、`broken-project`；传入 `--long` 额外生成 1000 章、1000 实体、100000 facts 的 `long-cn`。脚本会覆盖指定输出目录下同名 fixture。

生成后可用 `node scripts/verify-fixtures.mjs <目录>` 检查源文件、manifest 和 SQLite 基础结构。该检查不替代应用实际打开迁移：`migration-v1` 会明确报告为待应用升级的 v2 数据库。

`node scripts/verify-runtime.mjs` 会在临时目录执行一次真实 Main Service 核验：数据库迁移、损坏项目索引修复、章节导入、HTML 导出、Provider URL 安全策略和错误脱敏。它不是 test/build，也不会修改仓库内容。

追加 `--long` 可额外生成并核验 1000 章、1000 实体、100000 facts 的长篇 fixture；该模式会验证四位章节编号和索引修复后的数量一致，并检查任务队列并发限制、Workflow timeout/中断恢复和修复/列表/完整性检查耗时基线。

`node scripts/release-preflight.mjs` 只读检查发布入口、Electron 安全配置、CSP、schema 和 secret 脱敏；不执行 test/build，也不替代签名、notarization 或 CI 验收。
