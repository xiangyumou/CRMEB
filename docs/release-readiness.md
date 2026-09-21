# 上线前验证记录

## 上线后复查（本轮，未验收）

上线之后对整个仓库做了一次复查。下面是本轮改动与证据；**这一节还不是验收记录**，
推广前仍需按第 6 节的人工条件走一遍。

### 修掉的缺陷

| # | 问题 | 证据 |
|---|---|---|
| 1 | `/api/crontab/*` 八个定时任务接口**匿名可达**。整个 `/api` 组挂的是 `AuthTokenMiddleware::class, false`（`$force=false` 时吞掉鉴权异常继续放行），而 `CrontabController` 不继承任何鉴权基类。任何人都能取消未支付订单、**强制确认收货**（压缩买家售后窗口）、删除昨日附件、反复触发无界开销的数据库操作。 | 改前实测八个端点全部返回 200，且一次匿名 GET 改写了 `runtime/.timer`。生产由独立 `timer` 容器跑定时任务，这组 HTTP 接口是冗余机制，整组删除。`StorefrontCronEndpointTest` + `retired-code-guard` 的路由回流检查。 |
| 2 | 上传目录下的文件**会被当成 PHP 执行**。nginx 配置里没有任何 `/uploads` 规则，`.php` 直接命中通用的 `location ~ \.php$`；扩展名白名单是唯一一道防线，没有纵深防御。 | 改前实测：同一个文件返回 200 并执行了 PHP（回显 `RCE-EXECUTED`），改后 403。`UploadExecutionTest`（5 种可执行后缀 + 正常文件对照组 + 点文件 + 缓存头）。注意 `^~` 会让 nginx **跳过后面全部正则 location**，所以只写一个前缀块会在堵住 PHP 执行的同时把全局那条 `location ~ /\.` 让掉、并悄悄改掉上传文件的缓存语义；这两条都在块里重写了一遍，各自有用例和变异条目。生产 `data/uploads` 实测 79 个文件全是图片，没有任何 `.php`/点文件，这个面没有被用过。 |
| 3 | 前台 `/api/login` 没有验证码、没有失败计数、没有任何节流，任意顾客账号可被无限次试口令；口令存的是**无盐 MD5**，而后台用的是 bcrypt。 | 按账号维度节流（不按来源：代理后所有访客共用一个地址，按来源限速会变成全站限速），且冷却只看最近 60 秒而不是整个 15 分钟计数窗口——按整个窗口算，任何人都能靠持续制造失败把某个顾客账号**无限期**锁在门外；口令校验兼容历史 MD5 并在登录成功时就地升级为 bcrypt。`StorefrontLoginSecurityTest`。 |
| 4 | `user.pwd` 是 `varchar(32)`，装不下 60 字符的 bcrypt。回归栈的 MySQL 非严格模式下会**静默截断**，被截断的哈希永远验不过——等于永久锁死账号。 | 新增 `upgrade/core-store/user-password-hash.php`（幂等、自校验、核对用户行数），已接进 `deploy/production/upgrade.sh`；`/readyz` 增加列宽检查。登录侧写完回读校验，验不过就写回原值，所以**代码与迁移谁先上线都不会锁死用户**，这条单独有用例。 |
| 5 | `StoreOrderEffectServices::execute()` 声明返回 `bool`，但五个通知类 case 是 `break` 出 switch 的，函数末尾没有 return。PHP 7.4 抛 TypeError，通知其实已经发出去了，异常在那之后，于是**每一笔支付的五条通知副作用都被记成 UNKNOWN**，堆进人工对账队列，而重投会重复发通知。 | 由新引入的 phpstan 发现。`OrderEffectTest::testANoticeEffectIsRecordedAsDone`（5 个事件类型，修复前 5/5 失败）。注意 `FulfillmentAtomicityTest` 原本断言通知停在 UNKNOWN——**那条断言把缺陷当成了预期行为，这正是它能一直活着的原因**，已一并更正。 |
| 6 | JWT 签名密钥兜底成字符串 `default`（四处 `Env::get('app.app_key', 'default')`）。那个值印在公开上游源码里，等于任何人都能伪造任意用户与管理员的令牌。生产已补随机值，但兜底本身还在，下一个部署照样会踩；安装模板还把 `APP_KEY = crmeb` 写死。 | 新增 `crmeb\utils\SigningKey`：读不到或读到已知弱值就抛异常，不再静默降级。安装器改为生成 32 字节随机密钥；`/readyz` 增加强度检查。 |
| 7 | `AdminLoginGuard` 注释写明"缓存不可用时失败开放"，但实现走的 `CacheService::get()`/`delete()` **不吞异常**（只有 `set`/`remember`/`has` 包了 try/catch），Redis 一抖后台登录直接 500——正是设计要避免的结果。 | 计数机制抽到 `LoginThrottleGuard`（后台与前台共用，按 scope 隔开），缓存访问在内部兜底。 |
| 9 | 异常收款、结果未知的退款与副作用**没有任何告警**，只能靠有人主动去敲 `php think order:reconcile`。发布文档自己把"真实收款开始前需要一个定时检查"列为开放条件。顺带发现：`effects:list` 用的是 `pendingIds()`，那是**自动补投**队列，通知与打印的未知结果被它刻意排除（必须人工确认后重试）——也就是说这份给人看的清单恰好漏掉了真正需要人处理的记录。 | 新增 `OrderReconcileAlertServices` 与定时任务 mark `paymentReconcileAlert`，判定复用人工核对用的同一批查询；新增 `StoreOrderEffectDao::manualIds()`（自动路径永远不会再碰的记录），告警与 `effects:list` 都改用它。`ReconcileAlertTest`。 |
| 8 | 其它：安装模板 `[DATABASE] DEBUG = true`（上线时踩过的同一个泄露问题）；PHP 未显式关 `display_errors`（官方镜像不装 php.ini，缺省是开的）；`make_path()` 建 0777 目录；`BaseDao::setJoinModel()` 与 `EnterpriseWechatJob::doJob()` 同样缺 return；`getTimerInfo()` 判空在使用之后；遗留空控制器与失效的 `.travis.yml`。 | 逐条修正，其中后两类由 phpstan 发现。 |

