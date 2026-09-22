# `@shop/e2e-admin` — 后台端到端套件

`K-hardening.md` §3。一条命令，从 `next/` 跑：

```
pnpm --filter @shop/e2e-admin e2e
```

它会：拉起 PostgreSQL 17 + Redis 7（Testcontainers）、建库灌 schema、播种、`next build`（只在没构建过时）、`next start`，然后跑 Playwright。第一次冷跑要几分钟（拉镜像 + 构建），之后热跑约一分钟。

其他入口：

| 命令                                                      | 作用                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm --filter @shop/e2e-admin e2e -- specs/auth.spec.ts` | 只跑一个文件                                                   |
| `pnpm --filter @shop/e2e-admin e2e:ui`                    | Playwright UI 模式                                             |
| `pnpm --filter @shop/e2e-admin exec tsx scripts/serve.ts` | 只起栈，保持常驻；随后的 `e2e` 会复用（`reuseExistingServer`） |
| `SHOP_TEST_PG_URL=… SHOP_TEST_REDIS_URL=… pnpm …`         | 用已有的 PG/Redis，跳过容器                                    |
| `SHOP_E2E_BUILD=1 pnpm …`                                 | 强制重新 `next build`                                          |
| `SHOP_E2E_PORT=3300 pnpm …`                               | 换端口                                                         |

**首次运行前**：`pnpm --filter @shop/e2e-admin exec playwright install chromium`（约 150 MB，不进仓库）。

## 这个套件断言什么

| 文件                            | 覆盖                                                                                                                                        | 对应 AUDIT 行                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `specs/smoke.spec.ts`           | 登录页在浏览器里渲染、真实会话下外壳渲染、kit 演示页五个 tab 控制台零报错、`/api/v1/health`                                                 | P0-B 遗留冒烟（`status/p0b.md` 末节） |
| `specs/auth.spec.ts`            | 密码错与账号不存在同一句话；登录成功落壳、cookie 属性、刷新存活；退出后 token 对 API 也失效；第六次尝试 429 且正确密码也被挡；跨站变更 403  | K-SEC-A2、A3、A8                      |
| `specs/restricted-role.spec.ts` | 用界面建一个只有 `order:order:read` 的身份和账号；它只看得到「订单」菜单；六个未授权读全 403；建管理员的提权尝试 403；`/admin/403` 文案     | K-SEC-A9、A10、R7                     |
| `specs/config-secrets.spec.ts`  | 密钥写入后标记 `已设置`、响应里只有布尔、库里确有值；再存一次不清空密钥                                                                     | K-SEC-U11                             |
| `specs/upload.spec.ts`          | PNG 入库与秒传提示；带脚本的 SVG 被拒且点名文件；声明成 JPEG 的 PNG 被拒；扫码上传对未签发 token 的拒绝                                     | K-SEC-U1、U6                          |
| `specs/product.spec.ts`         | 后台建商品（含素材选择器上传+选图）→ 商城 API 能读到；草稿商品商城读不到                                                                    | ——                                    |
| `specs/coupon.spec.ts`          | 建优惠券模板 → 发放给买家 → 「已领取记录」能查到；空发放被前端挡住                                                                          | ——                                    |
| `specs/diy.spec.ts`             | 新建页面 → 加组件 → 仅保存（商城 404）→ 保存并发布 → 商城读到的 JSON 与后台读到的逐字段相等                                                 | ——                                    |
| `specs/order.spec.ts`           | 快递发货缺物流公司/运单号被 refine 挡住；发货 → 确认收货 → 订单真的流转 + 审计留痕（**`test.fixme`，CR-15-k**）；已发完的单不再出现「发货」 | K-SEC-A9、X7                          |
| `specs/refund.spec.ts`          | 审核界面根本没有金额字段；拒绝必须填理由；同意后状态离开 `applied` 且效果账本恰好一行                                                       | K-SEC-R7（HTTP 边界那半）             |

## 现在还没覆盖的（`test.fixme` 与待办）

只有一个 `test.fixme`，而且它是**本套件查出来的缺陷**，不是占位：`order.spec.ts` 的「发货 → 确认收货」。`POST /admin-api/orders/:id/shipments` 今天答 500 —— 事务已提交，随后的入队在 BullMQ 里抛 `Custom Id cannot contain :`（所有 `dedupeKey` 都是 `name:id`）。确认收货、下单同理。**CR-15-k**。适配器改好那天把 `test.fixme` 去掉即可；它下面那条「已发完的单不能再发」改用服务层（内存队列）把单发出去，所以那条仍然是真跑的。

其余九个文件没有 `test.fixme`：这一轮要覆盖的流程，页面**都已合并**（A、B1、B2、C、F1、G1–G3），每条都是真跑的断言。

真正没覆盖的是下面这些，都属于 K2（第二轮），`status/k.md` 有同一张表：

| 待办                             | 为什么现在不做                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| 门店/客服台（`/api/v1/staff/*`） | B2 的页面已合并，但 **CR-14-k**：staff 路由对任何 staff 用户永远 403，先定设计再写 spec |
| 客户、注册、短信验证码           | `pending:E1`                                                                            |
| 通知与公众号                     | `pending:E2`                                                                            |
| 拼团、预售                       | `pending:D`                                                                             |
| 运费模板、CMS、统计              | `pending:F2`                                                                            |
| 退款「同意」之后真正打款         | 需要 worker + 假网关；本套件**不跑 worker**，断言停在效果账本那一行                     |
| HTTPS 下跑一遍                   | 见下面「已知的不真」                                                                    |

## 已知的不真

1. **`Secure` cookie 没有被覆盖**。`handle()` 只在 `NODE_ENV === 'production'` 时给 `admin_session` 打 `Secure`，而 Playwright 的 cookie jar 不会把 Secure cookie 发到 `http://127.0.0.1`。所以栈用**生产构建 + `NODE_ENV=test`** 跑。这一条属性由 `handle.int.test.ts` 直接断言；K2 应当在 J 的 TLS 边上再跑一遍本套件。
2. **不跑 worker**。服务端排进 BullMQ 的任务会留在 Redis 里不动。凡是断言「效果发生了」的地方，这里只断言「效果被记下了」。
3. **`workers: 1`**。一库一 Redis，多 worker 会互相看见对方的订单和审计行。这不是性能套件（§4 才是）。
4. **不碰任何真实网关**。种子把 `payment.apiBaseUrl` 写成 `http://127.0.0.1:9/no-gateway`：即便某条路径不顾缺失的凭证去调网关，也只会撞上本机的关闭端口，而不是微信。短信、阿里云一个字都没配。

## 结构

```
scripts/serve.ts     容器 + schema + 种子 + next build/start，写出交接文件
src/stack-file.ts    交接文件的路径与类型（临时目录，不进仓库）
src/stack.ts         按交接文件开一个 Ctx（只用于「界面造不出来的前置」和「界面看不到的回读」）
src/seed.ts          种子：超管、可锁账号、买家、类目、商品、两张已付订单、一张待审退款
src/fixtures.ts      test.extend：adminPage / adminApi / shop
src/files.ts         上传用的字节（PNG、带脚本的 SVG、谎报类型的 PNG）
specs/*.spec.ts      十个流程
```

**为什么栈在 `webServer` 里而不是 `globalSetup` 里**：Playwright 先起 `webServer` 再跑 `globalSetup`，所以放在 globalSetup 里建库，服务器早就连过一次并失败了。放一起还有个好处：Ctrl-C 一次，容器和服务器一起走。
