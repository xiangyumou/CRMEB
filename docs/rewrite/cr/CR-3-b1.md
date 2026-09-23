# CR-3-b1 — `orders.coupon_discount` holds every goods-level discount, not only the coupon

**Status (R5 sweep, 2026-09-23): RESOLVED** — the schema doc comment says "Every goods-level discount" as asked (`475f59217`). The status line below is kept as history.

- **Stream:** B1 (cart and checkout)
- **Status:** implemented that way; needs a doc-comment change and an ack from B2 and C
- **Affects:** `next/packages/db/src/schema/order.ts` (comments only, no DDL)

## What is ambiguous

```ts
    itemsAmount: money().notNull(),          // Sum of the lines before any discount.
    freightAmount: money().notNull().default('0.00'),
    couponDiscount: money().notNull().default('0.00'),
    /** What the buyer owes. `itemsAmount + freightAmount - couponDiscount`, … */
    payableAmount: money().notNull(),
```

The name says "coupon". The arithmetic says "everything that is not freight".
Both cannot stay true, because the order table has exactly three money columns
before `payable_amount` and the pricing pipeline has more than one source of
discount: `PricingContributor` is the frozen seam through which member pricing,
points deduction, full-reduction campaigns and group-buy pricing all attach
(`core/src/order/ports.ts`). If a contributor's discount is not in
`coupon_discount`, then `payable ≠ items + freight - couponDiscount` and the
`orders_amounts_non_negative` check is the only thing left describing the row.

## What B1 implemented

`coupon_discount` is **the total goods-level discount**: the coupon plus every
`PricingContributor` adjustment, summed. `payable = items + freight -
couponDiscount`, always, with no other term. The per-line
`order_items.discount_amount` is each line's share of that same number, split
with `Money.allocate` so the shares add back to it exactly (largest remainder,
deterministic — `order.pricing.test.ts`, and `order.int.test.ts::order creation
> per-line discount shares add back up to the order total`).

The itemised breakdown the confirm page shows (`优惠券抵扣 -10.00`, `会员折扣
-3.00`, …) is the `adjustments[]` array on `checkoutPreview`. It is a **view**,
not a stored ledger: the order keeps the total and the per-line shares, which is
what a refund needs in order to give back a proportional amount.

## What this asks for

1. Rename the field, or — cheaper and not a schema change — fix the comment:

```ts
    /**
     * Total goods-level discount: the coupon plus every pricing contributor.
     * Not freight. `order_items.discount_amount` splits this across the lines.
     */
    couponDiscount: money().notNull().default('0.00'),
```

2. B2 and C read it that way. For C in particular: a full refund is
   `paid_amount`, and a partial line refund is that line's
   `total_amount` (already net of its `discount_amount` share) — never
   `unit_price × quantity`, which would refund a discount the shop granted.

## Alternative, if an itemised stored breakdown is wanted

Add an `order_discounts` child table (`order_id, source, label, amount`) and
keep `coupon_discount` as the sum. B1 did not do this because nothing in the
retained surface reads it: the storefront detail shows the total, the admin
detail shows the total, and the refund maths uses the per-line shares.
