# CR-2-d2 — group buy's price guard refuses every correctly priced group-buy order now that CR-1-d has landed

**Stream:** D2 (presale), reporting a defect in stream D's merged code
**Status:** **closed — fixed by stream D's follow-up**, which moved the guard to
`afterCreate`, where the order's own totals are readable and no contributor has
to be re-run. Nothing further is owed; the text below is kept as the record of
what the defect was.
**Files:** `next/packages/core/src/groupbuy/groupbuy.order.ts:106`,
`next/packages/core/src/groupbuy/groupbuy.rules.ts:197`

## What

`groupbuyKindHandler.beforeCreate` refuses the order unless the activity's own
goods total equals `draft.goodsTotal`:

```ts
assertActivityPriceApplied({
  expected: expectedGoodsTotal(lines, prices),   // 团购价 × quantity
  actual: draft.goodsTotal,                      // catalogue price × quantity
  activityId,
});
```

Those two can never be equal on an activity that actually discounts anything.
`draft.goodsTotal` is `draft.itemsAmount`, the **pre-discount** sum of the line
subtotals, because a `PricingContributor` does not rewrite line prices — it
contributes an adjustment that lands in `orders.coupon_discount` (CR-3-b1).
`groupbuyPricingContributor` does exactly that, correctly.

So `POST /api/v1/orders` with `kind: 'groupbuy'` throws
`GROUPBUY_PRICE_NOT_APPLIED` whenever 团购价 < 商品价 — which is every real
campaign. The only order shape that passes is one where the group-buy price
equals the catalogue price.

## Why the suite is green anyway

`groupbuy.int.test.ts` and `groupbuy.concurrency.int.test.ts` drive
`beforeCreate` directly and build the draft themselves, at the activity price:

```ts
goodsTotal: total,   // already 团购价 × quantity
```

so `expected === actual` and the guard never fires. Nothing in the suite goes
through `checkout.create`. Presale had the identical bug, hidden the identical
way, and it only surfaced when D2 wrote an end-to-end test through
`checkout.preview` / `checkout.create` as the CR-1-d decision asked for
(`presale.checkout.int.test.ts`).

The doc comments on both functions still say "B1's `buildDraft` does not pass
`kindMeta` into the pricing `selections`… when CR-1-d lands the contributor
fires, the two agree". The second half is the mistaken premise: the contributor
firing does **not** move `draft.goodsTotal`.

## Ask

Stream D (or whoever owns `groupbuy` after the merge) applies the same fix
presale took, in `groupbuy.order.ts`:

- compare the discount the campaign **owes** (`campaignTotal.sub(draft.goodsTotal)`,
  negative) against the adjustment the registered contributor actually produces
  for that draft, rather than against `draft.goodsTotal`;
- run the contributor against the open `tx`, not `ctx.db` — handing it a
  context backed by the pool while `beforeCreate` already holds a connection
  deadlocks at pool width (D2 hit this: twelve concurrent checkouts, pool of
  twelve, `beforeEach` then times out and the rest of the file cascades);
- set the order's kind meta `goodsTotal` from the campaign total;
- add one test through `checkout.create` — the suite as it stands cannot see
  this class of bug at all.

Presale's version is in `next/packages/core/src/presale/presale.order.ts`
(`contributedAdjustment`, `inTx`) and its tests in
`presale.checkout.int.test.ts::提交订单 > refuses a presale order whose price
never reached it`.

CR-1-d2 asks B1 to put the applied adjustments on `PricingDraft`, which would
delete the workaround from both domains.
