# 上线前验证记录

## 已上线：acceptance-2026-09-21-production-cutover

`x-zoo.vip` 已在 2026-09-21 切到本仓库的发布版本并通过验收。

| 项目 | 值 |
|---|---|
| 源码提交 | `5b9a5f9b1633353655c1a44380ef76a8856d49a3` |
| 候选镜像 | `ghcr.io/xiangyumou/crmeb@sha256:9ed42ebdc89f50a4f165589754c39b9dd6260f8cb7a8fa3433a7e34263765171` |
| 回滚目标 | `ghcr.io/xiangyumou/crmeb@sha256:dd74f4ef4c3f55619e53f57f3edcfba3931bd654034e13fce25b1e53d4927592`（`100349db`） |
| 前端产物 | 后台 `a504aa82…`、H5 `3dbd3ce0…`、小程序 `7449ba19…`（`publishable: false`） |
| 门禁 | `sh scripts/check-maintenance.sh` 退出码 0 |
| 验收记录编号 | `acceptance-2026-09-21-production-cutover` |

三个前端产物摘要在另一台机器重新构建后与既有记录逐字节一致，构建可复现这一点是独立复核过的。

### 门禁结果（提交 `5b9a5f9b`）

| 层次 | 结果 |
|---|---|
| PHPUnit（单元 + 真实 MySQL/Redis 集成 + HTTP + 并发） | 270 tests, 3628 assertions, 0 failure, 0 error |
| PHP 7.4 语法检查 | 通过 |
| 静态守卫（11 项） | 全部通过 |
| 发布规则（真实本地 registry） | 8/8 |
| 升级/回滚规则（真实一次性容器栈） | 9/9 |
| 并发稳定性（10 次重复） | 10/10，每次 44 tests / 2461 assertions |
| 定向变异检查（14 项保护，逐条在临时副本内移除） | 14 detected, 0 undetected, 0 skipped |
| 微信/小程序/H5 支付适配器 | 通过 |

### 生产数据副本上的迁移演练

用当日生产备份恢复到一次性 MySQL，跑完整迁移并起整套新版应用：

- `drop-retired.php plan` 报 `apply_ready: true`，无待结算负债。
- `apply`：489 行变更、53 张退役表改名，JSON 备份落盘。
- `order-reliability.php apply`：建三表、加三列，自身校验通过。
- **装修 6 页 id 集合一致、2 个商品逐字段一致、79 条素材记录逐字段一致。**
- php / queue / timer / workerman 四个角色真实健康检查全过；`/`、`/admin/`、`/readyz`、`/api/version` 均 200，`/readyz` 返回 `{"ready":true}`，应用日志 0 条错误。

正式升级在生产上得到同样的 489 行 / 53 张表，与演练一致。

### 上线过程中发现并处理的问题

1. **`.env` 属主权限**：文件是 `640 ubuntu:ubuntu`，而新的就绪探针以 `www-data` 在 php-fpm 里读它，读不到就报 `missing settings`。旧版探针不读这个文件，所以此前没有暴露。`upgrade.sh` 在健康闸处按设计停住：迁移已完成、备份完好、流量没有恢复。改成 `ubuntu:www-data` 后重新启动即通过。部署文档已补这一条。
2. **`[CHANNEL]` 缺失**：生产 `.env` 从未配置该段，于是 php/queue/timer 都在连自己的 `127.0.0.1`，新订单提醒与客服消息实际上一直没有送达。补齐后 queue 与 timer 的健康检查（依赖 Channel 往返）才通过。
3. **`[DATABASE] DEBUG = true`**：未认证请求能拿到数据库层错误原文，已改为 `false`。

### 仍然开放的条件

- **微信支付配置不完整**：`pay_weixin_key` 为空，公众号与小程序 `appid` 为空（商户号与证书序列号已配）。在补齐之前无法真实收款，真实商户支付/退款验收也无法进行。
- 小程序包仍是 `publishable: false`（未配 `CRMEB_MP_APPID`），不能提交微信审核。
- 异常收款、结果未知的退款与副作用只能由 `php think order:reconcile` 人工列出，没有告警。真实收款开始前需要一个定时检查。
- `.env` 没有 `APP_KEY`，JWT 回落到字面量 `default`。令牌另有缓存白名单把关，所以不是直接可利用的漏洞，但仍应写入随机值（会使现有登录态失效）。
- 退役表以 `eb_retired_*` 保留，`finalize` 是验收期之后的独立操作。

