# CR-1-d2 — `PricingDraft` hides the adjustments from `beforeCreate`, so a kind handler cannot check its own price without re-running a contributor

**Status (R5 sweep, 2026-09-23): RESOLVED** — `PricingDraft.adjustments` is in `order/ports.ts` (B3, `41883680c`); presale contributes through it, `inTx`/`contributedAdjustment` are gone. The status line below is kept as history.

**Stream:** D2 (presale) **Status:** open
**Files:** `next/packages/core/src/order/ports.ts` (`PricingDraft`),
`next/packages/core/src/order/order.checkout.service.ts` (`create`) — stream B1

## What

CR-1-d landed: `buildDraft` now passes `kind` and `kindMeta` into the pricing
`selections`, so a marketing `PricingContributor` fires for real. Thank you —
the presale price reaches the shopper, proven end to end in
`presale.checkout.int.test.ts::确认订单 > quotes 预售价, not the catalogue price`.

What did not change is what `beforeCreate` can see. A contributor does not
rewrite line prices; it contributes an adjustment that lands in
`orders.coupon_discount` (CR-3-b1). So the draft handed to the kind handler:

```ts
await handler.beforeCreate(ctx, tx, {
  userId,
  lines: draft.lines.map(pricingLineOf),   // catalogue prices
  goodsTotal: draft.itemsAmount,           // pre-discount
  selections: { ...body.kindMeta },
});
```

carries the **pre-discount** totals and no view of `draft.discount.applied`,
which `create` is holding at that very moment. A domain that needs to know its
own price actually reached the order — the one failure that silently bills a
shopper the catalogue price for a campaign — has nothing to compare against.

## Why it matters twice

1. **The guard cannot be written correctly.** Both marketing domains shipped
   the same check written the same wrong way: compare the campaign's goods
   total against `draft.goodsTotal`. That compares the campaign price against
   the catalogue price, and it refuses **every correctly priced order**. Presale
   is fixed; group buy is not (see CR-2-d2).

2. **The workaround costs a connection.** Presale's fix asks the registered
   contributor what it takes off this very draft. That is a second execution of
   a contributor inside an open transaction, and the first version of it handed
   the contributor `ctx` — whose `db` is the pool. Twelve simultaneous
   checkouts against a pool of twelve deadlocked: twelve connections held,
   twelve more wanted.
   `presale.concurrency.int.test.ts::…holds under a crowd, not just a pair`
   caught it. The local fix is a `{ ...ctx, db: tx }` cast in
   `presale.order.ts::inTx`, which works and which no domain should have to
   write.

## Ask

Put the applied adjustments on `PricingDraft`, since `create` already has them:

```ts
export interface PricingDraft {
  userId: number;
  lines: readonly PricingLine[];
  goodsTotal: Money;
  selections: Readonly<Record<string, string | undefined>>;
  /**
   * What the pricing pass took off, by contributor. Empty on the pricing pass
   * itself (a contributor cannot see its peers); populated for `beforeCreate`,
   * so a kind handler can verify its own adjustment landed.
   */
  adjustments?: readonly PriceAdjustment[];
}
```

and pass `draft.discount.applied` when calling `beforeCreate`. Then both guards
become three honest lines with no second query, no second connection and no
cast:

```ts
const mine = draft.adjustments?.find((a) => a.source === PRICING_SOURCE);
assertActivityPriceApplied({
  expected: campaignTotal.sub(draft.goodsTotal),
  actual: mine?.amount ?? Money.ZERO,
  activityId,
});
```

The field is optional, so nothing existing breaks; `contributedAdjustment` and
`inTx` are deleted from `presale.order.ts` the day it lands.
