# CR-1-a — `StockPort.release` cannot tell a cancellation from a refund

**Stream:** A (catalog) **Status:** RESOLVED — accepted and extended by the orchestrator
**Files:** `next/packages/core/src/order/ports.ts` (frozen, orchestrator-owned)

## What

The frozen port is:

```ts
export interface StockPort {
  /** Returns the lines that could NOT be satisfied. Empty array means success. */
  reserve(tx: Tx, orderId: number, lines: readonly StockLine[]): Promise<StockLine[]>;
  release(tx: Tx, orderId: number, lines: readonly StockLine[]): Promise<void>;
  commit(tx: Tx, orderId: number, lines: readonly StockLine[]): Promise<void>;
}
```

Stream A implements it as three statements on `product_skus`:

| call      | statement                                                             |
| --------- | --------------------------------------------------------------------- |
| `reserve` | `UPDATE … SET stock = stock - n WHERE id = $1 AND stock >= n`          |
| `commit`  | `UPDATE … SET sales = sales + n WHERE id = $1`                        |
| `release` | `UPDATE … SET stock = stock + n WHERE id = $1`                        |

That split is deliberate: stock leaves the shelf the moment the order is
placed (so the last unit cannot be sold twice — risk-matrix §1), and `sales` is
a *sold* counter that must not move until money has changed hands.

The problem is that `release` is called from two places that need different
statements:

- **cancel / payment timeout** — `commit` never ran, so `sales` was never
  incremented. Restore stock only.
- **refund / return** — `commit` ran, so `sales` was incremented. Restore stock
  **and** decrement `sales`.

Nothing in the signature distinguishes them, and the port has no state of its
own to infer it from. Calling the current `release` on a refund leaves `sales`
permanently overstated: every dashboard, the 销量 column, the "热销" sort and the
storefront's 已售 label drift upwards by the refunded quantity and never come
back. This is exactly the drift legacy had, and legacy's answer —
`StoreProductServices::incStockDecSales` — is named in the brief under "Fix,
don't port" because it did the two halves as separate unguarded statements and
could push `sales` below zero.

## What stream A did

Implemented the port exactly as frozen, and exported one extra function from
`core/src/catalog/index.ts` for the refund path:

```ts
export async function releaseSold(
  tx: Tx,
  orderId: number,
  lines: readonly StockLine[],
): Promise<void>;
```

which runs, per line:

```sql
UPDATE product_skus
   SET stock = stock + $n,
       sales = greatest(0, sales - $n)
 WHERE id = $1
```

One statement, so the two counters cannot drift apart, and `greatest(0, …)`
rather than a bare subtraction because `product_skus_sales_non_negative` would
otherwise abort the whole refund transaction — an over-released counter is a
reporting inaccuracy, a failed refund is a customer without his money.

Idempotency is not the statement's job. The port doc says "every method is
idempotent per `orderId`", and the only mechanism available to a method whose
arguments are `(tx, orderId, lines)` — no `ctx`, so no clock — is the effects
ledger's `UNIQUE (scope, scope_id, event_type)`. Stream A therefore claims the
ledger key first (`scope = 'order'`, `scope_id = String(orderId)`,
`event_type = 'catalog.stock.commit' | 'catalog.stock.release'`, inserted with
`status = 'done'` so the dispatcher never picks it up) and returns without
touching stock when the insert changes no rows. Those two keys are already
declared in SCHEMA.md §4.5, which is what suggested the mechanism.

`releaseSold` claims `catalog.stock.release` too: a refund and a cancel of the
same order are mutually exclusive, so one key is correct and the second caller
is the one that must do nothing.

Stream C (refunds) therefore has to import `releaseSold` from
`@shop/core/catalog` directly instead of going through `getStockPort()`. That is
one import more than the design intends, and it is the reason for this CR.

## Ask

Either, in `order/ports.ts`:

```ts
release(tx: Tx, ctx: Ctx, lines: StockLine[], opts?: { committed?: boolean }): Promise<void>;
```

— `committed: true` from the refund path, absent or `false` from cancel — or add
a fourth method:

```ts
releaseSold(tx: Tx, ctx: Ctx, lines: StockLine[]): Promise<void>;
```

The optional-argument form is preferable: it is backward compatible with every
call site written against the frozen port, and a caller that forgets the flag
gets today's behaviour rather than a missing method.

When either lands, stream A deletes the extra export and stream C switches to
`getStockPort().release(…, { committed: true })`. Nothing else changes.

## Until then

`releaseSold` is exported from `core/src/catalog/index.ts` and documented in the
caller table there and in `docs/rewrite/status/a.md`. Its behaviour is pinned by
`catalog.concurrency.int.test.ts`, including the case where two concurrent
releases race past zero.

## Resolution

Accepted, and extended in a way this CR got wrong.

`StockPort.release` now takes a fourth argument:

```ts
export interface StockReleaseOptions {
  committed?: boolean;
  refundId?: number;
}
```

`committed: true` selects the one-statement `stock + n, sales = greatest(0,
sales - n)`; absent, `sales` is left alone, which is right for cancel and for a
payment timeout.

The part this CR missed: **an order is refunded line by line**, so a refund
release is idempotent per *refund*, not per order. Keying the effect ledger on
`('order', orderId)` for both paths — which is what the local `releaseSold`
did — would have swallowed the second partial refund of an order and left that
stock off the shelf for good. With a `refundId` the claim is
`('refund', refundId)`; without one it stays `('order', orderId)`.

`releaseSold` is deleted. `catalog.stock.ts` implements the new signature,
`claimStockOperation` takes the scope, and three integration tests pin it: a
committed release restores stock and sales; two partial refunds of one order
both restock while a replay of either does not; a cancel release and a refund
release on the same order do not shadow each other.
