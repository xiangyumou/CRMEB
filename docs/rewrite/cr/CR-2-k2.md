# CR-2-k2: every paid and every refunded order parks an `unknown` effect row

**Stream:** K2 (hardening second pass) **Status:** RESOLVED (R2, option 1; commit in `docs/rewrite/status/r2.md`)
**Files:** `next/packages/core/src/payment/payment.service.ts` (~543, records `order.paid`), `next/packages/core/src/refund/refund.service.ts` (~716, records `order.refunded`)
**Pinned by:** `next/packages/core/src/order/order.sequence.int.test.ts`, `it.fails` "CR-2-k2 — every effect a paid and refunded order records is delivered"

## What

Settlement records `('order', <id>, 'order.paid')` in the payment transaction,
and a succeeded refund records `('order', <id>, 'order.refunded')`. The comments
say who reads them: "subscribe messages, printer, ERP" and "the buyer's
notification (E2) and anything B1 hangs off a finished order".

**No handler is registered for either event type.** The `order`-scope handlers
in the tree are `groupbuy.join`, `groupbuy.refund`, `presale.paid`,
`presale.released`, `presale.refund`, the virtual delivery, `order.received` and
`order.completed`. The notification domain hooks the in-transaction
`onOrderPaid` and `onOrderRefunded` instead of these rows.

So the dispatcher claims each row, finds no handler, retries it on backoff 8
times, and parks it as `unknown` ("no handler for order/order.paid"). Every paid
order in production would add one row to the operator's effects queue that no
action can clear, and every refund would add another.
`order.fulfil.effects.ts` explains why that is the wrong outcome for a missing
consumer: "parking one `unknown` effect row per shipment would give an operator
a queue of rows they cannot act on".

## Reproduction

The pinned test pays, applies and approves a refund, lets the fake gateway
report it refunded, and drains the effects twice. It expects no row with status
`unknown`. It gets two, `order.paid` and `order.refunded`.

## Asked for

One of:

- **register log-only handlers** for `order/order.paid` and `order/order.refunded`
  (the pattern `presale.effects.ts` uses for `presale.paid`), and leave them as
  the extension point the comments describe; or
- **stop recording them** if the in-transaction hooks are the whole design, and
  drop the comments that promise consumers.

Either way, flip the `it.fails` above to `it`. The first option is smaller and
keeps the ledger as an audit trail of the two events.

## Resolution (R2)

Option 1. `payment/payment.effects.ts` registers `('order', 'order.paid')` and
`refund/refund.effects.ts` registers `('order', 'order.refunded')`, both to a
logged no-op (the `presale.effects.ts` pattern), from the existing
`registerPaymentEffects()` / `registerRefundEffects()`. The rows stay as the
ledger's record and the extension point; a real consumer replaces the
registration. The pin `order.sequence.int.test.ts::CR-2-k2 — every effect a paid and refunded order records is delivered > leaves nothing parked for want of a handler`
is now `it`.

`refund.concurrency.int.test.ts::… > sends one refund however many effect dispatchers run`
counted `done === 1`; settling now also delivers `order.refunded`, so it asserts
that the dispatchers' `done` total equals the rows now `done` (no row finished
twice) and that `refund.execute` is one of them, once.

Note: the effect is keyed `('order', orderId, 'order.refunded')`, so an order's
second settled partial refund records no second row. Harmless while the
consumer is a log line; a real consumer should key by refund.
