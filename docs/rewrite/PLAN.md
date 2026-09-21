# CRMEB 核心商城重写计划：Next.js + PostgreSQL + Redis（多 agent 并行）

## Context

现状是一个已大幅裁剪的 CRMEB 分叉：ThinkPHP 6 后端（~13.8 万行、856 路由、107 张活表）、Vue 2 管理后台（~16.9 万行、198 页，其中装修页占 1/3，约 70 处表单由后端 form-create 规则驱动）、uni-app 商城端（H5 + 小程序，无任何测试）。生产（`ubuntu@43.142.105.205`，2 核 3.6 GB）只读核查结果：1 用户、7 笔测试订单、2 商品、1 管理员、0 角色，全库 18.7 MB，上传 45 MB；微信 appid / 支付密钥 / 短信均未配置，站点因备案被云边缘拦截。**实质是绿地重写**，无需双写或增量同步。

目标：后端与管理后台用 Next.js/TypeScript 完全重写，借机理顺架构、补全测试；数据库迁到 PostgreSQL + Redis，不引入其他基础设施。

### 已确认的决策
1. `/api` 契约一并重新设计为干净 REST；同步改写 uni-app 的 `api/` 层与 `utils/request.js`（页面/组件不重写）；商城端补测试单独成流。
2. 不移植：后台开发者工具（代码生成器、在线文件管理、数据库备份/清数据、`system_route` 接口登记、自定义 eval 事件/定时）、PC 商城接口与 PC 装修、outapi + MCP、多语言内容系统。此前已退役的功能（砍价/秒杀/分销/积分/会员/余额/自提/客服聊天等）同样不移植。
3. 数据：全新 schema；迁移系统配置、分类/商品/SKU、优惠券、装修页与主题、素材 + 上传目录、管理员、基础数据（城市、快递公司、协议、通知模板、运费模板、用户标签/分组）以及那 1 个测试用户（含地址）；**测试订单全部丢弃**。
4. 管理后台 UI：Ant Design 5。
5. 隔离实施：从 `master` 拉新分支 `rewrite/integration`，代码放新顶层目录 `next/`；`crmeb/`、`template/admin` 原样保留作行为对照，切换验收后再单独删除。
6. 执行模型：Fable 5.1 做总调度，Opus 5 做执行；常态 5–6 个并行，硬上限 7。

### 默认假设（如不同意请在审批时指出）
- 一号通云、小票打印机、电子发票供应商不移植；发票降为"用户申请 → 后台手工标记已开"。
- 拼团海报改为商城端 canvas 本地绘制，API 只返回数据和二维码。
- 微信支付只实现 v3。

## 1. 目标架构

`next/`：pnpm workspace + turbo

| 包 | 职责 |
|---|---|
| `apps/web` | Next.js App Router（standalone）。后台页面 `app/admin/(shell)/<domain>/`；后台接口 `app/admin-api/<domain>/…/route.ts`；商城接口 `app/api/v1/<domain>/…/route.ts` |
| `apps/worker` | BullMQ worker + 可重复任务，取代 queue / timer / workerman 三个容器 |
| `packages/db` | Drizzle schema（`src/schema/<domain>.ts`）+ 迁移 + 基础数据种子。选 Drizzle 是因为支付/库存/退款路径需要 `SELECT … FOR UPDATE` 和条件更新 |
| `packages/core` | 领域模块：catalog, cart, order, payment, refund, coupon, groupbuy, presale, user, auth, wechat, sms, diy, cms, notification, shipping, stats, system, storage；`kernel/` 放 tx、Money、errors、clock、lock、队列/存储/配置端口 |
| `packages/contracts` | `defineRoute({method,path,auth,permission,query,body,response,errors,examples})` + zod → OpenAPI；后台客户端、uni-app、测试、mock server 的唯一事实来源 |
| `packages/etl` | MySQL → PG 一次性迁移与校验 |
| `packages/testing` | Testcontainers(PG/Redis)、工厂、`runConcurrently`、假微信网关、由契约 examples 驱动的 mock server |

