# P0-a — platform runtime

Branch `rewrite/ws-p0a-platform`, worktree `../CRMEB-wt/ws-p0a`.
Last updated after the full gate run below.

## Done

| Area                  | What landed                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/config`     | ESLint flat preset (eslint 10 + typescript-eslint) with a purpose-built `boundaries` plugin, vitest unit/int project preset, tsconfig presets |
| `packages/contracts`  | `pnpm gen` aggregation, OpenAPI 3.1 build, `check:examples` gate, zh-CN zod locale, and the `health` + admin `auth` domains                   |
| `packages/db`         | `schema/auth.ts`, `schema/system.ts` (only)                                                                                                   |
| `packages/core`       | `kernel/`, `order/ports.ts`, `effects/`, `auth/`                                                                                              |
| `packages/testing`    | Testcontainers harness, `createTestCtx`, `defineFactory`, `runConcurrently`, port fakes, fake WeChat Pay v3 gateway, mock server + CLI        |
| `apps/web/src/server` | `env`, `container`, `handle()`                                                                                                                |
| `apps/web/app`        | health on both surfaces, admin `login` / `logout` / `me`                                                                                      |
| `apps/worker`         | `defineJob`, job aggregation, BullMQ worker, three jobs                                                                                       |
| CI                    | `.github/workflows/next.yml`                                                                                                                  |

### The kernel, in one line each

- `tx.ts` — `withTx` (reuses an open transaction), `lockRow`/`lockRows`
  (`FOR UPDATE`, optional `SKIP LOCKED`/`NOWAIT`), `conditionalUpdate` /
  `conditionalDelete` returning `{ affected, won }`.
- `money.ts` — `Money` over integer 分, with `allocate()` by largest remainder.
  A split **always** sums back to the original; proven over 1000 random cases.
- `errors.ts` — `DomainError(code, { details })`, status and Chinese message
  resolved through the contracts registry. An unknown code degrades to 500 and
  is logged loudly.
- `clock.ts` — `Clock`, `systemClock`, `fixedClock` (`advance`, `set`).
- `ids.ts` — `toId`/`fromId`, a 24-digit time-prefixed order number
  (Asia/Shanghai, per-process counter + 7 crypto-random digits, no snowflake),
  `randomToken`.
- `context.ts` — `Ctx` (db, redis, clock, config, logger, queue, storage,
  actor, platform, requestId) plus `ctx.withTx` and `ctx.as(actor)`.
- `logger.ts` — pino, redacting ~20 credential-shaped keys at three depths.
- `queue.ts` / `queue-bullmq.ts` — the `JobQueue` port (`enqueue` with `delay`
  and `dedupeKey`, `cancel`), a memory fake, and the BullMQ adapter.
- `storage.ts` — `Storage` port, local driver with **server-generated keys**
  and a directory/extension whitelist, `memoryStorage`, S3 driver as a
  _throwing_ stub for F1.
- `config-registry.ts` — `defineConfigGroup` (zod + UI metadata + `legacyKeys`),
  `config.get/set/getRaw/invalidate`, Redis-cached with invalidation on write.
- `rate-limit.ts` — atomic Lua fixed-window and token-bucket, plus `enforce()`.

## Verification

Everything below was run in this worktree on the committed tree. `corepack`
needs its shims on `PATH` for turbo to find pnpm (`corepack enable`); CI does
that in its own step.

```
$ corepack pnpm install
Already up to date
Done in 2ms using pnpm v12.5.1
  [exit 0]
$ corepack pnpm gen
@shop/contracts:gen: contracts: aggregated 2 contract file(s), 1 error file(s)
@shop/contracts:gen: contracts: wrote openapi.json (5 route(s), 5 path(s))
@shop/worker:gen: worker: aggregated 3 job file(s)
 Tasks:    2 successful, 2 total
  [exit 0]
$ corepack pnpm typecheck
 Tasks:    7 successful, 7 total
  [exit 0]
$ corepack pnpm lint
 Tasks:    8 successful, 8 total
  [exit 0]
$ corepack pnpm format:check
Checking formatting...
All matched files use Prettier code style!
  [exit 0]
