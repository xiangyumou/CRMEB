# Regression case matrix

One line per automated case; every checked line has executable assertions for
the response or return value, the persisted effects, and a no-side-effect
failure or repeat path. HTTP cases use production routing, middleware and JWT
against the seeded install SQL; payment transports stay offline.

## Payment transport security

- [x] TLS-001 The WeChat v2 and v3 payment transports keep certificate-chain and hostname verification on: no `verify => false`, no `CURLOPT_SSL_VERIFYPEER/HOST` disable, and the trust store comes from the server environment (`CRMEB_PAY_CA_BUNDLE`) with no backend toggle.
- [x] TLS-002 A platform-signed response verifies, while a tampered body, a wrong signature, an unknown platform serial and a stale timestamp all fail the check.
- [x] TLS-003 A response whose platform certificate cannot be fetched is never trusted, so the caller treats the query result as unknown and keeps resources.
- [x] TLS-004 A signature made with a key that does not match the published certificate is rejected.
- [x] TLS-005 A v3 notification is answered as a failure unless its platform signature verifies and its resource decrypts into a JSON object, so a forged "money received" cannot be believed.
- [x] TLS-006 The v3 driver refuses to convert an unverified query or close response into `closed`/`paid`.

## Payment concurrency and creation (offline gateway)

- [x] PAYC-001 A payment create held at the gateway boundary while a cancellation commits can never leave a collectible gateway payment on a cancelled order: either the cancel settles the attempt first, or the create is refused under the order lock and the attempt is closed.
- [x] PAYC-002 A create the gateway accepted but whose response was lost keeps the attempt as unknown (not submitted, not closed), the order unpaid and uncancelled, and a later cancellation closes the gateway order before releasing anything.
- [x] PAYC-003 Repeated pay taps by the same payer keep one attempt row for one merchant order number; no tap completes or cancels the order on its own.
- [x] PAYC-004 The attempt's driver, merchant, app, channel, amount and payer are immutable: an identical replay is idempotent, any change is refused for manual handling and the stored row is untouched.
- [x] PAYC-005 A recorded merchant identity that no longer matches the configuration stops cancellation with 请人工核对后处理 and releases no stock, coupon or cancel flag.

## Payment and gateway

- [x] PAY-001 Unknown product order notification is acknowledged without side effects.
- [x] PAY-002 Notification for an already paid product order does not run payment effects again.
- [x] PAY-003 Internal notification failure returns failure so the gateway can retry.
- [x] PAY-004 A valid product payment notification invokes the payment-success service once with its trade number.
- [x] PAY-005 A concurrent notification is acknowledged when another worker atomically paid the order.
- [x] PAY-006 Only the first atomic payment transition updates an order or records its trade number.
- [x] PAY-007 Two callbacks for the same real order pay it exactly once: the losing callback keeps the first trade number and no status or capital-flow row is duplicated.
- [x] GATEWAY-001 Signed WeChat V2/V3 callbacks reject a paid amount that is short, over, or malformed before any payment effect.
- [x] GATEWAY-002 The retained `pay_wechat_type` setting selects the matching WeChat driver — `0` builds the v2 channel, `1` the v3 channel — and the setting ships with the install SQL.

## Pricing

- [x] PRICE-001 Integral deduction accounts for frozen points and the configured maximum.
- [x] PRICE-002 Disabled integral deduction leaves price and available points unchanged.
- [x] PRICE-003 Ordinary item pricing, coupon thresholds and freight boundaries.
- [x] PRICE-004 Multi-item order pricing returns the cart list with its spread ids and splits the coupon across every row.

## Stock

- [x] STOCK-001 Zero and negative inventory deductions are rejected.
- [x] STOCK-002 A deduction larger than available stock is rejected without changing stock or sales.
- [x] STOCK-003 Two concurrent deductions of the last item yield one success, final stock 0 and sales 1.
- [x] STOCK-004 Activity inventory requires sufficient stock and quota in the same update.

## Queue and lifecycle

