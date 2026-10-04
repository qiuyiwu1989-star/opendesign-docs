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

# Acceptance record

## Spec037: public integration foundation (2026-09-16, local only)

- 313 tests / 44 files pass. The full suite encountered one existing large-fixture 5-second timeout with two workers; one worker passes without raising thresholds, and the npm test command now uses one worker. SDK protocol tests, store boundaries and real HTTP MCP Client initialize/listTools/callTool are included. A test initially used fetch to override Host; Node rewrote it, so the DNS-rebinding check now sends a real node:http Host header and verifies 403.
- Typecheck and both base builds pass. Root static JS closures: initial 419649, long without tools 443864, slides 478987 bytes. Browser SDK IIFE 2841 bytes / ESM 2368 bytes. MCP dependencies never enter the browser bundle. npm audit continues to report the already-tracked development-only Vitest advisory; no new MCP advisory appeared in that audit.
- Official MCP Client generated a synthetic DeepBrain handoff via the live local :5192/mcp endpoint. Browser landing identified the file, expiry and bearer-link semantics. First import was cancelled in Docs; the landing showed cancellation and allowed retry. The second attempt displayed the origin :5192 and imported the report into Docs :5191. The landing showed saved success and removed its URL fragment. A separate HTTP read of the same token then returned 404, proving cleanup rather than just trusting the UI.
- Imported MCP report H1 edited to “天使轮估值谈判复盘 · MCP 开放接入验收”, saved, refreshed and recovered in Docs; all five static figures and inline evidence links remained in the rendered document. The exact-source export/physical download/chooser-reimport evidence is the separate Spec036 record below, not a newly repeated export claim for this MCP document.
- Built `/integrate/` page and actual IIFE button tested: user confirmation appeared, source showed saved success, and the resulting HTML heading/body rendered in Docs. Desktop screenshot inspected. In-app fractional iframe input required the same temporary 1280×900 viewport used in Spec036; reset afterwards.
- Public SDK URL, public MCP hosting, production DeepBrain button and specific third-party MCP hosts are not released or certified by this local acceptance. Single-process in-memory storage only; no accounts, billing, cloud sync, long-term retention or arbitrary website URL capture.

## Spec036: external HTML handoff (2026-09-16, local only)

- 303 tests / 41 files pass with 2 workers, both `/docs/` and root builds and original bundle budgets pass. Root closures: initial 419610, long without tools 443747, slides 478875 bytes. First unrestricted worker run hit the existing 5-second limit in five large-fixture tests; reducing workers passed without relaxing thresholds.
- Source `127.0.0.1:5190` → Docs `127.0.0.1:5191`: READY/PAYLOAD, explicit origin/name/size confirmation, one local document and exact-origin RESULT success verified in the in-app browser and native Safari. Reload retains the document without repeating import.
- In-app browser: edited mixed inline text while retaining evidence links, saved and reloaded; created/reloaded a version-bound comment; moved/deleted/restored a static chart; declined a second handoff with unsaved edits and observed rejected plus unchanged draft. Desktop pointer acceptance at 1280×900; fractional iframe coordinates were rejected by the automation at its default viewport.
- Safari: title edit/save/reload; real 21150-byte download, byte-exact to the fixture except the intended H1 edit; that downloaded file was reimported using the in-app browser's native file-chooser API. All five chart names and edited title restored. Ordinary HTML intentionally does not include comments. In-app download event alone did not yield a confirmed file and is not claimed as download evidence.
- Five static SVG charts visually checked in Safari under the host's dark theme; SVG #3 link jumped to the cash-flow evidence. Static source tests cover style/media/class/fragment retention and every chart's exact deletion; active/identity-bearing subtrees remain blocked.
- Safari review-switch readiness failure reproduced, then fixed by binding iframe lifecycle to preview channel. Actual Safari anchor selection and saved comment passed afterward. This is not a full cross-browser/IME/device matrix.
- Sample source audit: 1 HTML / 21133 bytes, zero scripts/external/relative resources, 48 editable text segments and source roundtrip passed.
- No server, account, cloud storage, CSP change, push or deployment. Release number remains unpublished. Detailed four-point compatibility response and reproducible local setup: `docs/incoming/2026-09-15-deepbrain-handoff-import.md` §8.


## Spec035: review wayfinding and toolbar icon pass (2026-09-10, local only)

