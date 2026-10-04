# OpenDesign 公网上线回执 — 2026-09-18

## 给深脑开发的结论

OpenDesign Docs 接收端已于 2026-09-18 11:08:26（UTC+08）上线，可以开始生产来源联调。

- Docs：https://doc.opendesign.cc/
- 握手入口：https://doc.opendesign.cc/#handoff=v1
- 目标 origin：`https://doc.opendesign.cc`
- 浏览器 SDK：https://doc.opendesign.cc/sdk/opendesign.js
- 接入示例：https://doc.opendesign.cc/integrate/
- Release：`20260916T160027Z-handoff`（标签为候选生成时间，实际激活为 9 月 18 日）。

你方运行时配置请使用 `OPENDESIGN_DOCS_URL=https://doc.opendesign.cc/`，启动交接时按已实现逻辑附加 `#handoff=v1`；如果客户端直接使用配置值跳转，则配置完整握手入口。不要重复追加 fragment。来源端验证消息的 `event.origin` 应为上述目标 origin，且检查窗口、v 和 nonce。

## 已验证

1. 新鲜完整测试 316 项 / 44 文件通过，typecheck、根路径构建和 bundle budgets 通过。
2. 公网 22 个公开构建文件与本机 dist 逐字节一致，healthz、release.json 和上一版入口资源均返回 200。
3. Safari 从独立本地来源向公网 Docs 打开新窗口，显示准确来源和 41 KB 报告确认框。取消返回 `ok:false, reason:rejected`；重试确认返回 `ok:true`。
4. 使用你方 `deepbrain-sample-report-9charts.html` 合成样本，九种图表加流程图共 10 张，报告和七个证据区正常载入。
5. 原生双击修改 H1 为 `DeepBrain Public Acceptance 0918`，保存为版本 2，刷新后标题、版本和十张图表仍在。
6. Safari 实际下载 HTML，文件 41775 字节；逐字节校验等于原样本只替换 H1，十个 SVG 原样保留。实际文件：`/Users/qiu/Downloads/深脑-合成报告-edited-2.html`。
7. 整图删除、移动及图内页脚随 figure 操作已有样本自动回归通过；本次公网浏览器没有重新执行图形移动/删除或下载后再导入，不扩大验收结论。

## 请深脑完成的最后一步

先确认你方修正版及 `/api/opendesign/config` 已实际发布，再配置运行时地址并刷新来源页面，从真实深脑生产 origin 走一次“准备报告 → 打开 Docs → 确认 → 成功回执 → 编辑保存”。请回传实际来源 URL、发布版本、配置接口状态及成功/取消回执，再对用户开放按钮。

本次浏览器来源是合成报告测试页，并非深脑生产按钮，因此不宣称双方生产全链路已通过。OpenDesign 侧未修改深脑服务器配置或开关。

## 发布边界

仅发布 Docs 静态接收端、SDK 和接入页。独立 MCP/REST 临时交接服务尚未公网部署；本站不是已上线的 MCP endpoint。文档仍存当前浏览器 IndexedDB，未接数据库或 COS。预览不运行任意网页脚本，不提供任意 URL 抓取。

保留上一版 `20260910-438f7c3` 及旧 hashed assets，原子切换 current；未修改共享 Nginx 配置、CSP、证书或重启其他服务。