关键约定：
- **依赖边界**（ESLint 强制）：route handler 不含业务逻辑，只经 `handle(route, fn)` 调 `core`；`core` 不引用 `next/*`；后台 UI 只引用 `contracts` 和生成的客户端。
- **错误模型**：真实 HTTP 状态码 + `{code, message, details?}`；分页 `{items,total,page,pageSize}`；金额以十进制字符串传输、`numeric(12,2)` 存储、域内用整数分的 `Money`。
- **鉴权**：后台 httpOnly cookie + Redis 会话（带 `passwordVersion`）；商城 `Authorization: Bearer <opaque>`，令牌哈希入 `user_sessions` 表，改密即全部吊销；平台头 `X-Client-Platform`。
- **配置**：废弃 575 键的 `sys_config`，改为 `core/system/config/<group>.config.ts`（zod schema + UI 元数据 + `legacyKeys` 映射），值存 `config_values(group,key,value jsonb)`，一个通用 `<ConfigGroupForm>` 渲染所有配置页。
- **表单**：form-create 整体废除，约 70 处改为 antd Form + zod 的类型化表单。
- **RBAC**：权限原子在 `core/<domain>/permissions.ts` 声明，菜单在 `apps/web/src/admin/menu/<domain>.menu.ts`；DB 只存 `roles / role_permissions / admin_roles`。
- **可靠性**：保留分叉里的好设计——`payment_attempts(out_trade_no UNIQUE)`、`payment_exceptions`、`order_effects(order_id,event_type UNIQUE)` 副作用账本 + 提交后派发。订单状态迁移一律用"条件更新、以受影响行数为准"。
- **实时通知**：SSE（`/admin-api/notifications/stream`）+ Redis pub/sub，不需要自定义 Next server。
- **第三方**：自写精简微信客户端（Pay v3、OA OAuth/JS-SDK、小程序 `code2session`、模板/订阅消息）；短信用阿里云；物流查询用阿里云市场 API（生产已配置）；存储支持本地与 S3 兼容。
- **装修页 JSON**：保存格式与现有输出字节级兼容，落为 `contracts/src/diy/schema/<component>.schema.ts`（34 个组件各一 zod schema + 带 `schemaVersion` 的页面信封）；`moren.js` 默认值和生产 6 个装修页作为金样，必须 parse→serialize→parse 零差异。uni-app 渲染器不动。
- **uni-app 字段策略**：新 API 为 camelCase；重写后的 `template/uni-app/api/` 保持导出函数名不变，新增纯函数 `api/mappers/<domain>.js` 把新 DTO 映射回页面在读的旧视图模型，仅在语义变化处改页面。
- **容器**：`web`、`worker`、`postgres:17`、`redis:7`（`noeviction`）+ 一个约 10 MB 的 `edge` nginx（H5 history 模式 SPA 在 `/`、后台在 `/admin`、`/uploads/` 沿用禁执行规则）。内存预算约 1.6 GB；镜像只在 CI 构建。

## 2. Phase 0 — 地基（调度者 + 2 个执行者，串行为主）

**P0-a 平台**：仓库骨架、tsconfig/ESLint 边界/Prettier/Vitest；`pnpm gen` 生成被 gitignore 的聚合桶文件（契约、权限、菜单、任务、effects、配置组——各域写各自文件，自动聚合，天然无合并冲突）；**全部域的 Drizzle schema（约 70 表）**与单一 `0000_init` 迁移；基础数据种子；`core/kernel`；跨域端口 `core/order/ports.ts`（`OrderStateMachine`、`onPaid/onCancelled/onRefunded` 钩子、`StockPort`）；两套鉴权 + RBAC 中间件；`handle()`、OpenAPI 构建、mock server；测试基座；CI `.github/workflows/next.yml`。

**P0-b 后台壳与金样切片**：AntD 5 布局、注册表驱动菜单、`<Can>`、登录、SSE 铃铛；`apps/web/src/admin/kit/`（`<CrudTable>`、`<ZodForm>`、`<ModalForm>`、`<AssetPicker>` 桩、`<LinkPicker>`、`<ConfigGroupForm>`、由契约生成的 TanStack Query 客户端）；**金样切片 = 优惠券**（契约、带领取竞态条件更新的 service、过期任务、后台 CRUD、商城接口、单元/集成/并发测试、Playwright、ETL mapper、菜单与权限文件）+ `docs/rewrite/GOLDEN.md` 逐文件讲解。

