# CR-1-r2 — `onOrderPaid` has no ordering, so "commit before the campaigns" holds only by import order

**Stream:** R2 (payment, refund, order) **Status:** OPEN — for the orchestrator (`order/ports.ts` is read-only to R2; `core/scripts/gen-config-groups.ts` is not R2's)
**Files:** `next/packages/core/src/order/ports.ts` (`HookRegistry.register`), `next/packages/core/scripts/gen-config-groups.ts` (`registerAllDomains`)

## What

CR-1-k2 asks for the order domain's stock-commit hook to run before
`groupbuy:take-seat` and `presale:commit-sale`. `HookRegistry` runs hooks in
registration order and `register` replaces a known name in place, so the
position is decided by who registers first:

- **Production module graph** (web, worker): `order/index.ts` is evaluated
  before the group-buy and presale registrars, and `order:commit-sale` is first.
  Asserted by `order/order.stock.hooks.test.ts`.
- **After `resetOrderPorts()` + `registerAllDomains()`** (what the sequence
  test and others do): the generated registrar calls the domains
  alphabetically — catalog, groupbuy, notification, order, … — so
  `groupbuy:take-seat` and `notification:order-paid` land ahead of it.

Today the order is harmless: the campaign hooks write only their own ledgers
and never read `product_skus`, so the SKU commit is independent of them inside
the one transaction. It is intent, and nothing enforces it.

## Asked for (either)

1. `HookRegistry.register(name, handler, { before?: readonly string[] })` (or a
   numeric `priority`), with `order:commit-sale` declaring
   `before: ['groupbuy:take-seat', 'presale:commit-sale']`; or
2. the generator emits `registerOrderDomain()` first in `registerAllDomains()`
   (the one domain whose hooks others build on), with a comment saying why.

R2 would then add a `resetOrderPorts()` case to `order.stock.hooks.test.ts`.
