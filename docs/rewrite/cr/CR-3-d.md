# CR-3-d — the refund domain has no system-initiated refund entry point

**Stream:** D (group buy and presale) **Status:** done — `refundSystemInitiated(tx, ctx, input)` lives in `core/src/refund/refund.system.service.ts` and is exported from the refund index; the group-buy effect handler forwards to it by default. D2's presale expiry calls the same function with `reason: 'presale_expired'`
**Files:** `next/packages/core/src/refund/index.ts`, `refund.service.ts` (stream C)

## What

When a group fails — the expiry sweep finds a `forming` group past
`expires_at` and virtual fill is off — every member who already paid has to get
their money back. The brief says so:

> Expiry job …: fill virtually if allowed, else fail the group and **request
> refunds for paid members through stream C's public API**.

There is no such API. `core/src/refund/index.ts` says it in so many words:

> There is deliberately no "create a refund on behalf of a user" export. A
> group-buy that fails (`is_automatic`) is a future caller and will get its own
> entry point with its own ceiling check; nothing may insert a `refunds` row by
> reaching past this file.

What is exported is `apply(ctx, input)` — the shopper's own request, which needs
a `ctx` whose actor is that shopper, produces a `requested` refund that an
operator still has to approve, and enforces the after-sale window. A failed
group is none of those things: nobody applied, nobody should have to approve,
and the after-sale window is irrelevant because the goods were never shipped.

## Ask

An export on the refund domain along the lines of

```ts
/**
 * A refund the shop owes without anybody asking: a failed group buy, an
 * expired presale. Full amount, every unshipped line, no approval step.
 * Idempotent per (orderId, reason) — the caller is the effects ledger.
 */
export async function refundSystemInitiated(
  tx: Tx,
  ctx: Ctx,
  input: {
    orderId: number;
    reason: "groupbuy_failed" | "presale_expired";
    note?: string;
  },
): Promise<{ refundId: number; created: boolean }>;
```

taking `(tx, ctx, input)` like every other cross-domain entry point, applying
C's own cumulative ceiling check, and settling the order through the same
`onOrderRefunded` path an operator-approved refund uses.

## As built

Exactly the signature above, in a **new file** — `refund.system.service.ts`,
with its one extra query in `refund.system.repo.ts` — rather than a function
added to `refund.service.ts`, which another stream is editing. The refund
index gained one export line. Nothing in `refund.service.ts` or
`refund.repo.ts` was touched.

```ts
export async function refundSystemInitiated(
  tx: Tx,
  ctx: Ctx,
  input: {
    orderId: number;
    reason: "groupbuy_failed" | "presale_expired";
    note?: string;
  },
): Promise<{ refundId: number; created: boolean }>;
```

What it does, in the caller's transaction: locks the order, refuses one that
is missing or never collected anything, and answers a caller whose refund
already exists with its id and `created: false`. Otherwise it takes every
_unshipped_ line's remaining units at `lineRefundAmount`, adds the freight when
nothing shipped at all, caps the total at C's cumulative ceiling (spreading the
cap over the lines so `refunds.amount` and its `refund_items` still agree),
inserts the refund **straight to `approved`** with `is_automatic` and a null
`reviewed_by_admin_id`, raises `refunded_quantity` on each line so the
warehouse cannot ship what is being refunded, and records the ordinary
`refund.execute` effect. The gateway call, the capital flow, the restock and
`onOrderRefunded` are then the same path an operator's 同意 takes.

Idempotency is per `(orderId, reason)`, decided by a lookup under the order's
own row lock rather than by trusting the caller's ledger — the frozen schema
has no reason-key column, so the customer-facing reason string carries it
(`拼团未成团，系统自动退款` / `预售未成行，系统自动退款`). The partial unique
index `refund_items(order_item_id) WHERE is_open` is the backstop, and a
buyer's own open request on a line wins: the shop stands aside with
`REFUND_ALREADY_OPEN`.

`groupbuy.effects.ts` keeps the `AutoRefundPort` seam, now defaulted to this
function; the "no port registered" throw is gone. Registering anything else is
a test substituting a spy.

Invariants: REFUND-010 … REFUND-013. Tests:
`refund/refund.system.int.test.ts` (eleven cases, including six callers
released together on one order) and `groupbuy.int.test.ts::the CR-3-d system
refund`.