### 新增的工程化

- **PHP 静态分析**（此前完全没有）：`tests/static-analysis/` 独立 composer 项目，phpstan 1.12.30 固定版本，跑在已构建镜像里（应用的 vendor 只存在于镜像内），不需要 MySQL/Redis——这同时是目前唯一一条不用起整套栈的快反馈回路。level 1 起步 + baseline，含义是"从今天起不再新增"；框架 facade 的误报用 `ignoreErrors` 排除而不是塞进 baseline。首次运行就找出了上表第 5、8 条。
- **变异检查进门禁**：`tests/deployment/mutation-check.sh` 此前只在发布时手动跑，变异覆盖会在两次发布之间悄悄腐化，现在进了 `scripts/check-maintenance.sh`。CI 的 regression job 相应补了拉取发布产物的步骤（变异脚本要读 `.build/release/build.json` 决定构建哪个 revision），超时从 10 分钟放宽到 60 分钟。
- 新增保护逐条加进变异检查（14 → 21 项）：前台登录节流、冷却有上界、口令升级回读校验、历史 MD5 兼容、上传目录 PHP 拦截、上传目录点文件拦截、对账巡检读的是人工清单而非自动补投队列。

### 本轮门禁结果

| 层次 | 结果 |
|---|---|
| PHPUnit（单元 + 真实 MySQL/Redis 集成 + HTTP + 并发） | **304 tests, 3720 assertions, 0 failure, 0 error**（上一轮 270 / 3628） |
| PHP 7.4 语法检查 | 通过 |
| phpstan（新增） | 0 errors（baseline 收住 289 条历史问题） |
| 静态守卫（11 项） | 全部通过 |
| 发布规则（真实本地 registry） | 8/8 |
| 升级/回滚规则（真实一次性容器栈） | 9/9 |
| 定向变异检查 | **21 detected, 0 undetected, 0 skipped**（上一轮 14 项） |
| 并发重复 | 门禁内 10/10；另见下方说明 |