**出口门 G0**：CI 全绿；schema 可干净迁移；金样切片（含双进程领取竞态）通过；mock server 能服务 OpenAPI；`docs/rewrite/{CONVENTIONS,GOLDEN,STATUS}.md` 与目录归属表已提交；打 tag `rewrite-p0-freeze`。

## 3. 并行工作流

每个流的**第一个交付物是契约 PR**（路由 + zod + examples），调度者在 G1a 门合并——uni-app 流由此对着 mock server 开工，不等任何后端实现。

| 流 | 范围（纵切：后端模块 + 后台页面 + 契约 + 测试） | 规模 | 依赖 |
|---|---|---|---|
| A 商品 | 商品/SKU/规格/分类/标签/参数/评价、pg_trgm 搜索 | L | P0 |
| B1 下单 | 购物车、确认、计价、运费、优惠分摊、创建、取消、自动取消、库存扣返 | L | P0 端口 |
| B2 履约 | 发货、收货、拆单、自动收货、手工发票、后台订单页、移动端店员接口 `/api/v1/staff/*` | L | B1 |
| C 支付与退款 | 微信客户端核心、Pay v3、attempts、回调、对账任务、异常单、effect 派发器、退款申请/审核/回调 | L | P0 端口 |
| D 营销 | 拼团（原子占座、过期、退款后团长降级）、预售（窗口任务、四账本回滚），经订单钩子挂接 | L | A、B1 契约 |
| E1 用户与登录 | 短信/密码/小程序/公众号登录，用户、地址、标签、分组，阿里云短信 | M | P0 |
| E2 公众号与通知 | 菜单、自动回复、二维码、素材；通知模板、站内信、订阅消息、SSE 生产者 | M | C（微信核心） |
| F1 系统 | 配置页、管理员与角色、素材库、真实上传与 `<AssetPicker>`、日志、协议 | M | P0 |
| F2 运营内容 | 运费模板、物流查询、城市、文章、统计看板 | M | A、B2 |
| G1 装修核心 | 34 个组件 zod schema、金样往返、DIY/主题接口、编辑器壳、zustand 状态、拖拽画布、32 个预览组件、链接选择器 | XL | P0 |
| G2 装修面板 | 约 61 个右侧配置面板 + 35 个配置控件，基于 G1 第一周冻结的面板接口；按生产 6 页和 `moren.js` 实际使用顺序实现 | XL | G1 面板接口 |
| H uni-app 接口层 | 重写 `utils/request.js` 与 `api/*.js` + mappers；删 `kefu.js`、`lottery.js`、`Cb-lang`；最小化调用点修正 | L | G1a 契约 + mock |
| I 商城端测试 | api 层/mappers/store/utils 的 Vitest；H5 构建上的 Playwright（浏览→加购→下单→假支付→退款） | M | H |
| J ETL 与部署 | `packages/etl`、Dockerfile、`deploy/next/`、升级/回滚脚本、镜像流水线 | M | schema 冻结 |
| K 加固 | 后台 Playwright 关键路径、静态守卫移植、风险矩阵全量审计、2 核机器的负载冒烟 | M | 全部 |

目录归属按 `<domain>` 互斥（`contracts/src/<domain>`、`core/src/<domain>`、`app/admin/(shell)/<domain>`、`app/admin-api/<domain>`、`app/api/v1/<domain>`、`worker/src/jobs/<domain>.*`）。各流验收 = `tests/regression/cases.md` 与 `risk-matrix.md` 对应章节移植后的用例（如 C 负责 §4 支付对取消锁/重复与迟到回调，D 负责 §5 最后一席竞态，B1 负责 §1–2 最后一件库存/重复提交）+ 每组后台页面一条 Playwright 主路径。

**波次（上限 7，常态 5–6）**

