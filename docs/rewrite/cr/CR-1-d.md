# CR-1-d — the pricing pipeline never sees `kind` or `kindMeta`

**Stream:** D (group buy and presale) **Status:** accepted — applied by the orchestrator on integration (`buildDraft` passes `kind` and the `kindMeta` keys to the contributors); the D follow-up adds the end-to-end checkout test and removes the "until then" stub wording
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

## Until then

`GroupbuyKindHandler.beforeCreate` and `PresaleKindHandler.beforeCreate`
recompute what the order _should_ cost — the activity's per-SKU price times the
line quantity, summed — and compare it with `draft.goodsTotal`. A disagreement
throws `GROUPBUY_PRICE_NOT_APPLIED` / `PRESALE_PRICE_NOT_APPLIED` (409,
拼团价未生效，请稍后重试), so no order is ever sold at the wrong price. Today that
means every activity whose price differs from the SKU price refuses at checkout;
the moment this CR lands, the contributor fires and the check passes silently.

Both halves are pinned by tests:
`groupbuy.int.test.ts::beforeCreate > refuses an order the contributor did not
reprice` and
`groupbuy.pricing.test.ts::contributes the group price when the selections name
the activity`.
