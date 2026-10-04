# 需求：外部应用一键「在 OpenDesign Docs 中打开」一份 HTML

> 来源：深脑（DeepBrain，https://shennao.zaowuyun.com）· 2026-09-15 · 邱懿武提出
> 给接手 opendesign-docs 的开发 agent。这是一份**需求说明**，不是已编号的 spec：
> 编号、切片方式、是否先做本地验证再发版，由本仓库按自己的 G3 规矩决定。
> 本文不授权部署，也不授权放宽 CSP。

## 1. 要解决什么

深脑能把一份分析报告导出成**自包含 HTML**：内联样式、静态内联 SVG 图表、零脚本、零外链。现在用户想做两件事：

1. 下载这份 HTML（深脑侧已完成）；
2. **在深脑点一下，直接在 doc.opendesign.cc 里打开这份 HTML**，做二次编辑、批注，再从 Docs 导出下载。

第 2 步现在只能靠「先下载，再去 Docs 选文件导入」。用户要的是少掉中间这一步。

## 2. 现状约束（已核实，给出处）

- Docs 是纯前端、local-first，没有后端。文档存在浏览器 IndexedDB `opendesign-docs` v3（`src/store.ts:21-25`）。
- 导入入口**只有**文件选择器（`src/App.tsx:225-236`）。没有 URL 参数，没有拖入，也没有外部 postMessage。
- 线上响应头（2026-09-15 实测 `curl -I`）：
  - `connect-src 'none'`：Docs **不能 fetch** 外部 URL，所以 `?src=https://…` 这种拉取方案行不通；
  - `frame-ancestors 'none'` 与 `X-Frame-Options: DENY`：Docs 不能被外站 iframe 嵌入；
  - **没有** `Cross-Origin-Opener-Policy`，所以 `window.opener` 可用。
- 本仓库规则禁止放宽 CSP（`CLAUDE.md` Rules）。
- 可复用的落库入口是 `App.tsx:88` 的 `add([{ name, source }])`，旁边 `importFiles` 里的校验（5 MiB 上限、严格 UTF-8、非空）也可以直接借用。

**结论：用 `window.open` + `postMessage` 交接。** postMessage 不受 `connect-src` 管，不需要 iframe，也不需要改 nginx。

## 3. 交接协议 v1

### 3.1 流程

```
来源页（深脑）                                  Docs（doc.opendesign.cc）
────────────────────────────────────────────────────────────────────────
用户点击「在 OpenDesign 中编辑」
w = window.open('https://doc.opendesign.cc/#handoff=v1', '_blank')
   （必须在点击回调里同步调用，否则会被拦截；
     不能带 noopener，否则拿不到 w）
                                               页面加载，发现 #handoff=v1
                                               且 window.opener 存在
                                    ◄───────── opener.postMessage(READY, '*')
监听 message：
  event.source === w
  event.origin === 'https://doc.opendesign.cc'
  校验通过后回发：
w.postMessage(PAYLOAD, 'https://doc.opendesign.cc') ──►
                                               校验（见 3.3）
                                               弹确认：「来自 shennao.zaowuyun.com
                                               的文档《…》(128 KB)，导入到本机？」
                                               用户确认 → add([{name, source}])
                                    ◄───────── opener.postMessage(RESULT, event.origin)
                                               history.replaceState 清掉 #handoff
```

READY 用 `'*'` 发出是安全的，因为它不带任何数据，只带一次性 nonce。真正的文档只朝精确的 Docs origin 发送。

### 3.2 消息格式

```ts
// Docs → 来源
type Ready = { type: 'opendesign:handoff-ready'; v: 1; nonce: string }   // nonce: crypto.randomUUID()

// 来源 → Docs
type Payload = {
  type: 'opendesign:handoff'; v: 1; nonce: string                        // 回填 READY 里的 nonce
  document: {
    name: string        // 文件名，如 "深脑-周会复盘-1a2b3c4d.html"
    html: string        // 完整 HTML 源码，UTF-8 字符串
    generator?: string  // 如 "DeepBrain"
    sourceUrl?: string  // 来源页地址，仅作显示与记录，Docs 不得去访问
  }
}

// Docs → 来源
type Result =
  | { type: 'opendesign:handoff-result'; v: 1; nonce: string; ok: true }
  | { type: 'opendesign:handoff-result'; v: 1; nonce: string; ok: false; reason: 'rejected' | 'too_large' | 'invalid' | 'timeout' | 'storage' }
```

### 3.3 Docs 侧必须做的校验

1. **只认 opener**：`event.source === window.opener`。其他窗口、其他 iframe 发来的消息一律忽略。
2. **nonce 一次性**：不匹配就忽略；用过即作废。同一 nonce 再来一次**不能**再导入一份（防重复文档）。
3. **来源确认**：导入前必须让用户确认，确认框里明文显示 `event.origin` 的主机名、文件名、大小。
   - 文件名只能当纯文本渲染，不许插进 HTML。
   - 是否维护一份「可信来源免确认」白名单由本仓库决定。**v1 建议一律确认**，这样协议对任何来源都能开放，不用把深脑写死进代码。
