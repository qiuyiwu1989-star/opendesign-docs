# Studio 工程关系与复用审计

日期：2026-09-24。只读检查 Git 元数据、源码、包配置、说明文档及产物文件名；本次未安装、构建、启动服务、调用模型或部署，也未读取凭据/环境文件。

## 工程关系

以下四个目录属于同一个 Git 仓库，公共 Git 目录为 `/Users/qiu/Documents/opendesign-studio-v0/.git`，经 `git worktree list --porcelain` 核实。

| 目录 | 当前分支 | HEAD | 定位 |
| --- | --- | --- | --- |
| `opendesign-studio-v0` | `feature/html-cloud-docs` | `576ccbec4a9f135e83f2aebe87a8590697b84062` | 主工作区，已包含完整 Studio workspace 与后续 Docs 迭代 |
| `opendesign-studio-core` | `agent/studio-core-ir` | `64a857ab3fd276edcacd320056e8d7e306edd3e1` | 早期契约子任务 worktree |
| `opendesign-studio-web` | `agent/studio-web-shell` | `ff8207319db004a29028378fcb464e9e0abcb544` | 早期 Web 壳子任务 worktree |
| `opendesign-studio-renderers` | `agent/studio-renderers` | `3f4bf22e2befe79eae5b7f074c168ef1a5877944` | 早期渲染与 QA 子任务 worktree |

三个早期分支与当前主工作区比较均为左侧 1、右侧 97 个独有提交；`git cherry HEAD <branch>` 对各自唯一提交均显示 `-`，证明存在补丁等价提交。它们不是最新的三套独立产品，也不应再次无差别合并这些旧提交。没有删除或修改旧 worktree。

`opendesign-studio-artifacts` 不是 Git 仓库，是输出物目录：存在 HTML、PPTX、PNG、六页 PNG、QA JSON、editability JSON 等文件。文件存在只证明磁盘上有产物，本次未打开验证内容、未在 Keynote 中验证可编辑性、未验证产生这些文件的运行可复现性。

主工作区有五个未跟踪的部署/产品文档文件；本审计未修改它们。其他三个 worktree 的短状态输出为空。

## 推荐唯一开发主线

**Studio 集成基线选 `opendesign-studio-v0` 当前 HEAD；后续隔离分支从这一基线建立，不继续三个早期 agent 分支。** 这是本次建议，不是已经完成的迁移或用户确认的仓库调整。

当前 `/Users/qiu/Documents/opendesign-docs` 继续作为 Docs 编辑器工作区；不要因 v0 中也有 `studio/apps/docs-web` 就反向覆盖当前 Docs。前者与后者的具体差异需要按功能/测试比较后择取，避免恢复旧版本存储或交互逻辑。长期保持一个 Docs 编辑内核，并通过有版本的 HTML/任务契约连接 Studio；本次不做整仓合并。

## Studio 包与运行入口（代码静态确认）

Workspace 根为 `opendesign-studio-v0/studio`，`package.json` 包含 `apps/*` 与 `packages/*`，要求 Node >=22。启动命令应在该目录执行，v0 仓库根没有 package.json。

| 命令/入口 | 静态配置 |
| --- | --- |
| `npm run dev` | `scripts/dev.mjs` 并行启动 `dev:api` 和 `dev:web` |
| `npm run dev:web` | `apps/web`，React/Vite，base `/studio/`；README 标称 `127.0.0.1:5173`，脚本未固定 strictPort，实际启动端口仍须验证 |
| `npm run dev:api` | `apps/local-api/src/main.ts`，tsx watch；Web `/api` 默认代理 `127.0.0.1:8787`，端口可由运行配置改变 |
| `npm run dev:docs` | `apps/docs-web`，Vite 固定 `127.0.0.1:5175`、strictPort，base `/docs/` |
| `npm run test/typecheck/build` | 遍历 workspace 对应脚本；本次未执行 |

另有 `apps/admin-api`、`apps/library-admin`；默认 `dev` 不会启动它们。`apps/web/src/main.tsx` 与 `App.tsx` 是 Studio UI 入口，`HtmlSourceEditor.tsx` 与 `editor-model.ts` 提供 HTML 源编辑与编辑模型代码。

## 值得复用的模块

