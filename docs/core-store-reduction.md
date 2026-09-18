# 核心商城精简实施记录

## 产品边界

保留 H5、微信小程序、管理后台、商品/SKU/素材、用户与地址、购物车、订单、优惠券、微信支付与原路退款、快递、可视化装修、完整拼团和预售入口。新人礼包仅赠优惠券，客服仅展示二维码。

退出砍价、秒杀、抽奖、直播、分销、积分签到、付费会员及等级权益、储值、非微信支付、门店自提核销、同城配送、自建聊天、原生 App 和上游覆盖升级。

退出业务已从后端、管理后台与数据库中删除，不再只是隐藏。历史订单字段保留原值并只读展示。

## 后端

- 删除退出业务的 service、dao、model、job、listener、控制器、路由文件与整个 `kefuapi` 应用，以及 alipay/allinpay/资金转账驱动和第三方直播聊天组件。
- 订单主链路：支付成功、退款、购物车、运费、下单、订单读取、发货、收货、拆单都不再读写退出业务字段；退款只按原路微信支付处理。
- 历史订单（`pay_type` 为 yue/offline/alipay/allinpay、`seckill_id`、`bargain_id`、`use_integral`、`spread_uid`、`shipping_type=2`）仍可列表、详情与导出，支付方式通过 `CoreStore::historicalPayTypeLabel()` 显示为「历史：…」；对这类订单发起原路退款会被明确拒绝，提示线下处理。
- 新订单对退出字段写 0；`eb_user`、`eb_store_order` 上这些列保留原值且不再被读写。
- 订单通知与移动端订单管理改为读取 `order_notice_admin_uids` 配置（用户 UID 列表），不再依赖已删除的客服表。
- 客服只保留二维码：`customer_qrcode` 是唯一入口（公开接口只返回它），聊天类型/电话/链接/企业 ID/离线反馈文案等配置随聊天一起删除，H5 与小程序的客服悬浮按钮在未配置二维码时隐藏。
- 删除隐藏层本身：`CoreStoreAdmin`、`CoreStore::DISABLED_CONFIG`、`sys_config()` 中的强制覆盖与 `config/core_store_removed_admin.json` 均已移除；`config/core_store_removed_pages.json` 由装修清理与迁移共用，用于剔除装修里和已保存的个人中心菜单里指向已删页面的链接。

## 管理后台

- 删除退出业务的页面、路由与 API 模块，以及对应的菜单过滤层；保留页面中的积分、会员价、佣金、核销、余额支付等分支一并清除。
- 渠道码与客服选人改用现有用户列表接口。
- 恢复管理端用户状态开关与预售后台（`marketing/advance` 路由组），预售 CRUD 可用。
- 移除 `vue-pickers`、`quill`、`vue-ydui`、`emoji-awesome`、`better-scroll`、`countup`、`vue-puzzle-vcode`、`editor`、`oss`、`cropperjs`、`qs` 等无引用依赖。

## 迁移与数据保护

脚本：`crmeb/upgrade/core-store/drop-retired.php`。只能在 CLI 运行，`plan` 不写数据库；`apply`、`rollback` 需要位于 `public` 之外、权限 0600 的备份路径。

```sh
php upgrade/core-store/drop-retired.php plan
php upgrade/core-store/drop-retired.php apply /private/retired-backup.json
php upgrade/core-store/drop-retired.php rollback /private/retired-backup.json [--force]
php upgrade/core-store/drop-retired.php finalize --dump=/private/full-dump.sql [--yes]
```

- `plan` 只读，输出退出业务表与行数、未结清事项、将变为不可达的余额/积分/佣金，以及受保护表的行数与哈希；受保护表用服务端聚合计数与校验和比对，真实订单量下不会把整表读进内存。
- **未结清负债会拒绝 apply**：审核中的提现（`status=0`，已提现的 `status=1` 不会阻塞）、未发货的历史余额/线下单、未完成的积分商城订单、无法再核销的已付自提单；未完成的充值/付费会员订单同样计入。先在业务侧处理完再执行。
- 非零余额/积分/佣金不阻塞迁移，apply 会把清单导出为备份同目录的 CSV，供运营线下补偿；`eb_user` 上的这些列保留原值。
- `apply` 先写备份，再在**一个事务内**补齐新装才有的保留设置、客服 tab 与预售菜单、迁移订单通知名单，然后删除退出配置、配置 tab、菜单、定时任务、通知模板与组合数据，并校验受保护表未变；提交后**再逐表重命名**为 `eb_retired_*`。每张表的改名都先写入备份再执行，中途中断可完整恢复，失败时打印已改名的清单。
- 通知名单转换：apply 把 `eb_store_service` 中 `status=1` 且 `notify=1` **或** `customer=1` 的记录并入 `order_notice_admin_uids`（与既有值合并去重），避免上线后订单通知或移动端订单管理丢失。
- 保留菜单不再变孤儿：发票管理、资金流水、账单记录、客服配置改挂到保留的父菜单，被删菜单遗留的权限行一并删除。
- `rollback` 恢复表名与被删除的行；受保护表在迁移后发生变化时拒绝执行（`--force` 可强制），记录被编辑则拒绝覆盖。`finalize` 之后 `eb_retired_*` 已不存在，rollback 直接**非 0 退出**并提示需要 mysqldump 恢复，不再假成功。
- `finalize` 真正删除 `eb_retired_*`：必须提供命名了全部待删表的 `--dump`，未加 `--yes` 时要求交互确认。
- 校验商品、规格、分类、附件、订单、订单购物车与用户表的行数和内容哈希不变。脚本不改上传文件、不删共享表字段。

