# Stream D — Group buy

Branch `rewrite/ws-d-marketing`, worktree `../CRMEB-wt/ws-d`.
Domain `groupbuy`. Nothing pushed.

## Scope change: presale is stream D2

The orchestrator split `presale` out into stream D2 (branch
`rewrite/ws-d2-presale`, cut from commit `8cd2936d`). From that point this
stream owns **`groupbuy` only** — core, routes, admin pages, jobs, the ETL
mapper, the invariants rows and this file.

**There is no presale work to hand over.** Nothing under `core/src/presale`,
`app/**/presale-*`, `app/admin/(shell)/presale`, or a `presale.*` worker job was
ever written on this branch; the last presale commit is the contract one, which
was merged into `rewrite/integration` before the split, so D2 has everything it
needs from `origin/rewrite/integration` and needs to cherry-pick nothing from
here.

What is left below that still says "presale" is history: the contract tables,
the decisions that were taken while both domains were one stream, and the
invariants rows whose presale halves are now D2's. They are kept because D2's
brief points at them.

## Contracts ready

`packages/contracts/src/groupbuy/` and `packages/contracts/src/presale/` are
committed and green. **26 routes, 34 examples**:

```
$ pnpm --filter @shop/contracts gen
contracts: aggregated 31 contract file(s), 12 error file(s)
contracts: wrote openapi.json (257 route(s), 205 path(s))
$ pnpm --filter @shop/contracts check:examples
contracts: 257 route(s) OK, every example parses.
$ pnpm --filter @shop/contracts typecheck   [exit 0]
$ pnpm --filter @shop/contracts lint        [exit 0]
```

Files: `groupbuy/{schemas,errors}.ts`, `groupbuy/groupbuy.admin.contract.ts`
(10 routes), `groupbuy/groupbuy.storefront.contract.ts` (7),
`presale/{schemas,errors}.ts`, `presale/presale.admin.contract.ts` (7),
`presale/presale.storefront.contract.ts` (2).

### Admin surface

| Route id                          | Method | Path                                        | Permission                 |
| --------------------------------- | ------ | ------------------------------------------- | -------------------------- |
| `groupbuy.adminActivityList`      | GET    | `/admin-api/groupbuy-activities`            | `groupbuy:activity:read`   |
| `groupbuy.adminActivityDetail`    | GET    | `/admin-api/groupbuy-activities/:id`        | `groupbuy:activity:read`   |
| `groupbuy.adminActivityCreate`    | POST   | `/admin-api/groupbuy-activities`            | `groupbuy:activity:write`  |
| `groupbuy.adminActivityUpdate`    | PUT    | `/admin-api/groupbuy-activities/:id`        | `groupbuy:activity:write`  |
| `groupbuy.adminActivitySetStatus` | POST   | `/admin-api/groupbuy-activities/:id/status` | `groupbuy:activity:write`  |
| `groupbuy.adminActivityDelete`    | DELETE | `/admin-api/groupbuy-activities/:id`        | `groupbuy:activity:delete` |
| `groupbuy.adminActivityOrders`    | GET    | `/admin-api/groupbuy-activities/:id/orders` | `groupbuy:group:read`      |
| `groupbuy.adminStatistics`        | GET    | `/admin-api/groupbuy-statistics`            | `groupbuy:activity:read`   |
| `groupbuy.adminGroupList`         | GET    | `/admin-api/groupbuy-groups`                | `groupbuy:group:read`      |
| `groupbuy.adminGroupDetail`       | GET    | `/admin-api/groupbuy-groups/:id`            | `groupbuy:group:read`      |
| `groupbuy.adminGroupComplete`     | POST   | `/admin-api/groupbuy-groups/:id/completion` | `groupbuy:group:complete`  |
| `presale.adminActivityList`       | GET    | `/admin-api/presale-activities`             | `presale:activity:read`    |
| `presale.adminActivityDetail`     | GET    | `/admin-api/presale-activities/:id`         | `presale:activity:read`    |
| `presale.adminActivityCreate`     | POST   | `/admin-api/presale-activities`             | `presale:activity:write`   |
| `presale.adminActivityUpdate`     | PUT    | `/admin-api/presale-activities/:id`         | `presale:activity:write`   |
| `presale.adminActivitySetStatus`  | POST   | `/admin-api/presale-activities/:id/status`  | `presale:activity:write`   |
| `presale.adminActivityDelete`     | DELETE | `/admin-api/presale-activities/:id`         | `presale:activity:delete`  |
| `presale.adminOrderList`          | GET    | `/admin-api/presale-orders`                 | `presale:order:read`       |