- [x] QUEUE-001 Paid, deleted, offline and already cancelled orders are not restored by the unpaid-cancel job.
- [x] QUEUE-002 An eligible unpaid order restores resources and persists cancellation state once.
- [x] QUEUE-003 A cancellation settles the payment gateway before it releases anything: settlement runs first, the attempt is marked closed, and only then are the coupon and the stock restored.
- [x] QUEUE-004 An unconfirmed gateway state (unknown or timeout) releases nothing: the attempt is neither closed nor marked, the coupon and the stock stay with the order and the job reports failure.
- [x] QUEUE-005 A gateway payment discovered during cancellation keeps the order alive, runs the unified local confirmation with the query's fresh trade number inside the original order lock, and releases no resource.
- [x] QUEUE-006 When the stock restore fails the coupon return, the stock restore and the cancel flag roll back together and no coupon_back status row survives.
- [x] QUEUE-007 When the coupon cannot be returned the stock restore never runs and no stock layer is touched.
- [x] QUEUE-008 Cancelling a presale order restores all four ledgers (the presale activity row, its type-6 SKU, the product row and its type-0 SKU) with deliberately different presale and product ids, so a restore through the ordinary layer cannot pass on matching totals.
- [x] QUEUE-009 Two concurrent cancellations of one order release the stock and the coupon once and write one coupon_back row; the loser observes the committed cancellation.
- [x] QUEUE-010 Payment success records exactly one effect for the order and hands that recorded row to the repair job, which runs the effect it was given; the row is never written by a second path.
- [x] QUEUE-011 A repeated callback reuses the effect entry it already wrote, and one delivery claims it: a second concurrent delivery cannot run the same effect, a finished, freshly claimed or attempt-exhausted record is not re-delivered, an unknown or interrupted one is, and a failed effect records the unknown outcome with its attempt counted.
- [x] ORDER-001 The retained purchase path over real HTTP: cart, confirm, computed, create — the order lands with the stock decremented and `order/computed` returns the same price the confirmation promised.
- [x] ORDER-002 Order creation queues `UnpaidOrderCancelJob` for the new order, so abandoned orders expire and release stock.
- [x] ORDER-003 An unpaid order can be cancelled once, a paid one never, and neither leaves a duplicate status row.
- [x] ORDER-004 Over real HTTP, submitting an order with an already spent coupon is refused before any write: no order row, the product stock unchanged and the coupon still spent rather than returned.

## Core business invariants (independent review)

- [x] ORDER-005 Only an unpaid, cancelled or refunded order can be deleted by its owner: a paid or shipped one stays, a stranger cannot delete any order, and the refused attempts change nothing.
- [x] ORDER-006 A cancelled order cannot be paid afterwards (the refusal leaves no attempt behind) and a refunded order cannot be confirmed as received.
- [x] ORDER-007 A repeated receipt is refused and does not add a second receipt status row.
- [x] ORDER-008 An order whose second stock deduction fails rolls back completely: no order row, the first item's product and SKU stock restored, and the failed item untouched.
- [x] COUPON-007 The last coupon cannot be claimed twice: one concurrent claim wins, the other is refused, `remain_count` never goes negative and exactly one user holds it.
- [x] COUPON-008 Two simultaneous claims by one user leave exactly one success, the loser refused by the per-user limit, and one claim record.
- [x] AUTH-005 A stranger gets `订单不存在` (never the after-sale detail) from the storefront refund surface, and the admin refund route refuses an unauthenticated call without completing the after-sale.
- [x] CLIENT-001 The retained purchase contract fields are accepted by the real routes; a paid order reports `已支付` rather than a new payment intent, and an order with an unknown gateway result is refused with a manual-handling message instead of a payment intent.

## Authorization

- [x] AUTH-001 Standard and legacy authorization headers populate the authenticated request.
- [x] AUTH-002 Optional authentication failure continues with an anonymous request.
- [x] AUTH-003 Token expiry and cross-user order read/write isolation through HTTP routes.
- [x] AUTH-004 Mobile order management admits exactly the uids on the order-notice roster; an empty roster closes it.

## Refunds

