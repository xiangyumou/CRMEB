# Architecture

How the shop is put together. [conventions.md](conventions.md) has the rules for writing code in
it; [invariants.md](invariants.md) lists the business rules and the tests that prove each one.

## Processes

```
                 Traefik (TLS, host routing)
                           │
                     edge (nginx)
        ┌──────────────────┼──────────────────────┐
   / (H5 build)   /admin, /admin-api, /api    /uploads/ (read-only volume)
                           │
                     web (Next.js)  ──────┐
                           │              │ enqueue, pub/sub
                    PostgreSQL 17     Redis 7
                           │              │
                     worker (BullMQ) ─────┘
```

| Process   | Source                      | Job                                                                                              |
| --------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `edge`    | `docker/edge/`              | Serves the H5 build and `/uploads/`, proxies the application paths to `web`, answers `/healthz`. |
| `web`     | `apps/web`                  | Every HTTP endpoint and the admin UI. Holds no state of its own.                                 |
| `worker`  | `apps/worker`               | Scheduled and on-demand jobs, and the dispatcher of the effects ledger.                          |
| `migrate` | `packages/db`, worker image | A one-shot that `upgrade.sh` runs, with the application stopped, to apply migrations.            |

PostgreSQL holds all business state. Redis holds what may be rebuilt or lost with a bounded cost:
admin sessions, the config cache, rate-limit counters, the BullMQ queue, the worker heartbeat,
cached logistics answers and the pub/sub channel of the admin notification stream. It runs with
`noeviction` and AOF, because a silently evicted queue entry is a lost job.

The production topology, its health checks and its operation are in
[deploy/README.md](../deploy/README.md).

## Packages

```
packages/contracts  ← packages/core ← apps/web, apps/worker
        ↑                  ↑
   admin UI (apps/web)  packages/db
```

- **`@shop/contracts`**: the API, declared once. Depends on zod and nothing else in the repository.
- **`@shop/db`**: the Drizzle schema (`src/schema/<domain>.ts`), migrations
  (`migrations/*.sql`, applied ones never change), and the reference-data seed.
- **`@shop/core`**: the domain logic. Imports contracts and db; never Next.js, React or an app.
- **`@shop/testing`**: the Testcontainers harness, factories, `runConcurrently`, the fake WeChat,
  WeChat Pay, SMS and logistics gateways, and the mock server that answers every route with its
  first example.
- **`apps/web`** and **`apps/worker`**: thin shells that build a `Ctx` and call `core`.

