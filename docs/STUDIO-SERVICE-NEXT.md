# Studio 服务下一轮任务：B1–B6

检查日期：2026-09-27。编号与 `docs/STUDIO-SPRINT-20260927.md` 保持一致。依据本机源码只读核查；本次仅编写计划，没有创建数据库、读取密钥、修改生产配置或部署。以下任务均为计划，不能作为已上线能力说明。企业提案与课程并重，用户侧先免费。

## 已实现的边界

| 范围 | 源码已有能力 | 尚未具备 / 不应推断 |
|---|---|---|
| 当前 Docs Agent | `run.ts` 单次 Responses 调用及 `propose_text`；`candidate.ts` 选区/内容校验；`ark.ts` 超时、取消、脱敏 | 多步创作、共享用户身份、项目授权、自动应用修改 |
| 当前任务存储 | `LocalAgentJobs` 单进程串行管理、JSON 临时文件 rename、请求指纹幂等、取消、重启将 running 标为 interrupted、最多 100 条本机记录 | 数据库、独立 Worker、多实例互斥、重启继续生成；候选携带 baseSource，需按作品敏感数据处理 |
| 当前 HTTP | Vite 开发插件限定 loopback peer、localhost Host、同源 Origin；start/query/cancel | 登录、组织空间、生产 API；本机边界不能代替用户授权 |
| 旧 Studio 身份 | `PublicSessionCodec` 签名匿名 Cookie，服务端生成 SessionScope；按 scope 访问项目、修订、任务、素材 | 用户账户、组织成员关系、跨设备归属；匿名会话不能等同登录身份 |
| 旧 Studio 存储 | `LocalProjectStore` 按 scope 写 JSON，进程内锁、修订冲突检测、HTML 源码修订与 SceneDocument 修订关联 | PostgreSQL 适配器、跨进程事务；旧 SceneDocument 不是当前任意 HTML 的同一数据模型 |
| 旧 Studio 执行 | `GenerationJobManager` 分阶段、按 scope 并发、重启活跃任务重新入队；WorkOrder ledger、大纲确认与方向选择 | 独立进程 Worker、数据库 lease；重入队不证明外部调用或写入恰好一次 |

以上来自源码阅读，未重新运行旧仓库测试。现有数据库的实际 schema、用户体系、部署拓扑本轮未核查。

## 可复用位置

- 当前模型与候选边界：[run.ts](/Users/qiu/Documents/opendesign-docs/services/studio-agent/run.ts)、[candidate.ts](/Users/qiu/Documents/opendesign-docs/services/studio-agent/candidate.ts)、[ark.ts](/Users/qiu/Documents/opendesign-docs/services/studio-agent/ark.ts)。复用函数与现有测试，保留模型无直接写权限。
- 当前任务契约：[jobs.ts](/Users/qiu/Documents/opendesign-docs/services/studio-agent/jobs.ts)、[jobs.test.ts](/Users/qiu/Documents/opendesign-docs/services/studio-agent/jobs.test.ts)、[jobs-plugin.ts](/Users/qiu/Documents/opendesign-docs/services/studio-agent/jobs-plugin.ts)。复用状态与幂等测试意图，文件存储只保留作本机适配器。
- 旧匿名身份：[public-session.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/apps/local-api/src/public-session.ts)、[public-session.test.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/apps/local-api/src/public-session.test.ts)。复用签名、过期、scope 隔离方法；Cookie 为 Secure/HttpOnly/SameSite=Lax，需匹配部署 HTTPS。
- 旧项目/修订：[storage.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/apps/local-api/src/storage.ts)、[storage.test.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/apps/local-api/src/storage.test.ts)。重点是 `readForOwner`、`appendRevisionForOwner`、`appendHtmlCompilationForOwner`、`RevisionDriftError`；复用语义与用例，不复制为数据库事务。
- 旧候选决策：[agent-changes.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/apps/local-api/src/agent-changes.ts)、[agent-changes.test.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/apps/local-api/src/agent-changes.test.ts)。复用 proposed/accepted/rejected/conflicted 生命周期；ScenePatch 经 HTML 适配器重实现。
- 旧编排：[generation-jobs.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/apps/local-api/src/generation-jobs.ts)、[generation-jobs.test.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/apps/local-api/src/generation-jobs.test.ts)、[work-orders.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/apps/local-api/src/work-orders.ts)、[work-orders.test.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/apps/local-api/src/work-orders.test.ts)。复用阶段事件、取消及 QA 门禁语义；旧大纲标记 `deterministic-v0`，不能称为真实 Agent 大纲生成。
- Agent OS 通用契约：[types.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/packages/agent-os/src/types.ts)、[ledger.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/packages/agent-os/src/ledger.ts)、[artifacts.ts](/Users/qiu/Documents/opendesign-studio-v0/studio/packages/agent-os/src/artifacts.ts)。可提取版本化类型与校验器，避免为了使用一个 ledger 引入整个旧渲染栈。

## 开发任务

### B1 — 身份与项目归属契约

**依赖：** 无；先确定已有登录身份如何验证。可先做匿名会话适配器和接口测试，不宣称账户打通。

**实现：** 定义服务端 Principal、ProjectAccess、owner/project/version 关联；所有 start/query/cancel/候选读取使用服务端推导身份。匿名 scope 与登录用户使用不同身份类型，保留以后显式认领项目的迁移入口。拒绝前端自行指定 owner。