- [x] REFUND-001 Historical pay types (`yue`, `offline`, `alipay`, `allinpay`, empty) are refused for original-channel refunds with the offline-handling message, while WeChat orders pass the guard when handed a model the way the dispatcher does.
- [x] REFUND-002 A presale order restore moves the presale activity row, the presale SKU, the product row and the product SKU back to their exact prior stock and sales; the fixture uses deliberately different ids and SKUs for the presale and the product layers so a restore through the wrong layer cannot pass on matching totals.
- [x] REFUND-003 An order sold from a group buy, a presale or ordinary stock restores through that layer only: the matching service is called once with the id and SKU the order carried, and the other two are never called.
- [x] REFUND-004 When the stock restore returns false the refund stops with `库存回退失败` before the payment gateway is resolved, and no `refund_price` status row is written.
- [x] REFUND-005 The refund number and amount are frozen on the first attempt and replayed on every retry: a second call with a higher amount reuses the persisted after-sale number and the originally frozen price, and both are persisted on the after-sale row.
- [x] REFUND-006 Two refund attempts released together from separate processes freeze one gateway number and one amount, and the persisted row matches what both attempts agreed on.

## Registration and notifications

- [x] USER-001 Self registration through the real `/api/register` route issues the configured newcomer coupon to the new uid only.
- [x] USER-002 A registration retry issues the coupon once and never credits money or points.
- [x] USER-003 The order-notice roster drives who receives the new-order in-site message, and nobody outside it.

## Coupons

- [x] COUPON-001 A retired member coupon (`receive_type = 4`, including the row the install SQL still ships) is absent from the storefront list, the PC list, the popup list, the quantity counts, the `receive_types = 1` search and the DIY `theme/coupon` component (both the every-user and the pinned-id form, while a component saved for the retired member audience returns an empty list), while an ordinary coupon stays listed.
- [x] COUPON-002 Claiming a retired member coupon by id fails with `该优惠券所属业务已下线` before any write: no claim record, no user coupon and an unchanged `remain_count`.
- [x] COUPON-003 An ordinary coupon can still be claimed and still consumes one from `remain_count`.
- [x] COUPON-004 Redeeming the same coupon twice succeeds once: the first redemption marks the row used and records the use time, and a second attempt in a later second changes nothing and does not rewrite the use time.
- [x] COUPON-005 A coupon that is not usable by this holder is refused in one conditional update and left in the state it was found: already used, marked failed, expired, not yet valid, and a coupon held by another uid each return zero affected rows.
- [x] COUPON-006 Two redemptions of one coupon released together from separate processes leave exactly one winner: the loser observes zero affected rows and the row records a single use.

## Storefront paths broken by the removal

- [x] SMOKE-001 Freight calculation accepts the retained signature the trimmed call sites use.
- [x] SMOKE-002 Recommendation lists load without the deleted `$where` clause (storefront home, PC and DIY defaults).
- [x] SMOKE-003 `/api/index` and the logged-in `/api/v2/index` respond.
- [x] SMOKE-004 `/api/userinfo` responds for the token holder.
- [x] SMOKE-005 The order-create listener finishes on the shortened payload and records the order status.
- [x] SMOKE-006 A finished order can be deleted by its owner; a shipped one cannot; neither can a stranger's.
- [x] SMOKE-007 Retired payment flags report off without their config rows instead of inverting to true.
- [x] SMOKE-008 The order-type statistic separates retained orders from historical ones instead of repeating the whole-table total.
- [x] SMOKE-009 The group-buy poster endpoint composes and uploads the poster offline (QR attachment pre-seeded), not a 500.
- [x] SMOKE-010 DIY data keeps the retained activities and drops the dead navigation entries whole.
- [x] SMOKE-011 Presale expiry unlists only expired presale products.
- [x] SMOKE-012 A successful group updates leader and members once without repeated notifications.

## Boundary of the retained shop

- [x] CORE-001 Retired payment types and order parameters are refused before any write; combination and presale parameters stay valid; gift rewards accept only coupons.
- [x] CORE-002 Removed storefront and admin routes answer 404 over HTTP, retained ones still match, and retired user parameters are rejected before writes while legacy empty values still filter.

