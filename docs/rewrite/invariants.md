# Invariant parity

Every line of `tests/regression/cases.md` appears here once. The owning stream fills in "New test ID" (`<file>::<test name>`) and sets State to `ported`, or to `retired` / `dropped` with a reason in the Invariant cell. Stream K fails the build while any row is `unmapped`. The risk matrix (`tests/regression/risk-matrix.md`) adds rows that were "new" or "thin" there; owners append those under their section.

Rows whose section owner is "dropped" need no test; the orchestrator closes them at G0.

## Payment transport security

Owner: **C**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| TLS-001 | The WeChat v2 and v3 payment transports keep certificate-chain and hostname verification on: no `verify => false`, no `CURLOPT_SSL_VERIFYPEER/HOST` disable, and the trust store comes from the server environment (`CRMEB_PAY_CA_BUNDLE`) with no backend toggle. | | unmapped |
| TLS-002 | A platform-signed response verifies, while a tampered body, a wrong signature, an unknown platform serial and a stale timestamp all fail the check. | | unmapped |
| TLS-003 | A response whose platform certificate cannot be fetched is never trusted, so the caller treats the query result as unknown and keeps resources. | | unmapped |
| TLS-004 | A signature made with a key that does not match the published certificate is rejected. | | unmapped |
| TLS-005 | A v3 notification is answered as a failure unless its platform signature verifies and its resource decrypts into a JSON object, so a forged "money received" cannot be believed. | | unmapped |
| TLS-006 | The v3 driver refuses to convert an unverified query or close response into `closed`/`paid`. | | unmapped |

## Payment concurrency and creation (offline gateway)

Owner: **C**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| PAYC-001 | A payment create held at the gateway boundary while a cancellation commits can never leave a collectible gateway payment on a cancelled order: either the cancel settles the attempt first, or the create is refused under the order lock and the attempt is closed. | | unmapped |
| PAYC-002 | A create the gateway accepted but whose response was lost keeps the attempt as unknown (not submitted, not closed), the order unpaid and uncancelled, and a later cancellation closes the gateway order before releasing anything. | | unmapped |
| PAYC-003 | Repeated pay taps by the same payer keep one attempt row for one merchant order number; no tap completes or cancels the order on its own. | | unmapped |
| PAYC-004 | The attempt's driver, merchant, app, channel, amount and payer are immutable: an identical replay is idempotent, any change is refused for manual handling and the stored row is untouched. | | unmapped |
| PAYC-005 | A recorded merchant identity that no longer matches the configuration stops cancellation with 请人工核对后处理 and releases no stock, coupon or cancel flag. | | unmapped |

## Payment and gateway

Owner: **C**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| PAY-001 | Unknown product order notification is acknowledged without side effects. | | unmapped |
| PAY-002 | Notification for an already paid product order does not run payment effects again. | | unmapped |
| PAY-003 | Internal notification failure returns failure so the gateway can retry. | | unmapped |
| PAY-004 | A valid product payment notification invokes the payment-success service once with its trade number. | | unmapped |
| PAY-005 | A concurrent notification is acknowledged when another worker atomically paid the order. | | unmapped |
| PAY-006 | Only the first atomic payment transition updates an order or records its trade number. | | unmapped |
| PAY-007 | Two callbacks for the same real order pay it exactly once: the losing callback keeps the first trade number and no status or capital-flow row is duplicated. | | unmapped |
| GATEWAY-001 | Signed WeChat V2/V3 callbacks reject a paid amount that is short, over, or malformed before any payment effect. | | unmapped |
| GATEWAY-002 | The retained `pay_wechat_type` setting selects the matching WeChat driver — `0` builds the v2 channel, `1` the v3 channel — and the setting ships with the install SQL. | | unmapped |

## Pricing

Owner: **B1**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| PRICE-001 | Integral deduction accounts for frozen points and the configured maximum. | | unmapped |
| PRICE-002 | Disabled integral deduction leaves price and available points unchanged. | | unmapped |
| PRICE-003 | Ordinary item pricing, coupon thresholds and freight boundaries. | | unmapped |
| PRICE-004 | Multi-item order pricing returns the cart list with its spread ids and splits the coupon across every row. | | unmapped |

