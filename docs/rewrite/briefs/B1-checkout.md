# Stream B1 — Cart and checkout

**Worktree** `../CRMEB-wt/ws-b1` · **Branch** `rewrite/ws-b1-checkout` · **Domains** `cart`, `order/{create,pricing,cancel}` plus the order state machine implementation · reference-map section "B1 — Checkout"

## Scope
Cart (add, set quantity, remove, list with validity flags, count, re-buy from an order). Checkout: `POST /api/v1/checkout/preview` (server-side recompute: items, address → freight, coupon choice, contributor adjustments) and `POST /api/v1/orders` (create) with an idempotency key. Pricing pipeline: item totals → `PricingContributor`s (marketing) → coupon (allocate across eligible items with `Money.allocate`) → freight (call `shipping`'s calculator through its index; until F2 lands, code against an interface with a flat-rate fake) → payable. Order numbers. Storefront order list/detail/counts. Cancel: user cancel, auto-cancel job (delayed per order + sweeping repeatable job), both through one entry point. You implement `OrderStateMachine.transition` declared in `core/src/order/ports.ts` and dispatch the `onOrder*` hooks inside the transaction.

## Cancel vs pay
Cancelling must not release stock or coupons while a payment attempt may still succeed. Call `PaymentPort.ensureNoOpenAttempts(tx, orderId)` (declared in ports; stream C implements it; use the fake from `@shop/testing` until then): confirmed closed → proceed; paid → run paid transition and refuse the cancel; unknown → refuse, keep everything, retry later.

## Invariants to prove
risk-matrix §1 rows on SKU swap and dead cart rows, all of §2, §3 rows "failed order returns the coupon" and "cancel returns the coupon once", §4 "manual + queue + timer cancel together" and "cancel when gateway close is unconfirmed"; cases "Pricing", "Stock", the cancel half of "Queue and lifecycle".

## Fix, don't port
- Order-create lock was a cache lock never tested → idempotency key with a UNIQUE column, second submit returns the first order.
- Coupon redeem, order insert, stock reserve: one transaction, all-or-nothing, proven by a mid-transaction failure test.
- `order/cancel` lived in the cart route group; it is `POST /api/v1/orders/:id/cancel`.

## Out of scope
Payment (C), delivery/receipt (B2), group-buy and presale rules (D attaches through `OrderKindHandler`), gift orders, pay-on-behalf.