并发用例在机器被其它容器栈同时占用时观察到 2/32 次抖动，失败点是
`PaymentConcurrencyTest::testACreateResponseTimeoutKeepsTheAttemptAsUnknown`。
机器空闲后本分支 20/20、未改动的 HEAD 基线同条件 20/20，均未复现；上线前这一次完整
门禁又跑到 10/10。支付链路（`StoreOrderController::pay` → `OrderPayServices` → 网关替身）
不经过本轮改动的任何文件。记录在此：这个用例对机器负载敏感，而 `concurrency-stability.sh`
要求 10/10——也就是说，机器上同时跑着别的容器栈时它可能会红，那不是回归。

### 复查发现但**未修**的问题

以下已核实存在，但都需要各自的并发用例或会动到已验证的产物可复现性，不适合并进本轮：

1. `StoreOrderTakeServices::takeOrder()`（约 `:91-99`）与 `StoreOrderDeliveryServices::delivery()`（约 `:63`）是无锁的 check-then-act：读状态、判断、再 `save()`，保存没有以 `status` 为条件。两个并发请求都能通过判断。当前后果是重复触发通知事件而非重复发钱（积分/佣金随退役功能一起下线了），但这条不变量目前没有任何保护。
2. `StoreOrderRefundServices::applyRefund()` 的"已有待处理退款"检查（约 `:1260-1267`）在事务之外、且没有订单行锁，两个并发申请可以各自建出一张退款单。金额仍被 `assertCumulativeRefundWithinPaid` 兜住，所以不会重复退款，但那条检查读起来像不变量，实际不是。
3. `BaseDao::incStockDecSales()`（约 `:573`）是读-再-写，而不是像 `decStockIncSales()` 那样的条件更新。它在退款/取消侧，所以是多还或少还库存而不是超卖。
4. `PayClient::handleTransferNotify()`（约 `:683`）不验签，与 `handleNotify()` 不对称。目前没有路由指向它。
5. 前台用户令牌不绑定口令哈希（`UserAuthServices::parseToken` 只取 `[$id, $type]`），改密后旧令牌仍然有效直到 30 天缓存过期；后台侧是绑定的。
6. `/adminapi/image/scan_upload` 的令牌是单一全局缓存键、10 分钟内可重复使用、不限次数、不与生成它的管理员绑定。
7. `SystemAttachment::videoDataSave()` 把客户端传来的路径原样写进附件表，没有任何校验；`onlineUpload()` 会抓取客户端给的 URL（SSRF 面）。
8. 注册短信验证码用后不删（`LoginController` 约 `:219`），在有效期内可重放；手机号登录与绑定手机则会删。
9. `template/admin/package-lock.json` 声明了 `package.json` 里并不存在的四个运行时依赖（`@better-scroll/core`、`better-scroll`、`countup`、`cropperjs`），是退役功能清理的残留。**不建议顺手重新生成锁文件**：实测重新生成会产生 2.4 万行差异，直接威胁"前端产物逐字节可复现"这条已验证的保证，应当单独做并配前后产物摘要比对。
10. 自定义定时器与自定义事件的 `eval()` 执行路径在生产没有开关：写入侧有 `app_debug` + 口令 + 超管三道闸，但 `CrontabRunServices::customTimer()` 与 `CustomEventListener` 的执行侧不看 `app_debug`，库里只要存在一行 `customCode` 就会在生产执行。**实测生产 `eb_system_timer` 的 7 条启用任务 `customCode` 全为空**，所以当前没有任何东西会被 eval，但这只是数据状态，不是保护。
11. `SystemCrontabServices::crontabApiRun()` 在删掉 `CrontabController` 之后成了**不可达的死代码**（全仓库只剩它自己的定义）。它也是除定时器循环之外最后一条能走到 `customTimer()`/`eval()` 的路径，删掉可以直接缩小上一条的可达面。本轮没有一并删，是因为发现它时门禁已经在跑，而删一段不可达代码的运行时收益为零、却要让整条门禁重跑——留作单独改动。