## Stock

Owner: **B1**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| STOCK-001 | Zero and negative inventory deductions are rejected. | | unmapped |
| STOCK-002 | A deduction larger than available stock is rejected without changing stock or sales. | | unmapped |
| STOCK-003 | Two concurrent deductions of the last item yield one success, final stock 0 and sales 1. | | unmapped |
| STOCK-004 | Activity inventory requires sufficient stock and quota in the same update. | | unmapped |

## Queue and lifecycle

Owner: **B1 / C**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| QUEUE-001 | Paid, deleted, offline and already cancelled orders are not restored by the unpaid-cancel job. | | unmapped |
| QUEUE-002 | An eligible unpaid order restores resources and persists cancellation state once. | | unmapped |
| QUEUE-003 | A cancellation settles the payment gateway before it releases anything: settlement runs first, the attempt is marked closed, and only then are the coupon and the stock restored. | | unmapped |
| QUEUE-004 | An unconfirmed gateway state (unknown or timeout) releases nothing: the attempt is neither closed nor marked, the coupon and the stock stay with the order and the job reports failure. | | unmapped |
| QUEUE-005 | A gateway payment discovered during cancellation keeps the order alive, runs the unified local confirmation with the query's fresh trade number inside the original order lock, and releases no resource. | | unmapped |
| QUEUE-006 | When the stock restore fails the coupon return, the stock restore and the cancel flag roll back together and no coupon_back status row survives. | | unmapped |
| QUEUE-007 | When the coupon cannot be returned the stock restore never runs and no stock layer is touched. | | unmapped |
| QUEUE-008 | Cancelling a presale order restores all four ledgers (the presale activity row, its type-6 SKU, the product row and its type-0 SKU) with deliberately different presale and product ids, so a restore through the ordinary layer cannot pass on matching totals. | | unmapped |
| QUEUE-009 | Two concurrent cancellations of one order release the stock and the coupon once and write one coupon_back row; the loser observes the committed cancellation. | | unmapped |
| QUEUE-010 | Payment success records exactly one effect for the order and hands that recorded row to the repair job, which runs the effect it was given; the row is never written by a second path. | | unmapped |
| QUEUE-011 | A repeated callback reuses the effect entry it already wrote, and one delivery claims it: a second concurrent delivery cannot run the same effect, a finished, freshly claimed or attempt-exhausted record is not re-delivered, an unknown or interrupted one is, and a failed effect records the unknown outcome with its attempt counted. | | unmapped |
| ORDER-001 | The retained purchase path over real HTTP: cart, confirm, computed, create — the order lands with the stock decremented and `order/computed` returns the same price the confirmation promised. | | unmapped |
| ORDER-002 | Order creation queues `UnpaidOrderCancelJob` for the new order, so abandoned orders expire and release stock. | | unmapped |
| ORDER-003 | An unpaid order can be cancelled once, a paid one never, and neither leaves a duplicate status row. | | unmapped |
| ORDER-004 | Over real HTTP, submitting an order with an already spent coupon is refused before any write: no order row, the product stock unchanged and the coupon still spent rather than returned. | | unmapped |

## Core business invariants (independent review)