- Automated: 275 tests across 39 files pass, including sequential marker numbering, active selection, resolved/missing markers and authenticated thread opening. Source audit, production dependency audit, typecheck, whitespace checks and both build bases pass.
- `/docs/` static JS closures remain under their fixed gates: initial 425,831 bytes, long document 449,894 bytes and slides 476,092 bytes. Review marker code remains lazy and outside reading/slides closures.
- In an isolated local browser origin, created three text comments and observed document markers `1`, `2`, `3` plus matching numbered inspector anchors. Clicking marker `2` restored an amber outline around “设计留在原处”, emphasized the marker and focused its matching thread card.
- Toolbar QA confirms consistent self-authored line icons for undo, redo, resources, export and save without increasing header height. Mode switches retain clear text; accessible names and tooltips remain. No Apple asset is distributed.
- No production deployment, public push, cloud review identity, voice comment or realtime collaboration change.

## Spec034: delivery and long-document performance baseline (2026-09-09, local only)

- Added a one-source immutable parse snapshot shared by deferred contextual long-document catalogs, object capability checks and selected-style inspection. A changed source replaces the cache. Base reading and preview construction retain their existing parsers so the editor-only optimization stays out of the reading closure; preview also strips and decorates a disposable tree before serialization.
- Final automated gate: 275 tests / 39 files, typecheck, example audit, production-dependency audit and both base-path builds pass. `/docs/` closures: initial 425802 bytes, long reading 449587, slides 475982; existing budgets were not raised.
- `npm run benchmark:long` validates 100 and 400-object documents plus a deterministic 5,241,856-byte / 400-object case. Acceptance-host sample: 2.7 / 0.8 ms cold/warm for 100 objects, 3.0 / 0.8 ms for 400, and 162.1 / 1.0 ms near 5 MiB. Ceilings are deliberately conservative and catch repeated full parses; these numbers are not an end-user performance promise.
- Isolated browser selected the rotated card, requested scale 1.096 and successive 10px moves at outer 100%, 75% and 50%. Saved/reloaded source progressed through x=10, x=20 and x=30 while retaining `rotate(6deg)` and scale 1.096. These are programmatic Moveable requests through the real sandbox/host bridge, not native pointer drag/resize acceptance.
- Chooser-driven reimport of `/Users/qiu/Downloads/体验文档-edited.html` was not performed because browser file upload requires explicit authorization. Exact on-disk source verification from spec033 remains valid but is not relabelled as import evidence.
- No production deployment, GitHub push, production dependency, schema change or user-owned browser tab mutation.

## Spec033: inspector fidelity and delivery closure (2026-09-09, local only)

- The compact long-document inspector reads supported literal inline font size, color, weight and alignment from the selected exact-source object. Unknown stylesheet/cascade values and mixed text runs are labelled rather than replaced with a fake 24px/default color. Parsing is source-only: no computed CSS, relative units, variables, broad shorthand interpretation or DOM serialization.
- 273 tests / 38 files pass, including 10 source-style parser cases and two inspector rendering cases. Typecheck, `/docs/` and root builds pass. Closures remain within unchanged budgets: initial 425802 bytes, long reading 449587, slides 475757. Object tools remain deferred; Moveable, Selecto and esbuild remain development-only. Production dependency audit reports 0 vulnerabilities.
- On a fresh isolated browser origin, selected a public demo paragraph and deleted it without a confirmation dialog; visible text targets changed 9→8. Undo restored the paragraph and 8→9; refresh retained the restored source. Deleting again, saving version 2 and refreshing retained the deletion.
- Actual download `/Users/qiu/Downloads/体验文档-edited.html` is 1,634 bytes and equals the public demo source with only that complete selected `<p>` removed. It contains no preview metadata. This closes delete/undo/save/refresh/on-disk export; native chooser reimport of this specific download was not completed and remains separately open.
- The isolated Moveable/Selecto adapter now explains and corrects the experimental 9.1px mismatch: Moveable `beforeDist` is inverse-before-matrix space, so the adapter maps it back through the gesture-start uniform scale. Tests show scale 1.096 followed by a requested 10px move writes 10.0px and preserves `rotate(6deg)` through source serialization. Native drag/resize/save/reload at 50/75/100% and all declared no-go geometries remain unaccepted; no production gesture migration occurred.
- No production deployment, GitHub push, schema change, credentials or user-owned browser records were touched. The PM/spec workflow kept experimental gesture work isolated from the local product candidate.

## Spec032: document object foundations (2026-09-09, local only)

