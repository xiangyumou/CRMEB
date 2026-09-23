# K2 §4 — load smoke report

Run on 2026-09-23 from `rewrite/ws-k2-hardening`: web build `G2Ls-p6gnt7C9yK2fqJYi`, worker bundle rebuilt the same morning. Re-run: `cd next && pnpm --filter @shop/e2e-admin exec tsx ../../load/run.ts` (knobs in `README.md`).

**Headline.** 16 shoppers, 60 s measured after 15 s warm-up: 15 864 requests, **0 errors**, overall p50 63 / p95 137 / p99 184 ms. Every order was paid through the fake gateway's signed callback. The four services used **556 MiB steady, 566 MiB peak** of the 1504 MiB their limits allow (1568 MiB with the edge). No N+1. Three performance CRs, of which CR-40-k2 matters: the effects outbox drains at a fixed 10/s while this load produced about 117/s.

## Machine

- Intel(R) Core(TM) i9-14900KF, 32 logical cores; 31.2 GiB RAM; WSL2 kernel 6.18.33.2-microsoft-standard-WSL2 (Ubuntu 24.04.5, Docker with the systemd cgroup driver, cgroup v2); Node v24.20.0.
- Images: postgres:17-alpine (sha256:1bea307d…), redis:7-alpine (sha256:f84b0c46…).
- 1-minute load average, run A (the reported run): 4.21 at start, 4.6–5.9 during, 5.47 at end. Run B (repeat): 5.29 rising to 11.02 as other executors started. The script waits while the average is above 12, for at most 30 min; neither run had to wait.
- **Not the target host** (2 cores / 3.6 GB). Memory is limited exactly as compose limits it, so the memory numbers transfer. CPU was not capped, so latency and throughput are optimistic for 2 cores: web is one event loop, but PostgreSQL, the worker and the load generator each had cores to themselves.

## How the stack was limited

- **postgres:** `docker run postgres:17-alpine --memory 512m --memory-swap 512m` (swap off), the compose `-c` flags verbatim, plus `shared_preload_libraries=pg_stat_statements`.
- **redis:** `docker run redis:7-alpine --memory 160m --memory-swap 160m`, `--appendonly yes --appendfsync everysec --maxmemory 96mb --maxmemory-policy noeviction`.
- **web:** the production entry point, `node apps/web/server.js` from `.next/standalone` (`next start` refuses `output: standalone`), in `systemd-run --user --scope -p MemoryMax=512M -p MemorySwapMax=0`, with `NODE_ENV=production`, `--max-old-space-size=384`, `DB_POOL_MAX=10`, `VALIDATE_RESPONSES=0`.
- **worker:** `node apps/worker/dist/main.js` in a `MemoryMax=320M` scope, `--max-old-space-size=224`, `DB_POOL_MAX=5`, `WORKER_CONCURRENCY=4`.
- **edge:** not run; its 64 MiB counts as unused.
- The scope limits are real: a `MemoryMax=64M` test scope was OOM-killed on this box. All four services are read the same way, from their cgroup files (`memory.current`, `memory.stat`, `memory.peak`) every 2 s.
- **`/api/v1/readyz` answers 503 here, harmlessly.** Its `migrations` check looks for drizzle's journal table; `@shop/testing` builds the schema by replaying the committed migration SQL without writing that journal, so the check always reports failed though the schema is identical. The other three checks (database, redis, worker heartbeat) passed, and `run.ts` waits on exactly those.

## Data and mix

Seeded through the core services: 3 parent and 6 leaf categories; 20 products, one SKU each, stock 1e6, free freight; the production home page (`prod-8.json`, about 90 KB), published and set as home; WeChat Pay config pointing at the in-process fake gateway (real RSA and AEAD); 3 `cities` rows; 16 shoppers who sign in over HTTP (`POST /api/v1/auth/sessions/password`) and add an address (`POST /api/v1/addresses`).

A one-pass smoke of every flow must succeed first; all six did. Then 16 VUs run a closed loop with no think time, picking flows by weight:

| flow             | weight | requests                                                                                                                                                                                                                                    |
| ---------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DIY home         |     20 | `GET /api/v1/diy/pages/home`                                                                                                                                                                                                                |
| category         |     20 | `GET /api/v1/catalog/categories`, then `GET /api/v1/catalog/products?categoryId`                                                                                                                                                            |
| product detail   |     25 | `GET /api/v1/catalog/products/:id`, signed in                                                                                                                                                                                               |
| cart add         |     15 | `POST /api/v1/cart/items`                                                                                                                                                                                                                   |
| checkout preview |     10 | `POST /api/v1/checkout/preview`, buy-now                                                                                                                                                                                                    |
| order + pay      |     10 | `POST /api/v1/orders` → `POST /api/v1/orders/:id/payments` (`wechat_oa`, the app calls the fake gateway's JSAPI endpoint) → gateway `markPaid` → signed `TRANSACTION.SUCCESS` to `POST /api/v1/webhooks/wechat-pay`, timed as that endpoint |

A request counts if it started inside the window. An error is any non-2xx or transport failure (30 s timeout). Percentiles are exact nearest-rank.

Not covered: coupons, group-buy and presale (not seeded); the cart page (cart add returns the whole cart, about 19 rows by the end); SMS and WeChat sign-in (offline; password sign-in stands in).

## Latency — run A (0 errors on every row)

| endpoint                           |      count |     req/s |   p50 ms |    p95 ms |    p99 ms |    max ms |
| ---------------------------------- | ---------: | --------: | -------: | --------: | --------: | --------: |
| `GET /catalog/products/:id`        |       2813 |      46.9 |     79.5 |     123.9 |     162.5 |     295.8 |
| `GET /diy/pages/home`              |       2285 |      38.1 |     15.7 |      29.7 |      40.3 |     118.1 |
| `GET /catalog/categories`          |       2265 |      37.8 |     14.6 |      28.7 |      41.0 |     119.4 |
| `GET /catalog/products?categoryId` |       2264 |      37.7 |     23.3 |      40.7 |      53.1 |      92.7 |
| `POST /cart/items`                 |       1623 |      27.1 |     75.5 |     121.9 |     144.6 |     197.3 |
| `POST /orders`                     |       1162 |      19.4 |    136.8 |     216.0 |     272.8 |     318.5 |
| `POST /orders/:id/payments`        |       1161 |      19.4 |     91.6 |     136.4 |     176.9 |     214.7 |
| `POST /webhooks/wechat-pay`        |       1160 |      19.3 |     64.3 |     103.8 |     131.2 |     178.7 |
| `POST /checkout/preview`           |       1131 |      18.9 |     84.3 |     131.8 |     162.5 |     237.9 |
| **overall**                        | **15 864** | **264.4** | **63.0** | **136.5** | **184.3** | **318.5** |

All 1435 orders ended paid; 0 failed jobs. Run B (same configuration, load rising to 11): 10 487 requests, 0 errors, p50 81 / p95 218 / p99 303 ms; memory within 3 % of run A.

## Memory — run A (working set = `memory.current` − `inactive_file`, as `docker stats` shows; MiB)

| service   |    steady |      peak |    limit |   peak % | notes                                                                              |
| --------- | --------: | --------: | -------: | -------: | ---------------------------------------------------------------------------------- |
| postgres  |     126.4 |     132.1 |      512 |     25 % | peak anon 50.0; peak `memory.current` 243.2; `memory.peak` 245.4                   |
| redis     |       6.8 |       7.9 |      160 |      4 % |                                                                                    |
| web       |     369.5 |     371.3 |      512 |     72 % | anon 360.8                                                                         |
| worker    |      52.9 |      54.5 |      320 |     17 % |                                                                                    |
| edge      |         — |         — |       64 |        — | not run                                                                            |
| **total** | **555.7** | **565.8** | **1504** | **37 %** | 1568 with the edge; peak `memory.current` summed 676.8, `memory.peak` summed 681.6 |

Web is the one to watch. V8 grows the heap toward its 384 MiB old-space cap before collecting hard, so flat-and-high is expected (flat within 4 MiB in both runs). That leaves about 140 MiB of cgroup above the heap. A longer soak would tell whether that holds.

## pg_stat_statements — run A

Reset at the start of the window: 168 076 calls, 9.1 s total execution time, 103 statements.

|   # | statement (top 10 by total time)                 | calls | total ms | mean ms |          |
| --: | ------------------------------------------------ | ----: | -------: | ------: | -------- |
|   1 | `diy_pages` home select                          |  2286 |   1378.2 |   0.603 | CR-42-k2 |
|   2 | `update products` views + 1                      |  2817 |   1041.7 |   0.370 | CR-41-k2 |
|   3 | `update product_skus` stock decrement            |  1163 |    694.8 |   0.597 |          |
|   4 | `insert effects`                                 |  6994 |    467.1 |   0.067 | CR-40-k2 |
|   5 | `insert product_events` (view)                   |  2817 |    394.5 |   0.140 |          |
|   6 | purchase-limit sum over `order_items` ⋈ `orders` |  2297 |    315.8 |   0.137 |          |
|   7 | `update user_sessions` `last_seen_at`            |  7898 |    255.2 |   0.032 |          |
|   8 | `insert orders`                                  |  1163 |    252.6 |   0.217 |          |
|   9 | `insert product_events` (cart)                   |  1623 |    251.0 |   0.155 |          |
|  10 | `insert payment_attempts`                        |  1165 |    233.7 |   0.201 |          |

Top by calls: `commit` 9412, `begin` 9409, `update user_sessions last_seen_at` 7898, `users` by id 7898, `user_sessions` by `token_hash` 7897, `insert effects` 6994, `product_skus` select 6246, `products in (…)` 3920, `product_categories_map in (…)` 3920, `update products views` 2817.

**N+1 check** (statement calls ÷ requests of the endpoints that could issue them): none found.

- Category list: 2267 queries returned 7546 rows (3.3 per page); a per-row statement would show about 7500 calls, and none does.
- Cart add: 1623 requests read 31 383 cart rows and load products, SKUs and categories in one batched `in ($1…$20)` query per request.
- Product detail: about 20 fixed-count statements (2815–2817 calls each).
- Auth: exactly 3 statements per signed-in request (7898 ≈ 7890), including a `last_seen_at` write on every request. Cheap; could be throttled if it ever contends.

## Findings

- **CR-40-k2** (medium): the effects dispatcher claims 50 rows per 5 s and never loops on a full batch. A paid order records 6 effects (4 `notification.send`, `order.paid`, `order.auto-deliver`). Run A left 7944 pending and 666 done, so one worker keeps up with about 1.7 paid orders/s — fewer while `order.paid` has no handler (CR-2-k2).
- **CR-41-k2** (medium): every product view bumps `products.views` under a row lock on top of the `product_events` insert. It is the #2 statement at 11× a comparable primary-key update, and it serialises views of a hot product.
- **CR-42-k2** (low): the DIY home page (about 90 KB jsonb) is read and cleaned from PostgreSQL on every request. It is the #1 statement, while 底部导航 and 个人中心 are already cached.

The stock decrement (#3) is the oversell guard and is needed; its cost is lock waiting on 20 shared SKUs, by design.
