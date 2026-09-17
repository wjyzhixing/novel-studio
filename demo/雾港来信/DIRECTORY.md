# 《雾港来信》项目目录

- `chapters/`：章节 Markdown 正文；同名 `.scenes.yaml` 保存场景元数据。
- `story/`：premise、大纲、卷结构、时间线、伏笔、实体关系和 `authoring-progress.yaml` 全书进度。
- `characters/`：角色的稳定 ID、目标、恐惧、秘密和关系。
- `world/`：雾港、修复店和旧事故现场等世界设定。
- `workflows/`：章节创作 DAG 定义。
- `prompts/`：项目级 Agent Prompt Pack。
- `.novel/`：应用生成的 SQLite 索引、运行记录、修订和缓存，不是正文源文件。

正文以 `chapters/*.md` 为唯一 source of truth；SQLite 可以通过应用的修复索引重新生成。