| 波 | 并行执行者 | 完成后接手 |
|---|---|---|
| W1 | A、B1、C、F1、G1，G1a 过门后加 H（6） | A→D，B1→B2，C→E2，F1→E1 |
| W2 | D、B2、E2、E1、G1、G2、H（峰值 7） | E1→F2，H→I |
| W3 | F2、G2、I、J、G1 收尾（5） | 最先完成者接 K |
| W4 | K、J 演练、缺陷修复（3–4） | 进入切换 |

## 4. 调度协议

- **分支/工作树**：集成分支 `rewrite/integration`；流分支 `rewrite/ws-<id>-<slug>`；工作树 `../CRMEB-wt/ws-<id>`；执行者每日 rebase，调度者 squash 合并。
- **调度者独占文件**（执行者不得修改）：根配置、`packages/db/**`、`core/src/kernel/**`、`core/order/ports.ts`、`contracts/src/_conventions/**`、`apps/web/src/admin/kit/**`、CI、`docs/rewrite/STATUS.md`。
- **变更请求**：执行者写 `docs/rewrite/cr/CR-<n>-<ws>.md`（改什么、为什么、影响哪些契约/表）；调度者落地并通知受影响的流；执行者先用本地适配层继续，不阻塞。
- **任务简报模板**：目标；归属路径；只读参考路径（`crmeb/…`、`template/admin/…` 中对应源文件）；要实现的契约；需证明的不变量（矩阵编号）；"修而不搬"项；范围外；完成定义清单。
- **完成定义**：契约已实现且开启响应校验；单元 + 集成测试；每个条件状态变更都有并发测试；后台页面只用 kit 组件；权限与菜单文件齐备；有数据迁移的域附 ETL mapper；更新 `docs/rewrite/status/<ws>.md`。
- **合并门**：typecheck、lint（含边界）、unit、integration、guards（后台客户端与 uni-app 的每个 URL 都能解析到已注册路由；每个后台路由都声明权限；退役功能黑名单；禁止 `eval` / `new Function` / 对用户 URL 的裸 `fetch`）、OpenAPI diff 审阅、脚本校验未越出归属路径；支付/退款/鉴权三个流由调度者额外跑 `/code-review`。

## 5. "修而不搬"清单（出自 `docs/release-readiness.md` 未修项）

| 缺陷 | 新设计 | 流 |
|---|---|---|
| `takeOrder`/`delivery` 无锁先查后改 | 状态机条件更新 + 竞态测试 | B2 |
| `applyRefund` 重复检查在事务外 | 订单行 `FOR UPDATE` + 待处理退款的部分唯一索引 | C |
| `incStockDecSales` 读后写 | 单条原子 `UPDATE` | B1 |
| 商城令牌不绑定密码 | 哈希会话，改密吊销 | P0/E1 |
| `scan_upload` 全局令牌 | 绑定管理员、一次性、短 TTL | F1 |
| `videoDataSave` 信任客户端路径 | 服务端生成存储 key + 校验 | F1 |
| `onlineUpload` SSRF | https 白名单、DNS 解析后拦私网 IP、大小与 MIME 上限 | F1 |
| 短信验证码可重放 | 校验时原子 `GETDEL` + 次数计数 | E1 |
| DB 存储代码被 `eval` | 功能删除 + 守卫禁用 | K |
| `handleTransferNotify` 不验签 | 无转账端点；所有回调走同一验签器 | C |

## 6. ETL 与切换

`packages/etl`：`mysql2` 读、Drizzle 写，按组单事务、幂等（截断重灌）。配置经各组 `legacyKeys` 映射并 zod 校验，未映射键出报告、丢弃键须在显式白名单；`label_list` 转关联表、`unique` 列改名 `sku_code`、多值 tinyint 转枚举；装修 JSON 过 zod 并剔除已移除组件，解析失败即中止；素材路径改写 + `rsync -a` 上传目录并生成 sha256 清单；bcrypt 哈希原样带过，遗留 MD5 标 `password_algo='md5'` 首次登录升级；`lower(account)` 唯一索引（PG 区分大小写）；epoch 按 Asia/Shanghai 转 `timestamptz`；**订单不迁**。`etl verify` 校验行数、金额合计、装修往返、素材文件存在，并在 CI 用生产 dump 副本演练。

