## 2026-09-29 Studio 云端免费试用已发布

公网版本 `20260929T052906Z-handoff`，独立 PostgreSQL / API / Worker 已启用，610 项测试及真实公网模型与浏览器保存/下载验证通过。匿名30天，暂不支持跨设备登录。详见 [发布回执与回退步骤](releases/20260929T052906Z-handoff.md)。

## 2026-09-19 场景样板发布（Spec042）

- 发布：`20260919T131308Z-handoff`，21:14 +08；回滚 `20260919T103501Z-handoff`。新增文档库“从场景样板开始”：免费教师课程 9 页＋独立活动单、企业提案 8 页。全部为合成样板，并非实时 AI 输出。
- 全量 336 项测试、TypeScript、生产构建和 bundle budget 通过；样板 15.86 kB 按需加载，初始 JS 423947 bytes。
- 候选浏览器实际创建两场景；课程标题和企业预算分别修改、保存、刷新、实际下载、真实文件选择器批量重导入成功；下载源码仅预期文字不同，所有其他源码完全相同。重导入后修改仍在，页数 9/8 保留。
- 课程 9 页和提案 8 页 DOM 内容边界检查：无超出画布/压住页脚项；首屏和方案表视觉检查通过。活动单实际创建并打开，含 14 处可编辑文字；打印分页、真实投影与目标用户评审尚未验收。
- 公网 release/index/入口 JS/CSS/场景模块与发布包逐字节一致；MCP health 200。公网 Safari 点击入口，实际创建九页课程和配套活动单，再创建八页企业提案，均显示已保存在本机；两入口已验证。
- 设计取舍与后续总监输出约定：docs/SCENARIO-DESIGN-NOTES.md。源样板：examples/scenarios/。本轮没有实现模型调用或 AI 局部修改。
- 包 SHA256：`4725bfda473cf739ddca19376368c4dcf1d1cdafd066803a719b3f31e06b5530`。源码哈希清单包含样板 HTML：docs/releases/20260919T131308Z-handoff-source-sha256.txt。未混合提交既有工作；哈希清单不是源码快照。

## 2026-09-19 资源保真与比例提示发布

- 公网版本：`20260919T103501Z-handoff`，18:35 +08 激活；回滚目标 `20260919T063449Z-handoff`。
- 发布包 SHA256：`f9bd29c44265efa0b407114a101c5920d2c6ae6fe2305d4be9bdf0788d951933`。服务器校验全部文件并通过 nginx -t，原子切换静态目录；未重启 MCP。
- 发布内容：spec040 实时比例提示、spec041 图片解码 15 秒超时与迟到资源清理。此前全量 336 tests、TypeScript、生产构建及包预算通过；本轮未修改应用代码，新增可复用资源验收样本。
- 候选实测：In-app Browser localhost:5196，通过真实文件选择器导入合成 HTML；损坏 PNG 被拒绝且原稿未变；PNG/WebP 与 OFL 授权 Noto Sans SC 子集 WOFF/WOFF2 替换、保存版本 2、刷新、实际下载和文件选择器重导入通过。两张图片 naturalWidth/Height 均为 320×200，complete=true。
- 下载产物 `/Users/qiu/Downloads/roundtrip-edited.html`：四项资源与样本逐字节一致；差异仅资源来源及相邻引号/空格，正文和版式代码保持。重导入为新文档，资源面板两字体显示已内嵌。
- 字体浏览器解码通过，截图中两个中文标题可读；该子集仅覆盖样本标题，不能代表完整 CJK 字形兼容。自动化 DOM 环境无法读取 FontFaceSet 状态，不将字体 CSS 声明等同逐字字体来源证明。
- HTTPS release/index/main/slides/image-import/resource-panel 与本地包逐字节一致；MCP health 200。原生 IME、手势矩阵和深脑真实按钮仍未关闭。
- 发布后 UI：Safari 新标签访问公网成功；创建演示样例，实际 Shift+Right 将手柄标签 100%→101.5%，保存成功。Safari 原生文件选择器成功导入实际下载的 roundtrip-edited.html；两个中文标题、PNG 与 WebP 显示，资源面板两字体均为已内嵌。IAB 公网导航两次超时，改用 Safari 完成；本地 IAB 完整闭环与公网 Safari 导入复核分别记录。
- 样本及 OFL：`tests/assets/resource-roundtrip/`。源码哈希清单：`docs/releases/20260919T103501Z-handoff-source-sha256.txt`；仓库包含既有未提交工作，本轮未创建 git 提交，哈希清单不是可还原源码快照。

## 2026-09-19 14:36：演示页键盘缩放已发布

Release `20260919T063449Z-handoff`，回滚点 `20260919T062545Z-handoff`。SHA256 `6e1ebf8b8965c771fa478b0955cd2b07a383d97677e997e09241b12b68ef7812`。

