# CR-1-k2: a paid order is never counted as sold

**Stream:** K2 (hardening second pass) **Status:** RESOLVED (R2, `rewrite/ws-r2-payments`; commit in `docs/rewrite/status/r2.md`) — see "Resolution" at the end
**Files:** `next/packages/core/src/catalog/catalog.stock.ts` (`catalogStockPort.commit`), `next/packages/core/src/payment/payment.service.ts` (`onOrderPaid.dispatch`), `next/packages/core/src/order/ports.ts` (`onOrderPaid`)
**Pinned by:** `next/packages/core/src/order/order.sequence.int.test.ts`, `it.fails` "CR-1-k2 — a paid order is counted as sold"

## What

`StockPort.commit` turns a reservation into a sale. It is guarded by the ledger
key `catalog.stock.commit` and increments `product_skus.sales`, then `rollupFor`
updates `products.sales`. It is the **only** caller of `repo.commitSkuSale`, and
**nothing in production calls it**:

```
$ grep -rn "\.commit(tx" packages/core/src --include=*.ts | grep -v test
(nothing)
```

The payment path says it does. `payment.service.ts` ~529:

```ts
// Hooks run inside this transaction: stock commit, coupon marking, group-buy
// team closing. …
await onOrderPaid.dispatch(tx, ctx, { … });
```

But the hooks registered on `onOrderPaid` are `groupbuy:take-seat`,
`presale:commit-sale`, `order:auto-deliver` and `notification:order-paid`. None
of them is a stock commit. `groupbuy.order.ts:338` says the same ("mirroring what
stream A's `StockPort.commit` just did on the SKU's").

The result: `product_skus.sales` and `products.sales` never go up for an ordinary
paid order. Stock is still correct, because reserve decremented it at checkout.
The storefront "已售" figure, sales sorting and anything else that reads `sales`
stay at the migrated values forever.

The refund side hides it. `releaseSoldSkuStock` writes
`sales = greatest(0, sales - n)`, so refunding a sale that was never counted
clamps at zero instead of violating `product_skus_sales_non_negative`. For a
product with migrated sales, a refund lowers a figure that the payment never
raised.

## Reproduction

The pinned test pays for 2 units of a SKU with stock 10 and sales 0, then
expects `{ stock: 8, sales: 2 }` on the SKU and `sales: 2` on the product. It
gets `sales: 0`. SEQ-001's conservation invariant (INV5) is relaxed to
`sales <= sold` until this lands, because `sales == sold` fails on every seed.

## Asked for

Register a paid hook, `catalog:commit-sale` or similar, that calls
`resolveStockPort().commit(tx, event.orderId, lines)` with the order's lines. It
belongs in the catalog domain's `index.ts`, next to `registerStockPort`, or in
order's, whichever owner the orchestrator names. It must run before
`groupbuy:take-seat` and `presale:commit-sale`, which assume it already ran.
Then:

1. flip the `it.fails` above to `it`;
2. tighten SEQ-001's INV5 back to `sales == sold`: search the driver for
   `CR-1-k2`, there is one relaxed comparison;
3. decide whether presale orders are committed by this hook or by
   `presale:commit-sale` alone, and make sure they are not committed twice. The
   `catalog.stock.commit` ledger key makes a second call a no-op for the same
   order, so the only risk is intent, not double counting.

## Resolution (R2)

- **The hook.** `order/order.stock.hooks.ts` registers `order:commit-sale` on
  `onOrderPaid`; it reads the order's lines (`stockLinesOf`, what checkout
  reserved and what cancel releases) and calls `resolveStockPort().commit`.
  It is installed on import of that file — which `order/index.ts` imports ahead
  of `order.fulfil.effects.ts` — and again from `registerOrderDomain()`. In the
  production module graph it is the **first** paid hook, ahead of
  `order:auto-deliver`, `groupbuy:take-seat` and `presale:commit-sale`
  (`order/order.stock.hooks.test.ts`, which imports `domains.gen` fresh).
  After a test's `resetOrderPorts()` + `registerAllDomains()` the registrars run
  alphabetically, so `groupbuy:take-seat` precedes it there; that order is
  harmless (the campaign hooks never touch `product_skus`), and a real
  ordering guarantee needs `ports.ts` — see CR-1-r2.
- **Presale (item 3).** Committed by this hook, like every paid order.
  `presale:commit-sale` moves only the campaign ledger
  (`presale_activity_skus.sales`), never the SKU's, so there is one writer of
  the SKU-level sale. Asserted by
  `order.sequence.int.test.ts::CR-1-k2 — a paid order is counted as sold > commits a presale order once, however often the sale is committed again`
  (a replayed `commit` and a replayed full `onOrderPaid.dispatch` leave SKU
  `sales` 2 and campaign `sales` 2).
- **Pin flipped:** `… > moves the SKU from reserved to sold when the payment is booked` is `it`.
- **INV5 tightened** to `sales === paid − restocked`. `sold` in the driver was
  "paid minus `refundedQuantity`", which is not what `sales` means: a refunded
  line that had already shipped is not restocked (refund.service `restock`,
  legacy `regressionStock`), so its units stay off the shelf _and_ in `sales`.
  The comparison now uses the same `returned` count as the stock half of INV5.
  All four seeds pass with `!==`.
- `payment/payment.int.test.ts` now registers the catalogue (the hook needs the
  stock port, as in every real process) and PAY-004 asserts `sales` moved.
