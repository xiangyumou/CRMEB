# Invariant parity

Every line of `tests/regression/cases.md` appears here once. The owning stream fills in "New test ID" (`<file>::<test name>`) and sets State to `ported`, or to `retired` / `dropped` with a reason in the Invariant cell. Stream K fails the build while any row is `unmapped`. The risk matrix (`tests/regression/risk-matrix.md`) adds rows that were "new" or "thin" there; owners append those under their section.

Rows whose section owner is "dropped" need no test; the orchestrator closes them at G0.

## Payment transport security

Owner: **C**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| TLS-001 | The WeChat v2 and v3 payment transports keep certificate-chain and hostname verification on: no `verify => false`, no `CURLOPT_SSL_VERIFYPEER/HOST` disable, and the trust store comes from the server environment (`CRMEB_PAY_CA_BUNDLE`) with no backend toggle. **Retired toggle, kept as a guard.** There is no successor setting: verification is the platform `fetch`'s and the trust store is the container's, so the test asserts that no group this stream owns can grow one. | `packages/core/src/payment/payment.config.test.ts::TLS-001 — no TLS toggle, in any group this stream owns > has no verification switch in `payment``, `packages/core/src/payment/payment.config.test.ts::TLS-001 — no TLS toggle, in any group this stream owns > has no verification switch in `wechat``, `packages/core/src/payment/payment.config.test.ts::TLS-001 — no TLS toggle, in any group this stream owns > keeps the API host configurable but off the form, so it cannot be re-pointed by hand`, `packages/core/src/refund/refund.config.test.ts::TLS-001 — no verification switch in `refund` > has none in the schema` | ported |
| TLS-002 | A platform-signed response verifies, while a tampered body, a wrong signature, an unknown platform serial and a stale timestamp all fail the check. | `packages/core/src/wechat/wechat.crypto.test.ts::TLS-002 — a platform-signed payload verifies, and four ways of being wrong do not > accepts a correctly signed body`, `packages/core/src/wechat/wechat.crypto.test.ts::TLS-002 — a platform-signed payload verifies, and four ways of being wrong do not > refuses a tampered body`, `packages/core/src/wechat/wechat.crypto.test.ts::TLS-002 — a platform-signed payload verifies, and four ways of being wrong do not > refuses an unknown platform serial`, `packages/core/src/wechat/wechat.crypto.test.ts::TLS-002 — a platform-signed payload verifies, and four ways of being wrong do not > refuses a stale timestamp in either direction` | ported |
| TLS-003 | A response whose platform certificate cannot be fetched is never trusted, so the caller treats the query result as unknown and keeps resources. | `packages/core/src/wechat/wechat.crypto.test.ts::TLS-003 — an unfetchable platform certificate is a refusal, not a default > refuses when the key set is empty`, `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > leaves the attempt unknown — not closed — when reconciliation cannot trust the answer` | ported |
| TLS-004 | A signature made with a key that does not match the published certificate is rejected. | `packages/core/src/wechat/wechat.crypto.test.ts::TLS-004 — a signature made with a key that is not the published one is rejected > rejects a body signed with the merchant key`, `packages/core/src/wechat/wechat.crypto.test.ts::TLS-004 — a signature made with a key that is not the published one is rejected > answers false rather than throwing for a malformed key or signature` | ported |
| TLS-005 | A v3 notification is answered as a failure unless its platform signature verifies and its resource decrypts into a JSON object, so a forged "money received" cannot be believed. | `packages/core/src/wechat/wechat.crypto.test.ts::TLS-005 — a resource must decrypt into a JSON object to be believed > refuses plaintext that is not JSON at all`, `packages/core/src/payment/payment.int.test.ts::PAY-003 — a failure on our side asks WeChat to deliver again > answers 401 for a signature it cannot verify, before touching the database` | ported |
| TLS-006 | The v3 driver refuses to convert an unverified query or close response into `closed`/`paid`. | `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > refuses a query response signed with the wrong key`, `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > accepts an empty 204 close, which carries no signature to verify`, `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > refuses a close whose error body cannot be verified`, `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > refuses to cancel an order whose close the gateway would not confirm`, `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > treats a dropped connection as silence, not as a closed order` | ported |

## Payment concurrency and creation (offline gateway)

Owner: **C**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| PAYC-001 | A payment create held at the gateway boundary while a cancellation commits can never leave a collectible gateway payment on a cancelled order: either the cancel settles the attempt first, or the create is refused under the order lock and the attempt is closed. | `packages/core/src/payment/payment.int.test.ts::PAYC-001 — a create in flight is never stepped over > settles it with the gateway first, and cancels only on a confirmed negative`, `packages/core/src/payment/payment.int.test.ts::PAYC-001 — a create in flight is never stepped over > releases nothing while the gateway will not say` | ported |
| PAYC-002 | A create the gateway accepted but whose response was lost keeps the attempt as unknown (not submitted, not closed), the order unpaid and uncancelled, and a later cancellation closes the gateway order before releasing anything. | `packages/core/src/payment/payment.int.test.ts::PAYC-002 — a create whose answer was lost > keeps the attempt unknown, and the order neither paid nor cancellable`, `packages/core/src/payment/payment.int.test.ts::PAYC-002 — a create whose answer was lost > books the payment when the answer that was lost was "yes"`, `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-002 — the reconciliation sweep racing a callback > settles once when the sweep and the notification arrive together` | ported |
| PAYC-003 | Repeated pay taps by the same payer keep one attempt row for one merchant order number; no tap completes or cancels the order on its own. | `packages/core/src/payment/payment.int.test.ts::PAYC-003 — repeated taps > keeps one attempt and one merchant order number`, `packages/core/src/payment/payment.int.test.ts::PAYC-003 — repeated taps > re-uses the frozen number rather than opening a second gateway order after a lost answer`, `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-004 — starting the same payment twice > produces exactly one attempt and one gateway order`, `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-004 — starting the same payment twice > inserts at most one open attempt — the unique index alone` | ported |
| PAYC-004 | The attempt's driver, merchant, app, channel, amount and payer are immutable: an identical replay is idempotent, any change is refused for manual handling and the stored row is untouched. | `packages/core/src/payment/payment.int.test.ts::PAYC-004 — the attempt is immutable > refuses a replay that disagrees about the channel, and leaves the row alone`, `packages/core/src/payment/payment.int.test.ts::PAYC-004 — the attempt is immutable > refuses a replay from a different payer`, `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-004 — starting the same payment twice > refuses a replay that disagrees about the channel` | ported |
| PAYC-005 | A recorded merchant identity that no longer matches the configuration stops cancellation with 请人工核对后处理 and releases no stock, coupon or cancel flag. | `packages/core/src/payment/payment.int.test.ts::PAYC-005 — the merchant on the attempt is no longer the configured one > stops the cancellation, asks WeChat nothing, and leaves a message for a human`, `packages/core/src/payment/payment.int.test.ts::PAYC-005 — the merchant on the attempt is no longer the configured one > refuses to reconcile it either, so the sweep cannot close it by accident` | ported |

