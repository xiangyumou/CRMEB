# CR-1-f2 — `FreightLine` should carry the line's freight mode

**Stream** F2 · **Status** open · **Blocking** no (local adapter in place)

## What

`FreightPort.quote(ctx, { addressCityId, lines })` is frozen in
`packages/core/src/order/ports.ts`, and `FreightLine` is:

```ts
{ skuId, quantity, freightTemplateId: number | null, weight, volume, amountFen }
```

A line whose product ships **free** and a line whose product has a **fixed**
postage both arrive with `freightTemplateId: null`, and they are priced
differently: free is 0, fixed is `fixedFreight × quantity` (legacy
`OrderFreightCalculator::getOrderPriceGroup`). The port cannot tell them apart
from its arguments.

## Asked of the orchestrator / stream B1

Add two fields to `FreightLine` in `core/src/order/ports.ts`, and set them in
`freightLineOf` (`order.pricing.ts`), which already has the `SkuForSale` in
hand:

```ts
freightMode: "free" | "fixed" | "template";
fixedFreightFen: number; // 0 unless freightMode === 'fixed'
```

Both are pure additions; `fallbackFreightQuote` and every existing caller keep
compiling.

## Interim

F2's `FreightPort` re-reads the skus it was handed through
`resolveCatalogPort().getSkusForSale(ctx.db, skuIds)` — imported from
`../order`, which is the one legal way across a domain boundary — and takes
`freightMode` / `fixedFreight` from there. It costs one extra query per quote on
a table checkout has just read, and it is deleted the day the two fields exist.

## Note

The same change makes the shop-wide 满额包邮 rule (F1's
`tradeConfig.freeShippingThreshold`) expressible inside the port, which
otherwise has no way to know a fixed-postage line was part of the order it must
zero.