- Reused the existing exact-source `object-edit` engine through a catalog adapter, adding contextual long-document paragraph/image/block tools, sibling reordering and insertion. Existing text edits, draft/history/version and export pipelines remain in use. Tools load only in edit mode; bundle guard enforces this. The object catalog caches one source parse; mutation capability validation still reparses exact source and performance needs a separate measured gate.
- 254 tests / 35 files and typecheck including the experiment pass. `/docs/` JS closures: initial 425802, long reading 449587, slides 475757 bytes. Root: 425797 / 449582 / 475752. Existing budgets not raised. Production dependency audit: 0 findings. Existing development Vitest advisory is tracked separately; no forced major upgrade.
- Isolated :5183 browser imported the public review fixture, changed heading to 48px, inserted a paragraph, moved it before the heading, saved version 2 and refreshed. Original bold/link markup retained. Directly edited the new paragraph to `编辑后的段落`, inserted and replaced a synthetic PNG through the real chooser; decoded dimensions 320×180, `complete=true`. Invalid PNG was rejected before source mutation.
- Saved version 3 and downloaded `/Users/qiu/Downloads/review-foundations-edited (2).html`: 132113 bytes, SHA256 `99c0ecbc757bca1bc2533931c62ab60632ffd1fff54c1e029bcdc45b605e13e8`. Exact byte comparison against the original plus the explicitly applied source operations passed; no preview metadata. Reimported that actual file, retained image/text/formatting, and copied a paragraph in the browser.
- A native confirm dialog blocked the first test tab during delete QA. The final delete control removes the selected source block directly with existing undo/history, without a blocking confirm. Spec033 closes the fresh-origin delete/undo/save/refresh/on-disk export path; chooser-driven reimport of that deletion download remains open. Original saved versions stay intact, and no user-owned tab was refreshed or edited.
- Development-only Moveable/Selecto experiment: sandboxed library initialized under opaque origin, click selection and request-event source writeback worked, original rotate(6deg) retained, saved experiment source survived reload. Runtime bundle 280160 bytes, absent from production builds. After scale=1.096, request rightward 10px wrote 9.1px: coordinate mapping not production-ready. One automated mouse drag produced no confirmed move. No native drag, touch, rectangle multiselect, or cross-browser acceptance claim. Keep the current production gesture engine.
- No production deployment, GitHub push, backend/schema change or private fixture check-in. Preview :5183 is an isolated local origin, not cloud synchronization.

## Spec031: edit/review foundations, first slice (2026-09-09)

- Actual source reuse: adapted `CommentsUI.refresh` marker construction from Bento revision `01000838496ec863ba1035eae12a8a4943020cdc`; attribution and MIT permission in NOTICE and portable preview/runtime. The adapter retains our versioned text/region anchors, uses a shadow layer and authenticated messages. Bento Store/CRDT/editor and Moveable/Selecto are not integrated by this slice.
- 244 tests / 34 files and typecheck pass. `/docs/` build: initial JS 424,739 bytes; long-document closure 447,122; slides closure 474,501. Root build: 424,734 / 447,117 / 474,496. Existing entry/slide limits were not raised; added a 450,000-byte long-view gate and a lazy-marker assertion. LongEditor was mechanically extracted from App and made a deferred feature, not rewritten.
- New public `examples/review-foundations.html` imported through the file chooser into an isolated :5182 browser origin. Selected the previously unsupported plain text before a strong element, changed it to `Updated intro `, applied and saved version 2. Refresh retained the edit, strong text and anchor link. Exported content matches original file with only that exact text replacement byte-for-byte; no preview wrappers written back.
- Added title comment, clicked its actual shadow-DOM marker, replied and resolved it. Resolved marker remained visible and clicking it selected the resolved thread. Added a region via Shift+Enter, saved, refreshed and reopened review: both text/resolved and region/pending markers persisted. In-app drag did not produce a confirmed rectangle; no new native-pointer acceptance claim.
- Actual Downloads files: `review-foundations-edited.html` equals the intended v2 source; `review-foundations-edited (1).html` equals original source exactly. Historical-version review export excludes v2 comments. Final `review-foundations-review (2).html`: 20,981 bytes, mtime 2026-09-08T17:22:42.821Z, SHA256 `4531278fe2663b1557bac786035c3172cf0b1c77cc932b2403941a488b78c3fa`. Contains the two v2 threads, saved reply and resolved state; excludes other-version comments and unsubmitted drafts.
- Copied the actual downloaded synthetic review file byte-for-byte to the local preview directory and opened it independently: document, preserved formatting, comments, replies and marker click-to-thread render without editor storage. Final viewer removes annotation-creation cursor/actions. This proves standalone HTML over local HTTP; direct file:// and cross-browser behavior were not separately exercised. Original scripts and remote resources are stripped by the same inert renderer, so it is not a pixel-identical arbitrary-HTML export.
- At a different iframe width, the saved text marker remains anchored but the region marker correctly shows `位置待定位` in the fallback stack. No silent reprojection. Region anchors still require their saved viewport width for exact positioning. Text targets are segmented safe source runs, not a full rich-text editor; whitespace-only runs and unsupported SVG/scripted content remain excluded. Preview-only spans can affect highly selector-sensitive CSS; source export remains unchanged outside explicit patches.
- No deployment, GitHub push, schema migration, credentials or user-source edits. Public synthetic QA record/downloads retained; user tabs and production untouched. QA tab :5182 retained for user trial. Initial development build also regenerated ignored dist; no :5179 listener was active. Final accepted build lives in isolated /tmp directories with prior hashed assets retained during updates.