## Payment and gateway

Owner: **C**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| PAY-001 | Unknown product order notification is acknowledged without side effects. **Adapted:** the delivery is still acknowledged and no order changes, but the money is no longer dropped — it becomes a `payment_exceptions` row and an automatic refund effect. | `packages/core/src/payment/payment.int.test.ts::PAY-001 — a notification for an order this shop does not have > acknowledges it, touches no order, and books it as an exception to refund` | ported |
| PAY-002 | Notification for an already paid product order does not run payment effects again. | `packages/core/src/payment/payment.int.test.ts::PAY-002 — an order that is already paid > treats the same transaction arriving again as a replay`, `packages/core/src/payment/payment.int.test.ts::PAY-002 — an order that is already paid > treats a *different* transaction on a paid attempt as a second real payment` | ported |
| PAY-003 | Internal notification failure returns failure so the gateway can retry. | `packages/core/src/payment/payment.int.test.ts::PAY-003 — a failure on our side asks WeChat to deliver again > answers 500 FAIL rather than acknowledging money it did not record` | ported |
| PAY-004 | A valid product payment notification invokes the payment-success service once with its trade number. | `packages/core/src/payment/payment.int.test.ts::PAY-004 — a valid notification settles the order exactly once > pays the order, books the flow and records the hand-off effect`, `packages/core/src/payment/payment.int.test.ts::PAY-004 — a valid notification settles the order exactly once > records a non-SUCCESS notification without acting on it` | ported |
| PAY-005 | A concurrent notification is acknowledged when another worker atomically paid the order. | `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > books the money once however many times WeChat delivers the same notification`, `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > is the callback insert that decides, not a prior read — the repo statement alone` | ported |
| PAY-006 | Only the first atomic payment transition updates an order or records its trade number. | `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > marks the order paid exactly once — the conditional update alone`, `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-002 — the reconciliation sweep racing a callback > lets exactly one of many concurrent reconciliations book the payment` | ported |
| PAY-007 | Two callbacks for the same real order pay it exactly once: the losing callback keeps the first trade number and no status or capital-flow row is duplicated. | `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > books the money once however many times WeChat delivers the same notification`, `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > treats a second notification for the same transaction as a replay` | ported |
| GATEWAY-001 | Signed WeChat V2/V3 callbacks reject a paid amount that is short, over, or malformed before any payment effect. A body with no usable amount at all (absent, zero or unparseable) is acknowledged and parked as `ignored: invalid amount` instead: there is nothing to book and nothing to refund, and a 500 would ask WeChat to redeliver the same bytes forever. | `packages/core/src/payment/payment.int.test.ts::GATEWAY-001 — an amount that disagrees is never booked > refuses a short amount, however well signed it is`, `packages/core/src/payment/payment.int.test.ts::GATEWAY-001 — an amount that disagrees is never booked > refuses an over amount, however well signed it is`, `packages/core/src/payment/payment.int.test.ts::GATEWAY-001 — an amount that disagrees is never booked > parks an unparseable amount on the callbacks table instead of looping`, `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-002 — the reconciliation sweep racing a callback > never books a payment whose amount disagrees with the attempt` | ported |
| GATEWAY-002 | The retained `pay_wechat_type` setting selects the matching WeChat driver — `0` builds the v2 channel, `1` the v3 channel — and the setting ships with the install SQL. **Retired:** there is no v2 driver to select. The rewrite speaks WeChat Pay v3 only (`node:crypto`, RSA + AEAD), so `pay_wechat_type` has no successor setting and the install SQL that shipped it is gone. |  | retired |

## Pricing

Owner: **B1**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| PRICE-001 |  Integral deduction accounts for frozen points and the configured maximum. **Retired: the points system is not ported.** | | retired |
| PRICE-002 |  Disabled integral deduction leaves price and available points unchanged. **Retired: the points system is not ported.** | | retired |
| PRICE-003 | Ordinary item pricing, coupon thresholds and freight boundaries. | `packages/core/src/order/order.int.test.ts::checkout preview > prices the ticked cart rows with freight and a coupon`, `packages/core/src/order/order.pricing.test.ts::payableOf > is items + freight - discount`, `packages/core/src/order/order.pricing.test.ts::payableOf > floors at zero rather than owing the shopper money`, `packages/core/src/order/order.pricing.test.ts::payableOf > still charges freight when the goods are fully discounted`, `packages/core/src/order/order.pricing.test.ts::couponAdjustment > discounts only the lines inside the coupon scope` | ported |
| PRICE-004 | Multi-item order pricing returns the cart list with its spread ids and splits the coupon across every row. | `packages/core/src/order/order.int.test.ts::order creation > per-line discount shares add back up to the order total`, `packages/core/src/order/order.pricing.test.ts::splitAdjustments > adds the shares back to the total for an awkward three-way split`, `packages/core/src/order/order.pricing.test.ts::distribute > gives the leftover fen to the largest remainder, deterministically` | ported |

## Stock

Owner: **B1**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| STOCK-001 | Zero and negative inventory deductions are rejected. | `packages/core/src/order/order.int.test.ts::the stock port > refuses a line of zero, negative or fractional units without touching anything` | ported |
| STOCK-002 | A deduction larger than available stock is rejected without changing stock or sales. | `packages/core/src/order/order.int.test.ts::the stock port > takes nothing when one line of several is short, and names that line`, `packages/core/src/order/order.int.test.ts::order creation > refuses when the stock ran out between the preview and the submit` | ported |
| STOCK-003 | Two concurrent deductions of the last item yield one success, final stock 0 and sales 1. | `packages/core/src/order/order.concurrency.int.test.ts::two checkouts for the last unit > sells it exactly once`, `packages/core/src/order/order.concurrency.int.test.ts::two checkouts for the last unit > sells ten units to exactly ten of twelve buyers` | ported |
| STOCK-004 |  Activity inventory requires sufficient stock and quota in the same update. **Owner: stream D (group buy and presale stock through `StockPort`).** | | unmapped |