### Storefront surface

| Route id               | Method | Path                                     | Auth          |
| ---------------------- | ------ | ---------------------------------------- | ------------- |
| `groupbuy.list`        | GET    | `/api/v1/groupbuy/activities`            | public        |
| `groupbuy.banners`     | GET    | `/api/v1/groupbuy/banners`               | public        |
| `groupbuy.detail`      | GET    | `/api/v1/groupbuy/activities/:id`        | user-optional |
| `groupbuy.openGroups`  | GET    | `/api/v1/groupbuy/activities/:id/groups` | public        |
| `groupbuy.groupDetail` | GET    | `/api/v1/groupbuy/groups/:id`            | user-optional |
| `groupbuy.withdraw`    | POST   | `/api/v1/groupbuy/groups/:id/withdrawal` | user          |
| `groupbuy.myGroups`    | GET    | `/api/v1/groupbuy/my-groups`             | user          |
| `groupbuy.poster`      | GET    | `/api/v1/groupbuy/groups/:id/poster`     | user          |
| `presale.list`         | GET    | `/api/v1/presale/activities`             | public        |
| `presale.detail`       | GET    | `/api/v1/presale/activities/:id`         | public        |

Resource segments this stream claims: on the admin surface
`groupbuy-activities/**`, `groupbuy-groups/**`, `groupbuy-statistics`,
`presale-activities/**` and `presale-orders`; on the storefront surface
`groupbuy/**` and `presale/**`. No method+path collides with another stream —
the contracts gate proves it.

### What the storefront adapter (H) and the admin streams must know

1. **There is no "join a group" endpoint and no "buy a presale" endpoint.**
   Both are orders. The client calls B1's `POST /api/v1/orders` with
   `kind: 'groupbuy' | 'presale'` and `kindMeta`:

   ```jsonc
   { "kind": "groupbuy", "kindMeta": { "activityId": "1" } }            // open a new team
   { "kind": "groupbuy", "kindMeta": { "activityId": "1", "groupId": "501" } }  // join one
   { "kind": "presale",  "kindMeta": { "activityId": "2" } }
   ```

   `POST /api/v1/checkout/preview` takes the same two fields. A second checkout
   path would be a second copy of stock, coupons, freight and idempotency.

2. **The seat is taken when the order is paid, not when it is placed.** A
   `forming` group with `seatsTaken: 0` is a team whose leader has not paid yet.
   `groupbuy.groupDetail.members` lists paid, unrefunded members only.
3. **Posters are data.** `groupbuy.poster` returns the fields and a `qrPayload`
   string; the client draws the image. The server never renders a PNG.
4. **Presale is full payment only.** `paymentMode: 'deposit'` is refused with
   `PRESALE_DEPOSIT_NOT_SUPPORTED`; the deposit columns exist in the schema and
   are inert (SCHEMA.md §6.3).
5. **`groupbuy.withdraw` is legacy `combination/remove`** — the leader
   abandoning a team nobody has paid into. It is not a cancel: cancelling the
   _order_ is B1's `POST /api/v1/orders/:id/cancel`, and that unwinds the
   membership through `onOrderCancelled`.

## Decisions

Recorded rather than asked, per the brief.

1. **URL segments are `groupbuy-*` / `presale-*`, not `combination` /
   `advance`.** The legacy words are transliterations of nothing and the URL is
   what an operator's browser history shows.
2. **虚拟成团 is a shop-wide config toggle, not a per-activity column.** The
   brief asks for a per-activity virtual-fill switch; the frozen
   `groupbuy_activities` has no column for it and the schema is frozen. It is
   `groupbuy.virtualFillOnExpiry` in the `groupbuy` config group, plus the
   manual 立即成团 button which is separately permissioned. Filed as **CR-2-d**.
3. **Group-buy "per-user limit" is `perOrderQuantity`.** The frozen schema has
   `per_order_quantity` and `total_quota` and no per-user counter;
   `groupbuy_members_group_user_uq` already makes one shopper one seat per team.
   A hard per-user lifetime cap would need its own counter row and a conditional
   update (B1 says the same about its own purchase limits).
4. **An activity's price reaches the order through a `PricingContributor`, and
   the `OrderKindHandler` refuses the order if it did not.** B1's `buildDraft`
   passes only `{ couponId }` into the pricing `selections`, so a contributor
   cannot see `kindMeta` and cannot know which activity is being bought
   (**CR-1-d**). Until that lands, `beforeCreate` recomputes the goods total
   from the activity and throws `GROUPBUY_PRICE_NOT_APPLIED` /
   `PRESALE_PRICE_NOT_APPLIED` when it disagrees. Failing closed beats selling
   at the wrong price.
