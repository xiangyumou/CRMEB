# Golden slice — coupons

Branch `rewrite/ws-golden-coupon`, worktree `../CRMEB-wt/ws-golden`.
Last updated after the full gate run quoted below. Nothing pushed.

## Done

| Area                  | What landed                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/contracts`  | `coupon/{schemas,errors,coupon.admin.contract,coupon.storefront.contract}.ts` — 13 routes, 25 examples |
| `packages/core`       | `coupon/{coupon.repo,coupon.rules,coupon.service,coupon.jobs,permissions,index}.ts`                   |
| `apps/web` API        | 10 `route.ts` files — 5 admin, 5 storefront                                                           |
| `apps/web` admin      | `admin/(shell)/coupon/` — enums + 优惠券列表 + 已领取记录, and `src/admin/menu/coupon.menu.ts`         |
| `apps/worker`         | `jobs/coupon.expireUserCoupons.ts` (hourly), `jobs/coupon.closeClaimWindows.ts` (10 min)              |
| `packages/etl`        | **new package** — `src/mappers/coupon.ts` + test                                                      |
| docs                  | `GOLDEN.md`, the COUPON rows of `invariants.md`, `cr/CR-{1,2,3,4}-golden.md`, this file                |

**Counts.** 13 routes · 18 exported service functions (13 route-facing, 5 for
other streams) · 2 admin pages · 2 jobs · 1 ETL mapper.

Tests **added by this stream** — 110 in all:

| File                             | Kind                     | Tests |
| -------------------------------- | ------------------------ | ----: |
| `coupon.rules.test.ts`           | unit, no Docker          |    24 |
| `etl/src/mappers/coupon.test.ts` | unit, no Docker          |    20 |
| `coupon-templates.test.tsx`      | component                |     4 |
| `coupon.int.test.ts`             | real PostgreSQL          |    52 |
| `coupon.concurrency.int.test.ts` | real PG, `runConcurrently` | 14 |
| `admin-api/coupons/coupons.int.test.ts` | HTTP through `handle()` | 12 |

Every one of the 14 concurrency tests runs its racers on separate pools via
`forkTestCtx`; COUPON-006/007/008 are three of them.

## Verification

Run in `next/` on the committed tree (`pnpm gen typecheck lint test:unit
test:int build`, then the two extra gates). Full log:
`gate.log` in the session scratchpad. Verbatim:

```
$ pnpm gen        →  Tasks:    3 successful, 3 total
$ pnpm typecheck  →  Tasks:   10 successful, 10 total
$ pnpm lint       →  Tasks:   11 successful, 11 total
$ pnpm test:unit  →  Tasks:   10 successful, 10 total
   @shop/config     2 passed (2)      @shop/etl       20 passed (20)
   @shop/contracts 15 passed (15)     @shop/testing   48 passed (48)
   @shop/worker    12 passed (12)     @shop/core     109 passed (109)
   @shop/web      146 passed (146)
$ pnpm test:int   →  Tasks:   10 successful, 10 total
   @shop/worker     6 passed (6)      @shop/testing    9 passed (9)
   @shop/web       22 passed (22)     @shop/core     162 passed (162)
$ pnpm build      →  Tasks:    5 successful, 5 total
   ✓ Compiled successfully in 8.6s; all 10 coupon routes listed as ƒ (Dynamic)
$ pnpm --filter @shop/contracts check:examples
   contracts: 18 route(s) OK, every example parses.   # 13 coupon + 5 platform
$ pnpm exec prettier --check .
   All matched files use Prettier code style!