## Historical compatibility

- [x] HIST-001 Historical orders (retired pay types, seckill/bargain/presale fields) stay listable, readable and exportable with stable `历史：…` pay labels, including DAO lists with real cart rows.

## Migration

- [x] MIG-001 `plan` is read-only and reports the retired tables (including empty ones), seeds, timers, menus, senderless notifications and events it will remove.
- [x] MIG-002 `plan` leaves the shipped retained timers (`takeDelivery`, `clearPoster`, …) off the removal list and the retained menus parented under live parents.
- [x] MIG-003 `apply` renames every seeded retired table, removes exactly the retired seeds, keeps the retained timers and menus, carries the notify-or-customer roster union across, creates the retained settings, and is a no-op afterwards without overwriting the backup.
- [x] MIG-004 Completed withdrawals (`status=1`) do not block apply; pending ones (`status=0`) do, and the refusal happens before any backup is written.
- [x] MIG-005 `finalize` drops only empty renamed tables: a table that still holds rows refuses the whole batch with exit code 2 and the table names and row counts, and neither `--yes` nor `--dump` can bypass it. Empty tables are dropped when a dump is given, and a later `rollback` then fails non-zero instead of reporting success.
- [x] MIG-006 `plan` reports unreachable balances from a funded database (a field-restricted `find()` used to report zero) and blocks apply on paid self-pickup orders that could never be written off.
- [x] MIG-007 `rollback` restores every shared table row-for-row after apply.
- [x] MIG-008 `apply` creates every missing config tab and setting when several are missing at once, each with its own id and a correct `config_tab_id` reference.
- [x] MIG-009 A setting that is both created by this apply and holds a notification roster inherits the merged uid list, so order alerts and mobile order management survive its first creation.
- [x] MIG-010 A retained setting that lives on a retired tab is moved to the retained tab with its value intact instead of being deleted with the tab.
- [x] MIG-011 The WeChat payment version setting survives apply with its configured value, and a fresh install ships it too.
- [x] MIG-012 `rollback` refuses, without touching a single table name or row, when any recorded row was edited after apply; the refusal happens before the first rename.
- [x] MIG-013 `rollback` can be retried: after a rename completed but the data restore failed, a second run restores the remaining rows and repeating it again changes nothing.
- [x] MIG-014 A refused `plan` leaves the database unmodified.
- [x] MIG-015 A fresh install already ships the reliability schema: the payment-attempt and effect tables with their unique keys, and the two refund columns.
- [x] MIG-016 The reliability migration adds every missing table and refund column to a database that predates them, verifies the result by re-reading the schema, leaves existing order and refund rows alone with an empty new refund number, and leaves nothing to do on a second run.
- [x] MIG-017 The reliability migration finishes an interrupted release: a run that stopped after the first table is completed by the next one, and the object that already exists is not planned again.

## Maintenance tools

- [x] MAINT-001 The maintenance endpoints succeed over HTTP, the personal-centre menu skips removed pages, domain replacement rewrites retained media columns, "clear data" skips missing tables, refuses unsafe table names, and clears the retained order tables.

## SQL mode and route integrity

- [x] SQL-001 Grouped DAO queries (cart summing, reply keywords, capital flow, user list, home charts) work under `ONLY_FULL_GROUP_BY`.
- [x] ROUTE-001 Every registered route target resolves to a real controller method in its own layer.

## Known gaps

Payment transports are offline by design: real WeChat sandbox payment, refund
and gateway-side retry are operator verification steps. The double-callback
case (PAY-007) drives the same notification path the gateway would, with the
transport stripped.

Permanent deletion of a retired table that still holds rows is not supported:
`finalize` refuses it (exit code 2) instead of restoring or exporting the data.
There is no backup-restore tooling for that case — a shop that finds non-empty
retired tables must be handled by a separately planned operation.

The storefront and admin builds, H5/mini-program builds, on-device flows and a
real merchant WeChat payment and refund are release steps, not covered by this
suite.
