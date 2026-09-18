# Regression case matrix

One line per automated case; every checked line has executable assertions for
the response or return value, the persisted effects, and a no-side-effect
failure or repeat path. HTTP cases use production routing, middleware and JWT
against the seeded install SQL; payment transports stay offline.

## Payment and gateway

- [x] PAY-001 Unknown product order notification is acknowledged without side effects.
- [x] PAY-002 Notification for an already paid product order does not run payment effects again.
- [x] PAY-003 Internal notification failure returns failure so the gateway can retry.
- [x] PAY-004 A valid product payment notification invokes the payment-success service once with its trade number.
- [x] PAY-005 A concurrent notification is acknowledged when another worker atomically paid the order.
- [x] PAY-006 Only the first atomic payment transition updates an order or records its trade number.
- [x] PAY-007 Two callbacks for the same real order pay it exactly once: the losing callback keeps the first trade number and no status or capital-flow row is duplicated.
- [x] GATEWAY-001 Signed WeChat V2/V3 callbacks reject a paid amount that is short, over, or malformed before any payment effect.

## Pricing

- [x] PRICE-001 Integral deduction accounts for frozen points and the configured maximum.
- [x] PRICE-002 Disabled integral deduction leaves price and available points unchanged.
- [x] PRICE-003 Ordinary item pricing, coupon thresholds and freight boundaries.
- [x] PRICE-004 Multi-item order pricing returns the cart list with its spread ids and splits the coupon across every row.

## Balance and ledger

- [x] BALANCE-001 A paid recharge is not credited again; a first notification reaches the recharge-success service once. (Recharge is retired; the historical-ledger behaviour stays covered.)
- [x] BALANCE-002 Insufficient order balance writes nothing; an exact balance writes one ledger entry and pays the order.
- [x] BALANCE-003 Two orders cannot spend the same balance, and concurrent refund credits are not lost.
- [x] BALANCE-004 Negative balance changes are rejected without writing.
- [x] BALANCE-005 Competing full order payments with persisted ledger and order assertions.

## Stock

- [x] STOCK-001 Zero and negative inventory deductions are rejected.
- [x] STOCK-002 A deduction larger than available stock is rejected without changing stock or sales.
- [x] STOCK-003 Two concurrent deductions of the last item yield one success, final stock 0 and sales 1.
- [x] STOCK-004 Activity inventory requires sufficient stock and quota in the same update.

## Queue and lifecycle

- [x] QUEUE-001 Paid, deleted, offline and already cancelled orders are not restored by the unpaid-cancel job.
- [x] QUEUE-002 An eligible unpaid order restores resources and persists cancellation state once.
- [x] ORDER-001 The retained purchase path over real HTTP: cart, confirm, computed, create — the order lands with the stock decremented and `order/computed` returns the same price the confirmation promised.
- [x] ORDER-002 Order creation queues `UnpaidOrderCancelJob` for the new order, so abandoned orders expire and release stock.
- [x] ORDER-003 An unpaid order can be cancelled once, a paid one never, and neither leaves a duplicate status row.

## Authorization

- [x] AUTH-001 Standard and legacy authorization headers populate the authenticated request.
- [x] AUTH-002 Optional authentication failure continues with an anonymous request.
- [x] AUTH-003 Token expiry and cross-user order read/write isolation through HTTP routes.
- [x] AUTH-004 Mobile order management admits exactly the uids on the order-notice roster; an empty roster closes it.

## Refunds

- [x] REFUND-001 Balance refunds credit the user and record the resulting two-decimal balance; failed credits write no ledger.
- [x] REFUND-002 Historical pay types (`yue`, `offline`, `alipay`, `allinpay`, empty) are refused for original-channel refunds with the offline-handling message, while WeChat orders pass the guard when handed a model the way the dispatcher does.

## Registration and notifications

- [x] USER-001 Self registration through the real `/api/register` route issues the configured newcomer coupon to the new uid only.
- [x] USER-002 A registration retry issues the coupon once and never credits money or points.
- [x] USER-003 The order-notice roster drives who receives the new-order in-site message, and nobody outside it.

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
- [x] MIG-005 `finalize` refuses without a dump naming every renamed table, drops them with one, and a later `rollback` then fails non-zero instead of reporting success.
- [x] MIG-006 `plan` reports unreachable balances from a funded database (a field-restricted `find()` used to report zero) and blocks apply on paid self-pickup orders that could never be written off.
- [x] MIG-007 `rollback` restores every shared table row-for-row after apply.

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