| 模块 | 代码中已有的职责 | 建议接法/边界 |
| --- | --- | --- |
| `packages/contracts` | Scene IR、ScenePatch、Revision、来源、编辑能力和 Structured HTML 契约及校验 | 优先评估为 Studio → Docs 的版本化交付契约；不要强制把任意导入 HTML 全转成 Scene IR |
| `packages/agent-os` | 工作单、执行计划、证据、产物、事件、候选和反馈；纯领域包 | 可复用任务状态定义；代码/README 明确不负责调用模型、存储或发布 |
| `packages/model-adapter` | fixture provider、可取消的兼容 HTTP provider、候选校验入口 | 先跑离线 fixture，再单独验证真实模型；显式注入配置，不能把模块存在写成 AI 已接通 |
| `packages/design-director`、`design-packs` | 校验输入、来源覆盖、确定性编译 Structured HTML、导入门禁 | 优先复用生成后的可编辑结构约束与模板，不把它描述为已具备自由设计推理 |
| `packages/change-adapter` | 对模型给出的受限 ScenePatch 重新验证与生成差异 | 可学习“指定范围修改→差异确认”；它不保存、不批准、不自行调用真实 provider |
| `packages/html-document`、`html-importer` | SceneDocument 与声明式 Structured HTML 的序列化/受限导入 | 用于可控新生成内容；不是任意网站 HTML 的无损双向转换器 |
| `packages/renderers`、`qa` | HTML、PNG、原生对象 PPTX 输出代码与确定性质量检查 | 独立验证样例与原生文件编辑后再接产品；Node/native canvas/PPTX链不要混入浏览器首屏依赖 |
| `packages/ui`、`apps/web` | Studio 页面壳、组件与工作流实现 | 参考/提取明确组件，避免把另一套应用与 API 状态整体复制进 Docs |

## 与 Docs 保真边界

Studio 的结构化生成以受控 Scene IR/Structured HTML 为基础；现有 Docs 对外来 HTML 以精确源片段修改保留原文档。两条路径可以通过输出 HTML 和显式来源元数据衔接，不宜宣称 Scene IR 能无损覆盖全部 HTML/CSS/脚本。

`html-importer` 源码有明确允许标签与能力集合，并阻断脚本、iframe、form 等结构。它更适合作为生成内容的受控验收入口，不应替换 Docs 任意文档接收入口。

## 运行与发布证据边界

- **本次确认**：Git/worktree关系、当前提交、包/入口/源码存在、输出文件存在。
- **历史文档记录**：v0 `specs/019-docs-interaction-hardening.md` 写明 144 测试、本机 IAB 回归、未部署/推送，原生全屏和鼠标手柄门禁未关闭。该记录属于当时 Docs 子应用，不是当前 Studio 全链路验收，也不是本次重跑结果。
- **历史 README 提醒**：Studio README 提到匿名 `/studio/` 临时预览及共享服务端工作区限制；本次未访问公网，不能据此认定当前部署、隔离或安全状态。
- **未确认**：当前进程、实际监听端口、当前真实模型成功率、云端隔离、PPTX 在 Keynote 中的真实可编辑性、当前公网版本。

## 建议下一步

1. 在 v0 当前基线完成离线 contracts/model fixture/design-director 测试，记录工具链与准确测试范围。
2. 选一个合成课程或提案，打通 Structured HTML → 当前 Docs → 局部修改 → 导出重导入，验证来源与编辑边界。
3. 另设原生 PPTX 验收；真实模型与服务部署作为独立步骤，不能由代码存在或历史产物推断完成。

## 本轮主任务运行补充

2026-09-24：在v0启动隔离API 127.0.0.1:8798、前端127.0.0.1:5201/studio/，使用fixture模型及/tmp/opendesign-studio-audit-20260924数据目录。未调用真实模型。
浏览器确认六页作品、HTML/画布切换、元素选择后X/Y/W/H/字体/对齐及Agent局部修改入口可见。修改标题后保存显示“本地API不可用”；/api/health实际返回ok/fixture，因此不能直接归因为服务未启动。会话Cookie固定Secure而测试环境HTTP是待核实因素，不作为已确认根因。需在下一轮检查保存请求响应及会话归属后修复，不应直接迁移上线。

## 2026-09-25 保存修复
准确根因已查明：默认六页fixture仅在前端存在，首次保存却调用要求项目已存在的html-source接口，返回404。与早先Cookie猜测区分；未削弱Cookie安全设置。
修复首保存仅为确认不存在的fixture创建项目，已有项目保持revision检查，展示真实错误并保留草稿。HTTP创建/冲突/后续保存回归与34个App测试、类型、构建通过。实际浏览器首次改标题→保存显示同步→刷新后标题保留；第二次修订保存后已刷新，最终DOM复核与公网部署尚未完成。v0修复仅本地，详见 /Users/qiu/Documents/opendesign-studio-v0/docs/studio-first-save-fix.md。
