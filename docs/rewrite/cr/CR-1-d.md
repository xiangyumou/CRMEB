# CR-1-d — the pricing pipeline never sees `kind` or `kindMeta`

**Stream:** D (group buy and presale) **Status:** done — applied by the orchestrator on integration (`buildDraft` passes `kind` and the `kindMeta` keys to the contributors) and closed by the D follow-up, which added the end-to-end checkout tests and moved the fail-closed guard to where it can see the answer
**Files:** `next/packages/core/src/order/order.checkout.service.ts` (stream B1)

## What

`PricingContributor` is the seam a marketing stream uses to replace a SKU price
with an activity price:

```ts
export interface PricingDraft {
  userId: number;
  lines: readonly PricingLine[];
  goodsTotal: Money;
  /** Caller-supplied selections, e.g. `{ couponId: '3' }`. */
  selections: Readonly<Record<string, string | undefined>>;
}
```

`selections` is how a contributor learns _which_ activity the shopper picked.
But `buildDraft` fills it with exactly one key:

```ts
const adjustments = await gatherAdjustments(ctx, userId, lines, userCouponId, {
  couponId: input.userCouponId ?? undefined,
});
```

(`order.checkout.service.ts:306-308`)

`checkoutPreviewBody` already carries `kind` and `kindMeta`, and
`create` hands `kindMeta` to the `OrderKindHandler` twelve lines further down —
but the pricing pass has already run by then, and a handler cannot reprice a
draft: `beforeCreate` returns metadata, it does not return lines.

So a group-buy order priced through `POST /api/v1/orders` is priced at the
**ordinary SKU price**. The group price is unreachable.

Deriving the activity from the lines instead is not a fix: a group-buy activity
sells the shop's ordinary product rows, so a contributor that keyed on the SKU
would discount every ordinary order for that product too.

## Ask

One line in `buildDraft`:

```ts
const adjustments = await gatherAdjustments(ctx, userId, lines, userCouponId, {
  couponId: input.userCouponId ?? undefined,
  kind: input.kind,
  ...(input.kindMeta as Record<string, string | undefined>),
});
```

`kindMeta` is already `z.record(z.string(), z.unknown())` on the wire and is
already cast to `Record<string, string | undefined>` for `beforeCreate`, so the
cast is the same one B1 already makes. `kind` is added as its own key so a
contributor can refuse to fire on `kind: 'normal'` without having to guess from
the presence of an id.

The keys stream D reads are `kind`, `activityId` and `groupId`.

## As built

The ask landed as written. What the end-to-end test then found is that the
guard on this stream's side was checking the wrong number: `beforeCreate` is
handed `draft.goodsTotal`, which `order/ports.ts` defines as "sum of the line
subtotals" — the price _before_ any adjustment — and B1 books the 拼团价 as an
adjustment rather than rewriting the unit price. So with the contributor
firing, payable came out at the group price and the guard compared the group
price with the catalogue price and refused every real group-buy order.

The check therefore moved to `afterCreate`, which runs inside the same
transaction once the order lines exist, and compares what those lines actually
charge (`sum(order_items.total_amount)`) with what the activity says they cost.
That is strictly stronger — it sees the result of the whole pricing pipeline
rather than one input to it — and a mismatch still rolls back the order, its
lines and the stock reservation. Charging _less_ is now allowed: a coupon on
top of a group buy is the shopper's own business.

No further seam is needed, and no change to `order/**`.

Pinned by `groupbuy.int.test.ts::the group-buy price through the real checkout
(CR-1-d)` — three cases through the real `checkout.preview`/`create`: a
group-buy order priced at the activity price with the adjustment labelled
拼团价 and a team row written, the same SKU on an ordinary order still at the
catalogue price with no adjustment and no team, and a second shopper joining by
`groupId` — plus `groupbuy.int.test.ts::beforeCreate > refuses an order whose
draft is not at the activity price (CR-1-d)` and the unit cases in
`groupbuy.rules.test.ts`.
