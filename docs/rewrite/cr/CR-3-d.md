# CR-3-d — the refund domain has no system-initiated refund entry point

**Stream:** D (group buy and presale) **Status:** open
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

## Until then

`core/src/groupbuy/groupbuy.effects.ts` declares an `AutoRefundPort`:

```ts
export interface AutoRefundPort {
  refund(
    tx: Tx,
    ctx: Ctx,
    input: { orderId: number; reason: "groupbuy_failed"; note?: string },
  ): Promise<void>;
}
export function registerAutoRefundPort(port: AutoRefundPort): void;
```

A failing group records one effect per paid member —
`scope: 'order'`, `scope_id: String(orderId)`,
`event_type: 'groupbuy.refund'` — inside the transaction that fails the group,
which is `UNIQUE (scope, scope_id, event_type)` and therefore exactly-once
however many sweeps run. The handler calls the registered port; with **no port
registered it throws a `DomainError` with a message naming the order**, so the
row parks in stream C's 待处理任务 console
(`GET /admin-api/payment-effects`, which filters `scope in
('payment','refund','order')`) and an operator refunds it by hand. Nothing is
lost and nothing is silently skipped.

When C exports the entry point, `registerGroupbuyDomain()` registers a one-line
port that forwards to it and the local interface is deleted.

Pinned by `groupbuy.concurrency.int.test.ts::expiry racing the last join >
records exactly one refund effect per paid member` and
`groupbuy.int.test.ts::the failure sweep > parks the refund effect when no
AutoRefundPort is registered`.