4. **内容校验**与 `importFiles` 口径完全一致：
   - `html` 必须是非空字符串，按 UTF-8 计不超过 `MAX_DOCUMENT_BYTES`（5 MiB）；
   - `name` 清洗掉路径分隔符与控制字符，并补上 `.html` 后缀。

   不要另写一套校验。抽出共用函数，文件导入与交接导入都调它。
5. **超时**：收到 READY 后 15 秒内没来 PAYLOAD，就提示「没有收到文档，请回到来源页面重试」，然后清掉 `#handoff`。刷新页面不能又进入等待。
6. **不执行、不访问**：导入后的预览走现有 sanitize 与 sandbox，不开任何新口子。`sourceUrl` 只做显示与记录，永远不去 fetch。
7. **正在编辑时**：`switchAllowed()` 返回 false（有未保存改动）的话，沿用现有提示，不能静默丢掉用户正在改的内容。

### 3.4 来源信息落在哪

建议给这份文档的「原始导入」版本打标签，比如 `从 shennao.zaowuyun.com 导入`，让用户以后知道它从哪来。字段怎么放由本仓库定，但不能破坏 schema v3 的兼容性，也不能为此清库。

## 4. 来源侧（深脑）会保证什么

以下是深脑导出 HTML 的约定，Docs 可以按这些做验收，不需要做深脑特判：

- 单文件，UTF-8，`<meta charset="utf-8">`，`<meta name="generator" content="DeepBrain">`。
- **零 `<script>`、零外链资源**，也没有事件属性。
- 样式全部写在 `<head>` 里的一个 `<style>` 中，暗色主题靠 `@media (prefers-color-scheme: dark)` 实现。
- 图表是**静态内联 SVG**：
  - 颜色写在 `fill` / `stroke` 属性上，外加 `class="dbc-f-…"`；
  - 不含 `foreignObject`，也不含 SVG 动画元素；
  - mermaid 流程图以 `htmlLabels:false` 渲染，文字是 SVG `<text>`。
- 语义块结构：`article > header.report-head / section.report-body / section.evidence`。正文由 `h2-h4 / p / ul / ol / blockquote / div.table-wrap > table / figure.fig > svg` 组成。
- 锚点链接只用页内片段：正文里是 `<sup class="claim"><a href="#ev-3">#3</a></sup>`，SVG 里是 `<a href="#ev-3">`。文末 `li#ev-3` 是对应证据。
- 典型大小 20–200 KB，远低于 5 MiB。

**需要 Docs 确认或告知的几点**（发现不成立请在回执里写明，深脑来改导出）：

- head 里的 `<style>` 和 `@media` 在预览里保留、导出时原样保留；
- SVG 内的 `class` 属性、`<a href="#…">` 保留；
- `figure > svg` 整块能被选中、删除、移动（SVG 内文字不可编辑，这符合预期）；
- `sup > a` 这种行内混排不会导致段落无法双击改字。

## 5. 验收

自动化：

- READY / PAYLOAD / RESULT 的往返；nonce 不匹配、`event.source` 不是 opener、重复 nonce、超时、超大、非字符串、空字符串，逐条有测试。
- 交接导入与文件导入共用同一个校验函数（测试钉住，不许出现两份实现）。
- 用户在确认框点「取消」时，不写库，并回发 `ok:false, reason:'rejected'`。

浏览器实测（本地 dev 即可，不需要部署）：

1. 起一个本地「来源页」（例如 `localhost:5190/handoff-source.html`），点击按钮 → 打开 Docs → 出现确认框，显示来源主机名、文件名、大小 → 确认 → 文档出现在库里并自动打开。
2. 刷新 Docs 页：不会重复导入，也不会卡在等待。
3. 编辑一处文字、加一条批注、导出 HTML，再用文件选择器把它重新导入：内容一致。
4. 用深脑样例报告走一遍第 1–3 步：
   - 样例在 `docs/incoming/deepbrain-sample-report.html`，是合成数据，不含用户数据；
   - 5 张图表在 Docs 预览里都不是空白；
   - 暗色系统主题下可读；
   - `#3` 这类锚点点击后能跳到文末证据。
5. 在有未保存编辑时触发交接：出现既有的离开提示，不丢改动。

## 6. 不在本次范围

- Docs 把编辑后的结果**回传**给来源应用（v2 再议：需要反向授权与冲突处理）。
- 任何服务端中转、云存储、账号。
- 放宽 CSP、允许被 iframe 嵌入。
- 一次交接多份文档（v1 只收一份）。
- 部署。上线需要邱另行明确授权。

## 7. 回执

做完请在本文件末尾追加一段「回执」，写明：

- 实际使用的 hash 入口与消息格式（如果和 3.2 有出入）；
- §4 列出的 4 个确认点的结论；
- 发布到 doc.opendesign.cc 的版本号。

深脑在看到回执后，再把「在 OpenDesign 中编辑」按钮接上。在此之前，深脑不会先上一个点了没反应的按钮。

## 8. Docs 回执（2026-09-16，本地验收完成，尚未发布）