$ corepack pnpm test:unit
@shop/core:test:unit:      ✓  unit  src/kernel/money.test.ts (20 tests) 64ms
@shop/contracts:test:unit: ✓  unit  src/contracts.test.ts (15 tests) 28ms
@shop/testing:test:unit:   ✓  unit  src/fakes.test.ts (14 tests) 11ms
@shop/testing:test:unit:   ✓  unit  src/mock-server/mock-server.test.ts (18 tests) 124ms
@shop/core:test:unit:      ✓  unit  src/order/ports.test.ts (15 tests) 11ms
@shop/testing:test:unit:   ✓  unit  src/wechat/fake-gateway.test.ts (16 tests) 466ms
@shop/core:test:unit:      ✓  unit  src/auth/auth.test.ts (21 tests) 21ms
@shop/worker:test:unit:    ✓  unit  src/define-job.test.ts (12 tests) 10ms
@shop/core:test:unit:      ✓  unit  src/kernel/kernel.test.ts (29 tests) 148ms
@shop/config:test:unit:    ✓  unit  src/boundaries.test.js (2 tests) 122ms
@shop/testing:test:unit:   ✓  web-server-unit  src/server/handle.test.ts (39 tests) 48ms
 Tasks:    7 successful, 7 total
  [exit 0]
$ corepack pnpm test:int
@shop/worker:test:int:  [harness] postgres + redis ready in 2948ms (schema from schema-diff)
@shop/core:test:int:    [harness] postgres + redis ready in 2948ms (schema from schema-diff)
@shop/testing:test:int: [harness] postgres + redis ready in 2964ms (schema from schema-diff)
@shop/worker:test:int:  ✓  int  src/main.int.test.ts (6 tests) 110ms
@shop/core:test:int:    ✓  int  src/kernel/config.int.test.ts (19 tests) 673ms
@shop/core:test:int:    ✓  int  src/kernel/tx.int.test.ts (16 tests) 791ms
@shop/testing:test:int: ✓  int  src/harness/harness.int.test.ts (9 tests) 496ms
@shop/core:test:int:    ✓  int  src/auth/auth.int.test.ts (28 tests) 975ms
@shop/testing:test:int: ✓  web-server-int  src/server/handle.int.test.ts (10 tests) 359ms
@shop/core:test:int:    ✓  int  src/effects/effects.int.test.ts (18 tests) 1605ms
@shop/core:test:int:    ✓  int  src/kernel/rate-limit.int.test.ts (15 tests) 385ms
 Tasks:    7 successful, 7 total
  [exit 0]
$ corepack pnpm --filter @shop/contracts check:examples
contracts: 5 route(s) OK, every example parses.
$ corepack pnpm --filter @shop/testing exec tsc -p ../../apps/web/src/server/tsconfig.json
  [exit 0]
```

**Totals: 201 unit tests, 121 integration tests, 322 in all. Zero failing, zero skipped.**

### The mock server, live

```
$ corepack pnpm --filter @shop/testing mock -- --port 4010
mock server listening on http://127.0.0.1:4010
  5 route(s); GET http://127.0.0.1:4010/__mock/routes lists them
  select an example with the  X-Mock-Example: <name>  request header

$ curl -s http://127.0.0.1:4010/api/v1/health
{"status":"ok","time":"2026-01-01T12:00:00+08:00","version":"dev"}

$ curl -s -XPOST http://127.0.0.1:4010/admin-api/auth/login \
    -H 'content-type: application/json' -d '{"account":"admin","password":"crmeb123456"}'
{"id":"1","account":"admin","name":"超级管理员","avatar":null,"isSuper":true,
 "permissions":["auth:session:read","auth:session:delete"]}

$ curl -s http://127.0.0.1:4010/admin-api/auth/me -H 'X-Mock-Example: limited'
{"id":"2","account":"operator","name":"运营","avatar":null,"isSuper":false,
 "permissions":["auth:session:read","auth:session:delete","catalog:product:read"]}

$ curl -s -XPOST http://127.0.0.1:4010/admin-api/auth/login \
    -H 'content-type: application/json' -d '{"account":""}'          # 422
{"code":"VALIDATION_FAILED","message":"提交的数据有误","details":[
  {"field":"account","message":"数值过小：期望 string >=1 字符"},
  {"field":"password","message":"无效输入：期望 string，实际接收 undefined"}]}