维护窗口：apply 的重命名阶段按表执行且不可回滚，请安排停机窗口；期间不要同时跑定时任务或后台操作。

新装环境直接使用 `crmeb/public/install/crmeb.sql`：退出业务表、配置、配置 tab、菜单、定时任务、通知模板与自定义事件种子已移除（AllInPay 网关的设置 tab 与密钥随驱动一并删除）；保留的发票/资金流水/账单记录菜单挂回保留父级，客服配置 tab 承载 `customer_qrcode`，首页精品/热门 banner 组合数据保留，个人中心菜单选项只留下仍然存在的页面。`eb_system_route` 接口文档登记表仍保留少量指向已删控制器的行：它们是惰性文档，代码不读取，后台"同步路由"会在运行中的店铺上自行清理。`tests/static/install-sql-guard.cjs` 以迁移脚本中的退出清单为准，防止安装 SQL 再次播种这些行。`replace_site_url` 与「清除数据」按保留表重写：缺失的表跳过并记日志，单表失败汇总报告，不再因为退出业务的表已删除而整体失败。

## 验证与发布边界

```sh
sh scripts/check-maintenance.sh
```

依次执行回归套件、PHP 7.4 语法检查（含 `crmeb/upgrade` 全目录）、H5/小程序双端静态检查、管理后台接口正反向契约检查、退出业务残留守卫、安装 SQL 种子守卫、模型关联守卫、发布清单校验与支付适配检查。回归覆盖下单/计价/库存/拼团/预售/优惠券/队列，购物车到下单的真实 HTTP 链路与下单后自动取消入队、真实注册发新人券、拼团海报离线生成、历史订单兼容、双支付回调只入账一次，以及迁移 plan→apply→rollback→finalize 全周期。

`tests/static/model-relation-guard.cjs` 校验每个 DAO 预加载的关联都仍在对应模型上有定义。删除退出业务的模型关联时，`with()` 调用会一起留下——空订单表不会报错，直到迁移在真实数据上运行，后台订单列表才整体不可用。

`node scripts/source-metrics.cjs --write` 用同一口径重新计算 `core-store-baseline.json` 与 `core-store-result.json`。

**已验证：** 用改造前的建表 SQL 加历史订单/用户/退出业务数据构建脱敏副本，跑通 plan（拒绝未结清提现、积分商城单、未核销自提单）→ apply（154 行删除、48 张表改名、余额清单导出、通知名单继承）→ rollback（表名与行恢复）→ 再次 apply；后台登录、订单/售后/用户/商品/预售接口均正常；历史余额与支付宝订单可列表、可导出、退款被明确拒绝，微信订单可进入原路退款；`assertWechatRefundable` 曾因类型声明拒绝所有退款，已修复并加回归。

**发布前尚需验证：**HBuilderX 分别构建 H5/微信小程序并在真实客户端检查装修、下单和客服二维码；使用测试商户验证微信内/外 H5、小程序支付及原路退款；对拼团失败退款、预售完整履约执行端到端验收。静态检查与本地演练不等同于客户端构建、真机验收或真实商户支付。`/notice` WebSocket 需 workerman 容器，快递公司列表需 CRMeb 云 token，文件管理器需其独立登录——这三项在本地演练栈中不可用，属环境限制。

`crmeb/public/admin` 已用 Node 20.19.0 / npm 10.8.2 重建。生产配置挂载独立 public 目录，替换镜像不会自动更新这些文件。

## 清单

- `core-store-baseline.json`：修改前提交及物理行数/文件体积口径。
- `core-store-files.json`：实际修改、删除、新增文件清单。
- `core-store-removed-routes.json`：全部退出路由清单（后台 282、前台 115、outapi 5，共 402 条，由基线提交与当前提交的路由表做差集得出）。
- `core-store-removed-pages.json`：用户页面与装修失效链接清单，运行时用于清理装修数据。
- `core-store-shared-retained.json`：已清空；退出业务的共享类已全部删除。
- `core-store-result.json`：最终同口径源码统计。
