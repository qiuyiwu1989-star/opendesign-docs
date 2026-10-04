# Studio 数据迁移与备份恢复

2026-09-28。迁移工具已交付并在隔离 PostgreSQL 中验证；现有预览、原始 JSON、共享数据库和公网部署未切换。

## 本批覆盖的数据

- 服务端项目：原始 HTML、完整版本链、项目归属、当前版本、保存与候选接受回执。
- 服务端任务：所属会话、候选、完成状态、时间、请求指纹和安全错误码。
- 匿名身份：归档只含签名密钥的 SHA-256 指纹，**不含密钥本身**。恢复要求现存密钥与归档指纹一致；原浏览器 Cookie 未过期时可继续使用。

浏览器 IndexedDB 中的本地任务、需求摘要、本机待提交操作与 Docs 独立副本不在该服务端归档中。它们继续留在原浏览器，不会自动上传。

## 操作前提

Node.js 24+，先构建 `npm run build:studio-agent`。通过私密运行环境提供目标 `STUDIO_AGENT_DATABASE_URL`，不要将连接串写入命令参数或源码。

必须使用当前 API 实际配置的状态目录。停止该 API 后再导出/恢复；工具会获取同一目录独占锁，在线目录会被拒绝。PostgreSQL 备份前先等待或取消排队任务，等待执行退出，再停止 Worker。存在 queued、running 或有效租约的库拒绝备份。异常中断的运行任务需由 Worker 的租约清理转为 interrupted 后再备份，不会自动再次调用模型。

归档保存完整作品内容，应放在私密目录并纳入加密备份。文件创建为 0600，拒绝覆盖同名文件；校验和能检测损坏，不能代替可信保管或加密。密钥文件 `session-signing-key` 要单独安全备份。签名密钥遗失时，不允许生成新密钥冒充原身份完成恢复。

## 1. 旧 JSON → PostgreSQL

以下路径均为示例，请替换成真实绝对路径；归档必须位于状态目录之外。

```sh
npm run studio:archive -- export-local /private/archives/studio-before-pg.json --state-dir /private/studio-state
npm run studio:archive -- inspect /private/archives/studio-before-pg.json
```

导出逐项验证源码哈希、历史、任务归属和候选关系；不写回原项目、任务或密钥。原 JSON 中遗留的 running 只在归档副本里标记 interrupted。未知文件、未完成临时文件、损坏记录或符号链接会让整个导出失败，不静默跳过。

将数据库环境指向**新建且专用于本次迁移的目标数据库**，然后：

```sh
npm run db:migrate
npm run studio:archive -- restore-postgres /private/archives/studio-before-pg.json --state-dir /private/studio-state
```

恢复在一个数据库事务内写入全部项目与任务，仅允许空的 Studio 表。非空库、错误密钥或错误结构拒绝；中途失败全部回滚，不合并或覆盖已有数据。重试前可先检查目标库，避免把“已成功恢复但输出丢失”误当失败。

使用同一状态目录和数据库环境启动独立 API，再启动 Worker。Vite 必须通过 `STUDIO_AGENT_URL` 代理独立 API；原内嵌 Vite 模式仍是 JSON 模式。

验收顺序：原 Cookie 打开服务端副本 → 检查所有历史 → 恢复候选 → 确认 → 刷新读取 → 重复确认版本数不增加 → 检查原文件仍在。迁移工具兼容旧任务指纹，原 id 的相同请求只返回已有任务；更改要求后必须使用新 id。

## 2. PostgreSQL 备份 → 空数据库恢复

停止写入并满足静止任务要求后：

```sh
npm run studio:archive -- backup-postgres /private/archives/studio-pg-backup.json --state-dir /private/studio-state
npm run studio:archive -- inspect /private/archives/studio-pg-backup.json
```

备份从同一数据库快照读取项目和任务；检查数据库冗余 id、归属及关联相互一致。不包含连接信息、模型密钥、排队请求正文或租约。

恢复到另一台机器时，先安全还原原签名密钥到私密状态目录，保持文件 0600、目录 0700。将数据库环境指向一个新的空目标库，执行迁移和 `restore-postgres`，再按上一节验证。工具不会自动改变域名、配置、服务或启动进程。

## 3. 回退规则

- 未在 PostgreSQL 产生新数据前，可停 API/Worker，移除其数据库环境选择，使用原状态目录启动文件模式；导出没有修改原 JSON。
- PostgreSQL 已有新修改后，不能直接退回旧 JSON，否则用户看到的会是旧版本。本批不提供 PG → JSON 合并或自动回退；应备份 PostgreSQL 并恢复到新的空 PostgreSQL 库。
- `db:rollback-empty` 仅适用于空的 Studio schema，不是生产数据恢复命令。

## 工具契约与限制

独立部署入口：`node dist-studio-agent/archive-cli.mjs <action> <file> --state-dir <directory>`；inspect 不需要 state-dir。动作包括 export-local、backup-postgres、restore-postgres、inspect。日志只显示数量、时间和校验和；失败时不打印源码、SQL、连接串或密钥。

归档上限：64 MiB、1000 个项目、3200 个任务，每个身份最多 100 个任务；项目仍最多 20 个版本。超过上限明确拒绝，需后续批量迁移工具处理。

仍是匿名会话身份，Cookie 过期与跨设备登录不由本工具解决。正式账号、组织权限、定期自动备份和公网切换仍为后续工作。本批没有执行原预览数据迁移。

## 验证证据

- 真实 HTTP：JSON 服务产生版本与候选 → 关闭 → 导出 → 第一个 PostgreSQL → 同 Cookie 读历史、重试与接受 → 备份 → 第二个 PostgreSQL → 读回一致。
- 真 PostgreSQL：非空库拒绝、写入故障整事务回滚、活跃任务拒绝、数据库关联损坏拒绝。
- 文件工具：校验和损坏、源码哈希损坏、未知字段、错误身份、符号/硬链接、错误密钥、目录在线、覆盖已有文件和写入原目录均拒绝，原文件字节保留。
- 打包 CLI 通过真实数据库执行，符号链接方式启动也会执行而不会静默退出。

本批最终：79 个测试文件、599 项测试通过；TypeScript、前端及独立后端构建通过。测试使用隔离临时数据库与确定性模型执行器，不产生真实模型请求。

## 2026-09-29 生产补充

公网使用新建独立 PostgreSQL 数据库，未导入原浏览器或本机 JSON。新增 daily_usage 配额表不在本格式归档中，恢复至新空库会重置历史额度；生产 pg_dump 备份覆盖此表并已恢复校验。详见 [发布回执](releases/20260929T052906Z-handoff.md)。
