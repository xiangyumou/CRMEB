# CR-7-c — `cancelOrder` never closes the payment, so any order with an open attempt cannot be cancelled

**Stream** C · **Target** `next/packages/core/src/order/order.cancel.service.ts` (B1-owned) · **Severity** high, user-visible · **Status** **applied** on `rewrite/ws-b1-checkout`

## What

`cancelOrder` asks the payment port whether cancelling is safe:

```ts
const state = await paymentState(ctx, tx, input.orderId);
if (state === "paid") throw new DomainError("ORDER_ALREADY_PAID");
if (state === "unknown") throw new DomainError("ORDER_PAYMENT_STATE_UNKNOWN");
```

`paymentState` calls `PaymentPort.ensureNoOpenAttempts`, which is deliberately
database-only. It runs inside the cancelling transaction with the order row
locked, so it must not talk to WeChat — holding a row lock for the length of a
gateway round trip is how a checkout table seizes up. Its contract, written on
the function:

> An open attempt therefore answers `unknown` rather than going to find out, and
> the caller is expected to have run `closeOrderPayments` (which _does_ talk to
> the gateway) beforehand.

Nothing calls `closeOrderPayments`. So the guard behaves as designed and the
caller does not hold up its half:

| order                                     | outcome                                   |
| ----------------------------------------- | ----------------------------------------- |
| never opened WeChat                       | `closed` → cancels                        |
| the buyer tapped 支付 once and backed out | `unknown` → `ORDER_PAYMENT_STATE_UNKNOWN` |

The second row is the common case. A buyer who opened the WeChat sheet and
changed their mind has an attempt in `pending`, and every route into
`cancelOrder` refuses them: the 取消订单 button, `autoCancel`, and
`sweepExpiredOrders` — which means expired orders with an open attempt are never
swept at all, and their stock stays reserved until a human notices.

The protocol is right. It is a two-call protocol and only one call is wired.

## Asked for

Close the payments before opening the transaction:

```ts
export async function cancelOrder(ctx: Ctx, input: CancelInput): Promise<CancelOutcome> {
  const port = resolvePaymentPort();
  if (port) {
    // Outside the transaction: this one talks to WeChat.
    const state = await port.closeOrderPayments(ctx, input.orderId);
    if (state === 'paid') throw new DomainError('ORDER_ALREADY_PAID');
    if (state === 'unknown') throw new DomainError('ORDER_PAYMENT_STATE_UNKNOWN');
  }

  const outcome = await ctx.withTx(async (tx) => { /* unchanged, guard included */ });
  ...
}
```

The in-transaction `ensureNoOpenAttempts` stays exactly as it is. It is the
re-check under the lock, and it is what makes the race safe: an attempt that
opens between the close and the lock is caught there.

This needs one addition to the `PaymentPort` interface in `order/ports.ts`:

```ts
export interface PaymentPort {
  ensureNoOpenAttempts(tx: Tx, orderId: number): Promise<PaymentState>;
  /** Closes every open attempt at the gateway. Call outside a transaction. */
  closeOrderPayments(ctx: Ctx, orderId: number): Promise<PaymentState>;
}
```

Stream C's `registerPaymentDomain()` will register both the moment the field
exists; `closeOrderPayments(ctx, orderId)` is already exported from
`core/src/payment` with that exact signature.

For `sweepExpiredOrders` the close is a gateway call per order, so the sweep
should keep its batch small or close in parallel with a modest cap — but the
alternative is a sweep that skips exactly the orders it exists for.

## Meanwhile

The behaviour is proved, not assumed: `payment.concurrency.int.test.ts`
(`QUEUE-003 — a callback racing an order cancel`) spells the two-call protocol
out in a local `cancelOrder` helper rather than calling B1's, precisely because
B1's would answer `blocked` for every order in the test.

In the worker, stream C's `closeExpiredPayments` job is scheduled to run before
the auto-cancel sweep. It closes the attempts of expired orders, which lets the
sweep that follows see `closed` and do its work. That is a scheduling
coincidence standing in for a function call: it fixes the sweep, and it does
nothing at all for the buyer pressing 取消订单.

## Applied

Accepted by the orchestrator and applied on `rewrite/ws-b1-checkout`, exactly
as asked.

- **`PaymentPort`** gained `closeOrderPayments(ctx, orderId): Promise<PaymentState>`
  ("closes every open attempt at the gateway; call outside a transaction"), and
  `registerPaymentDomain()` registers it — C's `closeOrderPayments` already had
  that signature, so the registration is one property.
- **`cancelOrder`** calls it before it opens the transaction and refuses on
  `paid` (`ORDER_ALREADY_PAID`) and `unknown` (`ORDER_PAYMENT_STATE_UNKNOWN`).
  The in-transaction `ensureNoOpenAttempts` re-check under the row lock is
  untouched: it is what catches an attempt that opens in between. `autoCancel`
  goes through `cancelOrder`, so it inherits both calls.
- **`sweepExpiredOrders`** runs its gateway closes five at a time
  (`SWEEP_CLOSE_CONCURRENCY`) and then cancels, one order at a time, only the
  orders whose close answered `closed`. An order whose close said `paid`,
  answered `unknown` or threw is counted in a new `skipped`, releases nothing
  and is retried next pass — one silent gateway cannot cost the other 199
  orders their sweep. The report is now `{ scanned, cancelled, skipped }`.
- **The two-call protocol is tested, not assumed**, in
  `packages/core/src/order/order.cancel.payment.int.test.ts`: 12 tests against
  real PostgreSQL, the real payment domain and the fake WeChat gateway, on real
  orders from B1's checkout so that "released" means stock and coupon that were
  genuinely taken. One of them asserts the gateway is asked exactly **once** per
  cancel, which is the standing proof that the re-check stayed database-only.
- **`payment.concurrency.int.test.ts`'s local `cancelOrder` helper is gone.**
  `QUEUE-003` and `TLS-006` now race B1's real `cancelOrder`; the wrapper that
  remains only turns its two `DomainError`s back into this file's `paid` /
  `blocked` vocabulary. All 21 tests stay green.
- `payment.closeExpiredPayments`' comment no longer claims the `:01` / `:03`
  schedule is standing in for a function call. The job keeps its place — it
  makes the payment side final for orders nobody is cancelling, and it means
  the sweep usually finds the attempts already closed and calls WeChat not at
  all.

Invariant rows `QUEUE-002`, `QUEUE-003`, `QUEUE-004`, `QUEUE-005` and
`QUEUE-009` cite the new tests; the first four no longer say "B1 half done".