Owner: **assign per row**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| ORDER-005 | Only an unpaid, cancelled or refunded order can be deleted by its owner: a paid or shipped one stays, a stranger cannot delete any order, and the refused attempts change nothing. | | unmapped |
| ORDER-006 | A cancelled order cannot be paid afterwards (the refusal leaves no attempt behind) and a refunded order cannot be confirmed as received. | | unmapped |
| ORDER-007 | A repeated receipt is refused and does not add a second receipt status row. | | unmapped |
| ORDER-008 | An order whose second stock deduction fails rolls back completely: no order row, the first item's product and SKU stock restored, and the failed item untouched. | | unmapped |
| COUPON-007 | The last coupon cannot be claimed twice: one concurrent claim wins, the other is refused, `remain_count` never goes negative and exactly one user holds it. (Owner: Golden slice) | `packages/core/src/coupon/coupon.concurrency.int.test.ts::COUPON-007 — the last coupon, claimed by two people at once > hands the last one to exactly one claimant`, `… > never oversells a larger supply and never goes negative` | ported |
| COUPON-008 | Two simultaneous claims by one user leave exactly one success, the loser refused by the per-user limit, and one claim record. (Owner: Golden slice) | `packages/core/src/coupon/coupon.concurrency.int.test.ts::COUPON-008 — one user tapping 领取 twice > holds the per-user limit, and the unique violation surfaces as a 409` | ported |
| AUTH-005 | A stranger gets `订单不存在` (never the after-sale detail) from the storefront refund surface, and the admin refund route refuses an unauthenticated call without completing the after-sale. | | unmapped |
| CLIENT-001 | The retained purchase contract fields are accepted by the real routes; a paid order reports `已支付` rather than a new payment intent, and an order with an unknown gateway result is refused with a manual-handling message instead of a payment intent. | | unmapped |

## Authorization

Owner: **B2 / E1**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| AUTH-001 | Standard and legacy authorization headers populate the authenticated request. | | unmapped |
| AUTH-002 | Optional authentication failure continues with an anonymous request. | | unmapped |
| AUTH-003 | Token expiry and cross-user order read/write isolation through HTTP routes. | | unmapped |
| AUTH-004 | Mobile order management admits exactly the uids on the order-notice roster; an empty roster closes it. | | unmapped |

## Refunds

Owner: **C**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| REFUND-001 | Historical pay types (`yue`, `offline`, `alipay`, `allinpay`, empty) are refused for original-channel refunds with the offline-handling message, while WeChat orders pass the guard when handed a model the way the dispatcher does. | | unmapped |
| REFUND-002 | A presale order restore moves the presale activity row, the presale SKU, the product row and the product SKU back to their exact prior stock and sales; the fixture uses deliberately different ids and SKUs for the presale and the product layers so a restore through the wrong layer cannot pass on matching totals. | | unmapped |
| REFUND-003 | An order sold from a group buy, a presale or ordinary stock restores through that layer only: the matching service is called once with the id and SKU the order carried, and the other two are never called. | | unmapped |
| REFUND-004 | When the stock restore returns false the refund stops with `库存回退失败` before the payment gateway is resolved, and no `refund_price` status row is written. | | unmapped |
| REFUND-005 | The refund number and amount are frozen on the first attempt and replayed on every retry: a second call with a higher amount reuses the persisted after-sale number and the originally frozen price, and both are persisted on the after-sale row. | | unmapped |
| REFUND-006 | Two refund attempts released together from separate processes freeze one gateway number and one amount, and the persisted row matches what both attempts agreed on. | | unmapped |

## Registration and notifications

Owner: **E1 / E2**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| USER-001 | Self registration through the real `/api/register` route issues the configured newcomer coupon to the new uid only. | | unmapped |
| USER-002 | A registration retry issues the coupon once and never credits money or points. | | unmapped |
| USER-003 | The order-notice roster drives who receives the new-order in-site message, and nobody outside it. | | unmapped |

## Coupons

