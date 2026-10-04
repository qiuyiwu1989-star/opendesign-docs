# 网站与 MCP 接入指南

当前状态（2026-09-18）：公共 SDK、Docs 握手入口及 `/integrate/` 已上线 https://doc.opendesign.cc/，已通过跨来源合成报告验收；独立 MCP/REST 服务已公开试运行：`https://doc.opendesign.cc/connect/mcp`。真实深脑生产按钮仍待联调。详见 [上线回执](incoming/2026-09-18-opendesign-public-ready.md)。

## 1. 选择入口

| 来源 | 接法 | HTML 去向 |
| --- | --- | --- |
| 已生成 HTML 的网站 | 浏览器 SDK + 用户点击 | 直接传给 Docs 标签页，确认后保存在 IndexedDB |
| AI 工具或服务端 | MCP 或 REST 创建临时链接 | 先在独立交接进程内存保留；用户点击链接并确认后进入 Docs |
| 只有第三方网址 | 先获得可导出的 HTML | 当前不提供远程抓取、登录态复制或网站应用转换 |

推荐提供自包含 HTML：内联 CSS、内嵌图片、静态 SVG。预览不运行脚本、不自动加载外部资源。排版保留不等于任何网站都可完整搬入。

## 2. 本地运行

```sh
npm ci
npm run build:domain
python3 -m http.server 5191 --bind 127.0.0.1 --directory dist
# 另一个终端：
npm run handoff
```

- Docs：`http://127.0.0.1:5191/`
- 可操作接入示例：`http://127.0.0.1:5191/integrate/`
- MCP：`http://127.0.0.1:5192/mcp`（Streamable HTTP，非旧 SSE）
- 临时交接页：由工具返回，勿猜测 token。
- 启动服务后运行 `npm run handoff:demo`，会通过真实 MCP 客户端提交仓库里的合成报告，并打印可点击的限时链接；不会读取私人文件。
- `npm test` 会先构建 SDK，再运行包含真实 HTTP MCP 客户端的测试。开发时使用根项目完整依赖。生产用 `npm run build:handoff` 生成自包含 Node 22 ESM bundle 与资源，无需服务器安装仓库开发依赖。

## 3. 网站 SDK

构建输出 `public/sdk/opendesign.js` 和 `.mjs`；静态发布时一起复制。域名根目录对应 `/sdk/`，子路径部署对应 `/docs/sdk/`。SDK 采用项目 MIT 许可。

```html
<script src="http://127.0.0.1:5191/sdk/opendesign.js"></script>
<button id="edit">在 Docs 中编辑</button>
<script>
const preparedHtml = '<!doctype html><h1>报告</h1>';
document.querySelector('#edit').onclick = async () => {
  try {
    const result = await OpenDesign.open(
      { name: '报告.html', html: preparedHtml },
      { docsUrl: 'http://127.0.0.1:5191/',
        onReady: () => console.log('等待用户在 Docs 中确认') }
    );
    console.log(result); // {ok:true} 才是确认且本地保存完成
  } catch (error) { console.error(error.message); }
};
</script>
```

ESM：`import { open } from '…/sdk/opendesign.mjs'`。在用户点击前准备 HTML；不要先 await 生成请求再 window.open。SDK 默认 Docs 地址为 `https://doc.opendesign.cc/`；本地开发请明确传入本地地址。

成功：`{ok:true}`。拒绝/失败：`{ok:false,reason}`，reason 为 `rejected / invalid / too_large / timeout / storage / blocked / closed / unavailable`。参数错误会同步抛出。`readyTimeoutMs` 默认 20000，可设 1000–120000。READY 后等待用户确认，不再计连接超时；窗口关闭会结束等待。连接断开或超时不应自动重发，先让用户检查 Docs 是否已有副本。

双方必须使用 HTTP(S)，并允许 `window.opener`。`noopener`、COOP 隔离、嵌入页面 sandbox、弹窗策略都可能断开连接；此时提供下载 HTML 的备用入口，不承诺强制跳转。原始 HTML 不进入 URL。完整协议见 Spec036。

## 4. MCP