## Catalog

Owner: **A**

STOCK-001 to STOCK-003 above are B1's rows and stay B1's: the order domain owns
when stock moves. What *does* the moving is `catalog.stock.ts`, which implements
`StockPort`, so the same three invariants are pinned a second time from this
side — in `catalog.int.test.ts::stock` and
`catalog.concurrency.int.test.ts::reserving the last unit` — against the
one-statement conditional UPDATE rather than through order creation. Neither set
is redundant: B1's says the order refuses, mine says the row never moves.

The risk matrix (§1 "Products and cart") contributes CAT-001: "Product on/off
shelf (`is_show`)" was *thin* there — the fixture only ever used a live product.

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| CAT-001 | Taking a product off the shelf takes it off everywhere at once: out of the storefront list, out of search, a 404 on its page, and a refusal at the sale — including inside an order transaction that started while it was still live. | `packages/core/src/catalog/catalog.int.test.ts::taking a product off the shelf > removes it from the storefront list`, `… > hides it from search`, `… > makes the product page a 404`, `… > refuses the sale`, `… > refuses a new line even inside the order transaction` | ported |
| CAT-002 | Stock and sales move in one atomic statement, never read-then-write: a reservation reports the line it could not satisfy and takes nothing, two cart rows of one SKU become one decrement, and the product rollup follows the SKU. Legacy's `incStockDecSales` read the row first and wrote it back. | `packages/core/src/catalog/catalog.int.test.ts::stock > reserves, and reports the line it could not satisfy`, `… > merges two cart rows of the same SKU into one decrement`, `… > rolls the product stock down with the SKU`, `… > the CHECK constraint is the backstop under a raw over-decrement` | ported |
| CAT-003 | The last unit is sold exactly once however many shoppers commit at the same instant, and a larger pool hands out exactly the stock that existed. | `packages/core/src/catalog/catalog.concurrency.int.test.ts::reserving the last unit > sells it exactly once, however many shoppers commit at the same instant`, `… > hands out exactly the stock that existed, no more` | ported |
| CAT-004 | A stock effect replayed in parallel still moves the numbers once: the paid event commits the sale once, a retried cancellation returns the stock once, and sales never go negative when a release over-reaches. | `packages/core/src/catalog/catalog.concurrency.int.test.ts::a replayed stock effect > moves sales once even when the ledger delivers the paid event in parallel`, `… > returns the stock once when a cancellation is retried in parallel`, `packages/core/src/catalog/catalog.int.test.ts::stock > never lets sales go negative when a release over-reaches` | ported |
| CAT-005 | A refund release is idempotent **per refund**, not per order: two partial refunds of one order both restock, a replay of either does not, and the cancel path keeps a key of its own. (CR-1-a.) | `packages/core/src/catalog/catalog.int.test.ts::stock > restocks both partial refunds of one order, and neither of them twice`, `… > keeps the cancel key and the refund key apart`, `… > a committed release restores the stock and takes the sale back, in one move` | ported |
| CAT-006 | Editing a product keeps the SKU rows their history hangs on: a price edit leaves the SKU id, its stock and its sales alone, and the denormalised product price and stock are rolled up from the visible SKUs only. | `packages/core/src/catalog/catalog.int.test.ts::products > keeps a SKU id, its stock and its sales when the price is edited`, `… > rolls the denormalised price and stock up from the visible SKUs`, `… > excludes an invisible SKU from the price and the stock`, `apps/web/app/admin/(shell)/catalog/products/product-editor.test.tsx::商品编辑器 > turns the detail response into form input without a single null` | ported |
| CAT-007 | A product an unfinished order still references cannot be deleted, and a restored product comes back off the shelf rather than straight back on sale. | `packages/core/src/catalog/catalog.int.test.ts::products > refuses to delete a product an unfinished order still references`, `… > restores a deleted product as off_shelf, never straight back on sale`, `… > refuses to restore a product that was never deleted` | ported |
| CAT-008 | The category tree is three levels and consistent: the path and level are materialised from the parent, a fourth level is refused, a moved branch rewrites its whole subtree, a cycle is refused, and a category still holding products cannot be deleted. | `packages/core/src/catalog/catalog.int.test.ts::categories > materialises the path and the level from the parent`, `… > refuses a fourth level`, `… > rewrites the whole subtree when a branch moves`, `… > refuses to make a category a child of its own descendant`, `… > refuses to delete a category that still holds products` | ported |
| CAT-009 | A card-key product's stock **is** its card pool: importing derives the stock and reports duplicates, an import against a non-card product is refused, voiding takes only unclaimed cards back out, and the product form refuses a hand-typed stock. Legacy let the two numbers drift and sold cards that did not exist. | `packages/core/src/catalog/catalog.int.test.ts::virtual cards > derives the stock from the pool and reports duplicates`, `… > refuses an import against a product that is not a card product`, `… > voids only unclaimed cards`, `packages/core/src/catalog/catalog.rules.test.ts::the product form > refuses a hand-typed stock on a card product` | ported |
| CAT-010 | One card per order line, for good: a claim hands the same card back on a replay, two buyers never get the same card, and an empty pool refuses rather than overselling. | `packages/core/src/catalog/catalog.int.test.ts::virtual cards > hands one card per order line and gives the same card back on a replay`, `… > refuses when the pool is empty`, `packages/core/src/catalog/catalog.concurrency.int.test.ts::claiming a virtual card > never hands the same card to two buyers`, `… > gives one order line one card even when the effect is delivered twice at once` | ported |
| CAT-011 | A buyer reviews a delivered line exactly once — a double-tapped button writes one row, somebody else's line is refused without saying why, and a line not yet received is refused. | `packages/core/src/catalog/catalog.int.test.ts::reviews > lets a buyer review a delivered line exactly once`, `… > refuses a line belonging to somebody else without saying why`, `… > refuses a line that has not been received yet`, `packages/core/src/catalog/catalog.concurrency.int.test.ts::a double-tapped 发表评价 button > writes one review and refuses the rest` | ported |
| CAT-012 | Moderation counts what it moved, not what it was handed: a batch reports the rows the one conditional update actually changed, two operators submitting the same batch do not both count it, and a hidden review is gone from the storefront list and from the summary. | `packages/core/src/catalog/catalog.int.test.ts::reviews > batch moderation counts the rows it moved, not the ids it was handed`, `… > hides a hidden review from the storefront list`, `packages/core/src/catalog/catalog.concurrency.int.test.ts::two operators submitting the same moderation batch > reports the rows moved between them exactly once`, `apps/web/app/admin/(shell)/catalog/reviews/product-reviews.test.tsx::商品评价 > publishes a selection in one request` | ported |
| CAT-013 | The auto-review job writes its five-star default once the window has passed and never twice, and leaves a line the shopper reviewed alone. | `packages/core/src/catalog/catalog.int.test.ts::auto review > writes a five-star default once the window has passed, and never twice`, `… > leaves a line the shopper already reviewed alone` | ported |
| CAT-014 | A lifetime limit counts what the shopper already bought and a per-order limit ignores history; below the minimum is refused. | `packages/core/src/catalog/catalog.int.test.ts::purchase limits > counts what the shopper already bought against a lifetime limit`, `… > a per-order limit ignores history`, `… > refuses below the minimum` | ported |
| CAT-015 | Search takes the shopper's keyword as text, not as SQL: a Chinese substring matches, case is ignored, and `%` is a literal. A search is recorded, offered back as history newest-first and de-duplicated, and a fruitless one never becomes a hot word. | `packages/core/src/catalog/catalog.int.test.ts::search > matches a Chinese substring`, `… > ignores case in the keyword field`, `… > treats % as a literal, not a wildcard`, `… > records the search and offers it back as a hot keyword, but not a fruitless one`, `… > keeps a per-shopper history, newest first, de-duplicated` | ported |
| CAT-016 | 商品保障 has permission atoms of its own. Legacy registered those routes under a group labelled 商品参数, so granting "product parameters" silently granted "edit the guarantee badges on every product page". | `packages/core/src/catalog/catalog.int.test.ts::taxonomy > gives 商品保障 its own permission atoms rather than the 商品参数 group` | ported |
| CAT-017 | The export is one row per SKU, reports truncation honestly rather than silently cutting the list, and is gated on its own atom because it carries cost prices. | `packages/core/src/catalog/catalog.int.test.ts::export > emits one row per SKU and reports truncation honestly`, `apps/web/app/admin/(shell)/catalog/products/product-list.test.tsx::商品列表 > exports the current tab as a CSV the browser writes`, `… > hides every write action from a read-only admin` | ported |
| CAT-018 | The migration keeps what the legacy dump means: `is_virtual` + `virtual_type` become one `kind`, HTML-entity-encoded descriptions decode, sort order inverts where the new list sorts ascending, a sold card with no identifiable order line is voided rather than re-pooled, and a soft-deleted product is kept so order items do not dangle. | `packages/etl/src/mappers/catalog.test.ts::mapCatalog: products > reads the kind off is_virtual + virtual_type, not off virtual_type alone`, `… ::mapCatalog: descriptions > decodes the htmlspecialchars the legacy model decoded on read`, `… > unescapes the ampersand last, so &amp;lt; survives as text`, `… ::mapCatalog: the category tree > materialises the path and depth and flips the legacy sort`, `… ::mapCatalog: card-key stock > claims a sold card only when the order line can be named`, `… ::mapCatalog: products > keeps a soft-deleted product with its shelf state and a deleted_at` | ported |