切换（站点未公开、无真实数据，短维护窗口即可）：备份 MySQL 与 uploads → `deploy/next/compose.yml` 起 postgres/redis → 迁移 + ETL + verify → 以新 compose 项目 `crmeb-next` 起 web/worker/edge → 冒烟（readyz、后台登录、商城下单、假网关支付）→ 切 Traefik 标签。**回滚**：标签切回旧栈（旧栈停而不删，数据原封）。**退役**（验收后单独一个 PR）：删除 `crmeb/`、`template/admin/`、旧 `tests/`、`deploy/production`、根 `Dockerfile`/`compose.yaml`，之后再删 MySQL 卷。

## 7. 主要风险

| 风险 | 缓解 |
|---|---|
| 装修 JSON 漂移导致未重写的商城渲染器坏掉 | 字节级金样 + H5 构建上逐页 Playwright 渲染 |
| 响应形状变化让 uni-app 页面静默出错 | mapper 层 + 提取页面实际读取字段的脚本 + I 流测试 |
| 订单/支付/营销跨流耦合 | P0 冻结端口与钩子、假网关、CR 流程 |
| 微信支付 v3 无凭据无法实测 | 移植 `tests/static/wechat-payment-test.mjs`、签名向量测试、保留人工沙箱验收门 |
| 冻结后 schema 反复改 | 迁移仅调度者可动，切换前折叠回 `0000_init` |
| 13.8 万行 PHP 里的隐性业务规则 | `cases.md` + 风险矩阵即规格，简报引用 PHP 源文件，K 流审计 |
| 2 核 3.6 GB 内存压力 | compose 限额、CI 构建、负载冒烟 |
| G2 成为最长杆 | 面板接口第一周冻结、双执行者、按实际使用顺序做 |

## 8. 验证

1. 每次合并：typecheck、lint、unit、真实 PG/Redis 上的 integration、guards、契约 examples 校验。
2. 不变量对齐：`docs/rewrite/invariants.md` 把 `cases.md` 与 `risk-matrix.md` 每一行映射到新测试编号，或标注"已退役/已砍"及原因；有未映射行则 K 流构建失败。
3. 并发套件：支付对取消、最后一件库存、拼团最后一席、重复退款、重复收货、优惠券领取与核销、重复回调——每个场景 CI 内跑 50 轮。
4. 契约闭合：守卫证明后台客户端与 uni-app `api/*.js` 的每个调用都解析到已注册路由，且无退役功能 URL。
5. 端到端：后台 Playwright（登录、建商品、优惠券、装修页编辑保存、订单发货、退款审核、角色限制）；商城 Playwright 在 H5 构建 + 真实栈 + 假网关上跑（浏览、加购、下单、支付、收货、退款、两用户拼团）。
6. ETL 演练：灌入生产 dump 副本 → `etl verify` → 经 HTTP 逐个取回迁移后的商品、装修页、素材。
7. 部署演练：CI 内演练 `deploy/next` 的升级与回滚，镜像 digest 固定，断言健康/就绪/内存预算。
8. 人工验收（凭据到位后）：真实小程序登录与支付、真实短信。

## 关键参考文件
- `tests/regression/cases.md`、`tests/regression/risk-matrix.md` — 业务不变量规格
- `docs/release-readiness.md`（§复查发现但未修的问题）、`docs/core-store-reduction.md`、`docs/maintenance/architecture.md`
- `crmeb/app/services/CoreStore.php` — 产品边界；`crmeb/app/api/route/v1.php`、`v2.php`、`crmeb/app/adminapi/route/*.php` — 现有接口面
- `template/uni-app/utils/request.js`、`template/uni-app/api/*.js`、`template/uni-app/subpackage/diyComponents/` — 商城端契约与装修渲染器
- `template/admin/src/store/module/moren.js`、`mobildConfig.js`、`components/mobilePage|mobileConfig|mobileConfigRight/` — 装修编辑器参考
- `tests/static/admin-api-contract.cjs`、`retired-code-guard.cjs`、`wechat-payment-test.mjs` — 待移植守卫
- `deploy/production/compose.yml`、`nginx.conf`、`upgrade.sh`、`rollback.sh` — 部署参考