---

## 已上线：acceptance-2026-09-21-post-review-hardening

本轮复查的修复已于 2026-09-21 上线 `x-zoo.vip` 并通过验收。

| 项目 | 值 |
|---|---|
| 源码提交 | `01bb567eeee6767d08df5d3369ac661e2928db96` |
| 候选镜像 | `ghcr.io/xiangyumou/crmeb@sha256:50b0e2c57a94145ce6088f4f136018f2bd384fe394fb0affb03d7830608b2cb7` |
| 回滚目标 | `ghcr.io/xiangyumou/crmeb@sha256:9ed42ebdc89f50a4f165589754c39b9dd6260f8cb7a8fa3433a7e34263765171`（`5b9a5f9b`） |
| 前端产物 | 后台 `a7b569ec…`、H5 `3dbd3ce0…`、小程序 `7449ba19…`（`publishable: false`） |
| 门禁 | `sh scripts/check-maintenance.sh` 退出码 0（本地），CI 同提交 regression job 亦通过 |
| 验收记录编号 | `acceptance-2026-09-21-post-review-hardening` |

H5 与小程序摘要与上一发布版本逐字节一致；后台摘要变化只来自本轮改动的一个后台页面与删除的 `cypress.json`，并在三次独立构建中复现同一摘要。

### 上线后实测

| 检查 | 结果 |
|---|---|
| `/readyz` | `{"ready":true}`（含 APP_KEY 强度与 `user.pwd` 列宽检查） |
| `/admin/`、`/api/version`、`/pages/index/index`、`/healthz` | 200 |
| `/api/crontab/*` 八个端点 | **全部 404**（上线前实测 200） |
| `/uploads/*.php`、`/uploads/` 下点文件 | **403** |
| 真实商品图 `/uploads/attach/2026/09/…jpg` | 200，271387 字节，`cache-control: no-cache, must-revalidate` 保持不变 |
| 前台登录连续失败 | 第 7 次在比对口令之前被拒：`登录失败次数过多，请稍后再试` |
| `user.pwd` 迁移 | `changed: true`，32 → 255，`users: 1`，`verified: true` |

### 这次上线踩到的两个问题（都已修复并记录）

1. **CI 自 `fc6957e1` 起从未发布过镜像。** regression job 改成跑完整门禁后，门禁里的 `core-store-front.cjs` 需要 `template/admin/node_modules` 里的 `@babel/parser`，而该 job 不装 npm 依赖，于是每次在 PHPUnit 全过之后死于 `MODULE_NOT_FOUND`，`publish` 作为下游 job 被跳过。已补依赖安装，并在 `release-pipeline-guard.cjs` 加断言：任何跑门禁的 job 必须先装 `template/admin` 依赖（删掉安装步骤该断言会红并点名 job，非空转）。
2. **`publish-release.sh tags` 的每架构标签名算错。** `tag="${arch_image##*:}"` 取出的是 `ci-<sha>-<arch>`，于是它把 CI 标签重新发布到自己身上；`imagetools create` 重新包装后 digest 改变，冲突守卫正确地拒绝。重构前的内联代码是用 `ci-` 产出 `sha-<sha>-<arch>`，重构时丢了这次改名。**这条路径每次发布都会失败**，只是一直被上面第 1 条挡在前面没暴露。本次上线的 `sha-` 标签是用 CI 自己产出并验证过的 amd64/arm64 镜像手工合成的（未重新构建），`publish-release.sh` 的修复另行提交。

### 一次非计划停机