---

## 历史完整门禁记录（修复前）

这份记录对应本轮订单、支付、退款、拼团、副作用、升级回滚、发布流程以及前端产物可复现性的修复。源码提交为 `7e1d6414f7040c7feefe948f1e803f8c4979809f`（`cleanup/retired-features`）；记录本身是随后的文档提交，除 `docs/`、`README` 与测试文档外没有代码差异。

## 1. 被验证的产物

| 项目 | 值 |
|---|---|
| 源码提交 | `7e1d6414f7040c7feefe948f1e803f8c4979809f` |
| 测试镜像 | `crmeb-test-current:latest`，镜像 ID `sha256:dc763a75a4b9aa2cfc0ce67e26b4a6b7d4f58cb5f1d1a55c2fdd57fb68010700` |
| 镜像 revision 标签 | `7e1d6414f7040c7feefe948f1e803f8c4979809f`（与 `git rev-parse HEAD` 一致） |
| 前端构建 | `scripts/build-release.sh`，Node 20.19.0 / npm 10.8.2，UniApp 2.0.2-5020420260813001 |
| 后台产物 | `a504aa8280f067eeb430045599cd39da3e28be78d32c4b56feeb330bd1cea927` |
| H5 产物 | `3dbd3ce0ac17f1283bf09246f96707f3aef2867ae43b25bff85dbbddeaba6be3` |
| 小程序产物 | `7449ba1931001b9c027491e552481303199b71f10ac4077eedcf49db50c1be24`（`publishable: false`，未配置 AppID） |
| 门禁命令 | `sh scripts/check-maintenance.sh crmeb-test-current:latest` — 退出码 0 |
| 工作区 | 构建与门禁期间工作区干净，`.build/release/build.json` 记录的提交与被测提交一致 |
| 验收记录编号 | `acceptance-2026-09-21-order-payment-refund` |

推广时的参数约定：`source_sha` 传入实际推送并已由 CI 发布 `sha-<sha>` 标签的提交；本记录之后的提交若只修改 `docs/`（以及 `README`、测试文档），其中的镜像内容与本文档记录的源码完全一致，可以直接作为推广目标。`acceptance_record` 传入上面的验收记录编号，`candidate_digest` 传入该提交标签解析出的 digest。

镜像来源可核验：Dockerfile 用 `VCS_REF` 与镜像内 `build.json.gitCommit` 比对，前端产物在构建时被重新汇编并计算摘要，三个摘要都能独立复现（见第 4 节），因此“镜像里的前端产物来自这个提交”不是仅凭标签得出的结论。

## 2. 门禁覆盖与结果

| 层次 | 结果 |
|---|---|
| PHPUnit（单元 + 真实 MySQL/Redis 集成 + HTTP + 并发 + 固定随机种子状态序列） | 260 tests, 3567 assertions, 0 failure, 0 error |
| PHP 7.4 语法检查（`app`、`crmeb`、`route`、`upgrade`） | 通过 |
| 静态守卫 | core-store-front、admin-api-contract、retired-code-guard、install-sql-guard、model-relation-guard、php-symbol-guard、event-payload-guard、deployment-topology-guard、release-pipeline-guard、verify-release-test、wechat-payment-test 全部通过 |
| 发布规则（真实本地 registry） | 8/8 |
| 升级/回滚规则（真实一次性容器栈） | 8/8 |
| 并发稳定性（两种执行顺序，各重复 10 次） | 10/10，每次 42 tests, 2444 assertions |
| 定向变异检查（临时副本内逐条移除保护） | 10 detected, 0 undetected, 0 skipped |

并发与变异检查都在最终镜像上执行。并发脚本会拒绝在被修改过的代码上使用旧镜像，这项约束用于防止用旧构建掩盖新代码。

变异检查覆盖的十项保护：支付/取消订单锁、支付尝试上下文不可变、网关确认关单、退款金额冻结、优惠券剩余数量条件更新、虚拟卡原子领取、退款完成金额由服务生成、TLS 对端校验、响应验签、取消后收款的异常分支。移除任意一项都会让对应用例失败，说明这些断言不是空转。

## 3. 本轮新发现并已修复的问题