Owner: **Golden slice**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| COUPON-001 | A retired member coupon (`receive_type = 4`, including the row the install SQL still ships) is absent from the storefront list, the PC list, the popup list, the quantity counts, the `receive_types = 1` search and the DIY `theme/coupon` component (both the every-user and the pinned-id form, while a component saved for the retired member audience returns an empty list), while an ordinary coupon stays listed. **Retired**: the new schema has no member claim mode — `coupon_claim_mode` is `manual / new_user / order_gift / admin_grant` — so there is no row for any surface to hide. What remains testable is that the legacy rows never arrive: the migration drops them by id and counts them. | `packages/etl/src/mappers/coupon.test.ts::templates > migrates the seed data and drops the member coupon — COUPON-001 / COUPON-002` | retired |
| COUPON-002 | Claiming a retired member coupon by id fails with `该优惠券所属业务已下线` before any write: no claim record, no user coupon and an unchanged `remain_count`. **Retired** with COUPON-001: an id that was a member coupon is not in `coupon_templates` at all, so `claim` answers `COUPON_TEMPLATE_NOT_FOUND` (404) like any unknown id, which the refusal test below covers. | `packages/etl/src/mappers/coupon.test.ts::templates > migrates the seed data and drops the member coupon — COUPON-001 / COUPON-002`, `packages/core/src/coupon/coupon.int.test.ts::claim > refuses a draft, disabled, deleted or unknown template the same way` | retired |
| COUPON-003 | An ordinary coupon can still be claimed and still consumes one from `remain_count`. | `packages/core/src/coupon/coupon.int.test.ts::claim > puts a coupon in the wallet and decrements the supply — COUPON-003` | ported |
| COUPON-004 | Redeeming the same coupon twice succeeds once: the first redemption marks the row used and records the use time, and a second attempt in a later second changes nothing and does not rewrite the use time. | `packages/core/src/coupon/coupon.int.test.ts::redeem > refuses a second redemption — COUPON-004` | ported |
| COUPON-005 | A coupon that is not usable by this holder is refused in one conditional update and left in the state it was found: already used, marked failed, expired, not yet valid, and a coupon held by another uid each return zero affected rows. | `packages/core/src/coupon/coupon.int.test.ts::redeem > refuses every unusable shape with one code — COUPON-005` | ported |
| COUPON-006 | Two redemptions of one coupon released together from separate processes leave exactly one winner: the loser observes zero affected rows and the row records a single use. | `packages/core/src/coupon/coupon.concurrency.int.test.ts::COUPON-006 — one coupon, two orders at the same instant > lets exactly one redemption win` | ported |

## Storefront paths broken by the removal

Owner: **H / I**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| SMOKE-001 | Freight calculation accepts the retained signature the trimmed call sites use. | | unmapped |
| SMOKE-002 | Recommendation lists load without the deleted `$where` clause (storefront home, PC and DIY defaults). | | unmapped |
| SMOKE-003 | `/api/index` and the logged-in `/api/v2/index` respond. | | unmapped |
| SMOKE-004 | `/api/userinfo` responds for the token holder. | | unmapped |
| SMOKE-005 | The order-create listener finishes on the shortened payload and records the order status. | | unmapped |
| SMOKE-006 | A finished order can be deleted by its owner; a shipped one cannot; neither can a stranger's. | | unmapped |
| SMOKE-007 | Retired payment flags report off without their config rows instead of inverting to true. | | unmapped |
| SMOKE-008 | The order-type statistic separates retained orders from historical ones instead of repeating the whole-table total. | | unmapped |
| SMOKE-009 | The group-buy poster endpoint composes and uploads the poster offline (QR attachment pre-seeded), not a 500. | | unmapped |
| SMOKE-010 | DIY data keeps the retained activities and drops the dead navigation entries whole. | | unmapped |
| SMOKE-011 | Presale expiry unlists only expired presale products. | | unmapped |
| SMOKE-012 | A successful group updates leader and members once without repeated notifications. | | unmapped |

## Boundary of the retained shop

Owner: **K**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| CORE-001 | Retired payment types and order parameters are refused before any write; combination and presale parameters stay valid; gift rewards accept only coupons. | | unmapped |
| CORE-002 | Removed storefront and admin routes answer 404 over HTTP, retained ones still match, and retired user parameters are rejected before writes while legacy empty values still filter. | | unmapped |

## Historical compatibility

Owner: **dropped: no orders are migrated**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| HIST-001 | Historical orders (retired pay types, seckill/bargain/presale fields) stay listable, readable and exportable with stable `历史：…` pay labels, including DAO lists with real cart rows. | | unmapped |

## Migration

