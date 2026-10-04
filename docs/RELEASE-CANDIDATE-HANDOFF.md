## 当前公网发布 — 2026-09-18

已获用户授权并于 11:08:26 +08 激活 `20260916T160027Z-handoff`。Docs 接收端、SDK、接入页已上线，MCP 服务仍为本地可选进程。316 tests / 44 files、构建、22 个公网文件字节校验及 Safari 交接取消/成功、编辑保存刷新、实际 HTML 下载通过。深脑真实生产按钮尚待对方联调。

详见 [上线回执](incoming/2026-09-18-opendesign-public-ready.md)。归档 SHA256：`efa2536697bc3a7158e7d876132719448b39c3c219a9b83a8d7bd235e89a4973`。当前目录 `/var/www/doc.opendesign.cc/releases/20260916T160027Z-handoff`；回滚版本 `20260910-438f7c3`，保留旧资源。源码工作区尚未提交，不以 Git HEAD 代表此发布。

---

## 历史记录（以下状态以当时为准）

# Docs 接收端发布候选 — 2026-09-17

用户已明确要求完成公网发布。本轮部署已获授权；当前阻碍是服务器身份认证，不是等待再次批准。

## 检查结果

- 完整 suite：315 项 / 44 文件通过；此后新增九图合成样本回归，static-figure suite 共 11 项通过。
- root build、typecheck、bundle budgets、两份合成报告源文件审计通过。
- 九种图表加一张流程图，共 10 个 figure，整图删除和移动往返源码完整性检查通过；本轮新增样本视觉/公网验收尚未完成。
- 深脑第二轮回执已收到：开关改服务端运行时 OPENDESIGN_DOCS_URL、先生成再导航、图表去掉依赖 ID 的结构。这些是对方报告，尚非我方生产验证。

## 发布候选

- Release: `20260916T160027Z-handoff`
- 本机 archive: `/tmp/opendesign-docs-20260916T160027Z-handoff.tar.gz`
- SHA256: `efa2536697bc3a7158e7d876132719448b39c3c219a9b83a8d7bd235e89a4973`
- 仅包含 dist 静态资源与校验清单，不包含 MCP 服务、仓库源文件、报告样本或用户数据。
- 激活脚本：`deploy/activate-docs-release.sh`，bash 语法检查通过；尚未在服务器运行。
- 脚本核对已有 current、锁定发布、校验包、保留旧 hashed assets，原子切换 current，记录原路径；不需要改 CSP 或重启 nginx。
- 回滚：使用候选目录 previous-release.txt 中记录的原版本，在同一发布锁下创建新的临时 symlink 并原子替换 current。不得清除用户 IndexedDB 或删除旧发布。

## 当前真实状态与继续点

使用现有默认身份执行 `ssh -o BatchMode=yes ubuntu@146.56.239.22` 被拒绝（publickey,password）；本机 ssh-agent 未加载身份。已向用户请求正确 SSH 别名/密钥文件路径或恢复本机登录，不请求发送密码/私钥正文。

没有上传或激活任何线上版本。恢复访问后：只读核对 current/vhost → 上传校验候选 → 原子切换 → 逐文件核对公网字节 → 浏览器真实来源握手/取消/编辑保存刷新与文件交付 → 写上线回执。任一关键用户路径失败则保留证据并回滚。

深脑公网配置、按钮启用及独立 MCP 公开部署不包含在此次 Docs 静态发布中。
