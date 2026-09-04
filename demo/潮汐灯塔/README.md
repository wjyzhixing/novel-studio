# 《潮汐灯塔》全流程示例

这是一个可直接被 Novel Studio 打开的完整示例项目，不依赖真实 Provider 才能浏览内容。

## 已包含

- 2 卷、4 章正文；每章都是 Markdown 源文件。
- 6 个实体：林月、何执、雾港、潮汐灯塔、地下星图库、潮汐罗盘。
- 3 个 Timeline 事件、3 条实体关系、1 条 Lore 规则、1 条伏笔和 1 条 Plot。
- 3 个场景 sidecar：港口收到罗盘、星光地图揭密、风暴中点灯。
- 3 张章节插图及 Asset provenance，已在前三章 Markdown 中使用相对路径引用。
- `flow_tide_lighthouse.novelflow.json`：Chapter Input → Context → Plan → Write → Human Review → Memory Extract → Image Proposal → Image Generate → Human Image Select → Insert Illustration。

## 使用方式

在 Novel Studio 的 Welcome 页面选择“打开项目”，选择本目录：

`demo/潮汐灯塔`

打开后可以从左侧进入章节、Story Bible、Timeline、Illustration Studio 和 Workflow。要真正执行 AI 节点，再在 Provider Settings 配置文本/图片 Provider；当前示例图片已经是可直接浏览的本地资产。