## Spec030: production alpha deployment (2026-09-08)

- Source `9820591`, activated at 05:44:52 UTC on https://doc.opendesign.cc/. The preceding `96715f3` activation exposed a readiness race in native production QA: selection worked but save/export/play remained disabled. Added authenticated request-ready after parent listener registration and iframe load. The fixed release shows dimensions and enabled controls after reload.
- 240 tests / 32 files, typecheck and production-root build pass. Entry JS closure 442,662 bytes; slides 487,585 bytes, within unchanged budgets. Compatibility rollback based on `f98750c` plus the same readiness fix passes 233 tests, typecheck and root build. Rollback is prepared, not production-browser exercised.
- Native Doubao browser, new production QA tab and new public example only: changed paragraph to `Production release check 2026-09-08`, applied text, clicked Save version, reloaded, confirmed the exact text and ready controls. Clicked Export then Download HTML. Actual Downloads artifact `演示页体验-edited (3).html` is 1,464 bytes, mtime 05:46:58.671 UTC, contains the marker and both slide pages, and no readiness bridge. Older downloads and existing user documents were not overwritten. Pending text correctly blocked premature save before Apply.
- All six production entry/assets match local bytes; root and healthz 200, deliberately missing asset 404, Library and Studio 200. Access-log sample after fixed activation: 12 requests, zero 5xx. This is a bounded observation, not ongoing monitoring.
- User switched the native browser to unrelated work after download, so further native interaction stopped. Full presentation navigation, physical drag/resize, IME, touch and cross-browser gates are not closed by this deployment. Existing localhost user tab was not refreshed or closed. Browser storage was not cleared; the synthetic QA record and downloaded file remain.
- No GitHub push, server database change, nginx restart or security-policy relaxation. Existing browser storage may upgrade to the current IndexedDB schema; rollback must use the prepared compatible build, not the initial v1 application. See DEPLOYMENT.md.

## Spec029: editing continuity and compact inspector (2026-09-08)

- 239 tests / 32 files and typecheck pass. Both base-path builds and budgets pass: `/docs/` initial/static JS 442,595 bytes; slides static closure 487,348 bytes, below the existing 450,000/490,000 gates. No budget increases or new runtime dependencies.
- New trusted-bridge VM tests: half-zoom sub-threshold pointer jitter writes no placement; a meaningful gesture converts correctly; modern composition flags and keyCode 229 do not cancel text or nudge objects. Explicit Escape restores original text without edit messages in both long-document and slide bridges. Shared-key and pristine-inspector SSR tests added. These are simulated events, not native IME/device evidence.
- Isolated browser QA on a newly imported real VR deck at 1280 x 720: text, style and position drafts cancel with Escape; collapsed position disclosure preserves pending state and announces it in its summary; cancellation clears that state. Direct canvas text cancels back to the original, then Ctrl+Enter commits the intended replacement. Unchanged text no longer displays a redundant apply row. Screenshot confirmed precise controls are collapsed and canvas remains dominant.
- Keyboard ArrowRight moved the chosen paragraph by 1px. Undo/redo UI paths exercised; after formal save and reload, DOM retained both replacement text and 1px translation. Actual downloaded `vr-deck-edited.html` is 20,285 bytes, mtime 2026-09-08T03:50:24.984Z, SHA256 `9a600cd75be0e47fa45e0c52452fdd90c1205f54ef7ec912da0c6277ed394905`. File equals the expected source-span text replacement plus placement patch byte-for-byte, retains all 10 pages and has no editor markers. Reimport through file chooser preserved the text and translation. Original local input was not modified.
- Private corpus read-only source audit: deck A 3,579,888 bytes / 117 text targets / 10 pages / 156 objects; deck B 4,419,868 bytes / 116 targets / 10 pages / 184 objects; VR deck 20,258 bytes / 114 targets / 10 pages / 166 objects; course long document 26,400 bytes / 175 targets / no slide pages / 3 external references. All targeted source-span replacement checks passed. This does not certify every object as draggable or all resources as rendered. No sample content/assets added to Git.
- Limits: native automation drag and handle-resize attempts on this tab showed no confirmed placement change, so this round does not close physical-pointer acceptance. Frame locator inspections timed out after undo iframe recreation; reload restored inspection. Do not substitute successful simulated pointer tests for this missing browser gate. Native IME, touch, cross-browser and mid-gesture Escape remain future acceptance work.
- Built preview :5179 updated while retaining old hashed chunks; user's active page was not refreshed or closed. QA used separate :5180 records. No production deployment, GitHub push, schema migration or storage clearing.