Owner: **dropped: legacy MySQL migrations; ETL checks belong to J**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| MIG-001 | `plan` is read-only and reports the retired tables (including empty ones), seeds, timers, menus, senderless notifications and events it will remove. | | unmapped |
| MIG-002 | `plan` leaves the shipped retained timers (`takeDelivery`, `clearPoster`, …) off the removal list and the retained menus parented under live parents. | | unmapped |
| MIG-003 | `apply` renames every seeded retired table, removes exactly the retired seeds, keeps the retained timers and menus, carries the notify-or-customer roster union across, creates the retained settings, and is a no-op afterwards without overwriting the backup. | | unmapped |
| MIG-004 | Completed withdrawals (`status=1`) do not block apply; pending ones (`status=0`) do, and the refusal happens before any backup is written. | | unmapped |
| MIG-005 | `finalize` drops only empty renamed tables: a table that still holds rows refuses the whole batch with exit code 2 and the table names and row counts, and neither `--yes` nor `--dump` can bypass it. Empty tables are dropped when a dump is given, and a later `rollback` then fails non-zero instead of reporting success. | | unmapped |
| MIG-006 | `plan` reports unreachable balances from a funded database (a field-restricted `find()` used to report zero) and blocks apply on paid self-pickup orders that could never be written off. | | unmapped |
| MIG-007 | `rollback` restores every shared table row-for-row after apply. | | unmapped |
| MIG-008 | `apply` creates every missing config tab and setting when several are missing at once, each with its own id and a correct `config_tab_id` reference. | | unmapped |
| MIG-009 | A setting that is both created by this apply and holds a notification roster inherits the merged uid list, so order alerts and mobile order management survive its first creation. | | unmapped |
| MIG-010 | A retained setting that lives on a retired tab is moved to the retained tab with its value intact instead of being deleted with the tab. | | unmapped |
| MIG-011 | The WeChat payment version setting survives apply with its configured value, and a fresh install ships it too. | | unmapped |
| MIG-012 | `rollback` refuses, without touching a single table name or row, when any recorded row was edited after apply; the refusal happens before the first rename. | | unmapped |
| MIG-013 | `rollback` can be retried: after a rename completed but the data restore failed, a second run restores the remaining rows and repeating it again changes nothing. | | unmapped |
| MIG-014 | A refused `plan` leaves the database unmodified. | | unmapped |
| MIG-015 | A fresh install already ships the reliability schema: the payment-attempt, effect and exception-payment tables with their unique keys, and the three refund columns. | | unmapped |
| MIG-016 | The reliability migration adds every missing table, refund column and unique index to a database that predates them, verifies the result by re-reading the schema (types and indexes included), leaves existing order and refund rows alone with an empty new refund number, and leaves nothing to do on a second run. | | unmapped |
| MIG-017 | The reliability migration finishes an interrupted release: a run that stopped after the first table is completed by the next one, and the object that already exists is not planned again. | | unmapped |

## Test strength and stability (independent review)

Owner: **K**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| SEQ-001 | A fixed-seed sequence of real operations (create payment, gateway payment, cancel, refund, duplicate notification, close task) interleaved over three orders keeps every invariant after every step: a cancelled order keeps no collectible gateway payment, a paid attempt carries its trade number, money taken at the gateway is recorded locally, completed refunds never exceed the payment, and each stock layer keeps every unit in stock or sold. Four seeds run in the suite, and a failure prints the seed and the full event log for an exact replay. | | unmapped |
| MUT-001 | Removing any of ten protections (the payment/cancel order lock, attempt immutability, the gateway-confirmed close, the refund amount freeze, the coupon remaining-count guard, the virtual-card atomic claim, the service-generated refund completion, TLS peer verification, response signature validation, the cancelled-order payment branch) in a temporary copy makes the corresponding test fail; no protection is left unexercised. | | unmapped |
| STAB-001 | The concurrency set (payment creation vs cancellation, refund agreement in two processes, coupon races, the virtual-card race, multi-item rollback, the fixed-seed sequence) passes 10 consecutive repetitions with no flake. | | unmapped |

## Backup, upgrade and rollback (independent review)