## Risk matrix additions (cart, pricing and order creation)

Owner: **B1**

From `tests/regression/risk-matrix.md` sections 1 and 2, the entries whose
verdict was "new" or "thin". The ids are B1's; the matrix names the entry, not
an id.

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| RISK-B1-001 | An off-shelf or deleted product refuses the order instead of being quietly dropped from the lines, and its cart row stays visible with a reason so the shopper can act on it. | `packages/core/src/order/order.int.test.ts::checkout preview > refuses an off-shelf line instead of quietly dropping it`, `packages/core/src/cart/cart.int.test.ts::listing the cart > shows a dead row with a reason instead of dropping it`, `packages/core/src/cart/cart.int.test.ts::listing the cart > filters to the sellable rows and to the dead ones` | ported |
| RISK-B1-002 | A SKU whose price moved between the confirmation and the submit refuses the order rather than charging the new price: the client echoes the payable amount it was shown and a mismatch is `ORDER_PRICE_CHANGED`. | `packages/core/src/order/order.int.test.ts::order creation > refuses when the shopper was shown a different price` | ported |
| RISK-B1-003 | The cart price is read live, never from the row, so the confirmation cannot promise a price the product no longer has. | `packages/core/src/cart/cart.int.test.ts::listing the cart > reads the price live rather than from the row` | ported |
| RISK-B1-004 | A double submit of the same order key creates one order and answers every caller with it, decided by a UNIQUE constraint rather than by a cache lock. | `packages/core/src/order/order.concurrency.int.test.ts::the same idempotency key submitted several times at once > creates exactly one order and answers every caller with it`, `packages/core/src/order/order.concurrency.int.test.ts::the same idempotency key submitted several times at once > lets a key be reused after the order it was claiming rolled back`, `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/checkout and /api/v1/orders > returns the same order for a replayed submit, still 201` | ported |
| RISK-B1-005 | A creation that fails half-way leaves nothing behind: the coupon unspent, no order row, and every unit of stock already taken handed straight back. | `packages/core/src/order/order.concurrency.int.test.ts::two checkouts for the last unit > hands back every line it already took when a later line is short`, `packages/core/src/order/order.concurrency.int.test.ts::one coupon spent by two orders at once > is redeemed once, and the losing order does not exist`, `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/checkout and /api/v1/orders > refuses a coupon that was already spent, and writes nothing` | ported |
| RISK-B1-006 | The order and its items are one insert in one transaction, so there is no window in which an order exists without its lines, and a cancellation that cannot finish leaves the order exactly as it was. | `packages/core/src/order/order.int.test.ts::order creation > creates the order, takes the stock, empties the cart and schedules the cancel`, `packages/core/src/order/order.int.test.ts::cancellation > rolls the whole cancellation back when the stock cannot be returned` | ported |

## Queue and lifecycle