```

### The worker, booted by hand

`corepack pnpm build` produces a 268 KB bundle; run against real containers
with the schema applied:

```
{"level":"info","app":"worker","jobs":["system.dispatchEffects","system.heartbeat","system.pruneSessions"],"msg":"worker starting"}
{"level":"info","app":"worker","scheduled":["system.dispatchEffects","system.heartbeat","system.pruneSessions"],"msg":"repeatable schedules synced"}
{"level":"info","app":"worker","concurrency":4,"queue":"shop","msg":"worker ready"}
# redis-cli exists worker:heartbeat            -> 1
# redis-cli exists worker:heartbeat:job        -> 1   (the scheduled job fired)
# kill -TERM
{"level":"info","app":"worker","msg":"worker stopping, waiting for in-flight jobs"}
{"level":"info","app":"worker","msg":"worker stopped"}
# redis-cli exists worker:heartbeat            -> 0   (liveness key cleared)
```

`apps/worker` needed `pg` added to its own dependencies: `@shop/db` is bundled
into `dist/main.js`, but `pg` stays external, so the runtime has to provide it.

### Two real defects the integration tests caught

1. **`withTx` opened a savepoint instead of reusing the transaction.** `isTx`
   looked for a `transaction` method — which a drizzle `PgTransaction` also has.
   Every nested `withTx` was silently opening a savepoint. Now checks `rollback`.
2. **`recordEffect` read the ambient clock.** It used `new Date()` while the
   dispatcher compared against `ctx.clock`, so on a fixed clock nothing was ever
   claimed. `recordEffect(tx, ctx, input)` now takes the context, and the core
   ESLint preset bans zero-argument `new Date()` next to `Date.now()`.

## Things other streams must know

1. **`recordEffect(tx, ctx, input)`** takes `ctx` (the brief sketched it without).
   Reason above.
2. **`config.get(group)` takes the group _definition_, not its name** —
   `ctx.config.get(paymentConfig)` — because that is what makes the return value
   typed. `getRaw('payment')` exists for the generic admin screen.
3. **`auth:session:read` / `auth:session:delete`** are implicitly granted to every
   authenticated admin (`IMPLICIT_ADMIN_PERMISSIONS`). They exist because
   `defineRoute` (frozen) requires a permission on every `auth: 'admin'` route,
   and `/admin-api/auth/me` must work for an admin with no privileges at all.
4. **Admin login responds with the same `adminProfile` as `/me`.** No token in
   the body — it is an httpOnly cookie. P0-b: read identity from the login
   response, do not call `/me` again.
5. **Admin sessions live in Redis, storefront sessions in PostgreSQL.** Different
   lifetimes, different revocation needs. Both carry `passwordVersion`; both are
   stored hashed.
6. **`auth: 'staff'` fails closed with 403 until stream B2 calls
   `registerStaffCheck()`.** Same for `UserLookup`: a storefront session cannot
   be resolved until E1 calls `registerUserLookup()`. Both ship in-memory fakes
   in `@shop/testing`.
7. **Only `*.repo.ts` and `*.test.ts` may import `@shop/db/schema/*`.** Enforced;
   the kernel holds itself to it too (`config.repo.ts`, `effects.repo.ts`,
   `admin.repo.ts`, `user-session.repo.ts`, `audit.repo.ts`, `failed-jobs.repo.ts`).
8. **`group` is a reserved SQL word.** Drizzle quotes it; hand-written SQL against
   `config_values` must write `"group"`.
9. **Integration tests get a cloned database per test _file_.** Committing inside
   a test is fine and expected — that is what makes the concurrency tests real.
   `harness.db.truncateAll()` in `beforeEach`.
10. **`runConcurrently` defaults `isWinner` to "truthy".** For a
    `conditionalUpdate` pass `{ isWinner: (r) => r.won }`, or every caller counts
    as a winner. (This bit the author first.)
11. **`pnpm gen` must run before `typecheck`/`lint`/tests** — turbo wires it, but
    a direct `vitest` invocation in a fresh clone will not find `*.gen.ts`.
12. **Zod messages are Simplified Chinese** via `@shop/contracts/locale`, imported
    for its side effect by `handle()` and by the mock server.

## For the orchestrator

### FK the merge must wire

`user_sessions.user_id` is a bare `fk().notNull()` **without** `.references(...)`,
because `users` belongs to P0-S/E1. At merge, add:

```ts
userId: fk().notNull().references(() => users.id, { onDelete: 'cascade' }),
```

`config_values.updated_by` and `audit_logs.admin_id` are deliberately _not_
cascading (`audit_logs.admin_id` is `set null`): an operation log must outlive
the account that performed it.

### Table arbitration: `effects` vs `order_effects`

PLAN §1 mentions an order-specific `order_effects(order_id, event_type UNIQUE)`;
P0-S is likely to have written one. This stream shipped a **generic**
`effects(scope, scope_id, event_type)` with `UNIQUE (scope, scope_id, event_type)`.

**Recommendation: keep `effects`, drop `order_effects`.** Reasons:

- refunds, users, WeChat callbacks and notifications all need the same ledger;
  an order-only table means four more copies of the dispatcher.
- the dispatcher, its retry/backoff, its lease and its "park as unknown" path are
  written, tested (18 integration tests including exactly-once under two
  concurrent dispatchers) and wired to a repeatable worker job.
- `scope_id` is `varchar`, so a non-numeric key (a WeChat `out_trade_no`) fits;
  a `bigint order_id` cannot hold one.
- migration for P0-S is mechanical: `scope: 'order'`, `scopeId: String(orderId)`.

If you decide the other way, `core/src/effects/effects.repo.ts` is the only file
that touches the table.

### Deliberate oversteps

| File                            | Why                                                                                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next/pnpm-workspace.yaml`      | `pnpm install` fails without it — CR-1                                                                                                                                                                                                       |
| `next/.prettierignore` (new)    | the gate needs it — CR-2                                                                                                                                                                                                                     |
| `next/packages/db/package.json` | added `lint` script + `@shop/config`/`eslint` devDeps; the brief scoped this stream to the two schema files, but an unlinted `packages/db` means no boundary enforcement on ~70 tables. Trivial to merge; say the word and I will revert it. |

Root `package.json`, `tsconfig.base.json`, `.npmrc` and `_conventions/**` were
**not** touched.

### Dependencies P0-b must add to `apps/web/package.json`

`src/server` and the route files import exactly these:

```jsonc
{
  "dependencies": {
    "@shop/contracts": "workspace:*",
    "@shop/core": "workspace:*",
    "@shop/db": "workspace:*",
    "ioredis": "^6.0.0",
    "zod": "^4.6.5",
    "next": "^16.3.5",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
  },
  "devDependencies": {
    "@shop/config": "workspace:*",
    "@shop/testing": "workspace:*",
    "@types/node": "^24.0.0",
    "eslint": "^10.11.0",
    "typescript": "^7.0.2",
    "vitest": "^5.0.1",
  },
}
```

`pg`, `bullmq`, `pino`, `bcryptjs` and `drizzle-orm` are **not** needed: they
reach `apps/web` through `@shop/core` and `@shop/db`.

Once that package.json exists, delete these three temporary things:

1. `next/apps/web/src/server/tsconfig.json` (its `paths` stand in for node_modules)
2. `next/apps/web/src/server/eslint.config.js` (a comment inside shows the
   replacement, which splits `admin-ui` from `app-server` by glob)
3. the `web-server-unit` / `web-server-int` projects and aliases in
   `next/packages/testing/vitest.config.ts`

and remove the two `apps/web` steps from `.github/workflows/next.yml`.

## Stubbed, and honestly so

| Thing               | State                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S3 storage driver   | interface only; every method throws a clear message. F1 implements.                                                                                                                                                            |
| Slider captcha      | `CaptchaVerifier` interface + threshold logic, wired into login and tested. No provider. Off until something registers one.                                                                                                    |
| Fake WeChat gateway | endpoint _shapes_ + **real** RSA signing, real AEAD_AES_256_GCM, working signed notify delivery. Business rules (duplicate `out_trade_no`, close-a-paid-order, partial refunds, certificate rotation) carry `TODO(C)` markers. |
| `md5_legacy` verify | implemented as `md5(password)`, matching CRMEB's `SystemAdminServices::login`. If the ETL finds a different scheme, `verifyMd5Legacy` is the one place to change.                                                              |
| Worker end-to-end   | `syncRepeatables` is integration-tested against real Redis; a full "enqueue → worker executes" loop is not. The dispatcher it runs has 18 integration tests of its own.                                                        |
| Seeds               | none. `packages/db/src/seed/` is referenced by a script but not owned by this stream.                                                                                                                                          |

## Open CRs

- `docs/rewrite/cr/CR-1-p0a.md` — the four `allowBuilds` decisions (applied)
- `docs/rewrite/cr/CR-2-p0a.md` — two pre-existing unformatted files (worked around)
- `docs/rewrite/cr/CR-3-p0a.md` — typescript-eslint needs TS 6 (worked around)

## In progress / blocked

Nothing in progress; nothing blocked. The three CRs above are all either
already applied or worked around, and none of them stops another stream.