Owner: **J**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| OPS-005 | `upgrade.sh` refuses a moving tag, records the running digest as the rollback target, and refuses a deployment whose roles run different images. | | unmapped |
| OPS-006 | A dry run reports the plan without stopping writers or taking a backup. | | unmapped |
| OPS-007 | A failing migration keeps maintenance mode and resumes no traffic; the backup stays intact. | | unmapped |
| OPS-008 | A truncated backup is diagnosed before any migration and keeps the stack stopped. | | unmapped |
| OPS-009 | A backup that cannot be restored (contents disagree with the live database) stops the upgrade before any migration. | | unmapped |
| OPS-010 | A valid upgrade dumps, verifies the dump by restoring it into an isolated database and comparing retained row counts, runs the migrations, resumes traffic and reports the rollback target. | | unmapped |
| OPS-011 | `rollback.sh` refuses an unavailable target instead of changing the deployment, and never claims a database was restored. | | unmapped |

## Release publishing (independent review)

Owner: **J**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| REL-001 | The first publish of a commit creates its commit-scoped tags and reports a digest. | | unmapped |
| REL-002 | Republishing the same commit reuses the same digest and is reported as a no-op. | | unmapped |
| REL-003 | A candidate whose content differs from an existing tag fails the publish and names the digest it found, instead of silently republishing. | | unmapped |
| REL-004 | A registry query that cannot tell whether a tag exists aborts instead of being read as "absent". | | unmapped |
| REL-005 | Promotion refuses a candidate that was never published and a candidate from another commit, and moves the deployment tag only to the verified digest. | | unmapped |
| REL-006 | A static guard keeps the workflows calling the tested script (no inline publish helpers), keeps automated publishing from moving the deployment tag, requires the manual promotion inputs (digest, source SHA, acceptance record) and forbids the promotion workflow from rebuilding or pushing an image. | | unmapped |
| REL-007 | Releases are serialized repository-wide and never cancelled mid-publish. | | unmapped |

## Deployment topology (independent review)

Owner: **J**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| OPS-001 | The workerman health probe completes its Channel round trip through the address the configuration names: an empty `CLIENT_IP` is refused and there is no 127.0.0.1 fallback, so a bad address fails instead of passing inside its own container. | | unmapped |
| OPS-002 | The queue and timer roles verify the Channel address they are configured with, not only a fresh heartbeat; stopping the Channel server turns them unhealthy. | | unmapped |
| OPS-003 | `/readyz` gates on the tables, the refund columns and the unique indexes the release needs, and returns 503 (with no credentials or error detail) when any of them is missing; it recovers once the index is restored. | | unmapped |
| OPS-004 | The production topology runs a probe for every role it starts (`php`, `queue`, `timer`, `workerman`), asserted by a static guard. | | unmapped |

## Reliability schema verification (independent review)

Owner: **P0-S**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| MIG-018 | A unique index dropped from a shipped reliability table is reported by `plan` (non-zero) with the missing index named, and `apply` recreates it — verified by re-reading `information_schema`. | | unmapped |
| MIG-019 | A column of the wrong type is reported by `plan` and blocks `apply` before any avoidable DDL; the conflicting column is left as it was. | | unmapped |
| MIG-020 | An unresolved payment attempt (`status 0/3`) blocks `apply` with the count and the `order:reconcile payments:list` hint, and the migration proceeds once the state is resolved. | | unmapped |
| MIG-021 | An unknown effect and an in-flight refund each block `apply` (with `effects:list` / `refunds:list` hints) and release it once resolved. | | unmapped |
| MIG-022 | An interrupted run (a missing refund column on a database with the other objects) is completed by the next run, a second run is a no-op, and the retained order, cart, coupon and user rows keep their counts and states. | | unmapped |

## Maintenance tools

Owner: **dropped: tools not ported**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| MAINT-001 | The maintenance endpoints succeed over HTTP, the personal-centre menu skips removed pages, domain replacement rewrites retained media columns, "clear data" skips missing tables, refuses unsafe table names, and clears the retained order tables. | | unmapped |

## SQL mode and route integrity

Owner: **K**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| SQL-001 | Grouped DAO queries (cart summing, reply keywords, capital flow, user list, home charts) work under `ONLY_FULL_GROUP_BY`. | | unmapped |
| ROUTE-001 | Every registered route target resolves to a real controller method in its own layer. | | unmapped |
