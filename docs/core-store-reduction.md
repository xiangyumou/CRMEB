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
- 删除隐藏层本身：`CoreStoreAdmin`、`CoreStore::DISABLED_CONFIG`、`sys_config()` 中的强制覆盖与 `config/core_store_removed_admin.json` 均已移除；`config/core_store_removed_pages.json` 仅用于清除装修里的失效链接。

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
php upgrade/core-store/drop-retired.php rollback /private/retired-backup.json
php upgrade/core-store/drop-retired.php finalize
```

- `plan` 只读，输出退出业务表与行数、未结清事项、将变为不可达的余额/积分/佣金，以及受保护表的行数与哈希。
- **未结清负债会拒绝 apply**：未处理提现、未发货的历史余额/线下单、未完成的充值/付费会员订单、未完成的积分商城订单；先在业务侧处理完再执行。
- 非零余额/积分/佣金不阻塞迁移，apply 会把清单导出为备份同目录的 CSV，供运营线下补偿；`eb_user` 上的这些列保留原值。
- `apply` 先把退出业务表重命名为 `eb_retired_*`（瞬时、可回滚），再删除退出配置、配置 tab、菜单、定时任务与组合数据，并清理装修中的失效组件。
- 通知名单转换：apply 会把 `eb_store_service` 中 `notify=1` 的记录写入 `order_notice_admin_uids`，避免上线后订单通知丢失。
- `rollback` 恢复表名与被删除的行；若记录在迁移后被编辑则拒绝覆盖。`finalize` 在验收期后真正删除 `eb_retired_*`，此后只能依靠 mysqldump 恢复。
- 校验商品、规格、分类、附件、订单、订单购物车与用户表的行数和内容哈希不变。脚本不改上传文件、不删共享表字段。

新装环境直接使用 `crmeb/public/install/crmeb.sql`：退出业务表、配置、菜单与定时任务种子已移除，并新增预售菜单与 `order_notice_admin_uids` 配置。

## 验证与发布边界

```sh
sh scripts/check-maintenance.sh
```

依次执行回归套件、PHP 7.4 语法检查、H5/小程序双端静态检查、管理后台接口正反向契约检查、退出业务残留守卫、模型关联守卫、发布清单校验与支付适配检查。回归覆盖下单/计价/库存/拼团/预售/优惠券/队列，以及历史订单兼容与迁移 plan→apply→重复 apply→rollback→finalize。

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
