# CR-2-e4 — 累计订单 / 累计消费 on the staff 用户 screen needs a port nobody implements yet

- **Stream:** E4 (user & WeChat follow-up)
- **Status:** open — the seam is in, the implementation is the order stream's
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
  orderCount: number;   // paid, not fully refunded
  spendTotal: string;   // Money's spelling: "3980.00"
}

export interface UserOrderStatsPort {
  statsFor(db: DbOrTx, userIds: readonly number[]): Promise<Map<number, UserOrderStats>>;
}

registerUserOrderStatsPort(impl)   // exported from `@shop/core/user`
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