- 缩放手柄获得焦点后方向键等比缩放，Shift 使用较大步长；对象本体方向键仍然移动。复用鼠标缩放的边界约束和固定左上角几何补偿，支持既有撤销与版本保存。
- 改动前新测试证明缩放手柄上的方向键只移动对象（比例仍为 1），修复后通过。完整 44 文件 / 329 tests 通过。
- 构建发现前轮新增目录测试漏传 createPreview 第三个参数，已补 false，TypeScript、生产构建和体积预算通过。
- Safari 候选版本真实选择手柄、Shift+Right 后比例 1.015，水平偏移 5、垂直偏移 0.3；撤销、重做、保存、刷新后重新选中，数值仍一致。
- 公网 release、入口、主 JS 与演示 JS 与构建逐字节一致，MCP health 200；本轮未再在公网重复键盘流程。
- 本功能免费，无后端/数据结构改动。50/75/100% 真实鼠标拖拽、触屏、原生 IME 和深脑生产按钮仍是独立未完成项。

---

## 2026-09-19：免费章节目录已发布

Release `20260919T062545Z-handoff`；回滚点 `20260919T052742Z-handoff`；归档 SHA256 `e6ac633cbcf0dfd9f8cf28afe14173aac19a056cc79fd55e5ac912e88253ac27`。

- 长文侧栏新增目录，列出 H1–H6，支持嵌套文字/换行，按级别缩进；无标题显示空态。
- 点击发送经来源与 channel 校验的导航消息，预览定位并聚焦标题；源码不增加导航标记。输入未结束、侧栏未应用、预览未就绪或正在保存时禁用跳转。审阅时目录取自所选版本。
- 全量 327 tests 通过；随后新增目录测试，HTML 测试 10/10 通过（新增 1 项，合计 328 个测试用例）。生产构建与体积预算通过。
- Safari 候选页识别混合/换行标题并成功定位；公网报告出现 12 个章节入口，点击“证据”后滚动到正文证据章节，截图确认。原有版本 3 保留。
- 公网入口/JS/CSS/release 与本地构建一致，MCP health 200。本轮未改存储、导出源码或后端。
- 原生 IME、真实深脑生产按钮和触屏代表验收仍待完成。

---

## 2026-09-19 13:28 +08：失焦与连续输入防护已发布

Release `20260919T052742Z-handoff`，回滚点 `20260918T155207Z-handoff`。归档 SHA256 `047181bda2f6448532c52ad5fbccaf6381562f671d26b90c9a597bea1b23d201`。

- 组合输入期间失焦延后提交；确认结束等待最终输入期间阻止 flush、Escape 和双击切换编辑目标。
- 增加输入轮次标记，使旧轮次的延迟回调不能结束新一轮输入。新增竞态测试修复前失败、修复后通过；取消输入不产生 edit 的回归通过。
- 完整 44 文件 / 327 tests 通过，生产构建和体积预算通过。
- 同一候选构建在 Safari localhost:5195 验证长文标题“输入保存回归 0919”、演示页正文“演示页保存回归 0919”：页内直接编辑、保存、刷新恢复均通过。setValue 是直接填字，不等同系统输入法候选实测。
- 远端校验发布包、nginx 配置通过并原子切换；公网 release.json、index.html、主入口、长文和演示 JS 与构建一致。MCP health 200。
- 发布后浏览器复核被系统屏幕捕获错误阻断；不能把发布前的候选操作写成发布后操作。系统 IME 与深脑真实生产按钮仍待验收。
- 无数据库或 MCP 服务变更。源码工作区仍未提交。

---

## 保存防护发布与报告回读 — 2026-09-18 23:53 +08

Release `20260918T155207Z-handoff` 已上线；回滚点 `20260918T130600Z-handoff`。归档 SHA256：`2bad935e12e473adb60fd8dea9b8d8d8b271e9a7b26db000a25f60a6fbffacd6`。

- 320 tests / 44 files、生产构建与体积预算通过（本批源代码未再次修改，沿用同一构建）。
- 已发布：组合输入期间拒绝程序化 flush；长文源码修改异常时取消待执行保存/导出。
- 候选构建在内置浏览器完成真实文件选择器导入 → 页内改标题 → 保存 → 刷新 → 实际下载 → 文件选择器重新导入。下载文件 41776 bytes，仅标题变化，10 SVG、7 证据锚点完整保留；重导入后标题和图表可见。测试文件是合成报告，不能替代深脑生产按钮联调。
- 公网 release.json、index.html、主入口、长文与演示 JS 与本地构建逐字节一致；MCP health 200。Safari 刷新公网后旧报告、版本 3、10 图表及 MCP 入口正常恢复。
- 原生中文输入法候选仍未验收；原生 Safari 文件选择器自动化失败原因未定，内置浏览器的实际文件导入已通过。此次发布只关闭程序化 flush 防护与报告回读项，不关闭整个 P0。
- 本批无需数据库变更或 MCP 服务重启。工作区尚未提交，不以 Git HEAD 代表本次发布。

---