5. **The activity stock layers move in the `OrderKindHandler` and the order
   hooks, not in a second `StockPort`.** There is one `StockPort` slot and
   stream A owns it; wrapping it would make the merge order load-bearing.
   `afterCreate` reserves the activity counters in B1's transaction, right
   beside A's SKU reservation, and `onOrderCancelled` / `onOrderRefunded`
   release them. This is what invariants QUEUE-008 and REFUND-002 already say
   ("presale restores its ledgers from `onOrderCancelled` / `onOrderRefunded`").
6. **`presale_stock_ledger` records four deltas but applies two.** The activity
   and activity-SKU deltas are this domain's and are applied here; the product
   and product-SKU deltas are what stream A's `StockPort` applied in the same
   transaction, recorded for the exact restore REFUND-002 asks for. The tests
   assert all four counters return to their starting values.
7. **A failed group asks for its members' refunds through an effect, not a
   direct call.** `core/src/refund/index.ts` says in so many words that there is
   deliberately no "create a refund on behalf of a user" export and that a failed
   group buy "is a future caller". So the group-buy domain records an effect
   (`groupbuy.refund`) and an `AutoRefundPort` executes it; with no port
   registered the effect parks for a human in C's 待处理任务 console. Filed as
   **CR-3-d**.
8. **Every notification is an effect, always.** Legacy ran group notifications
   inside the pink transaction unless `deferEffects` was passed
   (`StorePinkServices::pinkComplete`). Here `onOrderPaid` and the expiry job
   only ever call `recordEffect`.

### Decisions taken while building (the races found two of them)

9. **The quota ceiling is enforced where `sales` moves, not at checkout.**
   `total_quota` is a lifetime ceiling on units _sold_, and `sales` only moves on
   payment. Checking it at reservation time let N unpaid orders through a quota
   of 1: six simultaneous checkouts against a quota of 2 all passed, and all six
   later paid. The check now lives inside `commitActivitySales`, the one
   statement that increments `sales`; a payment that loses it gives its seat back
   and takes the existing refund path with reason `quota_reached`. Stock is still
   taken at reservation. (Found by
   `the activity ledgers > never oversell the quota either`.)
10. **One lock order everywhere: the team row first, the membership under it.**
    Two members refunding at once deadlocked — one path held the group row and
    wanted the membership, the other the reverse. `handleCancelled` and
    `handleRefunded` now lock the team row first and re-read the membership under
    it. `settleDeparture` takes the seat count read _before_ the seat was freed,
    so a team emptied by a refund settles as `failed` rather than `cancelled`.
    (Found by `leadership > survives two members refunding at once`.)
11. **The expiry clock is a delayed effect, not a delayed BullMQ job.** A job
    enqueued inside B1's order transaction is a message that survives a rollback
    and a timer that vanishes on a Redis flush. `afterCreate` records a
    `groupbuy.expire` effect with `delayMs = groupTtlSeconds * 1000`; it commits
    with the order or not at all. `groupbuy.sweepExpiredGroups` stays as the
    backstop for a parked effect or a stopped runner, and is safe to run twice.
12. **A member who refunds keeps their row, marked `refunded`.** Legacy deleted
    the participation row, which is why a failed team's history was
    unrecoverable and 团长 could appear to be somebody else. Leadership is
    recomputed to the earliest remaining paid member.
13. **The admin edit form reads the activity before it writes it back.** The
    list row does not carry the per-SKU rows, and a form seeded from it would
    send `skus: []` and wipe every group price. `EditActivityModal` mounts only
    once `groupbuy.adminActivityDetail` has answered.
14. **拼团有效时长 is typed in seconds in the admin form.** `ZodForm` runs the
    contract's own schema in the browser, so an hours field would fail
    `min(60)` before anything could multiply it. The help text carries the
    arithmetic (`86400 = 24 小时`).

15. **The CR-1-d price guard belongs in `afterCreate`, not `beforeCreate`.**
    `PricingDraft.goodsTotal` is documented as the sum of the line _subtotals_,
    i.e. the price before any adjustment, and B1 books the 拼团价 as an
    adjustment rather than rewriting the unit price. Comparing the activity
    total with it therefore refused every correctly priced group-buy order once
    CR-1-d landed — which the new end-to-end test found. The check now runs in
    `afterCreate`, inside B1's transaction, against `sum(order_items.total_amount)`
    — the money the order actually charges. A mismatch still rolls back the
    order, its lines and the stock reservation. Charging _less_ is allowed, so a
    coupon stacked on a group buy is not refused.
