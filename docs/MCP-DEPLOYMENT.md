# MCP 公网部署与开发者平台 — 2026-09-18

## 当前入口

- 开发者平台：https://doc.opendesign.cc/integrate/
- MCP：https://doc.opendesign.cc/connect/mcp （Streamable HTTP，无 API Key 的免费试运行）
- REST 创建：`POST https://doc.opendesign.cc/connect/api/handoffs`
- OpenAPI：https://doc.opendesign.cc/integrate/openapi.json
- AI 接入说明：https://doc.opendesign.cc/integrate/llms.txt
- 健康检查：https://doc.opendesign.cc/connect/healthz

工具 `opendesign_create_document_handoff` 接收 `{name, html}`，返回临时链接。`ready` 不等于已经导入；用户必须打开链接并确认。

## 实际发布

用户明确授权独立 MCP 公网部署。服务于 11:31:17 +08 上线，开发者门户于 11:40:41 +08 发布。

- 独立 Node 22/systemd 服务 `opendesign-handoff.service`，仅监听 `127.0.0.1:5192`。
- Runtime release：`/opt/opendesign-handoff/releases/20260918-pilot-r2`，current 软链接激活。
- Runtime archive SHA256：`e45300d8763d8e3b8d557829d8590bad0757ee1415aaddee420ae08608790633`。
- 静态门户 release：`20260918T033700Z-handoff`；SHA256：`47ffe46201ac38455af61e276ab5cfabba28b38e8283b90bfa0aa991ea628513`。前版 `20260916T160027Z-handoff` 保留。
- 生产 bundle 由 `npm run build:handoff` 打包，无需在服务器安装完整开发依赖。模板见 deploy/opendesign-handoff.service、mcp.nginx.conf、mcp-location.conf。
- 现有 Docs vhost 只增加独立 `/connect/` 反向代理；编辑器 CSP 仍为 `connect-src none`。交接路径使用独立 CSP `connect-src self` 和 no-store。Nginx 语法通过后平滑 reload，未重启其他应用。
- systemd 使用动态低权限用户、只读文件系统、512 MiB 内存上限、不使用 swap、50% CPU 配额、失败自动重启和开机启动。
- 本次源码尚未提交或推送；不能用仓库 HEAD 冒充部署内容。

新子域 `mcp.opendesign.cc` 的 ACME 验证被 DNSPod 导向拦截页，未成功签发证书；其临时 vhost 已停用，不能宣传为可用入口。使用现有有效 TLS 域名的 `/connect/` 不依赖新证书。未修改 DNS 或其他站点证书。

## 验收

- 318 tests / 44 files，typecheck、domain build、bundle budgets 通过。
- 官方 MCP 客户端经过公网 HTTPS 完成 initialize、listTools、callTool；返回的 41770 字节九图加流程图合成 HTML 可原样读取。
- 来源 origin 校验、无效 token 404、GET MCP 405、挂载路径与资源相对链接回归通过。
- Safari 打开真实 MCP 返回链接，看到文件名和到期时间，再进入 Docs 来源确认。随后页面显示已导入成功并清除 URL fragment；API 复读返回 404，证实临时副本已删除。
- Docs 中编辑标题为 `OpenDesign MCP Public Pilot`，保存版本 3、刷新恢复，十张图仍保留。实际下载 `/Users/qiu/Downloads/MCP-public-9charts-edited.html` 为 41770 字节，逐字节等于原样本只替换 H1。
- 开发者页面经 Safari 验证，真实 MCP 地址、REST 示例、OpenAPI/AI 说明链接及免费额度均显示。公开 dist 文件全部与本机构建一致；首页和服务路径安全响应头分别核对。
- 最初软链接启动预检发现 argv 路径与 import.meta 真实路径不同而提前退出，已用 realpath 比较修复并发布 r2；服务发布后检查 NRestarts=0，内存约 35 MiB。
- 公网限流实际验证：连续 32 次带伪造 X-Real-IP / X-Forwarded-For 的请求，前 30 次按无效 token 返回 404，后 2 次返回 429；客户端改 IP 头不能绕过配额。
- Runtime 的四个发布文件 SHA256 与本机 dist-handoff 一致；首次 Python TLS 握手偶发超时后，Node 复用连接的有界验证成功，不把网络失败算服务行为通过。
- 公网真实 15 分钟过期检查：同一测试链接到期前返回 200，到期时间 11:46:39.206 +08；11:46:40.832 复读返回 404。期间服务未重启，证实按 TTL 失效。服务自 11:31 发布至此超过 15 分钟，NRestarts=0，日志无应用错误。

本轮未宣称所有 AI 宿主客户端已认证，未重新验收下载再导入、移动端或深脑真实生产按钮。

## 配额和数据

单文档 5 MiB；15 分钟 TTL；100 份 / 60 MiB 总临时容量；4 个并发处理；每来源 IP 每分钟 30 次 POST。Nginx 覆写 X-Real-IP；服务只有显式开启且 socket 为 loopback 时使用该单一有效 IP，拒绝伪造多值，不信任任意 X-Forwarded-For。

内存单实例，重启会使未完成链接提前失效。链接持有人可读取和删除，不能用于长期云保存。正常访问日志只记录 IP、method、URI、状态和耗时，不含 query、token、请求正文。无数据库/COS写入；无账号、计费或长期保存承诺。

## 运维及回滚

健康检查失败、持续 5xx 或关键交接链路失败时停止开放 MCP，并回退变更。不要清除用户浏览器数据。

1. 独立服务状态：`sudo systemctl status opendesign-handoff`，日志 `sudo journalctl -u opendesign-handoff`。
2. 关闭服务前优先删除 Docs vhost 中本轮唯一新增的 `include /etc/nginx/snippets/opendesign-mcp-location.conf;`；执行 `nginx -t` 后 reload。随后 `systemctl disable --now opendesign-handoff`。应对照当前配置只撤回本轮行，避免覆盖后续其他变更。
3. 变更前配置备份 `/etc/nginx/sites-available/doc.opendesign.cc.pre-mcp-20260918`；配额配置 `/etc/nginx/conf.d/opendesign-mcp.conf`。独立文件可移出 include 路径留存，不删除证据或其他站点配置。
4. 门户回滚：在既有 Docs 发布锁内原子切换 current 至 `20260916T160027Z-handoff`；不移除旧 hashed assets。MCP 服务与静态站回滚是独立动作。
5. 后续 runtime 更新必须校验 archive、准备新 release 并原子切换后 restart；重启会清除所有尚未完成链接，应预留 15 分钟维护窗口。当前部署脚本是本次固定候选的首次激活记录，不得盲目重复执行。

## 下一阶段

先完成深脑真实生产按钮联调，作为首个外部产品接入案例。接着做开发者账号/API Key、项目级配额、仅记录元数据的用量与主动撤销；有实际需求后再接 COS/持久存储及团队权限。收费候选为团队协作、长期保存、更高额度；当前仍免费，无支付和定价承诺。