1. **取消链路的测试夹具与落库结构不一致。** `QueueTest` 的支付尝试替身没有 `status` 字段，取消实现读取该字段时直接抛异常；同时订单夹具依赖数据库默认的空 `pay_type`，而队列入口会跳过线下支付订单，导致用例根本没走到被测路径。夹具现在显式构造微信支付订单，并给支付尝试补上 `SUBMITTED` 状态。修正前该组用例 4 个失败，修正后 12 tests / 61 assertions 通过。
2. **前端产物不可复现。** 同一提交两次构建中，H5 与小程序产物摘要不同（后台一致）。差异来自 `scripts/build-uni.sh` 使用随机 `mktemp` 工作目录——vue-loader 会把工作路径参与进每个带样式 chunk 的模块 id——以及小程序编译器把 `components/home/index.json` 的键顺序写成不确定顺序。工作目录改为固定路径并对 uni 两端产物规范化 JSON 键顺序后，H5 与小程序连续两次构建摘要一致；后台两次独立构建摘要一致。`tests/static/release-pipeline-guard.cjs` 增加了对应断言，重新引入随机工作目录时守卫会失败。

问题的实际影响：产物摘要漂移会让同一提交的重复发布看起来像内容冲突，`scripts/publish-release.sh` 会因此拒绝补发。修复后该路径可用于重试。

## 4. 可复现性证据

- 后台：两次独立 `scripts/build-admin.sh` 输出摘要均为 `a504aa82…`，与发布镜像内记录的摘要一致。
- H5 与小程序：连续两次 `scripts/build-uni.sh` 输出摘要一致（H5 `3dbd3ce0…`，小程序 `7449ba19…`），与发布镜像内记录的摘要一致。
- 修复前同样方法测得 H5 与小程序摘要每次不同，说明该检查确实能发现漂移而不是恒定通过。

## 5. 本轮修复的关键保证

- 手动、队列与定时取消共用同一个入口，在订单锁内读取支付尝试。处于 `CREATING` 的尝试会让取消停止而不是释放资源；只有网关明确回答已关闭的具体尝试才被标记 `CLOSED`。
- 支付回调在原订单锁内区分首次收款、同交易重复、不同交易重复与取消后收款；异常收款先持久化再确认回调，钱已收但订单已取消时进入人工处理，不自动补发商品。
- 退款使用持久化的售后编号与冻结金额，`processing`、`unknown`、`success` 分开保存；网关受理而本地提交失败时，恢复入口仍查同一编号并执行完整本地收尾。累计退款计入处理中与未知结果的金额占用。
- 拼团名额在团记录锁内判断；通知、打印、开票与延迟任务改为在核心事务提交后按副作用记录执行，非幂等外部动作结果未知时转人工。
- v3 支付覆盖公钥与平台证书两条验签路径，证书序号未命中时只刷新一次；查单、关单、退款与查退款的未验签响应不会被当作可信结果。
- 升级使用固定 digest 与 `--entrypoint php` 执行迁移，失败时显式停止写入角色并保留维护状态；发布在覆盖正式产物之前比较候选 digest，冲突直接失败。

## 6. 仍然开放的发布条件（人工）

以下项目不能由离线替身、静态检查、容器健康状态或测试数量代替：

1. 在生产备份的副本上完成真实数据恢复演练，逐行摘要核对订单、订单明细、售后、领券、用户与可靠性记录；行数相同而内容不同必须失败。
2. 在维护窗口中停止 HTTP 写入口、queue、timer 与 workerman，记录实际运行容器 digest，然后执行迁移与启动验收；核对生产现有的 7 条订单与 3 条领取记录原样保留。
3. 使用真实微信商户 v3 配置验收普通购买、支付回调、退款、网关重试与退款查询，并确认异常收款的人工处理流程。
4. 使用真实客户端完成普通购买、拼团、预售取消与退款验收；小程序需要有 AppID 的可提交包后单独验收。
5. 人工确认候选 digest、源码提交、迁移演练记录与商户验收记录一致后，才允许推广 `edge`。

在这些条件完成之前，首次上线不应使用 `docker compose pull && docker compose up -d --wait`。这两条命令只适用于已完成首次迁移、部署配置无变化、且目标是已验收固定 digest 的日常版本。

## 7. 复现入口

```sh
docker build --build-arg VCS_REF="$(git rev-parse HEAD)" -t crmeb-test-current:latest .
sh scripts/check-maintenance.sh crmeb-test-current:latest
bash tests/deployment/mutation-check.sh
node scripts/build-release.sh
```

`tests/regression/risk-matrix.md` 与 `tests/regression/cases.md` 保存每个核心业务不变量及其对应用例；生产验收记录单独保存，测试数量不作为完成标准。
