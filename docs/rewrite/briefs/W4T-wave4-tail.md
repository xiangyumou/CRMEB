# Stream W4T — wave-4 tail: CR-2-e4 and the 版式 ETL path

**Worktree** `../CRMEB-wt/ws-w4t` · **Branch** `rewrite/ws-w4t-wave4-tail` (from `rewrite/integration` at `294fee6c1`) · **Owns** `next/packages/core/src/order/**` (for §1 only), `next/packages/etl/src/**` (for §2 only), `docs/rewrite/cr/CR-2-e4.md`, `docs/rewrite/status/w4t.md`. **Read-only**: everything else — `packages/db`, `core/src/kernel`, `core/src/user`, `core/src/diy`, `contracts`, `apps`.

Two small, independent units. Commit each on its own.

## 1. CR-2-e4 — register `UserOrderStatsPort` in the order domain

Read `docs/rewrite/cr/CR-2-e4.md` and `packages/core/src/user/user-order-stats.port.ts` (E4, merged). The staff 用户 screen's `orderCount` / `spendTotal` answer `null` until the order domain registers the port. Do it inside `registerOrderDomain()` in `packages/core/src/order/index.ts`, next to `installStaffCheck()`:

```ts
registerUserOrderStatsPort({ statsFor: (db, userIds) => orderRepo.statsForUsers(db, userIds) });
```

`statsForUsers(db, userIds)` is one grouped query over `orders` for the given ids: **paid or beyond, minus fully refunded**, summing the same column `adminStatistics` (stats domain / `order.admin` service — find it, do not guess) sums, so the 店员's number and the console's number cannot disagree. Return `Map<number, { orderCount, spendTotal }>` with `spendTotal` in `Money`'s string spelling (`"3980.00"`); absent id = no qualifying orders. Batched — the list route asks about twenty users at once, one query, no N+1.

Tests: an int test in `packages/core/src/order/` that creates a user with a paid order, an unpaid order and a fully refunded order and asserts count 1 / the paid amount; plus flip `user-staff.int.test.ts::answers null, not zero, while no stream has registered the port` — that test now needs to reset the port registry (see how other ports' tests do it) or be renamed to assert the real numbers through `registerOrderDomain()`; and the HTTP test in `apps/web/app/api/v1/user.int.test.ts` may now assert real numbers instead of `null` — if that file is E4's and you must not edit `apps/`, leave it (its `null` assertion should still pass only if the port is not registered in that harness — check, and if it fails, the fix is in the test's setup, note it in your status and the orchestrator applies it at merge). Mark CR-2-e4 RESOLVED.

## 2. The two 版式 numbers' ETL path (F4's leftover)

Read `docs/rewrite/status/f4.md` § "Left for somebody else" (first bullet) and `packages/core/src/diy/diy.config.ts`. `diy.categoryLayout` and `diy.userCenterLayout` are config values a migrated shop re-picks by hand because nothing carries `eb_diy`'s `template_name = 'category' | 'member'` rows across. `DiyMigrationReport.settings.{categoryLayout,userCenterLayout}` already reads them. Give the ETL's `diy` group a `config_values` target: two rows (`group='diy'`, keys `categoryLayout` / `userCenterLayout`) written through the same path the config ETL writes other groups (`packages/etl/src/config.ts` — reuse, do not duplicate), only when the legacy row exists, validated against the group's zod schema. `etl verify` must count them. Tests: the diy mapper unit test for both values and a runner int test row asserting the two `config_values` rows after a run on the synthetic fixture (`packages/etl/src/runner.int.test.ts` — follow the existing pattern). The ETL must stay idempotent (ETL-J-001). Update `docs/rewrite/status/f4.md`? No — that is F4's file; record the closure in `docs/rewrite/status/w4t.md` and, if `invariants.md` has a row for the DIY settings migration, tell the orchestrator in your report rather than editing the ledger.

## Done

From `next/`: `pnpm turbo run gen typecheck lint test:unit build`, `pnpm --filter @shop/core test:int`, `pnpm --filter @shop/etl test:unit test:int` (both scripts by name — `pnpm --filter @shop/etl test` is a silent no-op), `pnpm --filter @shop/web test:int`, `pnpm exec prettier --check .`, `pnpm guards`. `docs/rewrite/status/w4t.md` with both units, the query used for §1 and the exact counting rule, and anything left. Final report: tests added, CR status, final commit hash.

## Rules

Never push, never SSH, never modify `crmeb/`, `template/**`, `packages/db/**`, `core/src/kernel/**`, or another stream's worktree. Commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
