# Studio 工作台整合：下一轮 C1–C5

日期：2026-09-27。状态：**待开发计划，当前尚未整合为统一工作台**。本文件基于当前源码只读检查；不代表功能已实现、浏览器验收通过或已发布。

## 目标与当前事实

企业提案与课程创作并重，共用“材料与目标 → 大纲 → 作品 → 局部优化 → 交付”的工作台。企业强调受众、决策与证据；课程强调学习目标、学习者、活动与评价。保持免费，不增加收费步骤。

当前源码已有可复用能力，但它们分属不同工作区：

- `src/Studio.tsx`：独立 dialog，需求/大纲表单、结构草稿、文字选区下拉框、候选预览、Studio 版本和 Docs 副本入口。AI 为开发环境开关，不是公开生产能力。
- `src/SlidesEditor.tsx`：Docs 演示编辑器，已有缩略图、画布、格式栏、选中对象、缩放平移、对象/页面操作与撤销；内部管理源码和历史，直接对接 Docs `DocumentRecord` / `DraftControls`。
- `src/DocumentLayers.tsx`：长文档图层，已经支持嵌套选择、父级选择和符合条件的同父级排序；当前由 `src/DocumentObjectPanel.tsx` 使用，未接入 Studio。
- `src/studio-model.ts` / `src/studio-store.ts`：Studio 独立草稿和版本模型；`applyProposal` 校验基准版本与源码，保存采用 IndexedDB 事务内版本比较。
- `src/studio-agent-client.ts` 与 `services/studio-agent/jobs.ts`：局部文字候选与本机任务恢复；服务端任务仅为本机开发用途。候选生成不等于作品已修改。
- `src/App.tsx` 中 `DocumentWorkspace`：Docs 自身已有演示/长文档切换。Studio 转入 Docs 后是独立副本，当前没有双向同步。

## 必须保留的边界

1. 每个编辑会话只有一个当前源码、一个应用命令入口和一条撤销历史；不能把两个独立保存系统同时挂到同一画布。
2. 区分未应用的属性/文字输入、已应用本机草稿、已保存版本、AI 候选。切页、切区、关闭前处理未应用输入。
3. HTML 修改继续使用现有精确源码补丁。生成候选、渲染预览均不能通过整页序列化覆盖原文。
4. AI 候选绑定任务、源码快照、版本与选区；接受时再次校验，过期候选不得覆盖新修改。接受一次对应一个可撤销动作。
5. 现有对象 ID、文字 target ID 和源码偏移不是可随意互换的标识；源码修改后重新解析映射，失配时清空选区并提示。
6. Studio HTML、Docs HTML 副本与旧版 Scene IR 的边界保留。此轮不实现 Scene IR 双向转换或自动回写 Docs 修改。
7. 普通网页按正常布局规则编辑；不默认把整份 HTML 转为 absolute。SVG 首轮仍是整体对象，不承诺路径节点编辑。

## C1｜页面导航与画布整合

**交付**：三栏骨架；左侧页面/当前页图层、中间作品、右侧面板插槽。先统一编辑会话和保存适配，再接画布，不复制两套源码状态。

**文件与拆分**：

- C1.1 新增 `src/studio-workspace-model.ts`、`src/studio-workspace-model.test.ts`：会话快照、未应用输入、基准检查；复用 `src/history.ts`、`src/html.ts`。
- C1.2 修改 `src/SlidesEditor.tsx`：提取可注入的源码提交/保存边界，保持现有 Docs 默认适配；参考 `src/DraftWorkspace.tsx`、`src/store.ts`，不把 Studio 任务伪装成 Docs 文档。
- C1.3 新增 `src/StudioWorkspace.tsx`、`src/studio-workspace.css`；修改 `src/studio.css`、`src/slides-workspace.css`。`src/Studio.tsx` 入口由主任务整合。
- C1.4 修改 `src/SlideThumbnails.tsx`、`src/DocumentLayers.tsx`、`src/document-layers.ts`：暴露当前页、选区与页范围接口，保留原长文档默认行为。新增 `src/studio-selection.ts`、`src/studio-selection.test.ts`，在同一源码快照中以来源范围映射页面、对象和文字目标，不能截取整页再解析导致偏移变化。

**依赖**：C0 梳理；C1.1 接口先行。场景入口 C3 可独立并行。

**验收**：缩略图切页 → 当前页图层刷新 → 点文字/图片/SVG/容器 → 画布选中一致；父级选择准确；手动改字/移动后不串对象；未应用输入切页有保护；手动修改 → 撤销/重做 → 保存重开一致；原 Docs 与长文档图层排序不回归；未选区域源码逐字符一致。桌面三栏、窄屏抽屉只保留一个主要保存入口。

## C2｜Agent/属性与选区同步

**交付**：右侧“设计总监 / 属性”切换；当前选中对象驱动工具能力与 Agent 上下文；生成候选在同一个作品上预览、接受或拒绝。

**文件**：

- 新增 `src/StudioAgentPanel.tsx`：从 `src/Studio.tsx` 提取任务交互；当前目标、原文、候选、任务状态分开呈现。
- 修改 `src/studio-agent-client.ts`、`src/studio-agent-client.test.ts`：复用任务 ID、查询/取消、候选校验，增加当前会话失配反馈。
- 修改 `src/StudioWorkspace.tsx`：接入 C1 会话/选区/命令接口；复用 `src/ObjectStyleInspector.tsx`、`src/TextRunInspector.tsx`，不在面板内维护第二份作品。
- 复用 `services/studio-agent/candidate.ts`、`services/studio-agent/jobs.ts`、`src/studio-model.ts`；回归 `src/studio-agent-roundtrip.test.ts`。本任务不扩展服务端权限。

