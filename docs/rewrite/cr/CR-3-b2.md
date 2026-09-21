# CR-3-b2 — a `virtual_card` line must be capped at quantity 1 at checkout

**Stream** B2 · **Status** open · **Blocking** no (B2 degrades safely) ·
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