Owner: **B1 / C**

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| QUEUE-001 | Paid, deleted, offline and already cancelled orders are not restored by the unpaid-cancel job. | `packages/core/src/order/order.int.test.ts::auto-cancel > does nothing while the payment window is still open`, `packages/core/src/order/order.int.test.ts::auto-cancel > is a no-op the second time, so the queue may retry it`, `packages/core/src/order/order.int.test.ts::cancellation > never cancels a paid order — that road leads through a refund` | ported |
| QUEUE-002 | An eligible unpaid order restores resources and persists cancellation state once. | `packages/core/src/order/order.int.test.ts::auto-cancel > cancels once the window has closed, and logs it as automatic`, `packages/core/src/order/order.int.test.ts::auto-cancel > sweeps every expired order and leaves the live ones alone` | ported |
| QUEUE-003 | A cancellation settles the payment gateway before it releases anything: settlement runs first, the attempt is marked closed, and only then are the coupon and the stock restored. **B1 half done** — the release runs only after `PaymentPort.ensureNoOpenAttempts` answered `closed`, under the order's row lock; C closes the “attempt is marked closed” half when the real port lands. **Settled:** the attempt is closed by `closeOrderPayments` before anything is released, and `ensureNoOpenAttempts` re-asks under the order's row lock. | `packages/core/src/order/order.int.test.ts::cancellation > gives back the stock and the coupon, and stamps the row`, `packages/core/src/payment/payment.concurrency.int.test.ts::QUEUE-003 — a callback racing an order cancel > closes exactly once when two cancels arrive together`, `packages/core/src/payment/payment.int.test.ts::PAYC-001 — a create in flight is never stepped over > settles it with the gateway first, and cancels only on a confirmed negative` | ported |
| QUEUE-004 | An unconfirmed gateway state (unknown or timeout) releases nothing: the attempt is neither closed nor marked, the coupon and the stock stay with the order and the job reports failure. **B1 half done**; the attempt assertions are C's. **Settled:** an unanswered attempt stays `unknown` and the cancel is blocked. | `packages/core/src/order/order.int.test.ts::cancellation > refuses, and releases nothing, when the gateway will not answer`, `packages/core/src/payment/payment.concurrency.int.test.ts::QUEUE-003 — a callback racing an order cancel > refuses to cancel while an attempt is merely unknown — nothing is released on silence`, `packages/core/src/payment/payment.int.test.ts::PAYC-001 — a create in flight is never stepped over > releases nothing while the gateway will not say` | ported |
| QUEUE-005 | A gateway payment discovered during cancellation keeps the order alive, runs the unified local confirmation with the query's fresh trade number inside the original order lock, and releases no resource. **B1 half done** — the order stays alive and nothing is released; the local confirmation is C's. **Settled:** the local confirmation is `settlePayment`, reached from the close through `reconcileAttempt` with the query's own facts. | `packages/core/src/order/order.concurrency.int.test.ts::cancel racing the paid transition > refuses the cancellation outright when the gateway reports the money arrived`, `packages/core/src/payment/payment.concurrency.int.test.ts::QUEUE-003 — a callback racing an order cancel > never cancels an order whose money arrived, whichever side gets there first`, `packages/core/src/payment/payment.int.test.ts::PAYC-002 — a create whose answer was lost > books the payment when the answer that was lost was "yes"` | ported |
| QUEUE-006 | When the stock restore fails the coupon return, the stock restore and the cancel flag roll back together and no coupon_back status row survives. | `packages/core/src/order/order.int.test.ts::cancellation > rolls the whole cancellation back when the stock cannot be returned` | ported |
| QUEUE-007 | When the coupon cannot be returned the stock restore never runs and no stock layer is touched. | `packages/core/src/order/order.int.test.ts::cancellation > gives nothing back when the coupon cannot be returned` | ported |
| QUEUE-008 |  Cancelling a presale order restores all four ledgers (the presale activity row, its type-6 SKU, the product row and its type-0 SKU) with deliberately different presale and product ids, so a restore through the ordinary layer cannot pass on matching totals. **Owner: stream D (presale restores its ledgers from `onOrderCancelled`).** | | unmapped |
| QUEUE-009 | Two concurrent cancellations of one order release the stock and the coupon once and write one coupon_back row; the loser observes the committed cancellation. | `packages/core/src/order/order.concurrency.int.test.ts::auto-cancel racing the user cancel > cancels once, returns the stock once and returns the coupon once`, `packages/core/src/order/order.concurrency.int.test.ts::auto-cancel racing the user cancel > survives the sweep and the shopper arriving together on many orders` | ported |
| QUEUE-010 | Payment success records exactly one effect for the order and hands that recorded row to the repair job, which runs the effect it was given; the row is never written by a second path. **C's: the payment-success effect is written by the payment domain.** | `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > books the money once however many times WeChat delivers the same notification`, `packages/core/src/payment/payment.int.test.ts::PAY-004 — a valid notification settles the order exactly once > pays the order, books the flow and records the hand-off effect` | ported |
| QUEUE-011 | A repeated callback reuses the effect entry it already wrote, and one delivery claims it: a second concurrent delivery cannot run the same effect, a finished, freshly claimed or attempt-exhausted record is not re-delivered, an unknown or interrupted one is, and a failed effect records the unknown outcome with its attempt counted. **C's, with the dispatcher itself owned by the platform.** | `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-011 — a late callback after the payment was closed > records one exception and one automatic refund, and leaves the order cancelled`, `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-011 — a late callback after the payment was closed > sends the money back once when the effect ledger runs`, `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-006 — reconciliation racing a refund callback > sends one refund however many effect dispatchers run` | ported |
| ORDER-001 | The retained purchase path over real HTTP: cart, confirm, computed, create — the order lands with the stock decremented and `order/computed` returns the same price the confirmation promised. | `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/checkout and /api/v1/orders > previews without writing, then creates with 201`, `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/cart > adds with 201 and lists what was added` | ported |
| ORDER-002 | Order creation queues `UnpaidOrderCancelJob` for the new order, so abandoned orders expire and release stock. | `packages/core/src/order/order.int.test.ts::order creation > creates the order, takes the stock, empties the cart and schedules the cancel` | ported |
| ORDER-003 | An unpaid order can be cancelled once, a paid one never, and neither leaves a duplicate status row. | `packages/core/src/order/order.int.test.ts::cancellation > gives back the stock and the coupon, and stamps the row`, `packages/core/src/order/order.int.test.ts::cancellation > refuses a second cancellation`, `packages/core/src/order/order.int.test.ts::cancellation > never cancels a paid order — that road leads through a refund`, `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/checkout and /api/v1/orders > cancels through the sub-resource and refuses the second attempt with 409` | ported |
| ORDER-004 | Over real HTTP, submitting an order with an already spent coupon is refused before any write: no order row, the product stock unchanged and the coupon still spent rather than returned. | `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/checkout and /api/v1/orders > refuses a coupon that was already spent, and writes nothing` | ported |

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
| CLIENT-001 | The retained purchase contract fields are accepted by the real routes; a paid order reports `已支付` rather than a new payment intent, and an order with an unknown gateway result is refused with a manual-handling message instead of a payment intent. | `packages/core/src/payment/payment.int.test.ts::CLIENT-001 — what the cashier is told > reports 已支付 instead of minting a second payment intent`, `packages/core/src/payment/payment.int.test.ts::CLIENT-001 — what the cashier is told > answers the cashier poll from the database, never from the gateway`, `packages/core/src/payment/payment.int.test.ts::CLIENT-001 — what the cashier is told > refuses to start a payment on an order that is already cancelled`, `packages/core/src/payment/payment.int.test.ts::PAYC-002 — a create whose answer was lost > keeps the attempt unknown, and the order neither paid nor cancellable` | ported |

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
| REFUND-001 | Historical pay types (`yue`, `offline`, `alipay`, `allinpay`, empty) are refused for original-channel refunds with the offline-handling message, while WeChat orders pass the guard when handed a model the way the dispatcher does. **Adapted:** the guard is structural rather than a list of pay types — a refund is frozen against the `payment_attempts` row that collected the money, so an order without one is refused with `REFUND_NO_ORIGINAL_PAYMENT` for an operator to settle by hand. | `packages/core/src/refund/refund.int.test.ts::REFUND-001 — there is no original channel to send it back through > refuses to send, and says so, rather than inventing a transaction` | ported |
| REFUND-002 | A presale order restore moves the presale activity row, the presale SKU, the product row and the product SKU back to their exact prior stock and sales; the fixture uses deliberately different ids and SKUs for the presale and the product layers so a restore through the wrong layer cannot pass on matching totals. **Owner: stream D (presale restores its own ledgers from `onOrderRefunded`).** C's half — that a settled refund calls `StockPort.release` once, for the unshipped units only — is covered below. | `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-006 — reconciliation racing a refund callback > does not restock a line that has already shipped` | unmapped |
| REFUND-003 | An order sold from a group buy, a presale or ordinary stock restores through that layer only: the matching service is called once with the id and SKU the order carried, and the other two are never called. **Owner: stream D (the per-activity layer is the port implementation's, not the refund domain's).** The refund domain calls one port once, with the order's lines and `{ committed: true, refundId }`. | `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-006 — reconciliation racing a refund callback > ends the order and releases nothing twice when the last line is refunded` | unmapped |
| REFUND-004 | When the stock restore returns false the refund stops with `库存回退失败` before the payment gateway is resolved, and no `refund_price` status row is written. **Inverted:** the money moves at WeChat, outside any transaction, so the restore cannot precede it. Instead the settlement — ledger row, order roll-up and restock — is one transaction that rolls back whole, and the frozen `out_refund_no` settles it later rather than sending a second refund. | `packages/core/src/refund/refund.int.test.ts::REFUND-004 — a restock that fails never loses the money > rolls the settlement back and settles it once the restock works again` | ported |
| REFUND-005 | The refund number and amount are frozen on the first attempt and replayed on every retry: a second call with a higher amount reuses the persisted after-sale number and the originally frozen price, and both are persisted on the after-sale row. | `packages/core/src/refund/refund.int.test.ts::REFUND-005 — a retry may not change what was sent > re-sends the frozen number instead of opening a second refund`, `packages/core/src/refund/refund.int.test.ts::REFUND-005 — a retry may not change what was sent > refuses a retry that asks for a different amount than the one frozen`, `packages/core/src/refund/refund.int.test.ts::REFUND-005 — a retry may not change what was sent > never gives back more than the order was paid, across several requests` | ported |
| REFUND-006 | Two refund attempts released together from separate processes freeze one gateway number and one amount, and the persisted row matches what both attempts agreed on. | `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-002 — approval racing the buyer withdrawing > queues one gateway call however many times the operator presses 同意`, `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-003 — duplicate refund callback > gives the money back once however many times WeChat delivers it`, `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-006 — reconciliation racing a refund callback > settles once when the query and the notification arrive together`, `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-006 — reconciliation racing a refund callback > sends one refund however many effect dispatchers run` | ported |

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