ESLint enforces the arrows (see [conventions.md](conventions.md#import-boundaries-eslint-enforced)).

## Contracts

Every endpoint is a `defineRoute({...})` in `packages/contracts/src/<domain>/*.contract.ts`. The
shared shapes (`money`, `instant`, `id`, `pageQuery`, `paged`, `sortQuery`) are in
`src/_conventions/common.ts`, and `defineErrors` in `src/_conventions/errors.ts` declares a domain's
error codes with their HTTP status and Chinese message.

`pnpm gen` collects every contract into `src/routes.gen.ts` (`allRoutes`) and every error table
into `src/errors.gen.ts`, and writes `openapi.json` from them. Everything else reads those:

- the admin UI calls a route through `useRouteQuery(route, …)` and `useRouteMutation(route)`
  (`apps/web/src/admin/api/hooks.ts`), typed from the route's own schemas;
- the mock server in `@shop/testing` answers each route with its first example;
- the guards compare the route list with the App Router tree, the permission atoms and the
  uni-app's `api/` calls.

With `VALIDATE_RESPONSES=1` (on in development and in every test run) `handle()` checks each
response against its contract, so a service that drifts from the contract fails loudly.

## Request path

A route file names a contract and calls one service function:
`export const GET = handle(couponAdminList, (ctx, { query }) => coupon.adminList(ctx, query))`.
`handle()` in `apps/web/src/server/handle.ts` does everything common to every endpoint:

```
parse → authenticate → CSRF → authorise → build Ctx → call → validate response → serialise → log → audit
```

- **Admin** sessions are an httpOnly cookie naming a Redis session that carries the admin's id,
  permission atoms, super flag and `passwordVersion`. Changing a password or a role revokes the
  sessions it affects.
- **Storefront** sessions are opaque Bearer tokens; `user_sessions` stores only their hash. The
  client names its platform (H5, mini-program, official account) in `X-Client-Platform`.
- **Authorisation** compares the route's `permission` with the session's atoms. A super admin
  passes every check; nothing in the product grants `is_super`.
- A `DomainError` becomes its declared status and message. Anything else becomes a 500 `INTERNAL`
  whose details go to the log and not to the client.
- Admin writes are recorded in the audit log, with secrets redacted.

## Kernel

`packages/core/src/kernel/` holds what every domain uses:

| Piece                           | File                               | What it gives                                                                                                                                                             |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ctx`                           | `context.ts`                       | Everything a service may reach: db, redis, clock, config, logger, queue, storage, actor, platform, request id. Built per request by `handle()` and per job by the worker. |
| `withTx`, `lockRow`, `lockRows` | `tx.ts`                            | Transactions, row locks, and lock ordering by ascending id.                                                                                                               |
| `Money`                         | `money.ts`                         | Integer fen arithmetic and allocation; `"12.00"` only at the API edge.                                                                                                    |
| `Clock`                         | `clock.ts`                         | The only source of "now" in domain code, so tests control time.                                                                                                           |
| Config registry                 | `config-registry.ts`               | `defineConfigGroup` and `ctx.config.get(group)`; values in `config_values`, cached in Redis.                                                                              |
| `JobQueue`                      | `queue.ts`, `queue-bullmq.ts`      | The queue port; `memoryQueue()` in unit tests, BullMQ in the apps.                                                                                                        |
| `Storage`                       | `storage.ts`                       | The storage port and its local-disk driver.                                                                                                                               |
| Rate limits                     | `rate-limit.ts`                    | Fixed-window and token-bucket limits in one Lua round-trip, keyed by subject (account, phone, user), never by IP.                                                         |
| Errors, ids, logger             | `errors.ts`, `ids.ts`, `logger.ts` | `DomainError`, id parsing, the structured logger with redaction.                                                                                                          |

## Domains

One directory per domain under `packages/core/src/`, each with its schema in
`packages/db/src/schema/` and its contracts in `packages/contracts/src/`:

| Domain                | Holds                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `auth`                | Admins, roles, permission atoms, admin and storefront sessions, captcha, the audit log.          |
| `user`                | Shoppers, addresses, labels, groups, storefront sign-in.                                         |
| `catalog`             | Products, SKUs and stock, categories, labels, parameters, reviews, search, view counts.          |
| `cart`                | The cart.                                                                                        |
| `order`               | Orders, the order state machine, checkout pricing, invoices, fulfilment, the cross-domain ports. |
| `payment`             | Payment attempts, WeChat Pay callbacks, payment exceptions, reconciliation, capital flows.       |
| `refund`              | Refund requests, approval and execution.                                                         |
| `shipping`            | Freight templates, cities, express companies, logistics tracking.                                |
| `coupon`              | Coupon templates, claiming, user coupons, allocation at checkout.                                |
| `groupbuy`, `presale` | The two promotion order kinds.                                                                   |
| `diy`, `cms`          | Page designs and themes; articles and agreements.                                                |
| `notification`        | In-app notices, message templates, subscription messages, the live admin stream.                 |
| `wechat`, `wechat-oa` | The WeChat client and WeChat Pay v3; the official account's menus, replies, QR codes, media.     |
| `sms`                 | Verification codes and the SMS provider port.                                                    |
| `storage`             | Uploads, the asset library, scan-to-upload, safe remote fetch, the S3 driver.                    |
| `stats`               | The dashboard.                                                                                   |
| `system`              | Site settings and the config groups that belong to no single domain.                             |
| `effects`             | The post-commit side-effect ledger.                                                              |

A domain exposes itself through its `index.ts` and is installed once at bootstrap through
`@shop/core/domains` (`src/domains.gen.ts`); see
[conventions.md](conventions.md#where-a-domains-files-go).

### The order ports

Several domains act on an order without owning it. `packages/core/src/order/ports.ts` is the one
place they meet; it holds interfaces, types and registries, and no behaviour:

- `ORDER_STATUSES`, `ORDER_TRANSITIONS`, `canTransition` and `OrderStateMachine`: a transition is
  one conditional `UPDATE … WHERE status IN (…)` decided on the affected row count.
- `onOrderPaid`, `onOrderCancelled`, `onOrderRefunded`, `onOrderCompleted`: hook registries. Hooks
  run inside the caller's transaction, touch only the database, and are idempotent.
- `StockPort` (catalog): reserve at order creation, commit on payment, release on cancel or refund.
- `PaymentPort` (payment): `closeOrderPayments` outside the cancelling transaction, then
  `ensureNoOpenAttempts` under the order lock, answering `closed`, `paid` or `unknown`. An `unknown`
  refuses the cancel and keeps every reservation.
- `FreightPort` (shipping), `PricingContributor` (coupons and promotions) and `OrderKindHandler`
  (group buying and presale) plug into checkout.

Fakes for every port are in `@shop/testing`.

### The effects ledger

Anything that calls a third party (WeChat Pay, a refund, an SMS, a subscription message, a template
message) is not done inside the transaction. The domain writes a row in `effects` in the same
transaction as the state change; the worker's dispatcher claims due rows after commit and runs the
handler the domain registered in its `effects.ts`.

- Recording is exactly-once: `UNIQUE (scope, scope_id, event_type)`.
- Dispatch is at-least-once, under a lease, with retry and backoff. Handlers are idempotent.
- A row with no registered handler parks as `unknown` instead of being dropped.
- The admin console lists effects by status and can retry one.

### Configuration

A settings screen is a config group: one `defineConfigGroup` in a domain's `*.config.ts`, with a
zod schema in which every field has a default, and `ui` metadata (labels, sections, field kinds,
`visibleWhen`). Values live in `config_values (group, key, value jsonb)`. One `<ConfigGroupForm>`
renders every group; secrets travel to the browser as "is set" only. The groups are collected by
`pnpm gen` into `config-groups.gen.ts`.

### Permissions and menus

A permission atom is `<domain>:<resource>:<action>`, declared in the domain's `permissions.ts` and
named by the contracts that need it. Roles are sets of atoms. The admin menu is assembled from
`apps/web/src/admin/menu/*.menu.ts` (`defineMenu`); an entry shows only when the admin holds its
atom. `apps/web`'s `gen` step assembles the menu. The `permissions` guard checks that every atom a
route or menu entry names is declared, and that no declared atom goes unused.

## Third parties

Every third party is behind a port with a real driver and a fake in `@shop/testing`. The tests and
the e2e suites use the fakes only.

| Service                   | Where                                                     | Notes                                                                                                                  |
| ------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| WeChat Pay v3             | `core/src/wechat/wechat.pay.ts`, `core/src/payment/`      | JSAPI, mini-program and H5; signed callbacks; stale attempts reconciled by the worker; refunds via `refund`.           |
| WeChat (mini-program, OA) | `core/src/wechat/wechat.client.ts`, `core/src/wechat-oa/` | code2session, OA OAuth and JS-SDK, menus, media, template and subscription messages. Access tokens cached in Redis.    |
| SMS                       | `core/src/sms/` (`sms.port.ts`, `sms-aliyun.ts`)          | Aliyun SMS. `send` never throws: an outage is a retryable answer, not a 500. `SHOP_FAKE_SMS` selects the fake driver.  |
| Logistics tracking        | `core/src/shipping/shipping.logistics.port.ts`            | Aliyun market express API; the host is fixed in code, answers cached in Redis; a failure reads as `unknown`.           |
| Object storage            | `core/src/kernel/storage.ts`, `core/src/storage/s3.ts`    | Local disk (the `uploads` volume, served by the edge) or any S3-compatible service. The server always chooses the key. |
| Remote fetch              | `core/src/storage/safe-fetch.ts`                          | The only way to fetch a user-supplied URL: public addresses only, redirects re-checked, size and time capped.          |

## Worker

`apps/worker/src/main.ts` starts one process that runs every job. A job is a file
`apps/worker/src/jobs/<domain>.<verb>.ts` exporting `defineJob({...})`: a name, a payload schema, a
handler, and optionally concurrency, attempts and a `repeat` schedule; `pnpm gen` collects them into
`jobs.gen.ts`. The payload is validated before the handler runs, and a job that exhausts its
attempts lands in `failed_jobs`.

Scheduled jobs declare their own `repeat` (a cron pattern in Asia/Shanghai time, or an interval):
order auto-cancel, auto-receive and completion sweeps; payment reconciliation and exception-refund
rechecks; refund reconciliation; coupon claim-window and expiry sweeps; group-buy and presale
window sweeps; catalog auto-review, view-count folding and history pruning; orphaned-upload
cleanup; audit-log and session pruning; the effects dispatcher; the heartbeat.

The worker refreshes `worker:heartbeat` in Redis on an interval, with a TTL of four intervals; the
container health check reads that key. On SIGTERM it stops taking jobs and waits up to
`SHUTDOWN_TIMEOUT_MS` for the running ones.

## Admin UI

The admin is part of `apps/web`: pages under `app/admin/(shell)/<domain>/`, Ant Design 6 on React
19, all text in Simplified Chinese. Pages are built from the kit in `apps/web/src/admin/kit/`:

- `CrudTable`: a paged, sortable, filterable table bound to a list contract.
- `ZodForm`, `ModalForm`: forms typed from a contract's body schema.
- `ConfigGroupForm`: every settings screen.
- `AssetPicker`, `LinkPicker`, `SkuPicker`: choosers backed by providers the page supplies.
- field components: `MoneyInput`, `DateField`, `RichTextField`, `AssetField`, `LinkField`,
  `SortableListField` and more.
- `MoneyText`, `InstantText`, `StatusTag`, `DescriptionsCard`, `ConfirmButton`, `PageContainer`.

Data flows through `useRouteQuery` and `useRouteMutation`; `useCan()` from `src/admin/session`
hides what the admin's atoms do not allow. `/admin/dev/kit` renders every kit component, and
`apps/web/src/admin/kit/README.md` documents them. The page designer (`src/admin/diy`) edits DIY
pages whose component schemas are declared in `@shop/contracts`, so the designer, the API and the
mobile client agree on each component's shape. The notification bell listens on
`/admin-api/notifications/stream`, a server-sent event stream fed by Redis pub/sub.

## The mobile client

`apps/uni-app` is the shipping mobile client: uni-app on Vue 2, built as the H5 storefront (served
by `edge` at `/`) and as the WeChat mini-program. It is an npm project outside the pnpm workspace.

Its pages read the field names they have always read. The modules in `api/` call `/api/v1`, and
the pure functions in `api/mappers/` translate each response into those names, so a contract change
is absorbed in one mapper rather than across pages. `utils/diyRegistry.js` lists the DIY components
it can render; the `uniapp` guard checks it against the contracts' registry, and checks that every
call in `api/` resolves to a route.

### The new mini-program (in progress)

`apps/mini` is the WeChat mini-program that replaces the uni-app: Taro 4 on React 18, in the pnpm
workspace. Until the cutover the uni-app above is still what ships; the edge image still serves the
uni-app H5 build.

- **Where it is going**: [docs/mini/](mini/) — the page map and route catalogue
  ([pages.md](mini/pages.md)), the design rules ([design.md](mini/design.md)), sign-in
  ([auth.md](mini/auth.md)), the WeChat platform rules ([wechat-compliance.md](mini/wechat-compliance.md)),
  the spike reports ([spikes/](mini/spikes/)), the real-device kit
  ([device-check.md](mini/device-check.md)) and each stream's status ([status/](mini/status/)).
- **Built from**: `@shop/api-client` (the typed `/api/v1` client, over `Taro.request` in the
  mini-program and `fetch` on H5, plus the zod-free route catalogue `@shop/api-client/routes`) and
  `@shop/storefront-blocks` (the DIY blocks, rendered by the mini-program and by the admin's editor
  canvas). Contracts are imported as types only; nothing carries zod at run time.
- **Seams**: only `src/platform/` calls WeChat (`Taro.*`: navigation, sign-in, payment, the tab bar,
  storage); NutUI only inside `src/ui/`. `pnpm build` builds the WeChat package, the H5 preview and
  the "模拟小程序" H5 build the e2e suite drives, and fails on the package-size budget.
- **Checked by** the `mini` guard (pages ⇄ `app.config.ts` ⇄ route catalogue, the platform seam,
  privacy declarations, retired URLs, no AppSecret or upload key) and `pnpm --filter @shop/e2e-storefront test:mini`.

## Edge

`docker/edge/nginx.conf`, in front of `web`:

- `/healthz` answers from nginx; `/readyz` proxies to the application's `/api/v1/readyz`.
- `^/(admin|admin-api|api)(/|$)` and `/_next/static/` go to `web`;
  `/admin-api/notifications/stream` goes unbuffered, for SSE.
- `^~ /uploads/` serves the uploads volume read-only; anything that could execute is refused.
- Everything else is the H5 build, with long cache on hashed assets and an `index.html` fallback.
- The client address is taken from `X-Forwarded-For` only when the peer is in
  `NEXT_EDGE_TRUSTED_PROXIES`; the app reads `X-Real-IP` and nothing else.

## Tests and checks

| Layer             | Where                        | Runs against                                                                                                                                                           |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | `*.test.ts` next to the code | Nothing external.                                                                                                                                                      |
| Integration       | `*.int.test.ts`              | PostgreSQL and Redis in Testcontainers; `runConcurrently` for every conditional update.                                                                                |
| Contract examples | `packages/contracts`         | Every example parses against its route.                                                                                                                                |
| Guards            | `guards/`                    | The whole tree: contracts vs routes, permissions, retired features, secrets, migrations, the uni-app, the mini-program, the invariant catalogue, the release pipeline. |
| Admin e2e         | `e2e/admin`                  | The production build of `apps/web`, Playwright, fakes for every third party.                                                                                           |
| Storefront e2e    | `e2e/storefront`             | The H5 build in mobile Chromium, through the edge, against the built app and worker; `test:mini` runs the mini-program's "模拟小程序" build the same way.              |
| Deploy drill      | `deploy/rehearsal/drill.sh`  | The production Compose stack, built locally: first deploy, upgrades that must roll back, rollback, backup and restore.                                                 |

CI (`.github/workflows/ci.yml`) runs all of them, and a nightly soak repeats the concurrency
suites 50 times with shuffled order.
