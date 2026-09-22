# W4T — wave-4 tail

Branch `rewrite/ws-w4t-wave4-tail`, worktree `../CRMEB-wt/ws-w4t`, cut from
`rewrite/integration` at `a6bbc53da`. Two small independent units, one commit
each.

| Unit                                                  | State                     |
| ----------------------------------------------------- | ------------------------- |
| 1. CR-2-e4 — `UserOrderStatsPort` in the order domain | done — CR marked RESOLVED |
| 2. The two 版式 numbers' ETL path (F4's leftover)     | done                      |

---

## 1. CR-2-e4 — 累计订单 / 累计消费

`registerOrderDomain()` registers the port next to `installStaffCheck()`, as
the CR asked:

```ts
registerUserOrderStatsPort({
  statsFor: (db, userIds) => orderRepo.statsForUsers(db, userIds),
});
```

Imported from `../user` (the domain's `index.ts`) rather than from
`../user/user-order-stats.port`, because `boundaries/core-cross-domain` allows
only the index or `order/ports.ts`. No cycle: nothing under `user/` or `auth/`
imports `../order`.

### The counting rule

A **qualifying order** is a _paid order_ as `core/src/stats/DEFINITIONS.md` §2
defines one, minus the fully refunded ones:

```
orders.paid_at is not null          -- paid or beyond; the `orders_paid_shape`
                                    --   CHECK makes this exactly "not
                                    --   pending_payment and not cancelled"
and orders.deleted_at is null       -- an admin-deleted order is out of every
                                    --   figure (DEFINITIONS.md §2)
and orders.refund_status <> 'refunded'   -- this figure's own clause
```

- `orderCount` = `count(*)`
- `spendTotal` = `sum(orders.paid_amount)` — **the same column** the console's
  营业额 sums (`order.console.service.ts::adminStatistics` →
  `order.fulfil.repo.ts::rangeTotals`; `DEFINITIONS.md` §3 `revenue`), which is
  what CR-2-e4 required so the 店员's number and the console's cannot disagree.

Two decisions inside that, both asserted rather than described:

- a **partially refunded** order counts, at what the gateway took, _not_ net of
  the refund. `sum(paid_amount - refunded_amount)` would be a third definition
  of 消费总额 — exactly the drift the port exists to prevent — and the console
  already reports refunds as their own figure, bucketed on the day the money
  moved (`DEFINITIONS.md` §2, "Money is bucketed where the money moved").
- an order the **buyer hid** from their own list still counts: 删除订单 on the
  storefront is visibility only (CR-4-h §6); they tidied their list, they did
  not un-spend the money.

### The query

`packages/core/src/order/order.repo.ts::statsForUsers` — one grouped query for
the whole page (the list route asks about twenty customers), so a customer list
stays one query rather than twenty-one. `userIds` is de-duplicated first; an
empty page returns an empty map without touching the database.

```sql
select user_id,
       count(*)::int                                           as order_count,
       coalesce(sum(paid_amount), 0)::numeric(12, 2)::text     as spend_total
  from orders
 where user_id = any($1)
   and deleted_at is null
   and paid_at is not null
   and refund_status <> 'refunded'
 group by user_id
```

`numeric(12, 2)` is `money()`'s own precision, so the cast cannot lose a fen; it
is there because `sum()` of numeric comes back unpadded (`"0"`, `"5320.0"`).
`Money.parse(...).toString()` is still what guarantees the `"3980.00"` spelling
the contract wants. Index: `orders_user_idx (user_id, created_at)` covers the
`user_id` lookup.

A user with no qualifying orders is **absent** from the map, never a zero row —
the user service is the one that turns absence into `0` / `"0.00"`, and it has
to keep telling "no qualifying orders" apart from "no port registered".

### Tests added

`packages/core/src/order/order.user-stats.int.test.ts` (7 tests):

| Test                                                                               | Pins                                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| counts the paid order and ignores the unpaid and the fully refunded one            | the brief's case: count 1, `"3980.00"`                                           |
| keeps a partially refunded order at what the gateway took                          | `200.00`, not `150.00`                                                           |
| drops a cancelled and an admin-deleted order, and keeps one the buyer hid          | `deleted_at` vs `hidden_by_user_at`                                              |
| adds several qualifying orders up across statuses                                  | `paid`/`shipped`/`received`/`completed`, `0.01 + 12.30 + 7.69 + 80.00 = 100.00`  |
| answers a whole page of customers from one call, leaving the ones with nothing out | batching, de-duplication, absent ≠ zero                                          |
| asks nothing of the database for an empty page                                     | the `ids.length === 0` short circuit                                             |
| registers UserOrderStatsPort, so the staff screen stops answering null             | `getUserOrderStatsPort()` after `registerOrderDomain()`, called through the port |

`user/user-staff.int.test.ts::answers null, not zero, while no stream has
registered the port` needed **no change**: it already calls
`resetUserOrderStatsPort()` itself, so it still proves the `null` path with the
port registered globally. Verified green.

### For the orchestrator — one test setup change in `apps/`

`pnpm --filter @shop/web test:int` has **one failing test**, and the fix is in
the test's setup, which this stream may not edit:

```
FAIL app/api/v1/user.int.test.ts > /api/v1/staff/users
     > lets a 店员 through all six and never unmasks a phone
- Expected  { "orderCount": null, "spendTotal": null }
+ Received  { "orderCount": 0,    "spendTotal": "0.00" }
```

The test does `await import('@shop/core/order')` a few lines earlier (to set
`orderStaffConfig.staffUserIds`), which is what registers the port. The 店员 is
looking at their own account and has no orders, so the correct assertion is now
zero rather than `null`. Exact patch, at `apps/web/app/api/v1/user.int.test.ts`
lines 430–433:

```diff
-    // Nothing is known about their orders: no stream registers
-    // `UserOrderStatsPort` yet (CR-2-e4), and `null` is how that is said.
-    expect(listed.items[0]).toMatchObject({ orderCount: null, spendTotal: null });
+    // This suite imports `@shop/core/order` above, which registers
+    // `UserOrderStatsPort` (CR-2-e4, resolved) — so the two numbers are known,
+    // and a 店员 who has never bought anything is a real zero, not `null`.
+    expect(listed.items[0]).toMatchObject({ orderCount: 0, spendTotal: '0.00' });
```

Everything else in `apps/web` is green (16 of 17 files, 230 of 231 tests).

No `invariants.md` row was touched: the file has no id for this figure. If one
is wanted, the natural pair is the counting rule above against
`order.user-stats.int.test.ts`.

---

## 2. The two 版式 numbers' ETL path

`diy.categoryLayout` / `diy.userCenterLayout` now migrate. F4's first "left for
somebody else" bullet is closed.

### Where the rows are written from, and why it is not the `diy` group

The brief asked for a `config_values` **target on the ETL's `diy` group**. That
cannot work, and the reason is in `runner.ts`:

```ts
await tx.clear(group.targets.map((target) => target.table));
```

Every group empties its own target tables before reloading them — that is where
idempotency comes from (ETL-J-001). `diy` runs ninth and `config` runs second,
so a `config_values` target on `diy` would `delete from config_values` and throw
away every setting the config group had written a few groups earlier, then
insert two rows. A migrated shop would come up with the two 版式 numbers and
nothing else configured.

So **`config_values` keeps one owner**, and the `config` group reads the two
`eb_diy` rows itself:

```ts
// groups.ts, the config group's sources
{ table: 'eb_diy', into: 'diy',
  where: "template_name in ('category', 'member')", optional: true },
```

That is the brief's actual requirement — "written through the same path the
config ETL writes other groups (`config.ts` — reuse, do not duplicate), only
when the legacy row exists, validated against the group's zod schema" — met
literally: `stageDiyLayouts` puts the two numbers into `mapConfig`'s **staging
map**, next to everything `eb_system_config` fed, and from that line on they are
indistinguishable from any other config value. They go through the same
coercion pass, the same group-wide `schema.safeParse`, the same "write back only
the fields a legacy key actually fed" rule and the same `ConfigValueRow`s. A
layout number the `diy` schema refuses fails the run, or falls back to the
default under `--allow-invalid-config`, exactly as a stock threshold would.

`optional: true` on the source: a partial dump without the decoration tables is
a shop that keeps the default layouts, not a broken migration. The `where` is a
constant in `groups.ts`, never interpolated, and `etl plan` prints it.

Nothing is duplicated between the two readers. `mappers/diy.ts` exports the two
things `config.ts` needs and the mapper itself uses:

- `diyLayoutField(templateName)` — `category` → `categoryLayout`, `member` →
  `userCenterLayout`, `undefined` for `color_change` (一键换色 is not ported)
  and for a `product_detail` template row;
- `settingNumber(value)` — the longtext column holds `'2'` in a dump and `2`
  when already parsed; anything that is not a finite number is `null`, which
  means "this row says nothing".

`mapDiy` now calls `diyLayoutField` where it used to spell the two names out, so
`DiyMigrationReport.settings` and the `config_values` rows cannot come apart.

### What the report says

The two entries appear in `ConfigMigrationReport.mapped` with
`legacyKey: 'eb_diy.category'` / `'eb_diy.member'` — the table and
`template_name` they really came from, rather than an invented `menu_name`.
`read` still counts `eb_system_config` rows only, and its doc comment now says
so. `groupsWithoutLegacyValues` stops listing `diy` for a shop that had the
rows. No value is printed anywhere; the markers are `<set>` / `<empty>` as
before.

### `etl verify` counts them

A second expectation on `config_values`, which needed one new field on
`CountExpectation`:

|        |                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------- |
| source | `eb_diy where template_name in ('category', 'member')`                                          |
| target | `config_values where "group" = 'diy'` (new `targetWhere`, via `Target.countWhere`)              |
| mode   | `atMost` — a row whose `value` is not a number says nothing and is left to the schema's default |

The check's `name` now carries the `targetWhere`
(`rows:config_values where "group" = 'diy'`), so two expectations on one table
read as two checks rather than a restatement.

### Idempotency (ETL-J-001)

Unchanged and still proved the same way: `run` twice, dump every table, compare
values. The two rows are ordinary `config_values` rows written by the group that
owns the table, with `updated_at = migratedAt` like every other one.
`runner.int.test.ts::跑第二遍得到逐字节相同的数据库` is green with them in.

### Fixture

`packages/etl/test/fixtures/legacy-mini.sql` gained the two `eb_diy` rows it
was missing (`#4 category = '2'`, `#5 member = '3'`), since the runner int test
has to assert them after a real run. That file is `packages/etl`'s own synthetic
fixture — outside `src/`, so worth naming here: nothing else in the tree reads
it, and `eb_diy` had `AUTO_INCREMENT=6` already. The diy group is unaffected
(both are `template_name` rows, so they were already "settings, not pages"), and
`verify`'s existing `eb_diy → diy_pages` `atMost` check still holds at 5 → 2.

### Tests added

| File                                                                       | Tests                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/etl/src/config.test.ts::版式 rows out of eb_diy`                 | 7, against the **real** `diy` group from the live registry rather than a throwaway one — half of what is being tested is that the legacy number satisfies the schema the admin screen validates against (CR-3-h2 §3 called these booleans; they are 1/2/3)  |
| `packages/etl/src/mappers/diy.test.ts`                                     | 2 — `diyLayoutField` names both fields and only those two; `settingNumber` reads `'2'`, `2`, `''`, `null` and a page payload the way `config.ts` needs                                                                                                      |
| `packages/etl/src/runner.int.test.ts::分类页 / 个人中心 的版式跟着迁过来…` | 1 — after a real run: both rows present with the fixture's values, `jsonb_typeof = number` (not the string `"2"`), and `config_values` still holds the `order` and `catalog` groups' settings, which is what would break if a second group owned this table |

The config unit tests cover: both rows out of a longtext column; only the row
that exists (the other is left to its default, never stored as one); a row that
says nothing and the two `template_name`s with no new home; the schema refusing
a layout number stopping the run; `--allow-invalid-config` dropping just that
field; and mapping twice giving identical rows.

### For the orchestrator

- **`invariants.md` has no row for the DIY settings migration.** The closest is
  **ETL-J-009** ("every legacy config key is accounted for"), which is about
  `eb_system_config` keys and does not cover a setting that never lived there.
  If a row is wanted, the statement is "the 版式 numbers a shop picked in the
  legacy editor survive the migration; nothing in the registry re-picks a
  default silently", and the test ids are
  `packages/etl/src/config.test.ts::版式 rows out of eb_diy > carries both numbers into config_values, out of a longtext column`
  and
  `packages/etl/src/runner.int.test.ts::etl run + verify > 分类页 / 个人中心 的版式跟着迁过来，运营不用重挑一次`.
  Not edited here: the ledger is the orchestrator's.
- `docs/rewrite/status/f4.md` was **not** touched (F4's file). Its first "Left
  for somebody else" bullet is now done; it proposes a `config_values` target on
  the `diy` group, which is the shape this stream had to reject — the reason is
  under "Where the rows are written from" above.

---

## Verification

From `next/`:

| Command                                             | Result                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm turbo run gen typecheck lint test:unit build` | green — 33 tasks                                                             |
| `pnpm --filter @shop/core test:int`                 | green — 55 files, 1131 tests                                                 |
| `pnpm --filter @shop/etl test:unit`                 | green — 22 files, 382 tests                                                  |
| `pnpm --filter @shop/etl test:int`                  | green — 10 tests                                                             |
| `pnpm --filter @shop/web test:int`                  | **1 failing** — `user.int.test.ts`, the `null` assertion above; 230/231 pass |
| `pnpm exec prettier --check .`                      | green                                                                        |
| `pnpm guards`                                       | 10 checks, 0 failures (73 pending on H3, I, K — pre-existing)                |

`pnpm turbo run …` failed once at full concurrency with `@shop/guards#typecheck`
exiting 1 and four sibling tasks cancelled; it is green at `--concurrency=4` and
`pnpm --filter @shop/guards typecheck` is green on its own. Resource contention
on this machine, not a real failure.
