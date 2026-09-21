# CR-3-b2 — a `virtual_card` line must be capped at quantity 1 at checkout

**Stream** B2 · **Status** **applied** on `rewrite/ws-b1-checkout` ·
**Blocking** no (B2 degrades safely) ·
**Asked of** stream A (catalogue) and stream B1 (checkout)

## What

`product_virtual_cards` carries

```sql
uniqueIndex('product_virtual_cards_order_item_uq')
  .on(order_item_id)
  .where(sql`order_item_id is not null`)
```

— one card row per order item. The schema is frozen, and the index is right:
it is what makes card delivery idempotent under a replayed effect, because a
second attempt to claim for the same line simply cannot write.

The consequence nobody wrote down is that **an order item of a card-key
product can only ever hold one card**. A buyer who sets the quantity to 3 on a
卡密 product creates one `order_items` row with `quantity = 3`, and the shop can
hand over exactly one card for it.

Legacy had the same hole and papered over it by issuing `quantity` rows with no
unique index at all, which is why a retried callback there could hand out three
cards for one purchase.

## What B2 does today

`autoDeliver` (`packages/core/src/order/order.fulfil.effects.ts`) claims one
card for the line, logs

```
'card-key line with quantity > 1; one card issued'
```

with the order id, the line id and the quantity, and **still marks the line
delivered**. The buyer gets their card; the operator gets a warning they can
act on. The alternatives were worse: throwing would park the effect and leave a
paid order undelivered over a defect the buyer cannot fix, and issuing nothing
would be a silent loss.

## Asked of A and B1

Cap it where the quantity is chosen, not where the card is handed over:

1. **Stream A** — `CatalogPort`/`SkuForSale` should carry the product kind (it
   already does, as `productKind`) and, for `virtual_card`, report a per-order
   purchase limit of 1. The cleanest spelling is the existing
   `purchaseLimitMode: 'per_order'` with `purchaseLimitQuantity: 1`, forced for
   `kind = 'virtual_card'` rather than left to whoever edits the product.
2. **Stream B1** — checkout refuses a `virtual_card` line with `quantity > 1`
   with the existing `ORDER_PURCHASE_LIMIT` error, and the cart clamps it when
   the item is added, exactly as it already does for a `purchaseLimit`.

A buyer who wants three cards then places three lines, or three orders, and
each line gets its own card.

## Also worth deciding (not B2's call)

If the shop wants one order item to hold several cards, the index has to become
`(order_item_id, id)` with a per-line sequence and the schema is no longer
frozen. B2 does **not** recommend it: one card per line is what makes delivery
idempotent, and idempotent delivery of a card key is worth more than the
convenience of a quantity stepper.

## Until then

Nothing is blocked. The warning is in the logs, the order is delivered, and
`autoDeliver` needs no change on the day the cap lands — the `quantity > 1`
branch simply stops being reachable.

## Applied

Accepted, and B1's half was already most of the way there: `cart.rules.ts` and
`order.checkout.service.ts` have refused a `virtual_card` line above one since
`80d823fd`, both quoting `product_virtual_cards_order_item_uq` in the comment.
What this pass added is the parts that were not covered.

**Stream A needed nothing.** `SkuForSale` already carries `productKind`, and
`catalog.sale.ts` already reports it, so the kind reaches both the cart rules
and `assertSellable` without a port change.

**The error codes stay `CART_VIRTUAL_CARD_QUANTITY` (422, 卡密商品每次只能购买 1
件) and `ORDER_VIRTUAL_CARD_QUANTITY` (422, 卡密商品每单只能购买 1 件)**, not
`ORDER_PURCHASE_LIMIT_REACHED`. Both are already in the frozen contracts and on
the routes, and both say *why* — a 卡密 cap is a schema fact, not a
merchandising limit an operator set and can change, and the storefront's copy
differs accordingly. Reusing the purchase-limit code would have thrown that
away and made `details: { limit }` a lie.

Also note the CR's suggestion of forcing `purchaseLimitMode: 'per_order'` /
`purchaseLimitQuantity: 1` on card products was **not** taken. It would put a
schema invariant into operator-editable data, where the next person to edit the
product can turn it off.

What changed:

- `capFor` returns **1** for a `virtual_card`. It was the one place the kind was
  not consulted: it is both the clamp `addUnits` applies and the cap 再次购买
  clamps a rebought line to, so without it those paths offered a quantity that
  `refuseQuantity` then refused.
- **立即购买 is covered explicitly.** Buy-now never touches the cart, so the
  cart's refusal does not reach it; the cap lives in `assertSellable`, where
  both sources meet, and there is now a test that says so for `preview` *and*
  `create`.
- **The cart's edit path is covered.** `addItem` was tested; `updateItem` sets
  an absolute quantity and was the way round the add-time refusal.
- **The cap is proved to be a cap, not a ban**: one card goes through B1's
  checkout, C's payment marks it paid, and B2's `autoDeliver` claims exactly one
  key while the second stays on the shelf.

Tests: `cart.rules.test.ts::capFor > is one for a card-key product…`,
`cart.int.test.ts::editing the cart > refuses to edit a card-key row up to two`,
`order.int.test.ts::checkout preview > refuses more than one card key on 立即购买 too`,
`order.int.test.ts::checkout preview > lets a single card key through checkout, and B2 delivers exactly one`,
plus the two that already existed. Invariant row `CAT-010` cites them.

`autoDeliver`'s `quantity > 1` warning branch is now unreachable through any
route, exactly as the CR predicted. It is left in place: it is the backstop for
a row written before this landed, or by a migration.