## 页面装修 (DIY)

Owner: **G1**

New rows, not from `cases.md`. The rewrite does not touch the uni-app renderer, so the saved page is a wire contract with a program nobody is rewriting; these are the properties that make that safe.

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| DIY-001 | A saved page survives parse → serialise byte for byte, including keys no schema in this build knows, for every production export. Validation hands back the caller's own object rather than zod's rebuilt one. | `packages/contracts/src/diy/schema/round-trip.test.ts::page value round trip > %s: parse -> serialise is byte-identical`; `packages/core/src/diy/diy.test.ts::validateDiyContent > hands back the caller’s own object, so the bytes never change` | ported |
| DIY-002 | Retired components and links to removed storefront pages are filtered on **read**, never on write: the stored row keeps every node, and the same three checks run in the same order as `DiyCompatibilityServices::clean`. | `packages/core/src/diy/diy.test.ts::cleanDiyData — parity with DiyCompatibilityServices::clean > covers every branch of the PHP`; `packages/core/src/diy/diy.int.test.ts::the storefront read > serves the home page with the retired components stripped` | ported |
| DIY-003 | Cleaning preserves key order and returns its input by identity when nothing is stripped, so a cleaned page still serialises byte for byte. | `packages/core/src/diy/diy.test.ts::cleanDiyData — parity with DiyCompatibilityServices::clean > keeps key order, so a cleaned page still serialises byte for byte` | ported |
| DIY-004 | Two editors saving the same page do not overwrite each other: the version token covers both `updated_at` and the envelope's `version`, so a save from a stale editor fails with `DIY_VERSION_CONFLICT`. | `packages/core/src/diy/diy.int.test.ts::saving content > lets exactly one of several simultaneous saves win` | ported |
| DIY-005 | The editor writes back a page it did not change, unchanged: timestamps and their derived `id`s are only rewritten once the page's order has actually moved. | `apps/web/src/admin/diy/store.test.ts::serialising > reproduces an untouched page byte for byte`; `apps/web/src/admin/diy/store.test.ts::serialising > rewrites timestamps and ids only once the order actually moves` | ported |
| DIY-006 | Hiding a component never deletes it: `isHide` stays in the payload and the renderer skips it. | `apps/web/src/admin/diy/store.test.ts::editing > hides without deleting` | ported |
| DIY-007 | A page kind that owns a footer always saves one (`pageFoot` on 首页, `bottomMenu` on 商品详情) and it always sorts last. | `apps/web/src/admin/diy/store.test.ts::serialising > appends the factory footer to a home page that has none`; `apps/web/src/admin/diy/store.test.ts::serialising > pushes the footer past the body when the body is restamped` | ported |
| DIY-008 | PostgreSQL `jsonb` reorders the keys inside a node; the guarantee that survives storage is "every key and value is preserved", not the byte order. Pinned so nobody mistakes it for a bug in this code. See CR-1-g1. | `packages/core/src/diy/diy.int.test.ts::saving content > is the database, not this code, that reorders the keys inside a node` | ported |

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
| SMOKE-010 | DIY data keeps the retained activities and drops the dead navigation entries whole. | `packages/core/src/diy/diy.test.ts::cleanDiyData — parity with DiyCompatibilityServices::clean > covers every branch of the PHP`; `packages/core/src/diy/diy.int.test.ts::the storefront read > serves the home page with the retired components stripped` | ported |
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