公网端点：`https://doc.opendesign.cc/connect/mcp`，免费试运行，无需 API Key。将此地址作为客户端的远程 Streamable HTTP 端点。各客户端配置格式不同；本次通过官方 TypeScript 客户端完成 initialize / listTools / callTool 验证，未宣称所有宿主应用已认证。

工具：`opendesign_create_document_handoff`

```json
{ "name": "报告.html", "html": "<!doctype html><h1>报告</h1>" }
```

成功返回 `structuredContent` 及同内容的 text：

```json
{ "status": "ready", "open_url": "https://doc.opendesign.cc/connect/open#BEARER_TOKEN", "expires_at": "ISO-8601 timestamp" }
```

工具调用会上传 HTML 到临时交接进程。`ready` 仅表示链接已生成；将链接呈现给用户，由用户打开并确认。不要把结果描述为已经导入。无效输入和容量问题返回 MCP `isError`。重复调用生成不同链接；不要无条件重试超时调用。

## 5. REST（服务端调用）

公网基址 `https://doc.opendesign.cc/connect`；`POST /api/handoffs`，`Content-Type: application/json`，同 MCP 输入，成功 HTTP 201 返回同一结果。`POST /api/read` 接收 `{token}` 返回 `{name, html, expiresAt}`（毫秒时间戳）；可重复读取，取消不消耗链接。`POST /api/complete` 接收 `{token}` 幂等删除，持有 token 即有删除权限；这个清理请求不是独立的导入证明。SDK 的成功回执才来自 Docs 的保存事务。

所有路径禁止跨站浏览器 API 请求；网站直接使用 SDK，服务端使用 REST。token 不放 query/path，日志不得记录请求体、片段或完整交接链接。

## 6. 免费试运行与部署边界

- 15 分钟 TTL、单文档 5 MiB、进程最多 100 项及 60 MiB UTF-8 内容；并发处理最多 4 个请求。
- 同一连接来源 IP 每分钟最多 30 次 POST，MCP 初始化和读取也计入。公网部署明确开启 `HANDOFF_TRUST_LOOPBACK_PROXY=1`，仅接受 loopback 连接上由 Nginx 覆写的单个有效 `X-Real-IP`；忽略 `X-Forwarded-For`。直连默认不信任转发头。
- JSON 传输体最多 32 MiB（容纳转义膨胀）；token 接口 1 KiB。Node 内存实际用量高于 UTF-8 字节数。
- 链接持有人可读取文档；没有账号隔离或撤销界面。导入成功后删除，取消可重试，到期定时清除，重启提前失效。链接被多人同时打开可能导入多份。
- 产品公开使用不等于用户文档公开展示。Docs 仍只保存到各自浏览器，换浏览器/设备不会自动同步。

独立进程配置：`HANDOFF_PORT` 默认 5192、`HANDOFF_BIND` 默认 127.0.0.1、`HANDOFF_PUBLIC_URL` 默认 loopback 地址、`HANDOFF_DOCS_URL` 默认本地 5191。公网配置 `HANDOFF_PUBLIC_URL=https://doc.opendesign.cc/connect/`、`HANDOFF_DOCS_URL=https://doc.opendesign.cc/`；路径前缀需以斜杠结尾。反向代理必须保留匹配公开地址的 Host，提供 TLS、请求体/连接限制和资源监控。暂时使用单实例，不支持多实例随机转发（内存不共享）。不要给交接页设置会切断 opener 的 COOP。

本次已获授权并完成公网部署。上线证据和回滚方式见 [MCP 发布记录](MCP-DEPLOYMENT.md)。不要为了开放接入放宽 Docs 预览 CSP。高级收费候选：团队权限与协作、长期云存储、更高额度、自定义品牌；本轮不接支付、不许诺定价。

技术依据：[官方 MCP HTTP 服务指南](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md)，使用锁定的 SDK 2.0.0，未手写 MCP 协议实现。

## v1 兼容补充（2026-09-16）

独立实现的客户端可按 Spec036 接入，不必引用托管 SDK。`document.bytes` 等未使用字段忽略；大小以实际 HTML UTF-8 字节数为准。Docs 发出 READY 后等 PAYLOAD 最多 15 秒；接收后不限制用户确认时间。版本升级须显式记录协议差异。深脑问题答复见 [联合联调回执](incoming/2026-09-16-opendesign-reply-to-deepbrain.md)。
