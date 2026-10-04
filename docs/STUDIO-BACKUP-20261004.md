# Studio 定期备份交付（2026-10-04）

状态：脚本、systemd service/timer 模板和隔离测试已完成，**尚未安装、启用或在生产运行**。本轮未连接生产、修改数据库或执行恢复。线上现有初始备份及发布包保持原样。

## 范围

- 固定备份独立数据库 `opendesign_docs_studio`，使用现有专用 Linux/PG 角色 `opendesign-docs-studio` 与 Unix socket peer 认证，不读取共享管理员凭据。
- `pg_dump --format=custom` 提供一致性快照，包含 projects、jobs、daily_usage 等全库业务表；不受自定义 JSON archive 不包含日额度的限制。
- 同时复制原 `/var/lib/opendesign-docs-studio/session-signing-key`，保留匿名身份连续性；备份前后检测密钥变化，变化则本次失败。不会生成或轮换签名密钥。
- 备份根目录固定 `/var/backups/opendesign-docs/studio-daily`，root 私有 0700；产物 0600。拒绝目录路径上的符号链接、公开可读或非普通签名密钥文件。
- 产物包含 `database.dump`、`session-signing-key`、`manifest.json`（SHA256 校验）。临时目录成功检查后才原子改名，文件和目录刷盘；并发运行由文件锁拒绝。
- dump 和 `pg_restore --list` 检查任一失败、超时、密钥变化，均返回非零；清理本轮临时目录，不轮换旧备份。日志只显示结果类别，不打印数据库内容、密钥或子进程原始错误。
- 每天新加坡时间 03:30，随机延后最多 15 分钟；停机错过后补运行。成功后保留最近 14 天。
- 轮换只移除本工具命名、精确文件清单、格式标记、数据库名、时间和文件哈希都匹配的过期目录。未知文件、额外文件、损坏备份、符号链接、硬链接、旧发布目录一律保留。未知损坏目录需人工检查，不能把轮换当作磁盘无限清理。

## 安装步骤（待后续发布执行）

要求 Linux、systemd、Python 3.9+、`/usr/bin/pg_dump` 与 `/usr/bin/pg_restore`（客户端版本兼容生产 PostgreSQL）、`/usr/sbin/runuser`，已有专用数据库角色/socket peer 认证。先检查磁盘容量、客户端版本和现有备份；以下命令只能在目标服务器上执行，未在本轮执行。

```sh
sudo install -d -o root -g root -m 0755 /opt/opendesign-docs-studio/ops
sudo install -d -o root -g root -m 0700 /var/backups/opendesign-docs/studio-daily
sudo install -o root -g root -m 0755 deploy/studio-backup.py /opt/opendesign-docs-studio/ops/studio-backup.py
sudo install -o root -g root -m 0644 deploy/opendesign-docs-studio-backup.service /etc/systemd/system/opendesign-docs-studio-backup.service
sudo install -o root -g root -m 0644 deploy/opendesign-docs-studio-backup.timer /etc/systemd/system/opendesign-docs-studio-backup.timer
sudo systemd-analyze verify /etc/systemd/system/opendesign-docs-studio-backup.service /etc/systemd/system/opendesign-docs-studio-backup.timer
sudo systemctl daemon-reload
sudo systemctl start opendesign-docs-studio-backup.service
sudo systemctl status opendesign-docs-studio-backup.service
sudo journalctl -u opendesign-docs-studio-backup.service -n 20 --no-pager
```

先检查第一次备份的权限、文件、校验和，并完成下述隔离恢复演练，再启用：

```sh
sudo systemctl enable --now opendesign-docs-studio-backup.timer
sudo systemctl list-timers opendesign-docs-studio-backup.timer
```

停止定期任务用 `sudo systemctl disable --now opendesign-docs-studio-backup.timer`；不会移除备份或停止 Studio API/Worker。timer 不带自动重试；失败后人工检查磁盘、PG 客户端/认证和密钥权限，再手动重跑。未接入外部告警，不能宣称已具备自动故障通知。

## 恢复验收与限制

`pg_restore --list` 仅证明目录可解析，**不等于实际恢复成功**。正式启用前需使用新建、隔离且为空的演练数据库恢复备份，运行现有 schema 验证，对照项目/版本/候选/额度数量与业务可读性。恢复包含 queued/running 的在线快照时还需验证队列租约过期恢复行为；不要对生产库执行试恢复，也不要启用演练 Worker 调用真实模型。

灾难恢复须由操作者明确选择备份及目标空库，先停止目标 API/Worker，再还原数据库和该备份配套签名密钥（专用服务用户拥有、0600），核验 schema、候选确认与匿名会话访问后恢复服务。原签名密钥不得被初始化脚本覆盖。不要直接把 root-only 备份目录当作运行目录。

这是一台服务器内的本地备份，不能覆盖整机丢失。下一批应接私有、加密的异机/COS 副本和监控；本轮未配置 COS，尤其不能把含签名密钥的目录放到公开对象存储。数据库 dump 不含 PG 集群角色定义、API/Worker 环境文件、Nginx 配置或浏览器本地草稿；恢复环境需结合发布回执和私密配置管理。

## 本地验证

```sh
python3 -m unittest discover -s deploy/tests -p 'test_studio_backup.py' -v
```

5 项隔离测试通过：私密输出与原密钥不变、dump 失败保留原备份并清理临时文件、拒绝符号链接/公开密钥、密钥变化拒绝发布、保留策略只清理完整有效过期产物。测试用模拟 pg_dump/pg_restore，无数据库连接。生产 systemd 运行及真实 PG 恢复仍待发布阶段验证。