**复用：** `public-session.ts` 的 codec 与 scope；`server.ts` 的 session → scope → store 传递模式；`storage.ts` 的 owner 方法语义。

**验收：** A/B 两会话交叉查询、取消、接受候选、读取源码均失败；伪造/过期 Cookie 无法继承原空间；同一用户不能操作未授权项目；本机运行保持可用。

### B2 — 项目与修订存储适配器

**依赖：** B1 身份/项目契约；实际数据库接入前只读核查既有 schema。

**实现：** 抽象 ProjectRepository/RevisionRepository，提供本机适配器与独立测试数据库适配器设计。计划表包括 projects、project_members（需要共享时）、revisions；修订保存 original HTML、内容 hash、父版本与来源。大材料保存对象引用，COS 上传通过独立对象存储接口。迁移脚本先在临时数据库验证。

**复用：** 旧 `RevisionDriftError`、预期版本比较、源码/编译产物分离；当前 `src/studio-model.ts` 与 `src/html.ts` 的精确修改边界。

**验收：** 两并发保存只允许一个匹配预期版本者成功；恢复创建新修订；源 HTML 字节内容按 UTF-8 往返不变；写失败不会出现修订成功而项目头未更新；跨 owner 读取失败。

### B3 — 持久化任务与独立 Worker

**依赖：** B1、B2 repository 契约；可先并行写纯状态机和内存测试。

**实现：** JobRepository、单独 Worker 入口；任务含 owner/project/baseRevision、幂等键、attempt、lease 与 heartbeat。事务领取任务，限定每 owner 并发；取消状态阻止迟到结果提交。首次只安全重试候选生成，模糊中断标记 interrupted，待阶段幂等完善后再自动续跑。用量按 attempt 记录，避免把“重试”当作无成本。

**复用：** 当前 `jobs.ts` requestHash/取消/终态测试；旧 `generation-jobs.ts` 阶段机与 scope 并发设计。旧进程内 Promise workers 不能直接当分布式 Worker 使用。

**验收：** 两 Worker 同时竞争不重复提交候选；kill/restart 后任务可解释且可重试；租约到期旧 Worker 的迟到结果被拒绝；重复 start 返回原任务；取消后不写作品；模型错误与凭证不进入公共状态。

### B4 — 任务进度、恢复与创作阶段事件

**依赖：** B1、B3 契约；原型和纯 ledger 可并行，真实项目写入依赖 B2/B5。

**实现：** 企业/课程共用工作单，记录目标、材料引用、大纲、方向、阶段、产物版本；先开放 read_selection、read_material、propose_text，逐步加入 propose_outline/generate_page。事件可按序号恢复获取；工具按阶段白名单提供。真实模型输出与规则生成示例明确标记。

**复用：** `work-orders.ts`、Agent OS `ledger.ts`/`artifacts.ts` 的事件和产物契约；不直接继承旧 SceneIR 对任意 HTML 的限制。

**验收：** 两类场景均从材料到三页草稿；刷新恢复已确认大纲和阶段；重复事件不重复执行；生成前能修改大纲；局部编辑范围不会扩大；产物能追溯材料和模型 attempt。

### B5 — 服务端候选接受与版本提交

**依赖：** B1、B2；候选生成可继续使用本机任务，最终连 B3。

**实现：** 服务端接受 candidateId + expectedRevision，不信任客户端回传的 after/baseSource；读取已存候选、校验归属与版本、使用精确 source patch，事务追加修订并标记 accepted。拒绝候选不改作品。前端继续预览及手动编辑，并显示冲突处理。

**复用：** 当前 `buildCandidate`、`applyProposal`；旧 `agent-changes.ts` 决策生命周期、冲突用例；新 `studio-agent-roundtrip.test.ts` 的双场景交付检查。

**验收：** A 用户无法接受 B 候选；重复接受返回同一结果；生成期间手动编辑导致冲突，旧候选不会覆盖；取消/拒绝后不能接受；企业和课程均通过编辑→版本→导出 File→重新导入，浏览器磁盘下载单独验收。

### B6 — 服务入口、免费额度与受控发布准备

**依赖：** B1–B5。

**实现：** 将开发插件业务提取为独立 HTTP 服务；SSE/轮询共享任务契约；MCP 委托同一身份和项目授权层。免费但后台有调用预算、限流与用量记录；API/Worker 分开健康检查，配置只通过服务端注入。先本机/隔离环境，准备具体部署与回滚方案后再发布。

**复用：** 当前 `ark.ts` 脱敏/超时、`run.ts` 工具约束、jobs 插件输入边界；旧 `server.ts` 路由组织与 quota 思路。不能把取消 localhost 校验视为完成公网化。

**验收：** HTTP 与 MCP 都无法绕过项目授权；浏览器 bundle/日志不含凭证；免费额度耗尽不启动模型；健康检查区分 API 存活和 Worker 可领取任务；隔离环境实测登录→生成→接受→保存→刷新→导出/重新导入；另行完成真实浏览器下载与部署版本验证。

## 并行安排与交付顺序

- 第一批：B1 身份契约；B2 存储接口/临时库测试；B3 状态机/领取协议设计可并行，以同一 owner/project/revision 契约合并。
- 第二批：B3 独立 Worker 与 B5 接受候选并行；B4 先做工作单交互与 ledger。
- 第三批：B4 真模型三页流程，B6 API/MCP 接入与隔离环境验收。
- 首个可交付范围：B1–B5 + B6 的本机独立服务验收；并不以此声称已上线或支持多人协作。