**依赖**：C1 会话、选区映射和布局插槽。服务端生产化由 B 线负责；此任务可先接现有本机 API。

**验收**：选中标题 → 生成 → 预览 → 接受 → 撤销/重做 → 保存刷新；取消不丢手动输入；刷新可恢复同一候选；用户手动改动后旧候选明确拒绝；属性未应用输入不被面板切换或 Agent 覆盖；两个窗口不能互相覆盖；选中图片/容器时解释首批仅支持文字修改；失败、404、重启不永久锁死入口。生成过程不能自动应用候选。

## C3｜企业/课程入口与需求摘要

**交付**：企业提案与课程创作并列入口；开始阶段以材料/目标为主，有初稿后以作品为主；需求、大纲、方向可回看。

**文件**：

- 新增 `src/StudioBriefPanel.tsx`：企业侧受众/决策/证据提示，课程侧学习者/目标/活动/评价提示，共用基础 brief。
- 修改 `src/studio-model.ts`、`src/studio-store.ts`、`src/studio.test.ts`、`src/studio-store.test.ts`：添加兼容的场景字段；旧任务无场景时提示选择，不擅自推断。
- 修改 `src/studio.css`；`src/Studio.tsx`、`src/StudioWorkspace.tsx` 接线由主任务统一合入。

**依赖**：C0；可与 C1 并行。C3 独占场景数据模型字段，先与 C1 明确基础 brief 不变的接口。

**验收**：两场景同等可见，分别创建、保存、重开；旧任务仍能读取；切换场景不静默覆盖既有材料/大纲；需求摘要反映用户确认内容；没有接通的材料解析/方向生成不能显示为已完成；创建初稿后进入同一作品工作台。

## C4｜可用性与版本回归

**交付**：双场景完整用户流程验收记录，修复整合问题；自动测试、实际浏览器、下载文件及公网证据分开记录。

**文件**：

- 新增 `tests/assets/studio-workspace-enterprise.html`、`tests/assets/studio-workspace-course.html`：不同页面结构与对象的脱敏验收样本。
- 新增 `src/studio-workspace.test.ts`：会话/选区/候选边界集成测试；回归 `src/document-layers.test.tsx`、`src/slides-bridge.test.ts`、`src/studio-store.test.ts`。
- 新增 `docs/STUDIO-WORKSPACE-ACCEPTANCE.md`：记录具体构建、环境、输入、操作、实际结果和未通过项。
- 更新本文件状态，不能用模块存在或模型响应成功替代浏览器验收。

**依赖**：C1–C3；与 A 线下载/重导入验收共用证据，避免重复计作完成。

**验收路径**：企业提案、课程各完成创建/打开 → 多页导航 → 图层定位 → 手动修改 → AI 候选 → 接受/拒绝 → 撤销重做 → 保存刷新 → 恢复旧版本 → Docs 独立副本 → 下载 HTML → 重新导入。检查中文输入法、键盘焦点、窄屏、断网、取消、旧候选、并发保存，以及未应用输入和版本恢复边界。确认 Docs 副本不会回写 Studio。

## C5｜跨编辑视图状态一致性（C4 后的补充任务）

**交付**：整合演示/长文档两种作品查看与编辑方式，确保切换使用同一已应用源码；这个任务不阻塞首版以演示页为主的工作台。

**文件**：

- 修改 `src/StudioWorkspace.tsx`、`src/SlidesEditor.tsx`、`src/LongEditor.tsx`：共用会话适配；长文档内部命令保留。
- 参考并按需要提取 `src/App.tsx` 中 `DocumentWorkspace` 的视图切换逻辑；主任务负责此共享文件。
- 复用 `src/DocumentObjectPanel.tsx`、`src/DocumentLayers.tsx`；新增 `src/studio-view-switch.test.ts`，回归 `src/long-workspace.test.tsx`。

**依赖**：C1、C4；先完成 C4，再评估实际重构范围。

**验收**：演示中改字 → 长文档查看 → 返回演示，已应用源码不变；未应用属性输入切换前有明确处理；撤销历史跨视图不丢；普通流式 HTML 不强制分页或转 absolute；导出重导入保留结构。未完成前继续明确使用 Docs 独立副本承接长文档精修。

## 并行与文件归属

- 第一批：C1 与 C3 并行。C1 独占 `SlidesEditor.tsx` 和会话类型，C3 独占场景模型与 brief 面板。
- 第二批：C2 接入，C4 准备样本与验收脚本；C2 先实现独立面板，再由主任务接入。
- 主任务独占 `src/Studio.tsx`、`src/App.tsx` 等共享集成点；`StudioWorkspace.tsx` 和共享样式由各任务提交边界清晰的片段，统一合入，不同时写入。
- C5 是后续补充；跨线编号与 `docs/STUDIO-SPRINT-20260927.md` 保持一致。

完成标准：同一个 Studio 作品会话支持手动与 Agent 修改，修改可恢复、可撤销、可保存与交付。Library 推荐、完整材料理解、多页自动生成、视觉审阅、云端权限与调度均不因此次布局整合被宣称完成。当前所有 C1–C5 都仍是计划，未进行产品代码修改。
