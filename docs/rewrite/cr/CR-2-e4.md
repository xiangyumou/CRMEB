# CR-2-e4 — 累计订单 / 累计消费 on the staff 用户 screen needs a port nobody implements yet

- **Stream:** E4 (user & WeChat follow-up)
- **Status:** **RESOLVED** by W4T — `registerOrderDomain()` registers the port, `orderRepo.statsForUsers` is the query
- **Affects:** `next/packages/core/src/user/user-order-stats.port.ts` (E4, done), `next/packages/core/src/order/index.ts` (B/B2/B3, one call)

## What the screen asks for

CR-2-h2 §3's decision list for `/api/v1/staff/users` includes **order count**
and **spend total**: the two numbers a 店员 glances at before deciding whether
the customer in front of them gets the 老客 treatment. Everything else on that
screen — nickname, avatar, masked phone, groups, labels, status, registration
date — is the user domain's own data. These two are not.

## Why E4 did not just write the join

`user.repo.ts` may not touch the order tables, and here the boundary is
load-bearing rather than procedural. "How many orders has this customer
placed" is not a `count(*)`: a 待付款 order does not count, a fully refunded
one does not, a 拼团 that never 成团 does not, and each of those rules lives in
the order aggregate and has moved at least once during this rewrite. A join
written from the user side would be a second definition of 消费总额 that nobody
would think to update, and the first anyone would hear of the drift is a
customer arguing with a 店员 about their own spend.

## What E4 built

`packages/core/src/user/user-order-stats.port.ts` — declared by the consumer,
in the same shape as the ports `order/ports.ts` already publishes:

```ts
export interface UserOrderStats {
  orderCount: number; // paid, not fully refunded
  spendTotal: string; // Money's spelling: "3980.00"
}

export interface UserOrderStatsPort {
  statsFor(
    db: DbOrTx,
    userIds: readonly number[],
  ): Promise<Map<number, UserOrderStats>>;
}

registerUserOrderStatsPort(impl); // exported from `@shop/core/user`
```

Batched, because the list route asks about twenty customers at once. A user
absent from the returned map means "no qualifying orders" and the service reads
that as `0` / `"0.00"`.

Until something registers an implementation, `getUserOrderStatsPort()` is
`undefined` and both fields on the staff contract answer **`null`** — which the
contract documents as "not known, render 「--」". That is deliberately neither
of the other two options: a 500 would take down the whole 用户 screen over two
decorative numbers, and a hard `0` would tell a 店员 that a customer with forty
orders is a first-time buyer. It is pinned by
`user-staff.int.test.ts::answers null, not zero, while no stream has registered
the port` and, over HTTP, by `apps/web/app/api/v1/user.int.test.ts::lets a 店员
through all six and never unmasks a phone`.

## The ask

One registration in the order domain, next to the `installStaffCheck()` that
`registerOrderDomain()` already calls — the same stream owns both, and for the
same reason: the staff console is built out of facts only the order aggregate
can state.

```ts
// core/src/order/index.ts, inside registerOrderDomain()
registerUserOrderStatsPort({
  statsFor: (db, userIds) => orderRepo.statsForUsers(db, userIds),
});
```

with `statsForUsers` grouping `orders` by `user_id` over whatever the aggregate
currently calls "counts": paid-or-beyond, minus fully refunded, summing the
same column `adminStatistics` sums so the 店员's number and the console's
number cannot disagree. E4 has no opinion on the query, only on where it lives.

Nothing breaks while this is open; the two fields stay `null`.

## Resolution (W4T)

`registerOrderDomain()` now registers the port, exactly as asked. The rule is
written down once, on `order.repo.ts::statsForUsers`:

> a **paid order** as `stats/DEFINITIONS.md` §2 defines one — `paid_at is not
null and deleted_at is null` — **minus** `refund_status = 'refunded'`;
> `orderCount = count(*)`, `spendTotal = sum(orders.paid_amount)`.

`paid_amount` is the same column the console's 营业额 sums
(`order.console.service.ts::adminStatistics` → `order.fulfil.repo.ts::rangeTotals`,
`stats/DEFINITIONS.md` §3 `revenue`), which is what the CR asked for. Two
consequences worth stating, because both are decisions rather than accidents:

- a **partially** refunded order counts, at what the gateway took, not net of
  the refund. Netting it here would be a third definition of 消费总额 — the
  drift this CR exists to prevent — and the console already reports refunds as
  their own figure, on the day the money moved;
- a **fully** refunded order is out of the population entirely, so it
  contributes neither a count nor an amount. That is the case a 店员 would
  actually notice, and it is the clause this figure adds to the shared "paid
  order" definition.

An admin-deleted order is out (it is out of every figure); an order the buyer
hid from their own list is in (删除订单 is visibility only, CR-4-h §6).

Pinned by `order/order.user-stats.int.test.ts`. The user-side `null` behaviour
is unchanged and still pinned by
`user/user-staff.int.test.ts::answers null, not zero, while no stream has
registered the port`, which resets the registry itself. The HTTP test
`apps/web/app/api/v1/user.int.test.ts::lets a 店员 through all six and never
unmasks a phone` imports `@shop/core/order`, so its `null` assertion now reads
`{ orderCount: 0, spendTotal: '0.00' }` — see `docs/rewrite/status/w4t.md`.
