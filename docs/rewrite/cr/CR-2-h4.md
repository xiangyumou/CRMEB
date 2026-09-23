# CR-2-h4 — an activity order's read model does not say what the shopper paid per unit

- **Stream:** H4 (storefront follow-up), raised against the order read model (B1 ownership:
  `next/packages/contracts/src/order/**`, `next/packages/core/src/order/**`). The orchestrator
  routes it.
- **Status:** **open**
- **Found on:** `rewrite/ws-h4-storefront-followup`, while writing `presale.spec.ts` (§3).
- **Severity:** display only, and only for a 预售 / 拼团 order **with a coupon stacked**, and on
  the 订单列表 for every activity order. The amounts charged are right; the unit price the
  page prints is the catalogue one.

## What happens

B1 prices an activity as a `PricingContributor` adjustment (`presale:activity-price`,
`groupbuy:activity-price`, CR-1-d / CR-3-b1). The line keeps the catalogue `unitPrice`
(¥88.00), and the activity's −¥10.00 folds into `couponDiscount` and the line's
`discountAmount`. The checkout **preview** returns `adjustments`, so the confirm page can print
¥78.00 (`template/uni-app/api/mappers/order.js`, 活动价 helpers). The **order** reads
(`orderListItem`, `orderDetail`) carry no adjustments and `originalUnitPrice: null`, so:

- `orderDetail` with `userCouponId: null` — `couponDiscount` is the activity discount, and the
  wrapper derives ¥78.00. Journey `presale.spec.ts` covers this case and passes.
- `orderDetail` with a coupon stacked — `couponDiscount` (¥15) is activity + coupon and the split
  is unknowable; the page prints ¥88.00 and a ¥15.00 "优惠券".
- `orderListItem` has no `userCouponId` at all, so the 订单列表 always prints ¥88.00.

## Ask (either)

1. **Preferred:** order reads carry the order's `adjustments` (the preview's
   `priceAdjustment[]`, persisted at create), so the page separates activity from coupon.
2. Or order items carry the activity unit price (`unitPrice` = the price paid, with
   `originalUnitPrice` = the catalogue price — the shape `orderItemExample` already shows for a
   discounted line).

## Proof

`template/uni-app/tests/mappers.order.test.mjs` › `CR-2-h4: a 预售 order with a stacked coupon
still prints ¥78` is an `it.fails`: it feeds the mapper the `orderDetail` such an order produces
and expects ¥78.00. With fix 1 the wrapper reads the adjustment (as the confirm page does) and
the test flips to `it`; with fix 2 the 活动价 derivation in `toLegacyOrderDetail` is deleted and
the test flips as is.
