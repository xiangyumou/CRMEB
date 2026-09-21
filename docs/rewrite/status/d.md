# Stream D — Group buy and presale

Branch `rewrite/ws-d-marketing`, worktree `../CRMEB-wt/ws-d`.
Domains `groupbuy` and `presale`. Nothing pushed.

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

## Change requests filed

| CR     | About                                                                                       | Status |
| ------ | ------------------------------------------------------------------------------------------- | ------ |
| CR-1-d | The pricing pipeline never sees `kind` / `kindMeta`, so an activity price cannot be applied | open   |
| CR-2-d | `groupbuy_activities` has no per-activity 虚拟成团 column                                   | open   |
| CR-3-d | The refund domain has no system-initiated refund entry point for a failed group             | open   |

## New dependencies

**None.** `next/pnpm-lock.yaml` is untouched.

## Progress

- [x] Contracts (26 routes), `check:examples` green
- [ ] Core domains, repos, services, ports
- [ ] Route files
- [ ] Jobs
- [ ] Admin pages and menu
- [ ] ETL mappers
- [ ] Invariants rows