## Spec028: compact export and actual file delivery (2026-09-08)

- 233 tests / 31 files plus typecheck pass. Both build bases/budgets pass. `/docs/` initial JS 442,400 bytes (gzip 139,340); slides static closure 486,573 bytes. Tests cover exact Unicode/CRLF/script/style/embedded-resource Blob preservation, bounded safe filenames and concise, non-success-claiming export markup.
- Real browser 1280 x 720: slide canvas y=190.875, height=497.25 unchanged before/after export popup; long-document iframe y=108, height=596 unchanged. Escape returns focus to export. Fixed and verified that selecting a different text target does not reopen a dismissed link after transient pending-text state.
- Sidebar staged text blocks export with a clear apply-first error. Applying a new title removes the old download anchor; saving version 2 and refreshing retains the new title. Fresh download contains that title. Tests used newly imported synthetic copies, not the user's native working document.
- Actual Downloads artifacts from direct UI clicks: `picture-check-edited.html`, 13,296 bytes, mtime 2026-09-08 10:44:32 local, SHA256 `f21e1eb4f7fcf5e8cb5be4cd7cb8927cd7507194f3c39eb96d75d0d24b307b8a`; PNG is embedded 256 x 256, SOURCE candidates absent, no editor bridge/contenteditable markers. File chooser reimport succeeded; rendered IMG complete=true/naturalWidth=256. Original imported fixture remains a separate record.
- After reimport and editing: `picture-check-edited-edited.html`, 13,306 bytes, mtime 10:54:20, SHA256 `d0eea3614c805e3c7c15d5a0da78d8483b09cd50715f315c9c0fa0f956d4b0e8`; new title and 256 x 256 PNG retained, no editor markers. Saved version survived app refresh. These are real downloaded files, not shell-generated substitutes.
- `font-check-edited.html`, 25,129 bytes, mtime 10:56:34, contains 18,096-byte `wOF2` payload. File chooser reimport succeeded with embedded font-face CSS and Demo Serif styling retained. Read-only browser font-set inspection returned no entries, so fresh browser decode status is inconclusive; this is payload delivery/reimport evidence, not a font-rendering compatibility certification. No font files or generated private artifacts added to Git.
- Browser download event timed out despite the first actual file; downloadMedia alone did not produce the second file, while clicking the visible download anchor did. Do not use either automation signal as proof of saved-file success. The UI deliberately makes no such claim.
- Prior local listeners :5179/:5180/:5181 were absent. Restored dev QA :5180 and current user-referenced built preview :5179; retained old build chunks and did not reload/close any user tab. No production deployment, public push, new cloud permission, or storage migration.

## Spec027: compact resource tools (2026-09-07)