## MCP 页面入口 — 2026-09-18

编辑器顶部及文档库底部新增“MCP 接入”链接，在新标签页打开 `integrate/#mcp`，保留原文档；链接路径兼容 Vite BASE_URL。Safari 公网点击确认跳至 MCP 段落，原编辑器标签保留。typecheck、domain build 和 bundle budgets 通过，变更公网文件逐字节一致，MCP health 200。此次轻量导航改动未新增或重跑完整单测；未宣称验证未保存输入或移动端。

Release `20260918T130600Z-handoff`，archive SHA256 `85917c5531156dedfb6607a0fcd86d512c2e89755f2ac5188f111d17a2767291`。前版 `20260918T033700Z-handoff` 保留可原子回滚。编辑器优化的优先级和验收标准见 [优化计划](EDITOR-OPTIMIZATION-PLAN.md)。

---

## 最新：开发者 MCP 公网试运行（2026-09-18 11:31 +08）

独立 MCP/REST 已上线 `/connect/`，开发者门户于 11:40 更新。当前静态 release `20260918T033700Z-handoff`；先前版本为回滚点。318 tests 通过，公网 MCP 客户端、浏览器导入/保存刷新/实际下载及成功后清理已验证。完整证据、额度和回滚步骤见 [MCP 部署记录](MCP-DEPLOYMENT.md)。下方旧状态为历史记录。

---

## 当前公网发布 — 2026-09-18

已获用户授权并于 11:08:26 +08 激活 `20260916T160027Z-handoff`。Docs 接收端、SDK、接入页已上线，MCP 服务仍为本地可选进程。316 tests / 44 files、构建、22 个公网文件字节校验及 Safari 交接取消/成功、编辑保存刷新、实际 HTML 下载通过。深脑真实生产按钮尚待对方联调。

详见 [上线回执](incoming/2026-09-18-opendesign-public-ready.md)。归档 SHA256：`efa2536697bc3a7158e7d876132719448b39c3c219a9b83a8d7bd235e89a4973`。当前目录 `/var/www/doc.opendesign.cc/releases/20260916T160027Z-handoff`；回滚版本 `20260910-438f7c3`，保留旧资源。源码工作区尚未提交，不以 Git HEAD 代表此发布。

---

## 历史记录（以下状态以当时为准）

# Production alpha — 2026-09-08

URL: https://doc.opendesign.cc/

User explicitly requested deploying the current version. Delivered source: `9820591`, activated 2026-09-08T05:44:52Z. This is a usable alpha, not completion of the broader v0.1 browser/device acceptance matrix. Keep it stable during the user's trial. No GitHub push was performed.

## Release and rollback

Static root build only; no backend or shared-service restart. Existing nginx configuration, CSP and certificate were retained. Release archive SHA256: `8ecdf214da7bb5ff20942c17fd17ff802dd35511f5ae06163e28c2b14e28c58b`. Every deployed entry/asset matched the locally built bytes.

The release uses the existing atomic `current` symlink convention. Release label: `20260908-9820591`. Legacy hashed assets remain available for already-open clients. The preceding activation and original v1 release were retained.

Prepared rollback label: `20260908-f98750c-ready-rollback`, based on `f98750c` plus the same authenticated readiness-handshake fix. Archive SHA256: `2145f6dec1d8eceb7f3855845c2a303555c8ac9befd668d5baaca179f5e32ae8`. Its tests/typecheck/build pass, but a live browser rollback drill was not performed.

Do not roll back to the original v1 application after a browser has upgraded its local database. Use the prepared schema-v3-compatible build. For an authorized rollback, resolve and validate the prepared rollback symlink on the host, create a separate temporary current link, then atomically replace current; never delete releases or clear browser storage. Recheck assets and actual edit/save/reload/download behavior afterward.

## User data and migration

Documents, drafts, versions and annotations remain in IndexedDB in the current browser and origin. They are not uploaded or synchronized. Localhost documents do not automatically appear on the public domain. Use the old page's Backup and Restore flow to export a project backup, then import it on the public domain. Export HTML alone does not include version history and comments. Do not clear browser data before making backups.

## Acceptance and limits

See ACCEPTANCE.md, spec030: native edit, applied text, formal version save, refresh persistence and actual downloaded HTML passed. Initial deployment QA found and fixed a frame readiness race; HTTP 200 alone did not suffice. 240 tests pass; entry and slides JS closures remain under 450,000 and 490,000 bytes.

Physical drag/resize after the recent threshold change, native IME, touch, broader browser coverage and full production presentation navigation remain separate gates. Source/asset compatibility is conservative, not support for arbitrary scripted HTML. Native QA stopped when the user switched to unrelated browser work; no user tab was closed or refreshed. The synthetic example record and its verified download were retained.

HTTPS was valid at deployment (certificate expiry 2026-12-05); this release did not reconfigure or certify automatic renewal. Health and access-log checks were bounded deployment checks, not a scheduled monitor.
