# CR-6-f1 — two streams claimed `group: 'order'`; the settings index now shows two order screens

**Status (R5 sweep, 2026-09-23): RESOLVED** — option 1: `trade.config.ts` is deleted and its keys folded into `order.config` / `order.fulfil.config` (B3, `41883680c`). The status line below is kept as history.

- **Stream:** F1 (system & storage)
- **Status:** resolved locally in F1's favour-of-B1; a product decision is wanted
- **Affects:** `next/packages/core/src/order/order.config.ts` (B1),
  `next/packages/core/src/system/trade.config.ts` (F1)

## What happened

The F1 brief assigns this stream the `order` config group ("auto-cancel
minutes, auto-receive days, auto-review days, stock warning, free-shipping
threshold, staff user ids for the mobile console"). B1's brief led it to
declare the same group name for the pay window and the sweep limit. Both landed;
`defineConfigGroup` throws on a duplicate group name, so after
`git merge rewrite/integration` the core package would not import at all.

F1 resolved it the way `CONVENTIONS.md` implies — the domain that owns the
behaviour owns the group:

- `order` (B1, `core/src/order/order.config.ts`): `payWindowMinutes`,
  `autoCancelSweepLimit`, legacy key `order_cancel_time`. Unchanged.
- `trade` (F1, `core/src/system/trade.config.ts`, 交易设置): auto-receive and
  auto-review timers, stock warning, free-shipping threshold, refund reasons and
  return address, the mobile console roster. F1's `autoCancelMinutes` was
  **deleted**, not renamed: it was the same setting as `payWindowMinutes`, and
  two fields writing one timer is worse than either name.

`core/src/system/config-groups.ts` now imports `../order/index` so the settings
index lists B1's group too.

## What needs deciding

The settings index shows 订单设置 and 交易设置 side by side. An operator looking
for "cancel unpaid orders after N minutes" has a 50% chance of opening the wrong
one. Three options, in the order F1 would pick them:

1. **Fold `trade` into `order`.** B1 takes ownership of
   `core/src/order/order.config.ts` as the single order group, absorbing the
   `trade` fields as sections (自动处理 / 阈值 / 售后 / 移动端订单台 — see CR-5-f1
   for the headings). One screen, one owner, and the after-sale fields sit next
   to the timer they interact with. Costs B1 one merge.
2. **Keep both, retitle.** `order` → 订单与支付, `trade` → 售后与阈值. Cheapest;
   still two screens.
3. **Move `trade` to B2.** The auto-receive/auto-review timers are fulfilment
   settings and B2 runs the jobs that read them. Leaves the thresholds and the
   console roster homeless.

F1 has no stake in the outcome beyond the ETL: the legacy keys are already
partitioned (`order_cancel_time` → B1's group, the other eleven → `trade`), and
`etl/src/mappers/system.ts` routes by whatever `legacyKeys` the registry
declares, so any of the three works without an ETL change.

## Note for every stream

Group names are global and collide at import time, not at review time. Before
declaring one, check `grep -rn "group: '" packages/core/src --include='*.config.ts'`.