```

Zero failures, zero skips. One fix was needed to get the last line green: see
"`next-env.d.ts`" below.

## Decisions other streams must know

**Argument order.** A service a route calls is `(ctx, input)` and opens its own
`ctx.withTx`. A service *another domain* calls inside its own transaction is
`(tx, ctx, input)` — matching `recordEffect(tx, ctx, input)`. So:

```ts
await coupon.redeem(tx, ctx, { userCouponId, userId, orderId });
await coupon.release(tx, ctx, { userCouponId, orderId });
await coupon.grantNewUser(tx, ctx, userId);
await coupon.grantOrderGifts(tx, ctx, { userId, orderId, productIds, paidAmount });
```

- **B1**: `quote(ctx, { userCouponId, userId, lines })` is a pure read and may be
  called twice while pricing. `redeem` throws `COUPON_NOT_USABLE` (409) on any
  refusal — used, revoked, expired, not yet valid, or someone else's. One code,
  deliberately: the answer comes from an UPDATE that affected zero rows and the
  service genuinely cannot say which. There is no `COUPON_ALREADY_REDEEMED`.
- **`grantOrderGifts` needs `paidAmount: Money`**, because the order-value
  threshold is compared against what was actually paid. It is idempotent per
  order through `user_coupons_order_gift_uq`, so a replayed payment callback
  grants nothing extra.
- **`release` never throws.** It returns `{ released: boolean }` — it runs behind
  the effects ledger and the ledger retries. A caller that must fail loudly
  (QUEUE-006) checks the flag and throws its own error. A coupon whose window
  passed while it sat on the order comes back `expired`, not `unused`.
- **`grantNewUser` never fails a registration.** A sold-out welcome coupon is a
  no-op, not an exception. Idempotent by "already holds one from this template".
- **Everything is exported from `core/src/coupon/index.ts` as plain functions.**
  No class, no service object. Import `@shop/core/coupon` (the `/index` is
  CR-2).
- **The checkout picker takes cart lines, not a cart id**:
  `listApplicable` / `quote` receive `{ productId, categoryIds, amount }[]` and
  derive the subtotal themselves, so the coupon domain never reads catalog or
  order tables. B1 supplies the lines.
- **`claim_slot` is a ceiling, not a quota.** It is computed from what is
  committed, so N simultaneous taps all target the same slot and exactly one
  lands. A user with `per_user_limit = 3` gets **one** coupon from a burst of
  concurrent taps, not three; the other two need separate, later taps. Anyone
  building a "claim all" button should know this.
- **`issueOne` inserts the wallet row before decrementing supply**, and deletes
  its own insert if the decrement loses. The reverse order leaks one unit of
  stock per concurrent double-tap (asserted in COUPON-008).
- **`adminUpdate` applies the total as a delta**, not a reset: raising
  `total_count` from 1000 to 1100 adds 100 to what remains rather than setting
  remaining to 1100. Legacy reset it and reissued stock that had already gone
  out. Floors at zero.
- **`adminGrant` is all-or-nothing on supply** (a grant that would oversell is
  refused whole, `COUPON_SOLD_OUT`) but **skips** users already at their limit
  and reports them in `skippedUserIds` — an operator pasting a list that
  overlaps a previous grant should not be blocked.
- **Soft delete leaves wallets alone.** Deleting a template hides it everywhere;
  coupons already issued keep working, because `user_coupons` snapshots the
  title and both amounts at issue time.
- There is **no `core/coupon/effects.ts`**. Coupons emit no effects; the gift
  grant runs inside the order-paid effect handler, which B1/C own.

## Deferred, and who unblocks it

- **Catalog pickers.** `productIds` / `categoryIds` in the admin form are
  `mode: 'tags'` id inputs. When **A** ships product and category pickers,
  swap the two field specs in
  `apps/web/app/admin/(shell)/coupon/coupon-enums.tsx`. Nothing else changes.
- **`UserLookup`.** The storefront HTTP test registers
  `fakeUserLookup([{ id }])` because **E1** has not shipped the real lookup yet.
  When it lands the fake goes and the test uses real users.
- **`adminListUserCoupons` shows user ids, not names.** Same reason; the column
  gets a name once E1's lookup exists.
- **`@shop/core/coupon` → `@shop/core/coupon`** once CR-2 lands. One sed
  over ten route files.

## New package

`packages/etl` did not exist, so this stream created the minimum for a pure
mapper: `package.json`, `tsconfig.json`, `eslint.config.js`
(`shopConfig({ kind: 'tooling' })`), `vitest.config.ts`, `README.md` and
`src/index.ts`. **No runtime dependencies at all** — devDeps only
(`@shop/config`, `@types/node`, `eslint`, `typescript`, `vitest`), all already
in the workspace. When the real runner arrives it can keep the mappers
untouched.

Two consequences for the orchestrator:

1. **`pnpm install` must be run after merging this branch** (a new workspace
   package). `next/pnpm-lock.yaml` is *not* committed, per the brief; the only
   change it needs is the `packages/etl` entry.
2. `packages/etl/README.md` states the mapper conventions (pure function,
   dropped rows counted, legacy ids preserved, money stays a string). The next
   stream to add a mapper should read it.

## Platform friction

Four CRs, all with a working workaround in this branch:

| CR                | What                                                                             | Cost if unfixed                              |
| ----------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| `CR-1-golden.md`  | CONVENTIONS says `app/admin-api/<domain>/**`, but the App Router makes the directory the URL, and one domain owns two resources | every stream guesses; wrong URLs found late   |
| `CR-2-golden.md`  | `@shop/core`'s export map has no directory entry, so imports read `@shop/core/coupon` | `/index` on every domain import, forever      |
| `CR-3-golden.md`  | two P0-A worker tests asserted the job-name list literally — **fixed in `0aa9c00e`, please keep it** | ~10 streams each editing the same two lines   |
| `CR-4-golden.md`  | `CrudTable` binds to the real URL, so every page test must `vi.mock('next/navigation')` | six pasted lines × ~150 admin pages           |

Plus one small thing fixed here rather than filed: **`apps/web/next-env.d.ts`**
is written by `next build` and is unformatted, so running the Definition of
Done in its own order (build, then `prettier --check .`) goes red on a clean
tree. Added to `next/.prettierignore` with a comment. `.prettierignore` is a
shared file — if that conflicts at merge, keep the line.

## Invariants

COUPON-003…008 are `ported` with real test ids in `invariants.md`.
COUPON-001/002 are `retired`: the new schema has no member claim mode, so there
is no row for any surface to hide; what remains provable is that the migration
drops the legacy `receive_type = 4` rows and counts them by id, which
`packages/etl/src/mappers/coupon.test.ts` asserts against the four
`eb_store_coupon_issue` rows copied out of `crmeb/public/install/crmeb.sql`.

The coupon half of **USER-002** (a retried registration issues the welcome
coupon once and never twice) is covered by
`packages/core/src/coupon/coupon.int.test.ts::grantNewUser > issues nothing the
second time — a retried registration — USER-002`. That row belongs to B2/E1;
they still own the money-and-points half.