- 229 tests / 30 files, typecheck, domain-root and `/docs/` builds plus bundle gates pass. `/docs/` initial/static JS 440,611 bytes; slides without tools 485,012 bytes. Root build validated in an isolated temporary output; budget script now accepts an optional directory.
- Real browser at 1280 x 720: long-document iframe stays y=108, height=596 before/after opening. Slide canvas stays y=191.375, height=497.25. No full-width resource row in either view, no redundant long-document context row. Dark appearance visually verified: popover follows the app surface instead of a hard-white strip.
- Tab into popup then Escape returns focus to the resource trigger. Clicking inside document iframe light-dismisses. Explicit close and reopening retains the font-rights checkbox (no source mutation). Review title retains version/local-only wording; font checkbox and replacement remain disabled in review.
- Narrow viewport positioning has pure geometry tests; no new physical touch, older-browser fallback or forced async upload-race acceptance. Native Popover API support is required. Export/save source logic unchanged; repaired-HTML download/reimport gate remains open.
- Updated the existing local preview on :5181 using `vite build --emptyOutDir false`, preserving old hashed chunks for already-open user pages. Fresh separate built-app tab verified the new toolbar and popup shell, then closed only our test tabs. No automatic refresh of the user's native document, no storage changes, no push or deployment.

## Spec026: loading slice and download gate (2026-09-07)

- 228 tests / 30 files pass; both build bases pass typecheck and the new manifest-based budget gate. Entry static closure: 439,623 bytes JS / 138,479 bytes gzip for `/docs/`, compared with 500,800 / 157,410 in spec025 (approximately 12.2% / 12.0% less). Slide view loads a further 44,401 bytes, for a 484,024-byte static closure; resource tool body is another 18,762 bytes on demand. Initial CSS is 14.13 kB; slide CSS 8.48 kB is deferred. These are artifact sizes, not measured LCP/load-time gains. Total code after all features load is slightly larger due to loading boundaries.
- Budgets follow transitive static imports once, detect missing manifest entries, and reject repair tools accidentally entering either initial or slide closure. Tests cover cycles/shared chunks/dynamic exclusions, collapsed shell without tools, suspended loading message and failure UI/retry callback. Actual offline chunk failure/retry is not browser-certified.
- Existing :5180 development tab/storage preserved. Built `/docs/` app served locally on :5181 and opened in an independent in-app QA tab with no initial documents. Native built page also showed loading → slide editor successfully. No root-base browser pass beyond its build/budget gate.
- In the isolated build tab, imported synthetic picture-check.html through the chooser. `.resource-body` count was 0 before expansion; first expansion showed the picture diagnostic. Confirmation state survived collapse/reopen. Chose a real local PNG, saved version 2, refreshed and verified naturalWidth 256, embedded source and zero SOURCE candidate nodes. Long-document switching displayed the same image and version count 2. Existing user documents were not cleared or overwritten.
- Download gate NOT closed: clicked the existing repaired-document Blob download in :5180 and attempted the supported media-download action; no matching file was confirmed in Downloads. Native file-selection actions did not expose a usable dialog, so no native repaired fixture was imported in this pass. The native browser subsequently switched to the user's course document; stopped all interaction with that window. Do not infer corruption or a user-facing browser defect from this automation limitation. No repaired HTML file was read on disk or reimported; earlier source/backup tests are not substitutes.
- No dependency/schema changes, public push, production deployment, automatic reload or storage reset. Keep :5181 running because the native browser now has a real document open there. Resume the file-delivery gate when a download is supplied or an unused native test surface is available.

## Spec025: explicit responsive image repair (2026-09-07)

