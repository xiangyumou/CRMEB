# CR-1-k2: a paid order is never counted as sold

**Stream:** K2 (hardening second pass) **Status:** OPEN, for the orchestrator (streams A and B1/C have merged; the fix spans a hook registration)
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
