# 编辑交互参考与实施建议

核实日期：2026-09-24。范围：官方交互文档、开源项目与本地编辑器架构；没有把产品宣传或星数当作可直接集成的证明。本文是设计与技术建议，不代表功能已实现或公网已验收。

## 先做这三项

1. **稳定工作区与上下文属性区**：顶部保留文档与常用动作，左侧页面/目录，中央画布，右侧当前选择的属性。侧栏可收起，展开后保留选择、输入和滚动位置。右侧用“文字 / 图片 / 位置”等内容标题明确当前对象，避免把所有功能同时铺开。
2. **把视口操作与内容修改分开**：演示画布提供适应画布、100%和后续的聚焦选中。侧栏变化后重新适配可用空间。缩放和平移不产生脏状态、不新增版本、不改导出的 HTML。长文档继续以纵向阅读和目录定位为主，不强行套无限画布。
3. **明确选择、改字、移动的状态**：选中对象能看见名称与可用操作；进入改字后保留中文输入、方向键和撤销语义；移动模式显示位置/比例反馈。已有方向键 1、Shift+方向键 10 的移动能力应加强可发现性和验收，不重复造功能。Escape 退出当前局部状态，不能悄悄丢掉未应用输入。

## Figma：学习选择与视口模型

- 图层列表与画布对应；复杂嵌套提供逐级进入和明确的对象选择路径。OpenDesign 可先把已有对象选择与属性标题对应起来，后续再增加层级选择，不在这一轮重写全部 DOM 树。[官方选择文档](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects)
- 画布可以适应全部内容、聚焦选中或使用指定比例；这些是当前视图设置。OpenDesign 应保存视口偏好而非把它写回作品源文件。[官方缩放文档](https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options)
- 空格拖动和手形工具把浏览画布与修改对象分开。建议先验证 iframe 与中文输入事件边界，再增加按住空格临时平移，不能抢走输入框中的空格。[官方画布探索文档](https://help.figma.com/hc/en-us/articles/15297425105303-Explore-design-files)
- 右侧属性围绕当前选择组织。学习信息层级，不复制视觉皮肤或用户不需要的原型/开发面板。[官方属性区说明](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar)

## Keynote：学习页面叙事与检查器

- 导航、幻灯片独立视图和全局浏览分别服务于编辑单页、专注与组织顺序。OpenDesign 当前优先做好缩略图导航和专注画布，全局页面总览后置。[官方工作视图](https://support.apple.com/en-ca/guide/keynote/tanae4979928/mac)
- 格式检查器随所选文字、形状或图片改变，并可隐藏；文档级设置与对象级操作分开。这直接支持侧栏收起与上下文工具区的设计。[官方侧栏说明](https://support.apple.com/en-ca/guide/keynote/tan391376b09/mac)
- 对象列表有助于处理被遮挡或难以点中的对象。OpenDesign 的对象列表应提供名称、类型与明确选中反馈，避免用户只能在画布反复点选。[官方对象列表](https://support.apple.com/en-ca/guide/keynote/tanc5f5e5382/mac)
- Keynote 提供坐标编辑与方向键微调；方向键一步、Shift+方向键十步。OpenDesign 已有类似实现，重点在输入态保护与操作反馈。[官方位置与对齐](https://support.apple.com/en-ca/guide/keynote/tanb46504b79/mac)

## 可快速学习的三个开源项目

| 项目 | 最值得学习 | 核实的许可证 | 本项目采用方式与边界 |
| --- | --- | --- | --- |
| [Moveable](https://github.com/daybrush/moveable) | 拖动、缩放、旋转、组合操控、吸附的交互原语与示例 | [MIT](https://github.com/daybrush/moveable/blob/master/LICENSE) | 当前 package.json 已有 moveable 0.53.0 与 selecto 1.26.3。优先复用现有栈；库提供交互，不自动解决源 HTML 保真、复杂 CSS、历史事务和输入法问题。 |
| [PPTist](https://github.com/pipipi-pikachu/PPTist) | 页面缩略图、演示编辑工作区、对象工具与快捷键组织 | [AGPL-3.0](https://github.com/pipipi-pikachu/PPTist/blob/master/LICENSE) | 作为交互与数据结构研究样本。当前不复制实现、不引入依赖；若未来引入代码，先评估项目许可证与分发/服务方式的兼容性，不能因产品暂时免费便忽略许可证。 |
| [GrapesJS](https://github.com/GrapesJS/grapesjs) | HTML 元素类型对应不同操作，图层、样式与资源管理分工 | [BSD-3-Clause](https://github.com/grapesjs/grapesjs/blob/dev/LICENSE) | 适合参考 HTML 编辑器模块边界。核心开源项目与 Studio SDK 应分别看待。本轮不引入整套编辑引擎。 |

Moveable 的[官方手册](https://github.com/daybrush/moveable/blob/master/handbook/handbook.md)可用于评估已有操控的扩展；先在小样上核对当前固定版本支持的能力，避免按最新文档假设本地版本兼容。

## 为什么不整库替换

本地 `src/html.ts` 用 parse5 源位置定位可编辑文字，`patchText` 在核对原片段后只替换目标区间；`src/html.test.ts` 明确测试精确片段修改。`LongEditor.tsx` 与 `SlidesEditor.tsx` 分别承接流式长文档和演示页面，`slides-bridge.ts` 承担隔离 iframe 中的操控与输入事务。这些是已有作品不被大面积重写的基础。

GrapesJS 官方说明其 HTML 会解析成 Component Definition，再由组件模型生成导出内容；组件模型是最终数据的依据。这与当前保留原始字符串、按源跨度局部修改的方式不同。[官方组件机制](https://grapesjs.com/docs/modules/Components.html)

因此，直接替换会引入新数据模型、历史记录、导入导出和迁移验证成本。可能影响原有 CSS、脚本保留与未知结构的格式保真；这是基于两种架构差异的风险判断，不是声称已测试所有不兼容情况。最短交付路径是保留当前内核，重组外层布局与交互反馈。

## 本轮验收场景

- 收起两侧面板再展开：当前页面、选择、未应用文本仍在，画布正确适配。
- 选文字 / 图片 / 无选择：右侧标题与工具对应，不能误操作旧对象。
- 适应视口与手动缩放：不出现未保存标记，导出内容不变化。
- 中文输入期间按方向键、空格、Escape：不误移动对象，不截断组合输入。
- 键盘微调后撤销：恢复目标位置；切页不把操作应用到旧页面。
- 长文档保持自然流式排版；演示页面使用固定画布。两种视图均完成保存、刷新、导出重导入，核对仅预期片段改变。

## 后续，而非本轮承诺

吸附参考线、多选对齐分布、层级钻取、对象锁定、命令搜索、页面总览可以按实际使用频率排期。每项先明确对原 HTML 的写入规则和撤销边界，再做视觉控件。
