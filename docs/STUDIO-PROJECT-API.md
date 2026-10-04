# Studio 本地项目与候选确认 API

2026-09-28。仅 Vite 本机开发服务；没有生产账号、数据库或 Worker。接口均为 POST JSON，要求 loopback peer、localhost/127.0.0.1 Host 和同源 Origin。使用服务端签名的匿名 Cookie，不接受请求声明 owner。旧无主任务不自动认领。

## 路由

| 路径（前缀 /api/studio-agent） | 请求字段 | 响应 |
|---|---|---|
| /projects/create | source, id（可选UUID） | 201 `{project}` |
| /projects/read | projectId | 200 `{project}` |
| /projects/save | projectId, expectedRevision, source, operationId（可选UUID） | 200 `{project}` |
| /jobs/start（项目模式） | id（可选）, projectId, baseRevision, targetId, instruction | 202 `{job}` |
| /projects/accept | projectId, jobId | 200 `{projectId, revision}` |

项目模式start只使用服务端已保存源码，不接受version或候选正文。基础版本必须是当前head；已有同ID同请求可重试，且不重复调用模型。id为调用方预分配UUID时可以在响应丢失后恢复查询。

`/jobs/query/cancel/list/remove` 保留原路径。旧Studio本地版本可继续使用原start `{id?,version,targetId,instruction}`；此类无项目绑定的任务不能调用项目accept。

## 接受语义

- 只接受此会话下已保存且绑定指定项目的candidate任务；候选取自服务端，不采纳客户端提供的替换结果。
- 归属、基础版本及源码校验通过后，以源码补丁修改选区；当前head变化返回409，绝不覆盖新内容。
- 项目同一文件原子存储新版本及 `acceptedJobId/candidateHash` 回执。同job同candidate重试返回原版本；即使项目已有后续版本也不重复追加。
- 生成状态与接受回执独立：任务status仍可为candidate；确认是否接受以项目revision中的回执为准。
- 不可访问项目/任务统一404；版本冲突409；非法输入422；客户端指定归属400；会话容量429。
- 同进程目录锁、文件原子替换；不代表跨进程事务。项目最多20版本、源码200000字符。删除生成任务后不能再经jobId重试accept，已保存的项目版本不删除。

## 工作台下一步接入约束

当前UI同时保留本地任务和显式创建的服务端副本模式，没有静默迁移。服务端副本的作品版本已由HTTP管理；本地任务保持原有存储。

显式创建服务端项目后，该模式以服务端版本为唯一作品版本来源；IndexedDB作为缓存与待提交操作记录。接受前先持久化操作标识；远端提交后本地缓存与回执同一事务更新。若远端成功而本机同步失败，保留操作并明确提示，不将它当作“未保存”重生成。断线后重试同一job的accept取回原回执。手改、恢复版本也必须走相同服务端版本链。

创建重试须使用相同id、初始source；手动保存重试须使用相同operationId、expectedRevision、source。savedOperationId与版本原子写入，重试返回当前项目历史而不追加。客户端待提交记录独立持久化，HTTP成功但本机同步失败时可恢复同一操作。
