# Stream C — Payment and refund

**Worktree** `../CRMEB-wt/ws-c` · **Branch** `rewrite/ws-c-payment` · **Domains** `payment`, `refund`, `wechat/core` · reference-map section "C — Payment & refund"

## Scope
`wechat/core`: a small first-party WeChat client on node `crypto`/`fetch` — access-token cache (Redis, single-flight), Pay v3 request signing, response + notification signature verification (platform certificate and public-key modes), AEAD decrypt, JSAPI/mini-program/H5 prepay, query, close, refund, refund query. No SDK. TLS verification always on.
`payment`: start payment for an order (`POST /api/v1/orders/:id/payments`) creating an immutable attempt; pay-vs-cancel serialised by locking the order row; close other attempts **at the gateway** before treating them closed; notify webhook (`/api/v1/webhooks/wechat-pay`); paid transition + effects recorded in the same tx (one effect row per event type: notify user, notify staff, gift coupons, capital flow…); exception payments persisted **before** ack (cancelled order, unknown out_trade_no, second real payment); reconcile job + alert; admin pages for payment exceptions and effects needing a human; capital-flow list. Implement `PaymentPort` from `core/src/order/ports.ts`.
`refund`: apply (user), approve/reject, return-shipment info, gateway refund with frozen `out_refund_no` + amount, states processing/unknown resolved by querying the frozen number (never re-sent with a new one), refund notify webhook, cumulative limit under the order-row lock, stock/coupon restoration exactly once, `onOrderRefunded` hook dispatch, admin refund pages, storefront after-sale routes.
Config group `payment` (mch id, API v3 key, cert serial, private key, public key id/pem, notify base URL) with secrets write-only.

## Schema rules you must honour

Read `next/packages/db/docs/SCHEMA.md` first. The ones that bite this stream:

- **One open refund per order item** is enforced by a partial unique index on `refund_items(order_item_id) WHERE is_open`. Flip `refund_items.is_open` in the **same statement or transaction step** that moves `refunds.status` to a terminal value (`rejected`, `cancelled`, `refunded`). A refund that closes without clearing `is_open` blocks every later refund on that item; one that clears it early admits a duplicate.
- `payment_attempts` rows are immutable apart from `status` and the provider result columns. A retry is a new attempt with a new `out_trade_no`; never rewrite the amount or the order link of an existing one.
- `payment_callbacks` is `UNIQUE(mch_id, provider_notify_id)`: insert first, treat a unique violation as "already processed" and answer the provider with success.
- Refunds are per order item with quantities; there is no order splitting. Shipments reference order items (`shipment_items`), so a refund of a partly shipped order reads `order_items.shipped_quantity`.

## Invariants to prove
All of risk-matrix §4; §6 refund rows (freeze, amount mismatch, cumulative limit, unknown result, service-computed completion, retried refund after gateway accept); §8 effects rows; cases "Payment transport security" (TLS-001…006), "Payment concurrency and creation", "Payment and gateway", "Refunds", the pay half of "Queue and lifecycle". Use and extend the fake gateway in `@shop/testing` (you own `packages/testing/src/fake-wechat/**` for this stream — the one exception to orchestrator ownership).

## Fix, don't port
- `applyRefund` duplicate check outside the tx → order-row lock + the partial unique index.
- `handleTransferNotify` without signature verification → no transfer endpoint; every webhook goes through one verifier.
- v2 API, Alipay, balance, offline: not ported. Historical pay types do not exist (no orders migrated).
- Reconcile alert went to the log only → in-app admin notification + log.

## Out of scope
Pay-on-behalf, gift orders, merchant transfers, mini-program shipping-info upload (B2).