## System, storage and uploads

Owner: **F1**

New rows: `tests/regression/cases.md` has none of these, because the legacy
system had no tests for its admin, settings or upload surfaces. They are the
"Invariants to prove" list of `briefs/F1-system.md`, plus one row for every
conditional state change the stream ships. Paths are relative to `next/`.

| Legacy ID | Invariant | New test ID | State |
|---|---|---|---|
| SYS-001 | An admin route answers 401 with no session and 403 for a signed-in admin who does not hold its atom; the atom-holder gets 200. | `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/admins > 401s without a session and 403s without the atom` | ported |
| SYS-002 | Read and write are separate atoms: a caller holding only `system:config:read` is refused the save. | `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/system/config > 403s a write for a caller holding only the read atom` | ported |
| SYS-003 | An entry whose atom the role does not hold is absent from the sider, and a role holding nothing sees no entries at all; a super admin sees every one. | `apps/web/src/admin/menu/system.menu.test.ts::F1 sider entries > never shows an entry whose atom the role does not hold` | ported |
| SYS-004 | A config read never returns a stored secret — only a boolean "is set" — over the service and over the wire. | `packages/core/src/system/system.int.test.ts::config > never returns a stored secret — only whether one is set`; `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/system/config > never returns a stored secret — only whether it is set` | ported |
| SYS-005 | Saving a group without retyping a secret leaves the stored secret intact, so an unrelated edit cannot blank a credential. | `packages/core/src/system/system.int.test.ts::config > leaves the stored secret alone when the form is saved without retyping it` | ported |
| SYS-006 | No descriptor field a browser renders as text can hold a secret, and every credential field in every registered group is marked `secret`. | `packages/core/src/system/system.test.ts::describeGroup > never describes a secret field as anything a browser would render as text`; `packages/core/src/system/system.test.ts::describeGroup > marks every credential in every registered group as secret` | ported |
| SYS-007 | A password change revokes every session of that account, the caller's own included, and is refused without the current password. | `packages/core/src/system/system.int.test.ts::own profile > changes my password and revokes every session I hold`; `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/profile > revokes every session, including the caller’s, on a password change` | ported |
| SYS-008 | Disabling an account, resetting its password, or changing the grants of a role somebody holds each revoke the affected sessions immediately. | `packages/core/src/system/system.int.test.ts::admins > revokes the account’s sessions when it is disabled`; `packages/core/src/system/system.int.test.ts::roles > revokes the sessions of everybody holding a role whose grants changed` | ported |
| SYS-009 | An admin with no grants at all can still read their own profile. | `packages/core/src/system/system.int.test.ts::own profile > is readable by an admin holding no grants at all` | ported |
| SYS-010 | The permission tree is built from the atoms the running build declares, not from a table, and a grant naming an undeclared atom is refused. | `packages/core/src/system/system.test.ts::permissionTree > groups atoms into sections and keeps them sorted`; `packages/core/src/system/system.int.test.ts::roles > refuses an atom the running build does not declare` | ported |
| SYS-011 | The last enabled super admin cannot be disabled or deleted, and nobody can lock themselves out. | `packages/core/src/system/system.int.test.ts::admins > will not let the last enabled super admin be disabled`; `packages/core/src/system/system.int.test.ts::admins > will not let an admin lock themselves out` | ported |
| SYS-012 | A write is audited with its actor, route and target and with the password redacted; a read is not audited, and the reader cannot undo the redaction. | `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/admins > creates with 201 and writes an audit row without the password in it`; `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/audit-logs > does not record a read` | ported |
| SYS-013 | A save is refused whole when the schema rejects a value or the group does not declare the key, and nothing is written. | `packages/core/src/system/system.int.test.ts::config > refuses a value the schema rejects, and writes nothing`; `packages/core/src/system/system.int.test.ts::config > refuses a key the group does not declare` | ported |
| SYSC-001 | Six concurrent disables of one account report exactly one session revocation, and the sessions are gone once. | `packages/core/src/system/system.concurrency.int.test.ts::disabling an account > lets exactly one of six disables claim the session revocation` | ported |
| SYSC-002 | Six concurrent deletions of one account leave one winner; the losers are told the account is gone. | `packages/core/src/system/system.concurrency.int.test.ts::deleting an account > lets exactly one of six deletions win` | ported |
| SYSC-003 | Six identical account creates are settled by the unique index, not by the pre-check, and one row exists. | `packages/core/src/system/system.concurrency.int.test.ts::creating an account > lets the unique index, not the pre-check, settle six identical creates` | ported |
| SYSC-004 | Six concurrent role deletions leave one winner, and a loser is told the role is gone rather than "in use by 0 admins". | `packages/core/src/system/system.concurrency.int.test.ts::roles > lets exactly one of six deletions of the same role win` | ported |
| SYSC-005 | A role deletion racing a grant of that role ends either deleted-and-grant-refused or granted-and-deletion-refused, never both. | `packages/core/src/system/system.concurrency.int.test.ts::roles > never deletes a role that a concurrent admin edit just granted` | ported |
| SYSC-006 | Six concurrent disables of one role revoke its holders' sessions exactly once. | `packages/core/src/system/system.concurrency.int.test.ts::roles > lets exactly one of six disables of a role revoke its holders` | ported |
| STOR-001 | An upload is refused when the bytes are a PHP script, HTML, an SVG (script or not), an executable or an archive, however the file is named or declared. | `packages/core/src/storage/file-type.test.ts::sniffFileType — the files that must never get in > refuses a PHP script however it is named or declared`; `packages/core/src/storage/file-type.test.ts::sniffFileType — the files that must never get in > refuses HTML, which would run as our own origin`; `packages/core/src/storage/file-type.test.ts::sniffFileType — the files that must never get in > refuses SVG — always, script or not`; `packages/core/src/storage/file-type.test.ts::sniffFileType — the files that must never get in > refuses executables` | ported |
| STOR-002 | Those refusals hold over HTTP, for admins and for shoppers, and write no row and no object. | `apps/web/app/admin-api/attachments/storage.int.test.ts::/admin-api/attachments > refuses what the old uploader accepted > refuses <each of five>`; `apps/web/app/admin-api/attachments/storage.int.test.ts::/api/v1/uploads > refuses an executable from a shopper too` | ported |
| STOR-003 | A declared content type that disagrees with the bytes is refused, not silently corrected. | `packages/core/src/storage/file-type.test.ts::mimeAgrees > refuses a real mismatch rather than silently correcting it`; `packages/core/src/storage/storage.int.test.ts::upload > refuses a PNG declared as a PDF rather than silently correcting it` | ported |
| STOR-004 | A remote import is refused for private, loopback, link-local and cloud-metadata addresses **after** DNS resolution, for a name that resolves to both a public and a private address, and on a redirect into the private network. | `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > refuses a public name that RESOLVES to a private address`; `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > refuses a name that resolves to one public AND one private address`; `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > refuses a redirect into the private network`; `packages/core/src/storage/safe-fetch.test.ts::classifyAddress > blocks every address family a fetch must never reach` | ported |
| STOR-005 | The connection is made to the address that was judged, presenting the original Host, so a second resolution cannot return a different answer. | `packages/core/src/storage/safe-fetch.test.ts::safeFetch — the happy path > connects to the address it judged, presenting the original Host` | ported |
| STOR-006 | A remote import refuses non-http schemes, credentials in the URL, a non-standard port, a redirect chain that will not end, and a body over the ceiling even when Content-Length lied. | `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > refuses a non-standard port, so this is not a port scanner`; `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > stops reading at maxBytes even when Content-Length lied` | ported |
| STOR-007 | A scan-upload token is single-use, bound to the admin who minted it, and is not burned when the file is refused. | `packages/core/src/storage/storage.int.test.ts::scan-to-upload > mints a token, accepts one upload, and refuses the second`; `packages/core/src/storage/storage.int.test.ts::scan-to-upload > does not burn the token when the file is refused`; `packages/core/src/storage/storage.int.test.ts::scan-to-upload > reports the status to the minting admin and hides it from everybody else` | ported |
| STOR-008 | The storage key is generated by the server; a caller cannot choose a path. | `packages/core/src/storage/s3.test.ts::createS3Storage > generates the key itself — a caller cannot choose a path` | ported |
| STOR-009 | Identical bytes are stored once: the second upload returns the existing row. | `packages/core/src/storage/storage.int.test.ts::upload > returns the existing row for identical bytes instead of storing them twice` | ported |
| STOR-010 | The storefront upload needs a shopper session, takes images only, enforces a per-user hourly budget and answers with the file rather than the library row. | `apps/web/app/admin-api/attachments/storage.int.test.ts::/api/v1/uploads > requires a shopper session`; `packages/core/src/storage/storage.int.test.ts::storefront upload > enforces the per-user hourly budget`; `packages/core/src/storage/storage.int.test.ts::storefront upload > accepts an image and answers with the file, not the library` | ported |
| STOR-011 | A folder that still holds anything cannot be deleted, and a folder cannot become its own descendant. | `packages/core/src/storage/storage.int.test.ts::categories > refuses to delete a folder that still holds anything`; `packages/core/src/storage/storage.int.test.ts::categories > refuses to make a category its own descendant` | ported |
| STOR-012 | The orphan sweep leaves a tombstone alone until retention has passed, then purges both the row and the object, and does nothing when retention is disabled. | `packages/core/src/storage/storage.int.test.ts::cleanOrphans > leaves a tombstone alone until the retention window has passed`; `packages/core/src/storage/storage.int.test.ts::cleanOrphans > purges the row and the object once it is old enough` | ported |
| STORC-001 | Six uploads of identical bytes at once store the object once and hand every caller the same row. | `packages/core/src/storage/storage.concurrency.int.test.ts::sha256 dedupe under concurrency > stores identical bytes exactly once when six uploads collide` | ported |
| STORC-002 | Six phones scanning one QR code produce exactly one upload; the other five are refused. | `packages/core/src/storage/storage.concurrency.int.test.ts::scan tokens are single-use > lets exactly one of six phones upload through one QR code` | ported |
| STORC-003 | Six concurrent deletions of one folder leave one winner, and a deletion racing an upload into that folder never loses the file. | `packages/core/src/storage/storage.concurrency.int.test.ts::deleting a folder > lets exactly one of six deletions of the same folder win`; `packages/core/src/storage/storage.concurrency.int.test.ts::deleting a folder > never deletes a folder that a concurrent upload just filed into` | ported |
| ETL-F1-001 | Migrated admins keep their password hash and its algorithm; an MD5 hash is carried as MD5 rather than relabelled bcrypt, and creation times are never invented. | `packages/etl/src/mappers/system.test.ts::admins > keeps an MD5 password as MD5 rather than pretending it is bcrypt`; `packages/etl/src/mappers/system.test.ts::admins > never invents a creation time` | ported |
| ETL-F1-002 | Legacy role grants (`eb_system_menus` ids) are **not** translated into atoms; every affected role is reported for re-granting. | `packages/etl/src/mappers/system.test.ts::roles > migrates the role but not its grants, and says so` | ported |
| ETL-F1-003 | A legacy config key no group claims is reported, not dropped silently, and `order_cancel_time` is converted from hours to minutes. | `packages/etl/src/mappers/system.test.ts::config > lists a legacy key no group claims instead of dropping it silently`; `packages/etl/src/mappers/system.test.ts::config > converts order_cancel_time from hours to minutes` | ported |
| ETL-F1-004 | A migrated attachment never gets an invented sha256 (which would disable dedupe permanently); the rows needing a digest are counted. | `packages/etl/src/mappers/storage.test.ts::attachments > never invents a sha256` | ported |
| ETL-F1-005 | An attachment's type comes from its path, not from the legacy `att_type` column the dump gets wrong, and a `pid` that is a legacy enumeration rather than a folder files the row as uncategorised. | `packages/etl/src/mappers/storage.test.ts::attachments > migrates a stock row, trusting the extension over att_type`; `packages/etl/src/mappers/storage.test.ts::attachments > files a row uncategorised when pid is a legacy enumeration, not a folder` | ported |
