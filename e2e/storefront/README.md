# `@shop/e2e-storefront` — 商城端到端套件

商城（uni-app H5）的浏览器端到端测试。一条命令，在仓库根目录跑：

```
pnpm --filter @shop/e2e-storefront test
```

`scripts/serve.ts` 在 Playwright 的 `webServer` 里起完整一套栈：

- PostgreSQL 17 + Redis 7（Testcontainers）
- 假微信支付网关及其控制面
- 播种
- H5 包（`dist/dev/h5` 过期时才构建）
- `next build`（没构建过时才构建）和 `next start`
- worker
- edge：浏览器实际打开的就是它，同源托管 H5 包，并把 `/api` 代理给 `next start`

起好之后用移动端 Chromium 跑 `specs/`。整个套件只对接 `@shop/testing` 的假网关，不碰真实的微信、短信或阿里云。

其他入口：

| 命令                                                               | 作用                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `pnpm --filter @shop/e2e-storefront test -- specs/presale.spec.ts` | 只跑一个文件                                                     |
| `pnpm --filter @shop/e2e-storefront test:ui`                       | Playwright UI 模式                                               |
| `pnpm --filter @shop/e2e-storefront exec tsx scripts/serve.ts`     | 只起栈并保持常驻，之后带 `SHOP_E2E_REUSE=1` 跑 `test` 就会复用它 |
| `SHOP_E2E_REUSE=1 pnpm …`                                          | 复用本检出端口上已经在跑的栈。默认**不**复用，见下节             |
| `SHOP_TEST_PG_URL=… SHOP_TEST_REDIS_URL=… pnpm …`                  | 用现成的 PG/Redis，不起容器                                      |
| `SHOP_E2E_BUILD=1 pnpm …`                                          | 强制重新 `next build`                                            |

## 多个检出（worktree）同时跑

端口和交接文件按检出派生，且默认不复用已在跑的栈，规则和 `@shop/e2e-admin` 一致（见 `src/stack-file.ts`）。否则第二个 worktree 的 Playwright 发现端口上已经有服务就会直接复用，用**别人的 H5 包、构建和数据库**跑自己的 spec，测出来是红是绿都和自己的代码无关。

| 变量                        | 默认                                             | 说明                                                                                                                    |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `SHOP_E2E_PORT`             | `BASE = 25000 + (CHECKOUT_ID % 2000) × 3`        | edge 端口，也就是浏览器打开的端口。`CHECKOUT_ID` 取检出根目录绝对路径 SHA-256 的前 8 位十六进制，每个检出固定且互不相同 |
| `SHOP_E2E_WEB_PORT`         | `BASE + 1`                                       | `next start` 的端口                                                                                                     |
| `SHOP_E2E_GATEWAY_PORT`     | `BASE + 2`                                       | 假微信支付网关的端口                                                                                                    |
| `SHOP_E2E_STOREFRONT_STACK` | `$TMPDIR/shop-e2e-storefront-<CHECKOUT_ID>.json` | 交接文件，同样按检出区分                                                                                                |
| `SHOP_E2E_REUSE`            | 不设置时不复用                                   | 只有设为 `=1` 才复用端口上已经在跑的栈。不设置时，端口被占用会直接报错，不会悄悄接管                                    |

端口段是 25000–30999，每个检出占连续三个端口：

- 和后台套件的 20000–24999 不重叠，两个套件可以同时跑
- 在 Linux 临时端口段（32768 起）之下
- 万一撞号，结果是「端口已占用」报错，不会静默复用

同一个检出要并行跑两遍时，给第二遍显式指定三个端口和 `SHOP_E2E_STOREFRONT_STACK`，例如：

```
SHOP_E2E_PORT=3720 SHOP_E2E_WEB_PORT=3721 SHOP_E2E_GATEWAY_PORT=3722 \
SHOP_E2E_STOREFRONT_STACK=/tmp/sf-2.json pnpm --filter @shop/e2e-storefront test
```

还有两样东西本来就不会在检出之间共享：

- 每次运行用的 PG/Redis 容器
- 网关控制面的端口（监听 0 号端口，由系统分配）

`SHOP_TEST_PG_URL` 指向一个共享的库时是例外：库名 `SHOP_E2E_DATABASE`（默认 `shop_e2e_storefront`）会被先删后建，这时要给每个检出分别指定库名。

**首次运行前**：`pnpm --filter @shop/e2e-storefront exec playwright install chromium`