对应 `specs/036-external-handoff-import.md`。Docs 接收端已实现，**doc.opendesign.cc 尚未部署本次功能，没有新的线上发布版本**。深脑可以按下列协议做本地联调；生产按钮仍应等 Docs 发布后再启用。

### 协议与实现差异

- 入口仍为 `#handoff=v1`；READY / PAYLOAD / RESULT 名称、`v:1`、nonce 和字段沿用 §3.2。
- 只接受最初 opener、匹配 nonce、非 opaque 的 HTTP(S) 来源；一次有效消息即锁定当前交接，确认或保存期间重复消息不会再次写库。
- 确认使用应用内模态面板，显示真实 `event.origin`（含端口）、清洗后的文件名、UTF-8 大小。文件和交接共用 `src/document-import.ts`。校验与交接模块按需加载。
- hash 在交接初始化时就清除（早于原提案），因此等待中刷新也不会重新进入交接。支持已有窗口的 hashchange 入口。
- 15 秒只限制等待 PAYLOAD，不限制用户阅读确认面板。没收到可信来源消息时无法指定 RESULT 的目标 origin：Docs 显示超时，来源页负责自己的连接超时；不会向 `*` 广播结果。
- 未保存编辑沿用原离开提示文本和草稿规则，在应用内再次确认；取消返回 `rejected` 且不落库。落库完成前不发送 `ok:true`；存储失败返回 `storage`。
- 原始版本 label 为 `从 <真实 origin> 导入`，不改变 IndexedDB v3。generator/sourceUrl 可发送但只校验类型和长度，不持久化、不访问；来源身份仅使用 event.origin。
- 第一版不回传编辑结果、不建服务端、不改变 CSP。新增 `figure > svg` 仅支持保守静态图表整块操作；包含 ID、脚本、动画、外部引用、use/defs 等复杂结构仍拒绝删除/排序，不做重复复制。

### §4 四项确认

1. **style / @media：通过。** 下载文件与原始样例逐字节对比，仅预期标题文本变化；head 样式、媒体查询未改动。Safari 默认暗色主题下五张图表均可见、文字可读。
2. **SVG class / 页内 a：通过。** 自动化验证保留 class 与 href，Safari 点击图表内 `#3` 实际滚动到文末现金流证据区域。
3. **figure 整块操作：通过（有边界）。** 五张样例图均可选、可删除、可按同级文档流前后排序。真实浏览器完成一张图上移、删除（5→4）、撤销（4→5）及还原顺序；所有五张的删除与源码完整性有自动化检查。SVG 内部文字不编辑，自由拖放不属于长文档范围。
4. **sup > a 混排编辑：通过。** 实际双击修改正文文字片段，保存并刷新恢复，证据 #1/#2 的链接与周围结构保留。

### 验收证据

- 303 tests / 41 files 通过（`npm test -- --reporter=dot --maxWorkers=2`）；两个 base-path 构建、typecheck、bundle budgets、`git diff --check` 通过。首次不限制并发时 5 个已有大文件测试超时；限制并发后保持原超时阈值通过。
- 来源 `http://127.0.0.1:5190/experiments/handoff/source.html` → Docs `http://127.0.0.1:5191/#handoff=v1`。内置浏览器和原生 Safari 都完成来源确认和导入；来源收到 `ok:true`，刷新不重复导入。
- 内置浏览器：修改混排正文、保存版本、刷新恢复；创建批注并刷新后仍存在；图表排序/删除/撤销；未保存标题时再次交接，取消离开后标题和草稿保留，来源收到 `rejected`。
- Safari：修改标题、保存、刷新恢复；实际下载 `/Users/qiu/Downloads/深脑-合成报告-edited.html`（21,150 bytes），仅 `<h1>` 增加 ` · Safari 验收`，其余字节完全一致。该真实下载文件通过内置浏览器文件选择器重新导入，修改标题、五张图和证据链接恢复。
- Safari 审阅切换曾出现 iframe 就绪卡住；以预览 channel 为 iframe key 后，在实际 Safari 复测审阅选择及新增批注成功。批注不会写入普通 HTML；需保留批注历史时仍使用项目备份或独立审阅副本。
- 内置浏览器的下载事件未能捕获且未发现落盘文件，因此下载证据采用 Safari 的真实文件；没有把“点击下载”当成交付成功。
- 浏览器原生低层输入在小数 iframe 坐标时拒绝操作，编辑验收改在 1280×900 桌面视口完成。未声称覆盖所有设备/浏览器。

### 本地复现

在仓库中：

```sh
npm run build:domain
python3 -m http.server 5191 --bind 127.0.0.1 --directory dist
```

另一个终端：

```sh
python3 -m http.server 5190 --bind 127.0.0.1
```

打开 `http://127.0.0.1:5190/experiments/handoff/source.html`。样例来源脚本已经示范监听顺序、精确 origin、opener 引用、同步 window.open、连接失败提示和单文件 PAYLOAD。仅用于本地合成数据联调。

**发布版本：未发布。** 下一步为明确批准后的 Docs 部署与正式域名双端验收，再由深脑启用生产入口。