16. **The system refund is a new file, and its idempotency key is the reason
    string.** `refundSystemInitiated` went into `refund/refund.system.service.ts`
    rather than into `refund.service.ts`, which another stream is editing; the
    two things it would have shared are three lines each over the pure helpers in
    `refund.rules.ts`. The frozen schema has no "which automatic process opened
    this" column, so the customer-facing reason string carries it and the
    idempotency lookup matches on it exactly, under the order's own row lock,
    with `refund_items_open_uq` as the backstop. It writes straight to
    `approved` with a null `reviewed_by_admin_id`, because `executeRefund` only
    claims rows past review and no admin decided this.
17. **A failed team's refunds are one transaction per member.** The effect
    handler opens the transaction, not the sweep: a team of five that fails is
    five refunds, and one bad order must not roll back the other four. A throw
    still parks the row in the 待处理任务 console for a person.

## Change requests filed

| CR     | About                                                                                       | Status                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| CR-1-d | The pricing pipeline never sees `kind` / `kindMeta`, so an activity price cannot be applied | done — applied on integration; this stream added the end-to-end checkout tests and moved the guard (decision 15) |
| CR-2-d | `groupbuy_activities` has no per-activity 虚拟成团 column                                   | closed — shop-wide, as recommended; nothing to change                                                            |
| CR-3-d | The refund domain has no system-initiated refund entry point for a failed group             | done — `refundSystemInitiated` built by this stream (decision 16)                                                |

## New dependencies

**None.** `next/pnpm-lock.yaml` is untouched.

## Files outside this stream's ownership

All merged. `packages/core/src/system/config-groups.ts` no longer exists —
integration generates `config-groups.gen.ts` and `domains.gen.ts` instead, and
the generated bucket already imports `./groupbuy/index`, so nothing has to be
edited by hand any more. `packages/etl/src/index.ts` carries
`export * as groupbuy from './mappers/groupbuy';`.

The CR-3-d follow-up added three files to a folder this stream does not own,
`packages/core/src/refund/`:

| File                        | Why                                                                          |
| --------------------------- | ---------------------------------------------------------------------------- |
| `refund.system.service.ts`  | the new entry point (CR-3-d, accepted; the orchestrator asked D to build it) |
| `refund.system.repo.ts`     | its one query — a `*.repo.ts` so the Drizzle boundary rule holds             |
| `refund.system.int.test.ts` | its tests                                                                    |

plus **one export line** in `refund/index.ts` and its header paragraph.
`refund.service.ts` and `refund.repo.ts` are untouched: stream N1 is editing the
first for notification calls, and a new file merges where an insertion into a
thousand-line one does not.

## Progress

- [x] Contracts (26 routes), `check:examples` green
- [x] Core domain: repo, rules, service, order seams, effects, config, permissions
- [x] Integration tests on real PostgreSQL (`groupbuy.int.test.ts`)
- [x] Concurrency tests, one per conditional state change
      (`groupbuy.concurrency.int.test.ts`) — the last seat, the two activity
      ledgers and their rollback, pay-vs-expiry, leader-refund-vs-join, one
      shopper two clicks
- [x] Route files (11 admin + 8 storefront) and the HTTP slice test
- [x] Jobs: `groupbuy.sweepExpiredGroups` (backstop; the per-team clock is an
      effect)
- [x] Admin pages and menu: 拼团活动 / 拼团列表 / 拼团统计, `groupbuy.menu.ts`,
      component tests for the first two
- [x] ETL mapper `eb_store_combination` → activities + activity SKUs, with tests
      (`eb_store_pink` deliberately not migrated)
- [x] Invariants rows: STOCK-004 and REFUND-003 group-buy halves, and a new
      「Group buys (risk matrix §5)」 section, RISK-D-001 … RISK-D-008
- [x] CR follow-ups: CR-1-d end-to-end checkout tests + the guard moved to
      `afterCreate`; CR-3-d `refundSystemInitiated` and the group-buy effect
      wired to it; invariants REFUND-010 … REFUND-013 and RISK-D-009
- [ ] Presale — **not this stream's any more**; stream D2 owns it, including the
      presale halves of STOCK-004, QUEUE-008, REFUND-002, REFUND-003 and
      SMOKE-011
