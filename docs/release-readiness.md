# 上线前验证记录

这份记录对应本轮订单、支付、退款、拼团、副作用、升级回滚和发布流程修复。源码修复提交为 `baf03008966964a914ceb5f6273851af2501211b`；随后只允许追加文档提交。测试镜像必须使用当前提交重新构建，并由 Dockerfile 校验镜像内 `build.json.gitCommit` 与 `VCS_REF` 一致。

## 自动化验证

最终镜像使用以下命令构建和验证：

```sh
docker build --build-arg VCS_REF="$(git rev-parse HEAD)" -t crmeb-test-current:latest .
sh scripts/check-maintenance.sh crmeb-test-current:latest
```

本轮已经完成的独立验证如下；提交文档后应以同一当前提交重建镜像，再执行一次完整门禁：

| 范围 | 结果 | 证明的内容 |
|---|---:|---|
| PHPUnit、MySQL/Redis/HTTP 集成和并发回归 | 260 tests / 3567 assertions | 订单、优惠券、库存、支付回调、取消、退款、拼团、副作用、迁移和保留入口 |
| PHP 语法与静态守卫 | 通过 | 精简边界、安装 SQL、模型关系、PHP 符号、事件、容器拓扑、发布流程和微信支付契约 |
| 发布规则 | 8/8 | 首次发布、重复发布、digest 冲突、查询失败和推广保护 |
| 升级/回滚规则 | 8/8 | 固定镜像、备份恢复、迁移失败停写、维护状态和回滚清单 |
| QueueTest 定向回归 | 12 tests / 61 assertions | 取消入口、尝试状态、网关查单顺序、未知结果和资源恢复 |
| 前端构建 | 后台、H5、小程序完成 | 构建提交与 `010e431a` 一致；小程序因无 AppID 仍标记不可发布 |

并发稳定性和变异测试必须在最终镜像上执行。并发脚本要求镜像标签与当前提交一致；这项约束用于防止用旧镜像掩盖新代码，失败时必须重建镜像，不能放宽检查。

## 本轮修复的关键保证

- 取消、手动入口、队列和定时任务共用订单锁内的取消流程。支付尝试处于 `CREATING` 时不释放库存或优惠券；只有网关明确关闭的具体尝试才能转为 `CLOSED`。
- 支付回调在原订单锁内区分首次收款、同交易重复、不同交易重复和取消后收款；异常收款持久化成功后才确认回调。
- 退款使用稳定的售后编号和冻结金额。`processing`、`unknown` 与 `success` 分开保存；网关成功而本地提交失败时，恢复入口查询同一退款编号并执行完整本地收尾。
- 退款累计金额锁定原支付订单，并计入已成功、处理中和未知结果的金额占用；库存恢复失败发生在网关请求之前。
- 拼团名额使用团记录锁；通知、打印、开票和延迟任务在核心事务提交后通过副作用记录执行，非幂等外部动作结果未知时转人工核对。
- v3 支付同时覆盖公钥和平台证书验签，证书序号未命中时只刷新一次；查单、关单、退款和查退款的未验签响应不能被当作可信结果。
- 升级使用固定 digest、明确的 PHP entrypoint 和持久恢复清单；发布先比较临时候选 manifest，正式 SHA 冲突时在覆盖前失败。

## 尚未完成的发布条件

这些项目不能由离线替身、静态检查或容器健康状态代替：

1. 在生产备份副本上完成真实数据恢复演练，逐行摘要核对订单、明细、售后、领券、用户和可靠性记录；同数量不同内容必须失败。
2. 在维护窗口中停止 HTTP 写入口、queue、timer 和 workerman，记录实际运行容器 digest，再执行迁移和启动验收。
3. 使用真实微信商户 v3 配置完成普通购买、支付回调、退款、网关重试和退款查询；确认异常收款的人工处理流程。
4. 使用真实客户端完成普通购买、拼团、预售取消和退款验收。小程序需要有 AppID 的可提交包后另行验收。
5. 人工确认候选 digest、源码提交、迁移演练记录和商户验收记录一致后，才允许推广 `edge`。

在上述条件完成前，本项目不应以 `docker compose pull && docker compose up -d --wait` 作为首次上线流程。两条 Compose 命令只适用于已经完成首次迁移、部署配置没有变化、且目标是已验收固定 digest 的日常版本。

## 复现入口

```sh
node scripts/source-metrics.cjs --write
docker build --build-arg VCS_REF="$(git rev-parse HEAD)" -t crmeb-test-current:latest .
sh scripts/check-maintenance.sh crmeb-test-current:latest
bash tests/deployment/mutation-check.sh
```

`tests/regression/risk-matrix.md` 和 `tests/regression/cases.md` 保存每个核心业务不变量及对应测试；生产验收记录应单独保存，不得用测试数量代替。
