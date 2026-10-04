# Studio 独立服务与 Worker

2026-09-29。独立 PostgreSQL API/Worker 已通过 doc.opendesign.cc 同源代理公开试用，见 [发布回执](releases/20260929T052906Z-handoff.md)。本文说明默认 JSON 模式；可选数据库与持久队列见 [PostgreSQL 运行说明](STUDIO-POSTGRES.md)，两种模式不能混用数据。

## 运行要求与构建

Node.js 24+。数据目录独占锁使用内置 `node:sqlite` 的独占事务；业务数据仍是私密 JSON 文件。

```sh
npm run build:studio-agent
```

生成 `dist-studio-agent/server.mjs` 和 `worker-child.mjs`，二者必须放在同一目录。启动前通过服务环境配置 ARK_API_KEY，不把密钥写入前端、命令历史或仓库。

```sh
STUDIO_AGENT_STATE_DIR=/absolute/private/studio-state STUDIO_AGENT_PORT=5198 node dist-studio-agent/server.mjs
```

开发模式也可用 `npm run studio:service`。服务只监听127.0.0.1；GET `/health` 等待存储锁和会话初始化成功再返回 `{ok:true}`。端口默认5198。

## Vite 接入

```sh
STUDIO_AGENT_URL=http://127.0.0.1:5198 VITE_STUDIO_AGENT_ENABLED=true npm run dev
```

显式设置URL后，Vite只代理 `/api/studio-agent`，不再打开任务数据目录。保留Host/Origin供独立服务校验。URL只允许明确端口的HTTP localhost/127.0.0.1，禁止把文档流量发往任意远端。

不设置URL时保留原嵌入式开发服务。切换到独立服务前，先停掉使用同一状态目录的嵌入式服务；不能让两个进程同时写同一目录。服务端签名密钥与业务文件必须一起保留，避免既有匿名会话失效。当前UI Cookie不是跨设备登录。

## 默认 JSON 模式的进程与数据边界

- 主服务是唯一存储写入者，统一管理会话、项目版本、候选及确认回执。
- 每次模型执行启动一个独立Node子进程，仅通过IPC接收请求/返回经过验证的候选或白名单错误码；Worker不写业务目录。这不是OS级文件访问沙箱。
- 全局模型并发仍为1；尚未实现持久队列、公平调度、跨机器Worker或数据库租约。
- 取消/超时终止子进程，SIGTERM后1秒仍未退出则SIGKILL。父端等待子进程退出再结算候选；迟到输出不应用。
- 数据根realpath统一；锁文件0600、目录0700。第二个服务获取锁失败即拒绝服务，不改写已有running状态。不得在服务运行时删除锁文件。
- 此锁仅阻止本机多进程写入；不支持跨主机/NFS共享目录。业务文件原子rename不能替代生产数据库事务、备份和灾难恢复。

## 默认 JSON 模式的关闭与重启

SIGTERM/SIGINT：停止接收新操作 → 等待已进入的HTTP处理 → 取消任务并保存interrupted → 等待Worker退出 → 释放目录锁。

强制崩溃后OS释放SQLite锁。重启读取running记录并标记interrupted，保留已完成candidate和项目确认回执。不会自动再次调用模型；用户明确重新生成时才产生新模型请求。重复确认已接受候选返回原版本。

`deploy/opendesign-studio-local.service` 是Node24的systemd模板：含私密StateDirectory、EnvironmentFile和KillMode=control-group，尚未安装启用。现有Host/Origin规则仍限制本机入口，不能直接用作公网域名反向代理。

## 已验证与下一步

- 全量69文件541测试通过；涵盖真实子进程成功/崩溃/超时/取消/非法IPC、目录锁跨进程争抢/SIGKILL恢复、会话/候选重启读取及优雅关闭后的无残留Worker。
- 独立bundle实际调用Ark，候选确认后2版本，重复确认不追加；Vite代理页面200、项目创建201、任务列表200。
- 当前已有5199预览API保持可用。本轮独立验收服务使用单独目录，未迁移原数据或接管原预览。
- 下一步：生产身份与公开入口边界、既有业务数据迁移/备份和生产发布验收。PostgreSQL 持久队列及数据库租约已实现为可选模式，见上述独立说明。共享服务器/数据库/公网配置本轮未变更。

## 数据迁移与恢复

离线 JSON 导出、PostgreSQL 备份和空库恢复工具已交付，见 [迁移步骤及回退边界](STUDIO-DATA-MIGRATION.md)。工具保留原始业务文件；本批未切换现有服务或共享数据库。

生产部署使用 `deploy/opendesign-docs-studio-{api,worker}.service`，明确设置 `STUDIO_AGENT_PUBLIC_ORIGIN=https://doc.opendesign.cc` 且必须用 PostgreSQL；Node 24 安装为隔离运行时。默认未设置 public origin 时仍只允许本机同源。公网匿名身份不等于正式账号。