- Automated: 224 tests across 29 files, typecheck in both `/docs/` and domain-root builds, and whitespace checks pass. New cases cover grouped diagnostics without suppressing CSS warnings, exact unrelated-byte preservation, confirmation, stale raw/offset/context/epoch/read-only guards, candidate ordering, duplicate/ignored/malformed tags, inert/script/event/identity-bearing candidates, limits, history and saved-source/project-backup round trips.
- Imported synthetic `examples/picture-check.html` into the existing localhost:5180 workspace, without clearing existing documents. The two SOURCE candidates and missing IMG fallback produced one repair item. Explicit confirmation did not open a chooser until the second action. Cancel retained the original issue and disabled undo; focus returned to the action. Confirmation focuses its button for keyboard users.
- Slide view: actual local PNG chosen and decoded at naturalWidth 1024; IMG width/height remained 240 × 240 and computed object-fit remained contain. SOURCE count became 0. Undo restored two candidate nodes and missing fallback; redo repaired again. Save created version 2; reload reopened picture-check.html, decoded width 1024 with dimensions retained and no candidate nodes.
- Original-version review remained unchanged with its own responsive-image diagnostic; unification action was disabled. Loaded original as a draft in long-document view, selected a different real PNG (naturalWidth 256), retained 240 × 240 dimensions, then saved version 3. Original and slide-edited version remained available. Test PNG inputs were existing local assets, not bundled or committed.
- No new schema, dependency, remote fetching, script execution, public push or deployment. Saved/backup bytes have automated round-trip checks; this phase did not independently download repaired HTML to disk and reimport it. No forced browser decode race, physical touch gate or arbitrary HTML compatibility claim.
- HTML source-specific dimensions and crops can change after unification; preserving attributes is not pixel preservation. Complex/nested/scripted pictures remain diagnostic-only. Existing selected single-background replacement was not expanded to arbitrary CSS. Semantics reference: [HTML picture/source](https://html.spec.whatwg.org/multipage/embedded-content.html#the-picture-element).
- Build warning retained: main JS 500.80 kB minified, 157.41 kB gzip, above Vite's 500 kB warning threshold. Both builds succeed; initial-loading code splitting and repaired-HTML download/reimport are next gates.

## Spec024: local font repair (2026-09-07)

- Final gate: 198 tests across 28 files, typecheck, `/docs/` build, domain-root build and whitespace checks passed.
- New coverage: WOFF/WOFF2 signatures, size/offset checks, mismatched extensions, collection rejection, decoder rejection/timeout, immutable decoded handles, conservative CSS spans, duplicate/escaped/nested/inert rejection, exact source preservation, undo/redo, stale-result guard and saved-version/project-backup round trips. No new dependency or schema migration.
- Imported synthetic `examples/font-check.html` into the existing local browser. Font button remained disabled until explicit embedding acknowledgment. Used an existing local Fraunces Latin 600 WOFF2 with its adjacent OFL file inspected; neither font binary nor private samples were committed.
- Before repair, the remote-font reference was isolated. After local selection, the live iframe contained an embedded font-face source; FontFaceSet size was 1, status loaded, and `check` for 600 84px Demo Serif and sample Latin text returned true. Computed weight remained 600. At the unchanged viewport, heading height changed from approximately 222.89 to 194.56px, illustrating that font replacement changes metrics.
- Undo removed embedded source and font check returned false; redo restored it. Save created version 2. Refresh reopened the same document with embedded source and successful font check. Long-document view also passed the font check at weight 600. Reviewing the original version restored its missing-font diagnostic and disabled both rights acknowledgment and repair.
- WOFF1 has header/mock-decoder coverage, not a real-file browser pass. No claim of CJK glyph coverage, full variable-font compatibility, complete CSS parsing, fixed memory allocation bound, license verification or full font-security validation. Late decode behavior is guard-unit-tested, not browser-race-injected. New font HTML download/reimport was not independently repeated; saved/backup bytes are covered separately.
- Header references: [W3C WOFF](https://www.w3.org/TR/WOFF/) and [W3C WOFF2](https://www.w3.org/TR/WOFF2/). The WOFF2 totalSfntSize is advisory; browser decoding remains necessary. No remote fetch, public push or deployment in this phase.

## Spec023: resource diagnostics and local image repair (2026-09-07)

- Automated: 188 tests across 27 files, typecheck and both base-path builds pass. New tests cover static CSS/font/image detection, inert contexts, responsive candidates, duplicate attributes, invalid bitmap/size limits, exact source preservation, undo/redo and version persistence, bounded read-only panel rendering, and session-selection fallback.
- Synthetic `examples/resource-check.html` imported through the actual file chooser. Panel initially reported three independent issues: missing local stylesheet, isolated external font and missing local IMG. No external probe was performed or added.
- Slide view: selected a real local PNG. Image issue disappeared while font and stylesheet issues remained. Preview IMG decoded (`naturalWidth=1024`); width/height source attributes stayed 240. Undo restored missing-image state (preview removes its original local src), redo restored the embedded bitmap, and save created version 2. After refresh and reselect, the image still decoded.
- QA found refresh chose the first database row. Added safe per-tab selected-document ID preference; after explicitly selecting the fixture again, a fresh reload opened `resource-check.html` with its saved image and two remaining resource issues.
- Long-document view: loaded the original as a draft, replaced the image with a different local PNG, and saved version 3; original and slide-edited versions remained available. Reviewing the original reported its own three issues and disabled image replacement. Returned to the latest presentation afterward.
- Async upload uses source/context epoch and current-disabled guards; an artificial delayed decode race was not injected in-browser. Actual image export-to-disk/reimport was not repeated in this phase; exact source/version persistence has tests and prior export acceptance remains separate. Full CSS coverage, malformed image decoding diagnostics, font import, picture repair and arbitrary HTML compatibility are not claimed.
- No dependencies, schema migrations, public push or deployment added. Test image files were local UI inputs only and are not distributed in this repository.

## Spec022: everyday editing reliability (2026-09-07)

- Final automated gate: 176 tests across 25 files, typecheck, `/docs/` build, domain-root build and whitespace checks pass. Includes backup validation/atomic failure/collision coverage, stale rounded placement acknowledgments, cancellation and review draft retention. No schema migration.
- Public two-page demo at 1440 × 900: actual pointer drag, vertical-only corner resize and repeated arrow/Shift-arrow adjustment exercised. Vertical resize produced scale 1.021; subsequent nudges accumulated correctly. Save and refresh retained the second saved version.
- Real drag → undo uncovered stale iframe rendering: original source was already equal to `renderSource`, so setting it again did not remount. A repaint revision now regenerates the preview channel. Repeated real drag → undo → reselect verified zero offsets and original scale. This specific integration regression has browser evidence, not a new component-level automated test.
- Local review: selection focused input; comment/reply persisted after refresh; resolving while a reply was unsent retained the draft across filtering; reopening restored pending state. Failure/conflict behavior has automated coverage, not newly forced browser-failure coverage.
- Downloaded an actual JSON backup in the native browser from the public demo with one saved version and one synthetic comment. The file was 2,370 bytes and passed format validation. Restored that downloaded file through the in-app file chooser as a suffixed independent copy; its version and comment were present while the original remained in the library. Multi-version/reference remapping and atomic non-overwrite behavior have automated coverage.
- Actual region drag created a second comment; locate was exercised. Region positioning remains version/viewport-dependent: opening the library changes preview width and can correctly produce the existing precision warning. Responsive anchor relocation is not claimed.
- Limits: the in-app browser download event timed out; its download-to-disk path is not certified. Native browser download plus cross-browser import was verified instead. Physical mid-gesture Escape, touch hardware and native OS fullscreen remain separate gates. Checks use a representative public demo, not arbitrary imported HTML.
- Local implementation only. No public push, production deployment, cloud sharing or voice recording in this phase.

## Spec021: content-first presentation (2026-09-07)

- Local tests: 147 across 23 files; typecheck, `/docs/` build and domain-root build pass.
- Browser geometry at 1440 × 900: stage 1440 × 900; 16:9 frame 1440 × 810 centered with 45px top/bottom letterboxing. Toolbar is an absolute overlay, not reserved layout height.
- At 1080 × 1920: frame 1080 × 607.5, centered without crop. Portrait black space is aspect-ratio letterboxing, not a controls footer.
- Confirmed idle class/opacity 0; pointer click wakes it; Tab reveals controls and keeps them visible while focused beyond the idle interval. Shift+Tab reaches exit; Space activates exit; Escape restores editor focus and the current page.
- Browser fullscreen event path hides the redundant fullscreen button. Physical OS fullscreen exit, denied-fullscreen fallback and real touch hover behavior have not been newly certified by this pass. Existing native editor drag/resize and region annotation gates remain separate.
- Imported source, export, data schema and production services were not changed. This iteration is local, not a pushed/deployed release.

## Inherited baseline

The upstream spec019 record reports 144 tests across 22 files, typecheck and builds passing. Browser checks cover local edits, version save/reload, actual HTML download/reimport, isolated presentation keyboard navigation and selection/focus synchronization.

These are inherited records, not fresh standalone browser acceptance. Native pointer drag/resize, region-drag comments and native fullscreen remain open gates. Windowed presentation fallback has been checked upstream. Arbitrary HTML compatibility is not claimed.

## Standalone extraction

Verified on 2026-09-07 with Node 24.16.0: fresh `npm ci`, 144 tests across 22 files, typecheck, `/docs/` build and domain-root build all passed. The 78 staged files passed whitespace checks and a credential/private-path pattern scan; the lockfile uses only registry.npmjs.org. This pattern scan is not a full security audit.

Public remote verified: `qiuyiwu1989-star/opendesign-docs`, visibility public, default branch `main`, license MIT. Unauthenticated repository access returned HTTP 200. Initial snapshot `85dd53813c26b9c4699585eb5527cd853adf998e` matched local and remote. Read-only [CI run 34105351817](https://github.com/qiuyiwu1989-star/opendesign-docs/actions/runs/34105351817) passed. No deployment workflow or secrets were configured by this extraction.

No user documents, source browser databases, private acceptance files or old repository history are distributed. Extraction does not migrate browser storage or change the live site.
