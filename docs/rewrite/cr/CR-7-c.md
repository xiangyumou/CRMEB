# CR-7-c — `cancelOrder` never closes the payment, so any order with an open attempt cannot be cancelled

**Stream** C · **Target** `next/packages/core/src/order/order.cancel.service.ts` (B1-owned) · **Severity** high, user-visible

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