第一次升级尝试在「隔离还原校验」一步失败并按设计停在维护态，**数据库未做任何迁移**，随后手工回退镜像并拉起，停机约 2.5 分钟（写入角色停于 `12:16:0x UTC`，nginx 恢复于 `12:18:35 UTC`）。
原因是 `upgrade.sh` 等待一次性 MySQL 就绪的判据不充分：MySQL 初始化期间的临时服务器已经接受配置好的 root 口令，"口令可用"并不等于"初始化完成"，临时服务器随后关闭、真正的服务器启动，还原命令落在空档里报 `ERROR 2002`，把一个可用的备份诊断成不可用。已改为先等日志出现 `ready for connections ... port: 3306`（临时服务器报 `port: 0`）。修复后重跑，`backup restored and the retained rows match` 正常出现，整个升级约 60 秒，维护窗口不到 1 分钟。
本机 `upgrade-rollback.sh` 一直 9/9，是因为这个窗口很短、只有较慢的机器才会输掉这个竞态——这是一条被绿色测试掩盖了的真实缺陷。

### 仍需人工完成

`paymentReconcileAlert`（异常收款与未知退款巡检告警）的定时任务是**库驱动**的：`crontabCommandRun` 按 `eb_system_timer` 的行分发。代码里加了 mark，但**生产库里还没有这一行**，所以巡检目前不会运行。需要在后台「系统 → 定时任务」新建一条，任务选「异常收款与未知退款巡检告警」，周期建议"每隔几分"取 10 分钟（`type=2`, `minute=10`）。经由后台保存才会同时刷新 `crontabCache`，直接写库不刷缓存不会生效。

---

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

### 阻塞：站点在公网上打不开

应用本身是健康的，但**外部用户到不了这个站点**。2026-09-21 复核时测到：

- 从两个互不相关的外部位置（本机、以及一个境外抓取服务）请求 `https://x-zoo.vip`，TCP 能建连，但发出 ClientHello 之后连接被重置。
- 服务器上抓包证明那个 ClientHello **从未到达主机**，到达的只有一个伪造的 RST；同一时刻用 IP 直连（不带 SNI）则握手完整、traefik 正常回 404。
- 明文 80 端口上，带任意 `Host` 的请求都被 302 到 `https://dnspod.qcloud.com/static/webblock.html?d=<所请求的域名>`。
- nginx 容器自启动以来的访问日志里只有 `127.0.0.1`（健康检查）和 `172.18.0.2`（traefik，即服务器自身发起的核验），**没有任何外部来源**。

也就是说拦截发生在云厂商边界、主机之外，且对任意 Host/SNI 生效。实例位于 `ap-shanghai`，这是中国大陆节点未完成 ICP 备案时的标准拦截形态。处理方向是完成备案，或把站点迁到不受此限制的地域。

这一条不影响上面的验收结论——迁移、数据完整性与各角色健康都是真实的——但在解决之前**没有真实用户能访问**。需要说明的是，之前记录的"公网端点全部 200"是在服务器上发起的请求，那不能证明外部可达性。

### 仍然开放的条件

- **微信支付配置不完整**：`pay_weixin_key` 为空，公众号与小程序 `appid` 为空（商户号与证书序列号已配）。在补齐之前无法真实收款，真实商户支付/退款验收也无法进行。
- 小程序包仍是 `publishable: false`（未配 `CRMEB_MP_APPID`），不能提交微信审核。
- ~~异常收款、结果未知的退款与副作用没有告警~~ 本轮已加 `paymentReconcileAlert` 定时巡检；**仍需在后台把这个定时任务实际启用**（定时任务是库驱动的，加了 mark 不等于建了任务行）。
- ~~`.env` 没有 `APP_KEY`~~ 已于 2026-09-21 写入 32 字节随机值并重启四个应用角色，运行时确认读到的不再是 `default`（长度 64）。原文件备份为 `deployment/config/.env.bak-20260921T065432Z`。
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
