# Business rules

The rules the shop keeps, each with the tests that prove it. A rule is a
`###` heading carrying its ID, a short statement of the rule, and a list of
citations: `` `<file>::<describe> > <test name>` ``, with the file relative to
the repository root. A rule with no test is not in this file.

A test names the rule it proves by putting the ID in its title —
`it('refuses a second redemption — COUPON-004', …)` — or in the title of its
`describe`. Code comments cite rules the same way, `(REFUND-007)`.

`pnpm guards` (the `invariants` check) keeps this file honest on every commit:

- every rule cites at least one test, and no ID appears twice;
- every citation resolves: the file exists, and for a `*.test.*` / `*.spec.*`
  file the last segment of the name is one of the test titles the file writes
  (a template title such as `` `refuses ${label}` `` or a `<hole>` in the
  citation matches any text); any other file — the deploy rehearsal, a shell
  suite — must write the name on one of its lines;
- a test title that names an ID from a known family (`PAY-…`, `REFUND-…`)
  names a rule that is in this file.

## Payment transport security

### TLS-001

Every outbound WeChat transport (payment, refund, the official account and the mini-program) and the remote-import fetch keep certificate-chain and hostname verification on, and nothing can turn it off: verification is the platform `fetch`'s and the trust store is the container's, so no config group has a verification switch, and the tests assert that none can grow one.

- `packages/core/src/payment/payment.config.test.ts::TLS-001 — no TLS toggle in any payment config group > has no verification switch in <group>`
- `packages/core/src/payment/payment.config.test.ts::keeps the API host configurable but off the form, so it cannot be re-pointed by hand`
- `packages/core/src/refund/refund.config.test.ts::TLS-001 — no verification switch in refund > has none in the schema`
- `packages/core/src/wechat/wechat.pay.tls.test.ts::TLS-001 — the pay client refuses a gateway it cannot authenticate > refuses the handshake, so the query never reaches the server`
- `packages/core/src/wechat/wechat.pay.tls.test.ts::refuses the close the same way — a 204 is only trustworthy over an authenticated channel`
- `packages/core/src/wechat/wechat.client.tls.test.ts::TLS-001 — the OA and mini-program client refuses a host it cannot authenticate > never sends the OA AppSecret to it: the token refresh stops at the handshake`
- `packages/core/src/wechat/wechat.client.tls.test.ts::never sends the mini-program AppSecret to it either`
- `packages/core/src/wechat/wechat.client.tls.test.ts::refuses the OAuth code exchange, which carries the secret too`
- `packages/core/src/wechat/wechat.client.tls.test.ts::refuses the mini-program login the same way`
- `packages/core/src/wechat/wechat.client.tls.test.ts::refuses a token-bearing JSON call`
- `packages/core/src/wechat/wechat.client.tls.test.ts::refuses a binary call (小程序码)`
- `packages/core/src/wechat/wechat.client.tls.test.ts::refuses a multipart upload (素材)`
- `packages/core/src/storage/safe-fetch.tls.test.ts::safeFetch over real TLS > keeps certificate verification on in the production transport (TLS-001)`
- `packages/core/src/refund/refund.tls.test.ts::TLS-001 — the refund client refuses a gateway it cannot authenticate > refuses the refund create at the handshake, so the request never reaches the server`
- `packages/core/src/refund/refund.tls.test.ts::refuses the refund query the same way — a SUCCESS is only trustworthy over an authenticated channel`

### TLS-002

A platform-signed response verifies, while a tampered body, a wrong signature, an unknown platform serial and a stale timestamp all fail the check.

- `packages/core/src/wechat/wechat.crypto.test.ts::TLS-002 — a platform-signed payload verifies, and four ways of being wrong do not > accepts a correctly signed body`
- `packages/core/src/wechat/wechat.crypto.test.ts::TLS-002 — a platform-signed payload verifies, and four ways of being wrong do not > refuses a tampered body`
- `packages/core/src/wechat/wechat.crypto.test.ts::TLS-002 — a platform-signed payload verifies, and four ways of being wrong do not > refuses an unknown platform serial`
- `packages/core/src/wechat/wechat.crypto.test.ts::TLS-002 — a platform-signed payload verifies, and four ways of being wrong do not > refuses a stale timestamp in either direction`

### TLS-003

A response whose platform certificate cannot be fetched is never trusted, so the caller treats the query result as unknown and keeps resources.

- `packages/core/src/wechat/wechat.crypto.test.ts::TLS-003 — an unfetchable platform certificate is a refusal, not a default > refuses when the key set is empty`
- `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > leaves the attempt unknown — not closed — when reconciliation cannot trust the answer`

### TLS-004

A signature made with a key that does not match the published certificate is rejected.

- `packages/core/src/wechat/wechat.crypto.test.ts::TLS-004 — a signature made with a key that is not the published one is rejected > rejects a body signed with the merchant key`
- `packages/core/src/wechat/wechat.crypto.test.ts::TLS-004 — a signature made with a key that is not the published one is rejected > answers false rather than throwing for a malformed key or signature`

### TLS-005

A v3 notification is answered as a failure unless its platform signature verifies and its resource decrypts into a JSON object, so a forged "money received" cannot be believed.

- `packages/core/src/wechat/wechat.crypto.test.ts::TLS-005 — a resource must decrypt into a JSON object to be believed > refuses plaintext that is not JSON at all`
- `packages/core/src/payment/payment.int.test.ts::PAY-003 — a failure on our side asks WeChat to deliver again > answers 401 for a signature it cannot verify, before touching the database`

### TLS-006

The v3 driver refuses to convert an unverified query or close response into `closed`/`paid`.

- `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > refuses a query response signed with the wrong key`
- `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > accepts an empty 204 close, which carries no signature to verify`
- `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > refuses a close whose error body cannot be verified`
- `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > refuses to cancel an order whose close the gateway would not confirm`
- `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > treats a dropped connection as silence, not as a closed order`

## Payment creation and concurrency

### PAYC-001

A payment create held at the gateway boundary while a cancellation commits can never leave a collectible gateway payment on a cancelled order: either the cancel settles the attempt first, or the create is refused under the order lock and the attempt is closed.

- `packages/core/src/payment/payment.int.test.ts::PAYC-001 — a create in flight is never stepped over > settles it with the gateway first, and cancels only on a confirmed negative`
- `packages/core/src/payment/payment.int.test.ts::PAYC-001 — a create in flight is never stepped over > releases nothing while the gateway will not say`
- `packages/core/src/payment/payment.cancel-lock.int.test.ts::PAYC-001 — a payment started while a cancel holds the order lock > waits for the cancel to commit, then refuses: no attempt, no gateway order`
- `packages/core/src/payment/payment.cancel-lock.int.test.ts::lets the payment through once the cancel has lost — the lock is a queue, not a refusal`

### PAYC-002

A create the gateway accepted but whose response was lost keeps the attempt as unknown (not submitted, not closed), the order unpaid and uncancelled, and a later cancellation closes the gateway order before releasing anything.

- `packages/core/src/payment/payment.int.test.ts::PAYC-002 — a create whose answer was lost > keeps the attempt unknown, and the order neither paid nor cancellable`
- `packages/core/src/payment/payment.int.test.ts::PAYC-002 — a create whose answer was lost > books the payment when the answer that was lost was "yes"`
- `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-002 — the reconciliation sweep racing a callback > settles once when the sweep and the notification arrive together`

### PAYC-003

Repeated pay taps by the same payer keep one attempt row for one merchant order number; no tap completes or cancels the order on its own.

- `packages/core/src/payment/payment.int.test.ts::PAYC-003 — repeated taps > keeps one attempt and one merchant order number`
- `packages/core/src/payment/payment.int.test.ts::PAYC-003 — repeated taps > re-uses the frozen number rather than opening a second gateway order after a lost answer`
- `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-004 — starting the same payment twice > produces exactly one attempt and one gateway order`
- `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-004 — starting the same payment twice > inserts at most one open attempt — the unique index alone`

### PAYC-004

The attempt's driver, merchant, app, channel, amount and payer are immutable: an identical replay is idempotent, any change is refused for manual handling and the stored row is untouched.

- `packages/core/src/payment/payment.int.test.ts::PAYC-004 — the attempt is immutable > refuses a replay that disagrees about the channel, and leaves the row alone`
- `packages/core/src/payment/payment.int.test.ts::PAYC-004 — the attempt is immutable > refuses a replay from a different payer`
- `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-004 — starting the same payment twice > refuses a replay that disagrees about the channel`

### PAYC-005

A recorded merchant identity that no longer matches the configuration stops cancellation with 请人工核对后处理 and releases no stock, coupon or cancel flag.

- `packages/core/src/payment/payment.int.test.ts::PAYC-005 — the merchant on the attempt is no longer the configured one > stops the cancellation, asks WeChat nothing, and leaves a message for a human`
- `packages/core/src/payment/payment.int.test.ts::PAYC-005 — the merchant on the attempt is no longer the configured one > refuses to reconcile it either, so the sweep cannot close it by accident`

## Payment callbacks and the gateway

### PAY-001

A payment notification for an order the shop does not know is acknowledged and changes no order. The money is not dropped: it becomes a `payment_exceptions` row and an automatic refund effect.

- `packages/core/src/payment/payment.int.test.ts::PAY-001 — a notification for an order this shop does not have > acknowledges it, touches no order, and books it as an exception to refund`

### PAY-002

Notification for an already paid product order does not run payment effects again.

- `packages/core/src/payment/payment.int.test.ts::PAY-002 — an order that is already paid > treats the same transaction arriving again as a replay`
- `packages/core/src/payment/payment.int.test.ts::PAY-002 — an order that is already paid > treats a *different* transaction on a paid attempt as a second real payment`

### PAY-003

Internal notification failure returns failure so the gateway can retry.

- `packages/core/src/payment/payment.int.test.ts::PAY-003 — a failure on our side asks WeChat to deliver again > answers 500 FAIL rather than acknowledging money it did not record`

### PAY-004

A valid product payment notification invokes the payment-success service once with its trade number.

- `packages/core/src/payment/payment.int.test.ts::PAY-004 — a valid notification settles the order exactly once > pays the order, books the flow and records the hand-off effect`
- `packages/core/src/payment/payment.int.test.ts::PAY-004 — a valid notification settles the order exactly once > records a non-SUCCESS notification without acting on it`

### PAY-005

A concurrent notification is acknowledged when another worker atomically paid the order.

- `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > books the money once however many times WeChat delivers the same notification`
- `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > is the callback insert that decides, not a prior read — the repo statement alone`

### PAY-006

Only the first atomic payment transition updates an order or records its trade number.

- `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > marks the order paid exactly once — the conditional update alone`
- `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-002 — the reconciliation sweep racing a callback > lets exactly one of many concurrent reconciliations book the payment`

### PAY-007

Two callbacks for the same real order pay it exactly once: the losing callback keeps the first trade number and no status or capital-flow row is duplicated.

- `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > books the money once however many times WeChat delivers the same notification`
- `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > treats a second notification for the same transaction as a replay`

### PAY-010

An attempt is closed only once the gateway has confirmed the close: an answer that cannot be verified, a dropped connection or silence leaves the attempt `unknown` rather than `closed`, and an order whose close the gateway would not confirm cannot be cancelled.

- `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > refuses to cancel an order whose close the gateway would not confirm`
- `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > treats a dropped connection as silence, not as a closed order`
- `packages/core/src/payment/payment.concurrency.int.test.ts::TLS-006 — an unverifiable gateway answer never becomes closed or paid > leaves the attempt unknown — not closed — when reconciliation cannot trust the answer`

### PAY-011

Money that arrives after its order was cancelled is never booked against the order and never lost: however many deliveries of the callback arrive, it is recorded as one `payment_exceptions` row and one automatic refund effect, the order stays cancelled, and the refund is sent once however many effect dispatchers run.

- `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-011 — a late callback after the payment was closed > records one exception and one automatic refund, and leaves the order cancelled`
- `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-011 — a late callback after the payment was closed > sends the money back once when the effect ledger runs`

### GATEWAY-001

A signed WeChat Pay callback whose paid amount is short, over or malformed is refused before any payment effect. A body with no usable amount at all (absent, zero or unparseable) is acknowledged and parked as `ignored: invalid amount` instead: there is nothing to book and nothing to refund, and a 500 would ask WeChat to redeliver the same bytes forever.

- `packages/core/src/payment/payment.int.test.ts::GATEWAY-001 — an amount that disagrees is never booked > refuses a short amount, however well signed it is`
- `packages/core/src/payment/payment.int.test.ts::GATEWAY-001 — an amount that disagrees is never booked > refuses a over amount, however well signed it is`
- `packages/core/src/payment/payment.int.test.ts::GATEWAY-001 — an amount that disagrees is never booked > parks an unparseable amount on the callbacks table instead of looping`
- `packages/core/src/payment/payment.concurrency.int.test.ts::PAYC-002 — the reconciliation sweep racing a callback > never books a payment whose amount disagrees with the attempt`

## Pricing

### PRICE-003

Ordinary item pricing, coupon thresholds and freight boundaries.

- `packages/core/src/order/order.int.test.ts::checkout preview > prices the ticked cart rows with freight and a coupon`
- `packages/core/src/order/order.pricing.test.ts::payableOf > is items + freight - discount`
- `packages/core/src/order/order.pricing.test.ts::payableOf > floors at zero rather than owing the shopper money`
- `packages/core/src/order/order.pricing.test.ts::payableOf > still charges freight when the goods are fully discounted`
- `packages/core/src/order/order.pricing.test.ts::couponAdjustment > discounts only the lines inside the coupon scope`

### PRICE-004

Multi-item order pricing splits the coupon across every line. A line written at checkout keeps its own adjustments in `order_items.snapshot.adjustments`, which sum to `-discount_amount`, so the order list and the detail agree, and a 预售 / 拼团 order with a stacked coupon shows the activity discount apart from the coupon.

- `packages/core/src/order/order.int.test.ts::order creation > per-line discount shares add back up to the order total`
- `packages/core/src/order/order.pricing.test.ts::splitAdjustments > adds the shares back to the total for an awkward three-way split`
- `packages/core/src/order/order.pricing.test.ts::distribute > gives the leftover fen to the largest remainder, deterministically`
- `packages/core/src/order/order.adjustments.int.test.ts::a 预售 order with a stacked coupon > separates the activity from the coupon, and the list and the detail agree`
- `packages/core/src/order/order.adjustments.int.test.ts::a 预售 order with a stacked coupon > lists only the coupon on an ordinary order, split over its lines`
- `packages/core/src/order/order.pricing.test.ts::splitAdjustments > keeps each adjustment's own per-line share, which the order lines persist`

## Stock

### STOCK-001

Zero and negative inventory deductions are rejected.

- `packages/core/src/order/order.int.test.ts::the stock port > refuses a line of zero, negative or fractional units without touching anything`

### STOCK-002

A deduction larger than available stock is rejected without changing stock or sales.

- `packages/core/src/order/order.int.test.ts::the stock port > takes nothing when one line of several is short, and names that line`
- `packages/core/src/order/order.int.test.ts::order creation > refuses when the stock ran out between the preview and the submit`

### STOCK-003

Two concurrent deductions of the last item yield one success, final stock 0 and sales 1.

- `packages/core/src/order/order.concurrency.int.test.ts::two checkouts for the last unit > sells it exactly once`
- `packages/core/src/order/order.concurrency.int.test.ts::two checkouts for the last unit > sells ten units to exactly ten of twelve buyers`

### STOCK-004

Activity inventory requires sufficient stock and quota. `total_quota` is a lifetime ceiling on units _sold_ and `sales` only moves on payment, so the quota is enforced in the same statement that increments `sales` (`commitActivitySales`), not at reservation time — checking it at checkout would let N unpaid orders through a quota of 1. Stock is taken at reservation, in one `UPDATE … WHERE stock >= n`.

- `packages/core/src/groupbuy/groupbuy.int.test.ts::placing an order > refuses when the activity is out of its own stock, even though the SKU is not`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::placing an order > enforces the campaign quota in the same statement as the stock`
- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::the activity ledgers > never oversell the campaign, however many place at once`
- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::the activity ledgers > never oversell the quota either`
- `packages/core/src/presale/presale.int.test.ts::placing an order > refuses when the campaign is out of its own stock, even though the SKU is not`
- `packages/core/src/presale/presale.int.test.ts::placing an order > enforces the campaign quota in the same statement as the stock`
- `packages/core/src/presale/presale.int.test.ts::paying > 限购总量 refuses a payment > gives the units back and asks for the money back`
- `packages/core/src/presale/presale.int.test.ts::paying > 限购总量 refuses a payment > enforces the per-SKU quota the same way`
- `packages/core/src/presale/presale.int.test.ts::paying > 限购总量 refuses a payment > does not half-apply the sale when only the campaign quota refuses`
- `packages/core/src/presale/presale.concurrency.int.test.ts::STOCK-004 — the last unit of a campaign, two checkouts at once > lets exactly one order through`
- `packages/core/src/presale/presale.concurrency.int.test.ts::STOCK-004 — the last unit of a campaign, two checkouts at once > holds under a crowd, not just a pair`
- `packages/core/src/presale/presale.concurrency.int.test.ts::STOCK-004 — the last unit of a campaign, two checkouts at once > never oversells the campaign when the warehouse is deep`
- `packages/core/src/presale/presale.concurrency.int.test.ts::STOCK-004 — the last unit of a campaign, two checkouts at once > is the UPDATE that decides, not a prior read — the repo statement alone`
- `packages/core/src/presale/presale.concurrency.int.test.ts::STOCK-004 — the last unit of a campaign, two checkouts at once > enforces the campaign quota under the same collision`

## Catalog

### CAT-001

Taking a product off the shelf takes it off everywhere at once: out of the storefront list, out of search, a 404 on its page, and a refusal at the sale — including inside an order transaction that started while it was still live.

- `packages/core/src/catalog/catalog.int.test.ts::taking a product off the shelf > removes it from the storefront list`
- `packages/core/src/catalog/catalog.int.test.ts::hides it from search`
- `packages/core/src/catalog/catalog.int.test.ts::makes the product page a 404`
- `packages/core/src/catalog/catalog.int.test.ts::refuses the sale`
- `packages/core/src/catalog/catalog.int.test.ts::refuses a new line even inside the order transaction`

### CAT-002

Stock and sales move in one atomic statement, never read-then-write: a reservation reports the line it could not satisfy and takes nothing, two cart rows of one SKU become one decrement, and the product rollup follows the SKU.

- `packages/core/src/catalog/catalog.int.test.ts::stock > reserves, and reports the line it could not satisfy`
- `packages/core/src/catalog/catalog.int.test.ts::merges two cart rows of the same SKU into one decrement`
- `packages/core/src/catalog/catalog.int.test.ts::rolls the product stock down with the SKU`
- `packages/core/src/catalog/catalog.int.test.ts::the CHECK constraint is the backstop under a raw over-decrement`

### CAT-003

The last unit is sold exactly once however many shoppers commit at the same instant, and a larger pool hands out exactly the stock that existed.

- `packages/core/src/catalog/catalog.concurrency.int.test.ts::reserving the last unit > sells it exactly once, however many shoppers commit at the same instant`
- `packages/core/src/catalog/catalog.concurrency.int.test.ts::hands out exactly the stock that existed, no more`

### CAT-004

A stock effect replayed in parallel still moves the numbers once: the paid event commits the sale once, a retried cancellation returns the stock once, and sales never go negative when a release over-reaches.

- `packages/core/src/catalog/catalog.concurrency.int.test.ts::a replayed stock effect > moves sales once even when the ledger delivers the paid event in parallel`
- `packages/core/src/catalog/catalog.concurrency.int.test.ts::returns the stock once when a cancellation is retried in parallel`
- `packages/core/src/catalog/catalog.int.test.ts::stock > never lets sales go negative when a release over-reaches`

### CAT-005

A refund release is idempotent **per refund**, not per order: two partial refunds of one order both restock, a replay of either does not, and the cancel path keeps a key of its own.

- `packages/core/src/catalog/catalog.int.test.ts::stock > restocks both partial refunds of one order, and neither of them twice`
- `packages/core/src/catalog/catalog.int.test.ts::keeps the cancel key and the refund key apart`
- `packages/core/src/catalog/catalog.int.test.ts::a committed release restores the stock and takes the sale back, in one move`

### CAT-006

Editing a product keeps the SKU rows their history hangs on: a price edit leaves the SKU id, its stock and its sales alone, and the denormalised product price and stock are rolled up from the visible SKUs only.

- `packages/core/src/catalog/catalog.int.test.ts::products > keeps a SKU id, its stock and its sales when the price is edited`
- `packages/core/src/catalog/catalog.int.test.ts::rolls the denormalised price and stock up from the visible SKUs`
- `packages/core/src/catalog/catalog.int.test.ts::excludes an invisible SKU from the price and the stock`
- `apps/web/app/admin/(shell)/catalog/products/product-editor.test.tsx::商品编辑器 > turns the detail response into form input without a single null`

### CAT-007

A product an unfinished order still references cannot be deleted, and a restored product comes back off the shelf rather than straight back on sale.

- `packages/core/src/catalog/catalog.int.test.ts::products > refuses to delete a product an unfinished order still references`
- `packages/core/src/catalog/catalog.int.test.ts::restores a deleted product as off_shelf, never straight back on sale`
- `packages/core/src/catalog/catalog.int.test.ts::refuses to restore a product that was never deleted`

### CAT-008

The category tree is three levels and consistent: the path and level are materialised from the parent, a fourth level is refused, a moved branch rewrites its whole subtree, a cycle is refused, and a category still holding products cannot be deleted.

- `packages/core/src/catalog/catalog.int.test.ts::categories > materialises the path and the level from the parent`
- `packages/core/src/catalog/catalog.int.test.ts::refuses a fourth level`
- `packages/core/src/catalog/catalog.int.test.ts::rewrites the whole subtree when a branch moves`
- `packages/core/src/catalog/catalog.int.test.ts::refuses to make a category a child of its own descendant`
- `packages/core/src/catalog/catalog.int.test.ts::refuses to delete a category that still holds products`

### CAT-009

A card-key product's stock **is** its card pool: importing derives the stock and reports duplicates, an import against a non-card product is refused, voiding takes only unclaimed cards back out, and the product form refuses a hand-typed stock. The two numbers cannot drift, so a card that does not exist is never sold.

- `packages/core/src/catalog/catalog.int.test.ts::virtual cards > derives the stock from the pool and reports duplicates`
- `packages/core/src/catalog/catalog.int.test.ts::refuses an import against a product that is not a card product`
- `packages/core/src/catalog/catalog.int.test.ts::voids only unclaimed cards`
- `packages/core/src/catalog/catalog.rules.test.ts::the product form > refuses a hand-typed stock on a card product`

### CAT-010

One card per order line, for good: a claim hands the same card back on a replay, two buyers never get the same card, an empty pool refuses rather than overselling, and **no line ever asks for two** — cart and checkout cap a `virtual_card` at one, so the unique index never has to swallow a second card.

- `packages/core/src/order/order.fulfil.int.test.ts::the paid hook and virtual delivery > runs exactly once however many times the ledger replays it`
- `packages/core/src/order/order.fulfil.int.test.ts::leaves the order in 待发货 for an operator when the shop is out of cards`
- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::two dispatchers replaying the same virtual delivery > gives the last card to exactly one of two orders racing for it`
- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::claims one card, writes one shipment and grants the coupons once`
- `packages/core/src/cart/cart.int.test.ts::adding to the cart > refuses a second card key`
- `packages/core/src/cart/cart.int.test.ts::editing the cart > refuses to edit a card-key row up to two`
- `packages/core/src/cart/cart.rules.test.ts::capFor > is one for a card-key product, whatever limit the product carries`
- `packages/core/src/order/order.int.test.ts::checkout preview > refuses more than one card key per line`
- `packages/core/src/order/order.int.test.ts::checkout preview > refuses more than one card key on 立即购买 too`
- `packages/core/src/order/order.int.test.ts::checkout preview > lets a single card key through checkout, and fulfilment delivers exactly one`

### CAT-011

A buyer reviews a delivered line exactly once — a double-tapped button writes one row, somebody else's line is refused without saying why, and a line not yet received is refused.

- `packages/core/src/catalog/catalog.int.test.ts::reviews > lets a buyer review a delivered line exactly once`
- `packages/core/src/catalog/catalog.int.test.ts::refuses a line belonging to somebody else without saying why`
- `packages/core/src/catalog/catalog.int.test.ts::refuses a line that has not been received yet`
- `packages/core/src/catalog/catalog.concurrency.int.test.ts::a double-tapped 发表评价 button > writes one review and refuses the rest`

### CAT-012

Moderation counts what it moved, not what it was handed: a batch reports the rows the one conditional update actually changed, two operators submitting the same batch do not both count it, and a hidden review is gone from the storefront list and from the summary.

- `packages/core/src/catalog/catalog.int.test.ts::reviews > batch moderation counts the rows it moved, not the ids it was handed`
- `packages/core/src/catalog/catalog.int.test.ts::hides a hidden review from the storefront list`
- `packages/core/src/catalog/catalog.concurrency.int.test.ts::two operators submitting the same moderation batch > reports the rows moved between them exactly once`
- `apps/web/app/admin/(shell)/catalog/reviews/product-reviews.test.tsx::商品评价 > publishes a selection in one request`

### CAT-013

The auto-review job writes its five-star default once the window has passed and never twice, and leaves a line the shopper reviewed alone.

- `packages/core/src/catalog/catalog.int.test.ts::auto review > writes a five-star default once the window has passed, and never twice`
- `packages/core/src/catalog/catalog.int.test.ts::leaves a line the shopper already reviewed alone`

### CAT-014

A lifetime limit counts what the shopper already bought and a per-order limit ignores history; below the minimum is refused.

- `packages/core/src/catalog/catalog.int.test.ts::purchase limits > counts what the shopper already bought against a lifetime limit`
- `packages/core/src/catalog/catalog.int.test.ts::a per-order limit ignores history`
- `packages/core/src/catalog/catalog.int.test.ts::refuses below the minimum`

### CAT-015

Search takes the shopper's keyword as text, not as SQL: a Chinese substring matches, case is ignored, and `%` is a literal. A search is recorded, offered back as history newest-first and de-duplicated, and a fruitless one never becomes a hot word.

- `packages/core/src/catalog/catalog.int.test.ts::search > matches a Chinese substring`
- `packages/core/src/catalog/catalog.int.test.ts::ignores case in the keyword field`
- `packages/core/src/catalog/catalog.int.test.ts::treats % as a literal, not a wildcard`
- `packages/core/src/catalog/catalog.int.test.ts::records the search and offers it back as a hot keyword, but not a fruitless one`
- `packages/core/src/catalog/catalog.int.test.ts::keeps a per-shopper history, newest first, de-duplicated`

### CAT-016

商品保障 has permission atoms of its own, separate from 商品参数, so granting "product parameters" never grants "edit the guarantee badges on every product page".

- `packages/core/src/catalog/catalog.int.test.ts::taxonomy > gives 商品保障 its own permission atoms rather than the 商品参数 group`

### CAT-017

The export is one row per SKU, reports truncation honestly rather than silently cutting the list, and is gated on its own atom because it carries cost prices.

- `packages/core/src/catalog/catalog.int.test.ts::export > emits one row per SKU and reports truncation honestly`
- `apps/web/app/admin/(shell)/catalog/products/product-list.test.tsx::商品列表 > exports the current tab as a CSV the browser writes`
- `apps/web/app/admin/(shell)/catalog/products/product-list.test.tsx::hides every write action from a read-only admin`

## Cart and order creation

### RISK-B1-001

An off-shelf or deleted product refuses the order instead of being quietly dropped from the lines, and its cart row stays visible with a reason so the shopper can act on it.

- `packages/core/src/order/order.int.test.ts::checkout preview > refuses an off-shelf line instead of quietly dropping it`
- `packages/core/src/cart/cart.int.test.ts::listing the cart > shows a dead row with a reason instead of dropping it`
- `packages/core/src/cart/cart.int.test.ts::listing the cart > filters to the sellable rows and to the dead ones`

### RISK-B1-002

A SKU whose price moved between the confirmation and the submit refuses the order rather than charging the new price: the client echoes the payable amount it was shown and a mismatch is `ORDER_PRICE_CHANGED`.

- `packages/core/src/order/order.int.test.ts::order creation > refuses when the shopper was shown a different price`

### RISK-B1-003

The cart price is read live, never from the row, so the confirmation cannot promise a price the product no longer has.

- `packages/core/src/cart/cart.int.test.ts::listing the cart > reads the price live rather than from the row`

### RISK-B1-004

A double submit of the same order key creates one order and answers every caller with it, decided by a UNIQUE constraint rather than by a cache lock.

- `packages/core/src/order/order.concurrency.int.test.ts::the same idempotency key submitted several times at once > creates exactly one order and answers every caller with it`
- `packages/core/src/order/order.concurrency.int.test.ts::the same idempotency key submitted several times at once > lets a key be reused after the order it was claiming rolled back`
- `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/checkout and /api/v1/orders > returns the same order for a replayed submit, still 201`

### RISK-B1-005

A creation that fails half-way leaves nothing behind: the coupon unspent, no order row, and every unit of stock already taken handed straight back.

- `packages/core/src/order/order.concurrency.int.test.ts::two checkouts for the last unit > hands back every line it already took when a later line is short`
- `packages/core/src/order/order.concurrency.int.test.ts::one coupon spent by two orders at once > is redeemed once, and the losing order does not exist`
- `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/checkout and /api/v1/orders > refuses a coupon that was already spent, and writes nothing`

### RISK-B1-006

The order and its items are one insert in one transaction, so there is no window in which an order exists without its lines, and a cancellation that cannot finish leaves the order exactly as it was.

- `packages/core/src/order/order.int.test.ts::order creation > creates the order, takes the stock, empties the cart and schedules the cancel`
- `packages/core/src/order/order.int.test.ts::cancellation > rolls the whole cancellation back when the stock cannot be returned`

## Order lifecycle and cancellation

### QUEUE-001

Paid, deleted, offline and already cancelled orders are not restored by the unpaid-cancel job.

- `packages/core/src/order/order.int.test.ts::auto-cancel > does nothing while the payment window is still open`
- `packages/core/src/order/order.int.test.ts::auto-cancel > is a no-op the second time, so the queue may retry it`
- `packages/core/src/order/order.int.test.ts::cancellation > never cancels a paid order — that road leads through a refund`

### QUEUE-002

An eligible unpaid order restores resources and persists cancellation state once — including an ordinary order whose buyer opened the WeChat payment sheet and backed out.

- `packages/core/src/order/order.int.test.ts::auto-cancel > cancels once the window has closed, and logs it as automatic`
- `packages/core/src/order/order.int.test.ts::auto-cancel > sweeps every expired order and leaves the live ones alone`
- `packages/core/src/order/order.cancel.payment.int.test.ts::the expired-order sweep > cancels an expired order whose buyer left an attempt open`
- `packages/core/src/order/order.cancel.payment.int.test.ts::the expired-order sweep > sweeps a batch of them, closing several gateway orders in one pass`

### QUEUE-003

A cancellation settles the payment gateway before it releases anything: `cancelOrder` calls `closeOrderPayments` outside the transaction, so the attempt is closed at the gateway first, `ensureNoOpenAttempts` re-asks under the order's row lock, and only then are the coupon and the stock restored. Both halves are exercised end to end against the real payment domain.

- `packages/core/src/order/order.int.test.ts::cancellation > gives back the stock and the coupon, and stamps the row`
- `packages/core/src/payment/payment.concurrency.int.test.ts::QUEUE-003 — a callback racing an order cancel > closes exactly once when two cancels arrive together`
- `packages/core/src/payment/payment.int.test.ts::PAYC-001 — a create in flight is never stepped over > settles it with the gateway first, and cancels only on a confirmed negative`
- `packages/core/src/order/order.cancel.payment.int.test.ts::cancelling an order whose buyer opened the WeChat sheet > closes the attempt, cancels the order and gives back the stock and the coupon`
- `packages/core/src/order/order.cancel.payment.int.test.ts::cancelling an order whose buyer opened the WeChat sheet > asks the gateway once, outside the transaction, and re-asks the database under the lock`
- `packages/core/src/order/order.cancel.payment.int.test.ts::a payment callback racing the cancel on one order > lets exactly one of them through, and releases the stock at most once`

### QUEUE-004

An unconfirmed gateway state (unknown or timeout) releases nothing: an unanswered close leaves the attempt `unknown`, the cancel raises `ORDER_PAYMENT_STATE_UNKNOWN`, the coupon and the stock stay with the order, and the sweep counts the order as `skipped` and retries it next pass rather than guessing.

- `packages/core/src/order/order.int.test.ts::cancellation > refuses, and releases nothing, when the gateway will not answer`
- `packages/core/src/payment/payment.concurrency.int.test.ts::QUEUE-003 — a callback racing an order cancel > refuses to cancel while an attempt is merely unknown — nothing is released on silence`
- `packages/core/src/payment/payment.int.test.ts::PAYC-001 — a create in flight is never stepped over > releases nothing while the gateway will not say`
- `packages/core/src/order/order.cancel.payment.int.test.ts::when the gateway will not answer > refuses with ORDER_PAYMENT_STATE_UNKNOWN and releases nothing`
- `packages/core/src/order/order.cancel.payment.int.test.ts::when the gateway will not answer > skips that order and sweeps the next one anyway`
- `packages/core/src/order/order.cancel.payment.int.test.ts::when the gateway will not answer > cancels the skipped order on the next sweep, once the gateway is back`

### QUEUE-005

A gateway payment discovered during cancellation keeps the order alive: `closeOrderPayments` reaches `reconcileAttempt` with the query's own facts, which confirms the payment locally through `settlePayment`; the cancel is then refused with `ORDER_ALREADY_PAID` and releases nothing.

- `packages/core/src/order/order.concurrency.int.test.ts::cancel racing the paid transition > refuses the cancellation outright when the gateway reports the money arrived`
- `packages/core/src/payment/payment.concurrency.int.test.ts::QUEUE-003 — a callback racing an order cancel > never cancels an order whose money arrived, whichever side gets there first`
- `packages/core/src/payment/payment.int.test.ts::PAYC-002 — a create whose answer was lost > books the payment when the answer that was lost was "yes"`
- `packages/core/src/order/order.cancel.payment.int.test.ts::when the gateway says the attempt was paid > refuses the cancel with ORDER_ALREADY_PAID and releases nothing`
- `packages/core/src/order/order.cancel.payment.int.test.ts::when the gateway says the attempt was paid > refuses the sweep the same way, and the order keeps its reservation`

### QUEUE-006

When the stock restore fails the coupon return, the stock restore and the cancel flag roll back together and no coupon_back status row survives.

- `packages/core/src/order/order.int.test.ts::cancellation > rolls the whole cancellation back when the stock cannot be returned`

### QUEUE-007

When the coupon cannot be returned the stock restore never runs and no stock layer is touched.

- `packages/core/src/order/order.int.test.ts::cancellation > gives nothing back when the coupon cannot be returned`

### QUEUE-008

Cancelling a presale order restores all four ledgers — the presale activity row, its SKU, the product row and the product SKU — through `onOrderCancelled`. The fixture uses deliberately different presale and product ids, so a restore through the ordinary layer cannot pass on matching totals.

- `packages/core/src/presale/presale.int.test.ts::cancelling > gives the reservation back and leaves sales alone`
- `packages/core/src/presale/presale.int.test.ts::cancelling > releases once however often the cancellation is replayed`
- `packages/core/src/presale/presale.int.test.ts::cancelling > does nothing when the cancellation lost the race to a payment`
- `packages/core/src/presale/presale.int.test.ts::placing an order > reserves once however often the creation is replayed (QUEUE-008)`
- `packages/core/src/presale/presale.concurrency.int.test.ts::REFUND-002 — a cancel racing a payment on a presale order > lets exactly one win, and the four ledgers agree with whichever it was`
- `packages/core/src/presale/presale.concurrency.int.test.ts::REFUND-002 — a cancel racing a payment on a presale order > balances all four ledgers when the cancellation wins, ten times running`
- `packages/core/src/presale/presale.concurrency.int.test.ts::the other conditional updates > claims each direction of the ledger exactly once`

### QUEUE-009

Two concurrent cancellations of one order release the stock and the coupon once and write one coupon_back row; the loser observes the committed cancellation.

- `packages/core/src/order/order.concurrency.int.test.ts::auto-cancel racing the user cancel > cancels once, returns the stock once and returns the coupon once`
- `packages/core/src/order/order.concurrency.int.test.ts::auto-cancel racing the user cancel > survives the sweep and the shopper arriving together on many orders`
- `packages/core/src/order/order.cancel.payment.int.test.ts::a payment callback racing the cancel on one order > cancels once when the shopper and the sweep arrive together on the same open attempt`

### QUEUE-010

Payment success records exactly one effect for the order and hands that recorded row to the repair job, which runs the effect it was given. The payment domain writes the row, and no second path does.

- `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > books the money once however many times WeChat delivers the same notification`
- `packages/core/src/payment/payment.int.test.ts::PAY-004 — a valid notification settles the order exactly once > pays the order, books the flow and records the hand-off effect`

### QUEUE-011

A repeated callback reuses the effect entry it already wrote, and one delivery claims it: a second concurrent delivery cannot run the same effect, a finished, freshly claimed or attempt-exhausted record is not re-delivered, an unknown or interrupted one is, and a failed effect records the unknown outcome with its attempt counted.

- `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-011 — a late callback after the payment was closed > records one exception and one automatic refund, and leaves the order cancelled`
- `packages/core/src/payment/payment.concurrency.int.test.ts::PAY-011 — a late callback after the payment was closed > sends the money back once when the effect ledger runs`
- `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-006 — reconciliation racing a refund callback > sends one refund however many effect dispatchers run`

### ORDER-001

The purchase path over real HTTP: cart, preview, create — the order lands with the stock decremented and the preview promises the price the order charges.

- `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/checkout and /api/v1/orders > previews without writing, then creates with 201`
- `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/cart > adds with 201 and lists what was added`

### ORDER-002

Order creation schedules the unpaid-order cancellation for the new order, so an abandoned order expires and releases its stock.

- `packages/core/src/order/order.int.test.ts::order creation > creates the order, takes the stock, empties the cart and schedules the cancel`

### ORDER-003

An unpaid order can be cancelled once, a paid one never, and neither leaves a duplicate status row.

- `packages/core/src/order/order.int.test.ts::cancellation > gives back the stock and the coupon, and stamps the row`
- `packages/core/src/order/order.int.test.ts::cancellation > refuses a second cancellation`
- `packages/core/src/order/order.int.test.ts::cancellation > never cancels a paid order — that road leads through a refund`
- `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/checkout and /api/v1/orders > cancels through the sub-resource and refuses the second attempt with 409`

### ORDER-004

Over real HTTP, submitting an order with an already spent coupon is refused before any write: no order row, the product stock unchanged and the coupon still spent rather than returned.

- `apps/web/app/api/v1/checkout.int.test.ts::/api/v1/checkout and /api/v1/orders > refuses a coupon that was already spent, and writes nothing`

### ORDER-009

`kind` and `kindMeta` are one discriminated union: a group-buy or presale order carries its own typed payload, a key its kind does not declare is stripped, an ordinary order's `kindMeta` is discarded, and every payload the legacy client sends still parses. Nothing inside `kindMeta` can overrule `kind`, so an ordinary order is never priced at an activity price.

- `packages/contracts/src/order/checkout-kind.test.ts::ORDER-009 — typed kindMeta > what the legacy client sends still parses > previews <label>`
- `packages/contracts/src/order/checkout-kind.test.ts::ORDER-009 — typed kindMeta > what the union tightens > strips a key the kind does not declare, above all a smuggled kind`
- `packages/contracts/src/order/checkout-kind.test.ts::ORDER-009 — typed kindMeta > what the union tightens > discards whatever kindMeta an ordinary order carries`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::ORDER-009 — a kind smuggled into kindMeta never reprices an ordinary order`

## Orders, ownership and the cashier

### ORDER-005

The console files an order away only once it is `cancelled`, `completed` or `refunded`: an order still in flight cannot be hidden while its stock and money stay committed, a batch skips what it cannot file rather than failing the lot, and however many operators tick the same order it is filed once. (A buyer hiding their own finished order is SMOKE-006.)

- `packages/core/src/order/order.console.int.test.ts::删除订单 > refuses an order that is still in flight`
- `packages/core/src/order/order.console.int.test.ts::删除订单 > files away a cancelled one and refuses to do it twice`
- `packages/core/src/order/order.console.int.test.ts::删除订单 > skips what it cannot delete in a batch rather than failing the lot`
- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::the console under concurrency > files an order away exactly once however many operators tick it`

### ORDER-006

A cancelled order cannot be paid afterwards (the refusal leaves no attempt behind), and a refunded order cannot be confirmed as received.

- `packages/core/src/order/order.fulfil.int.test.ts::receipt > refuses to confirm receipt of an order that was refunded`

### ORDER-007

A repeated receipt is refused and does not add a second receipt status row.

- `packages/core/src/order/order.fulfil.int.test.ts::receipt > refuses the buyer a second time, and refuses a stranger the first time`
- `packages/core/src/order/order.fulfil.int.test.ts::receipt > auto-receives silently, and a second pass is a no-op rather than an error`
- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::the buyer confirming while the auto-receive job fires > receives the order once and writes one timeline entry`

### ORDER-008

An order whose second stock deduction fails rolls back completely: no order row, the first item's product and SKU stock restored, and the failed item untouched.

- `packages/core/src/order/order.concurrency.int.test.ts::two checkouts for the last unit > hands back every line it already took when a later line is short`
- `packages/core/src/order/order.int.test.ts::the stock port > takes nothing when one line of several is short, and names that line`

### COUPON-007

The last coupon cannot be claimed twice: one concurrent claim wins, the other is refused, `remain_count` never goes negative and exactly one user holds it.

- `packages/core/src/coupon/coupon.concurrency.int.test.ts::COUPON-007 — the last coupon, claimed by two people at once > hands the last one to exactly one claimant`
- `packages/core/src/coupon/coupon.concurrency.int.test.ts::never oversells a larger supply and never goes negative`

### COUPON-008

Two simultaneous claims by one user leave exactly one success, the loser refused by the per-user limit, and one claim record.

- `packages/core/src/coupon/coupon.concurrency.int.test.ts::COUPON-008 — one user tapping 领取 twice > holds the per-user limit, and the unique violation surfaces as a 409`

### AUTH-005

A stranger gets `订单不存在` (never the after-sale detail) from the storefront refund surface — the refund service answers `REFUND_NOT_FOUND` for another user's row — and the admin refund route refuses an unauthenticated call without completing the after-sale.

- `packages/core/src/refund/refund.isolation.int.test.ts::AUTH-005 — a stranger and another shopper’s after-sale > answers a stranger’s read with exactly what an unknown id answers`
- `packages/core/src/refund/refund.isolation.int.test.ts::AUTH-005 — a stranger and another shopper’s after-sale > writes nothing when a stranger tries to act on it`
- `packages/core/src/refund/refund.isolation.int.test.ts::AUTH-005 — the admin refund route and an unauthenticated caller > refuses an unauthenticated 同意 without completing the after-sale`

### CLIENT-001

What the cashier is told comes from the database: a paid order reports `已支付` rather than a new payment intent, a cancelled order is refused a payment, and an order with an unknown gateway result is refused with a manual-handling message instead of a payment intent.

- `packages/core/src/payment/payment.int.test.ts::CLIENT-001 — what the cashier is told > reports 已支付 instead of minting a second payment intent`
- `packages/core/src/payment/payment.int.test.ts::CLIENT-001 — what the cashier is told > answers the cashier poll from the database, never from the gateway`
- `packages/core/src/payment/payment.int.test.ts::CLIENT-001 — what the cashier is told > refuses to start a payment on an order that is already cancelled`
- `packages/core/src/payment/payment.int.test.ts::PAYC-002 — a create whose answer was lost > keeps the attempt unknown, and the order neither paid nor cancellable`

## Authorization

### AUTH-001

The shop reads exactly one authorization header, `Authorization: Bearer <token>`; anything else is not a credential, and a route that requires one answers 401.

- `packages/core/src/auth/auth.test.ts::bearer parsing > reads a well-formed header and nothing else`
- `packages/core/src/auth/auth.test.ts::requireBearer throws 401 rather than returning null`

### AUTH-002

Optional authentication failure continues with an anonymous request.

- `apps/web/src/server/handle.test.ts::authentication > user-optional stays anonymous without a token and resolves with one`

### AUTH-003

Token expiry and cross-user order read/write isolation through HTTP routes.

- `packages/core/src/auth/auth.int.test.ts::storefront sessions > rejects an expired token`
- `packages/core/src/order/order.ref.int.test.ts::GET /api/v1/orders/:id > gives a stranger the same 404 for a number as for an id`
- `packages/core/src/order/order.int.test.ts::hiding a finished order > answers a second tap, a stranger and an unknown id all with the same 404`

### AUTH-004

The staff console (mobile order management) admits exactly the shoppers on the order-staff roster; a shopper who is not on it is refused, and an empty roster closes it.

- `apps/web/app/admin-api/orders/fulfilment.int.test.ts::the staff console > 403s a shopper who is not on the list`
- `apps/web/app/admin-api/orders/fulfilment.int.test.ts::the staff console > lets somebody on the list in, and lets them ship`
- `apps/web/app/admin-api/orders/fulfilment.int.test.ts::the staff console > tells an ordinary shopper they are not staff rather than 403ing them`

### AUTH-006

The mini-program sign-in counts only codes WeChat refused against a per-address budget (20 per 10 minutes); past it the address is refused with `RATE_LIMITED` without asking WeChat, a code WeChat accepted never counts, and another address is untouched.

- `packages/core/src/user/storefront-auth.int.test.ts::mini-program session renewal > AUTH-006 — stops asking WeChat for an address that sent 20 codes WeChat refused`
- `packages/core/src/user/storefront-auth.int.test.ts::mini-program session renewal > AUTH-006 — never counts a code WeChat accepted`

### AUTH-007

A parked mini-program sign-in survives a phone code WeChat refused, and the same bind token can instead be finished with an SMS code on `POST /auth/sessions/wechat-oa/phone`, which links the mini openid so the next launch is silent.

- `packages/core/src/user/storefront-auth.int.test.ts::mini-program session renewal > AUTH-007 — keeps the bind token when WeChat refuses the phone code`
- `packages/core/src/user/storefront-auth.int.test.ts::mini-program session renewal > AUTH-007 — finishes a mini sign-in with an SMS code instead, and links the mini openid`

### AUTH-008

A known mini-program openid renews silently: `signed-in`, `registered: false`, the same account, a fresh token of `sessionTtlDays` recorded as `wechat-mini`, no new account or identity, and the shopper's other sessions stay alive; `registered` is true only on the call that created the account, and a disabled account is not renewed.

- `packages/core/src/user/storefront-auth.int.test.ts::mini-program session renewal > AUTH-008 — renews an expired session silently: the same account, registered false, a fresh token of sessionTtlDays`
- `packages/core/src/user/storefront-auth.int.test.ts::mini-program session renewal > AUTH-008 — leaves the shopper’s other sessions alone when renewing`
- `packages/core/src/user/storefront-auth.int.test.ts::mini-program session renewal > AUTH-008 — refuses to renew a disabled account`
- `packages/core/src/user/storefront-auth.int.test.ts::mini-program session renewal > AUTH-008 — says registered only on the call that created the account`

## Fulfilment, the order console and invoices

### FULFILL-001

A dispatch is bounded by the UPDATE, not by a read: two operators pressing 发货 at the same instant produce one shipment, one `paid -> shipped` transition and one auto-receive job, and six operators splitting a four-unit line ship exactly four units.

- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::two operators shipping the same order at once > dispatches it exactly once`
- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::two operators shipping the same order at once > lets two operators split one line without ever overshipping it`

### FULFILL-002

`shipped_quantity + refunded_quantity <= quantity` holds against a refund approved mid-dispatch: whichever commits first, the other is refused or rolled back, and the CHECK `order_items_shipped_within_quantity` is what makes it true.

- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::shipping while a refund is approved for the same line > never lets shipped + refunded exceed what was ordered`
- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::shipping while a refund is approved for the same line > lets both through when there is room for both, and the roll-up still says fulfilled`
- `packages/core/src/order/order.fulfil.int.test.ts::the database itself > refuses to push a line past what was ordered`
- `packages/core/src/refund/refund.concurrency.int.test.ts::shipping the last unshipped units while a 仅退款 is approved > has exactly one winner when the warehouse goes first`
- `packages/core/src/refund/refund.concurrency.int.test.ts::shipping the last unshipped units while a 仅退款 is approved > has exactly one winner when the operator goes first`

### FULFILL-003

An order whose only unshipped unit was refunded rolls up to `fulfilled` rather than sitting in 部分发货 forever, and so does an order whose every line was refunded before anything shipped.

- `packages/core/src/order/order.fulfil.rules.test.ts::rollUpFulfillment > is fulfilled when the only unshipped unit was refunded`
- `packages/core/src/order/order.fulfil.rules.test.ts::rollUpFulfillment > is fulfilled when every line was refunded before anything shipped`

### FULFILL-004

`orders.status` and `orders.fulfillment_status` can never disagree, and an express shipment can never be written without a waybill.

- `packages/core/src/order/order.fulfil.int.test.ts::the database itself > refuses a fulfilment status that contradicts the order status`
- `packages/core/src/order/order.fulfil.int.test.ts::the database itself > refuses an express shipment with no waybill`

### FULFILL-005

A dispatch can be revoked only while the order has not left `paid`; revoking returns the units and rolls the fulfilment status back, and a second revocation is refused.

- `packages/core/src/order/order.fulfil.int.test.ts::editing and cancelling a shipment > hands the units back and rolls the fulfilment status back with them`
- `packages/core/src/order/order.fulfil.int.test.ts::editing and cancelling a shipment > refuses once the order has left paid, because there is no way back from shipped`
- `packages/core/src/order/order.fulfil.int.test.ts::editing and cancelling a shipment > refuses to cancel the same shipment twice`

### FULFILL-006

A courier API that is down or absent answers `available: false` rather than taking the order page with it.

- `packages/core/src/order/order.fulfil.int.test.ts::tracking > answers "unknown" rather than failing when no logistics provider is registered`
- `packages/core/src/order/order.fulfil.int.test.ts::tracking > does not let a courier API outage take the order page down`

### FULFILL-007

`received -> completed` waits out the review window, is a no-op on replay, and the sweep is only a backstop for a job the queue lost.

- `packages/core/src/order/order.fulfil.int.test.ts::completion > waits out the review window before completing`
- `packages/core/src/order/order.fulfil.int.test.ts::completion > is a no-op the second time, so a replayed job changes nothing`
- `packages/core/src/order/order.fulfil.int.test.ts::completion > sweeps the orders the delayed job lost`

### VIRTUAL-001

The paid hook writes one effect row and nothing else, so nothing in delivery can fail a payment; the ledger then hands the card key over exactly once however many times it replays, and two orders racing for the last card give it to one of them while the loser's effect is handed back for retry.

- `packages/core/src/order/order.fulfil.int.test.ts::the paid hook and virtual delivery > records one effect and nothing else inside the payment transaction`
- `packages/core/src/order/order.fulfil.int.test.ts::the paid hook and virtual delivery > runs exactly once however many times the ledger replays it`
- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::two dispatchers replaying the same virtual delivery > claims one card, writes one shipment and grants the coupons once`
- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::two dispatchers replaying the same virtual delivery > gives the last card to exactly one of two orders racing for it`

### VIRTUAL-002

A shop out of card keys leaves the order in 待发货 with nothing half-written, for an operator to see, rather than failing the payment or marking it delivered.

- `packages/core/src/order/order.fulfil.int.test.ts::the paid hook and virtual delivery > leaves the order in 待发货 for an operator when the shop is out of cards`

### VIRTUAL-003

`virtual_manual` is not auto-delivered — it goes out through the ordinary 发货 button — and a card or coupon line cannot be hand-shipped.

- `packages/core/src/order/order.fulfil.int.test.ts::the paid hook and virtual delivery > does not auto-ship a virtual_manual line — a human has to do something`
- `packages/core/src/order/order.fulfil.int.test.ts::what shipping refuses > refuses to ship a card line by hand — the paid hook already delivered it`
- `packages/core/src/order/order.fulfil.rules.test.ts::planShipment with named lines > refuses to hand-ship a card line`

### CONSOLE-001

改价 is refused once the money has arrived, the per-line shares still sum back to `orders.coupon_discount` to the fen, and a discount past the goods total is refused rather than clamped.

- `packages/core/src/order/order.console.int.test.ts::改价 > refuses once the money has arrived`
- `packages/core/src/order/order.console.int.test.ts::改价 > rewrites the order and every line, and the shares still sum back`
- `packages/core/src/order/order.console.int.test.ts::改价 > refuses a discount larger than the goods, and says what would have fitted`

### CONSOLE-002

修改收货地址 is refused once anything has gone out, so a printed label always matches the order.

- `packages/core/src/order/order.console.int.test.ts::修改收货地址 > is refused once the order has been dispatched`
- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::the console under concurrency > lets 修改地址 lose to a dispatch that commits first`

### CONSOLE-004

A console action reachable from both the web admin and the phone records _which_ surface acted, through `order_status_logs.operator_kind`.

- `packages/core/src/order/order.console.int.test.ts::备注 > records who wrote it, whichever console they used`

### INVOICE-001

One open invoice per order, enforced by the partial unique index rather than by asking first: five simultaneous requests leave exactly one row, and a cancelled or rejected one frees the slot.

- `packages/core/src/order/order.invoice.int.test.ts::申请开票 > allows exactly one open request per order`
- `packages/core/src/order/order.invoice.int.test.ts::申请开票 > gives the slot to exactly one of several simultaneous requests`
- `packages/core/src/order/order.invoice.int.test.ts::申请开票 > lets the buyer ask again after cancelling, with a corrected header`

### INVOICE-002

An invoice can only be issued or rejected once, and an issued one always carries its number and issue time (`order_invoices_issued_shape`).

- `packages/core/src/order/order.invoice.int.test.ts::the operator > refuses to issue the same invoice twice`
- `packages/core/src/order/order.invoice.int.test.ts::the operator > issues it to exactly one of two operators pressing at once`
- `packages/core/src/order/order.invoice.int.test.ts::the database itself > refuses an issued invoice with no number`

### INVOICE-003

An invoice can only be asked for on an order that was paid for and not refunded, and a stranger is refused exactly as a missing order is.

- `packages/core/src/order/order.invoice.int.test.ts::申请开票 > refuses an order nobody has paid for`
- `packages/core/src/order/order.invoice.int.test.ts::申请开票 > refuses an order whose money went back`
- `packages/core/src/order/order.invoice.int.test.ts::what the buyer can see > tells a stranger the invoice does not exist`

## 小程序发货信息管理 (WeChat mini-program shipping)

### WXSHIP-001

A shipment of an order paid through the mini program (`payment_attempts.channel = wechat_mini`) is reported to WeChat's 发货信息管理 (`upload_shipping_info`) after its transaction commits, through the effects ledger, keyed by the payment's `transaction_id` and the payer's openid. One shipment that sends everything is one unified upload (`delivery_mode: 1`); a split delivery is one express upload per shipment in dispatch order, `is_all_delivered` on the last. 顺丰 carries the masked receiver phone, a virtual delivery is `logistics_type: 3` with no waybill. A payment through any other channel, or any payment while 录入发货信息 is off, is never reported.

- `packages/core/src/payment/payment.mini-trade.int.test.ts::reporting a shipment of a mini-program payment > uploads one unified express shipment with the carrier’s WeChat code — WXSHIP-001`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::reporting a shipment of a mini-program payment > adds the masked receiver phone for 顺丰 — WXSHIP-001`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::reporting a shipment of a mini-program payment > reports a split delivery in parts, the last one saying all delivered — WXSHIP-001`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::reporting a shipment of a mini-program payment > reports a virtual delivery as logistics_type 3 without a waybill — WXSHIP-001`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::reporting a shipment of a mini-program payment > reports nothing for a payment made outside the mini program, or while switched off — WXSHIP-001`

### WXSHIP-002

An upload WeChat refused is retried by the ledger, and one WeChat already has (`10060002`, `10060023`) finishes as reported. An express shipment whose carrier has no 微信快递编码 is not sent with a guess: the effect waits, and goes out once an operator fills the code in.

- `packages/core/src/payment/payment.mini-trade.int.test.ts::reporting a shipment of a mini-program payment > waits, retrying, while the carrier has no WeChat code — and sends once it is filled in — WXSHIP-002`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::reporting a shipment of a mini-program payment > retries a WeChat refusal, and finishes on “already shipped” — WXSHIP-002`

### WXSHIP-003

修改发货信息 on a reported shipment re-uploads it at most once, which is WeChat's own limit; a second correction is not sent.

- `packages/core/src/payment/payment.mini-trade.int.test.ts::reporting a shipment of a mini-program payment > corrects a reported waybill once, as WeChat allows, and never twice — WXSHIP-003`

### WXSHIP-004

The mini program's push URL (`/api/v1/webhooks/wechat-mini`) acts only on a delivery signed with our token, fresh (±5 minutes), single-use for its signature triple, and — in 安全/兼容模式 — decrypted with our AES key and addressed to our appid; in 安全模式 a plaintext delivery is refused. A known event becomes one ledger row however often WeChat re-delivers it; an unknown event is acknowledged and dropped.

- `packages/core/src/payment/payment.mini-trade.int.test.ts::POST /api/v1/webhooks/wechat-mini > answers the URL check only when it is signed with our token — WXSHIP-004`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::POST /api/v1/webhooks/wechat-mini > refuses a bad signature, a plaintext push in 安全模式, a stale one and a reused nonce — WXSHIP-004`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::POST /api/v1/webhooks/wechat-mini > accepts plain JSON when 明文模式 is configured, and drops events nobody handles — WXSHIP-004`

### WXSHIP-005

WeChat's settlement push (`trade_manage_order_settlement`) moves a shipped order to received through the same conditional transition the buyer's 确认收货 and the auto-receive job use: a push repeated, and a push racing the buyer's tap, leave exactly one receipt.

- `packages/core/src/payment/payment.mini-trade.int.test.ts::POST /api/v1/webhooks/wechat-mini > moves the order to received on a settlement push, once, however often WeChat repeats it — WXSHIP-005`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::POST /api/v1/webhooks/wechat-mini > stamps the settlement when the money moves, without moving the order again — WXSHIP-005`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::the 确认收货 component > leaves one receipt when the settlement push and the buyer’s tap race — WXSHIP-005`

### WXSHIP-006

The 确认收货 component (`GET /api/v1/orders/:id/wechat-receipt`) is handed a payment number only for the signed-in shopper's own order, once it is shipped and WeChat was told everything left; a stranger's order is `ORDER_NOT_FOUND`. A receipt confirmed through the component (`{ via: 'wechat-component' }`) moves the order only after WeChat's `get_order` says the buyer confirmed; otherwise `ORDER_WECHAT_RECEIPT_UNCONFIRMED` and the order stays shipped.

- `packages/core/src/payment/payment.mini-trade.int.test.ts::the 确认收货 component > hands the payment number to the order’s owner only — WXSHIP-006`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::the 确认收货 component > answers null for an order WeChat was not told about — WXSHIP-006`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::the 确认收货 component > moves the order only once WeChat’s get_order says the buyer confirmed — WXSHIP-006`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::the 确认收货 component > refuses the component path for an order that was never reported — WXSHIP-006`

### WXSHIP-007

WeChat's shipping reminder and its 已纳入发货信息管理 notice reach operators as in-app notices. 同步 (`is_trade_managed` + `set_msg_jump_path`) is an operator's action with `payment:config:write`, run by hand rather than on a config save, and says so when the mini program is not configured or WeChat refuses.

- `packages/core/src/payment/payment.mini-trade.int.test.ts::POST /api/v1/webhooks/wechat-mini > tells operators about WeChat’s shipping reminder and about being put under management — WXSHIP-007`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::同步 (is_trade_managed + set_msg_jump_path) > records WeChat’s answer and points messages at the order page — WXSHIP-007`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::同步 (is_trade_managed + set_msg_jump_path) > says so when the mini program is not configured, and when WeChat refuses — WXSHIP-007`
- `packages/core/src/payment/payment.mini-trade.int.test.ts::同步 (is_trade_managed + set_msg_jump_path) > is an admin’s, not a shopper’s — WXSHIP-007`

## Refunds

### REFUND-001

A refund goes back through the payment that collected the money: it is frozen against the `payment_attempts` row that collected it, so an order without one is refused with `REFUND_NO_ORIGINAL_PAYMENT` for an operator to settle by hand, rather than inventing a transaction.

- `packages/core/src/refund/refund.int.test.ts::REFUND-001 — there is no original channel to send it back through > refuses to send, and says so, rather than inventing a transaction`

### REFUND-002

A refunded presale order restores the presale activity row, the presale SKU, the product row and the product SKU to their exact prior stock and sales, through `onOrderRefunded`. The fixture uses deliberately different ids and SKUs for the presale and the product layers, so a restore through the wrong layer cannot pass on matching totals. A settled refund calls `StockPort.release` once, for the unshipped units only.

- `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-006 — reconciliation racing a refund callback > does not restock a line that has already shipped`
- `packages/core/src/presale/presale.int.test.ts::refunding > walks stock and sales back together`
- `packages/core/src/presale/presale.int.test.ts::refunding > restores once however often the refund callback arrives`
- `packages/core/src/presale/presale.int.test.ts::refunding > leaves everything alone on a partial refund`
- `packages/core/src/presale/presale.int.test.ts::refunding > refunds an unpaid order without taking sales below zero`
- `packages/core/src/presale/presale.int.test.ts::paying > records the sale on the reservation row, so the ledger can still balance`
- `packages/core/src/presale/presale.concurrency.int.test.ts::REFUND-002 — a cancel racing a payment on a presale order > balances all four ledgers when a refund races itself`

### REFUND-003

An order sold from a group buy, a presale or ordinary stock restores through that layer only. The activity layers restore from `onOrderRefunded` / `onOrderCancelled`, which run only for an order of their own `kind`: an ordinary order never reaches the activity ledgers, and the activity ledgers are separate rows from the product ones, so a restore through the wrong layer cannot pass. The refund domain calls one port once, with the order's lines and `{ committed: true, refundId }`.

- `packages/core/src/groupbuy/groupbuy.int.test.ts::refunding a paid order > returns every activity ledger to where it started`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::cancelling an unpaid order > gives the activity stock back and leaves no seat behind`
- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::the activity ledgers > return to where they started when everybody refunds at once`
- `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-006 — reconciliation racing a refund callback > ends the order and releases nothing twice when the last line is refunded`
- `packages/core/src/presale/presale.int.test.ts::refunding > walks stock and sales back together`
- `packages/core/src/presale/presale.int.test.ts::paying > ignores an order that is not a presale`
- `packages/core/src/presale/presale.checkout.int.test.ts::确认订单 > does not touch an ordinary order for the same SKU`

### REFUND-004

A restock that fails never loses the money. The money moves at WeChat, outside any transaction, so the restore cannot precede it; the settlement — ledger row, order roll-up and restock — is one transaction that rolls back whole, and the frozen `out_refund_no` settles it later rather than sending a second refund.

- `packages/core/src/refund/refund.int.test.ts::REFUND-004 — a restock that fails never loses the money > rolls the settlement back and settles it once the restock works again`

### REFUND-005

The refund number and amount are frozen on the first attempt and replayed on every retry: a second call with a higher amount reuses the persisted after-sale number and the originally frozen price, and both are persisted on the after-sale row.

- `packages/core/src/refund/refund.int.test.ts::REFUND-005 — a retry may not change what was sent > re-sends the frozen number instead of opening a second refund`
- `packages/core/src/refund/refund.int.test.ts::REFUND-005 — a retry may not change what was sent > refuses a retry that asks for a different amount than the one frozen`
- `packages/core/src/refund/refund.int.test.ts::REFUND-005 — a retry may not change what was sent > never gives back more than the order was paid, across several requests`

### REFUND-006

Two refund attempts released together from separate processes freeze one gateway number and one amount, and the persisted row matches what both attempts agreed on.

- `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-002 — approval racing the buyer withdrawing > queues one gateway call however many times the operator presses 同意`
- `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-003 — duplicate refund callback > gives the money back once however many times WeChat delivers it`
- `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-006 — reconciliation racing a refund callback > settles once when the query and the notification arrive together`
- `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-006 — reconciliation racing a refund callback > sends one refund however many effect dispatchers run`

### REFUND-007

The sum of every refund on an order never exceeds what the order collected: the ceiling is checked under `FOR UPDATE` on the order row, re-checked inside the settling `UPDATE`'s own `WHERE`, and backstopped by the `orders_refunded_within_paid` CHECK. A retry that asks for a different amount than the one frozen is refused, never silently ignored.

- `packages/core/src/refund/refund.rules.test.ts::remainingCeiling — the sum of refunds never exceeds the payment > treats an unpaid order as nothing to give back`
- `packages/core/src/refund/refund.int.test.ts::REFUND-005 — a retry may not change what was sent > refuses a retry that asks for a different amount than the one frozen`
- `packages/core/src/refund/refund.int.test.ts::REFUND-005 — a retry may not change what was sent > never gives back more than the order was paid, across several requests`
- `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-001 — two refund requests on one order line > never lets two requests together ask for more than was paid`

### REFUND-010

A refund the shop opens by itself takes the full amount of every _unshipped_ line and needs no approval: it is written `approved`, with no reviewing admin, and the gateway call is queued as a post-commit effect rather than made inside the transaction. A line that has shipped is left to a person.

- `packages/core/src/refund/refund.system.int.test.ts::a refund the shop opens by itself > takes every unshipped line, needs no approval, and queues the gateway call`
- `packages/core/src/refund/refund.system.int.test.ts::a refund the shop opens by itself > gives the freight back only while nothing has shipped`

### REFUND-011

It is idempotent per `(order, reason)`: a replayed effect, a second sweep or two callers released together open one `refunds` row, and every caller is answered with its id. A buyer's own open request on a line wins, and the system refund stands aside.

- `packages/core/src/refund/refund.system.int.test.ts::a refund the shop opens by itself > answers the second caller with the first refund instead of opening another`
- `packages/core/src/refund/refund.system.int.test.ts::a refund the shop opens by itself > opens one refund when two callers arrive at the same instant`
- `packages/core/src/refund/refund.system.int.test.ts::a refund the shop opens by itself > stands aside when the buyer already has a request on the line`

### REFUND-012

It obeys the same cumulative ceiling an applied refund does — never more than the order collected, whatever the lines add up to — and the cap is spread over the lines, so `refunds.amount` and its `refund_items` still agree. An order with nothing left to give back is refused rather than opening an empty refund.

- `packages/core/src/refund/refund.system.int.test.ts::a refund the shop opens by itself > never gives back more than the order collected`
- `packages/core/src/refund/refund.system.int.test.ts::a refund the shop opens by itself > refuses when there is nothing left to give back`
- `packages/core/src/refund/refund.system.int.test.ts::a refund the shop opens by itself > refuses an order that never collected anything`

### REFUND-013

It settles through the same path an approved request does — one capital-flow row, one `StockPort.release`, the order's roll-up and `onOrderRefunded` — and a failed group buy's paid members each end up with exactly one refund however many sweeps run, while a member who never paid gets none.

- `packages/core/src/refund/refund.system.int.test.ts::a refund the shop opens by itself > settles through the same path an approved request does`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::the system refund for a failed team > gives every paid member exactly one refund, however many sweeps run`

## Registration and notifications

### USER-001

Self registration issues the configured newcomer coupon to the new account, and to nobody else.

- `packages/core/src/user/storefront-auth.int.test.ts::register > issues the newcomer coupon to the new account and to nobody else`

### USER-002

A registration retry issues the coupon once and never credits money or points.

- `packages/core/src/user/storefront-auth.int.test.ts::register > issues the newcomer coupon to the new account and to nobody else`
- `packages/core/src/coupon/coupon.int.test.ts::grantNewUser > issues nothing the second time — a retried registration — USER-002`

### USER-003

An admin notification reaches exactly the admins who hold the event's permission atom: the person who may open 退款单 is the person who hears about one, a super admin hears everything, and a disabled account hears nothing.

- `packages/core/src/notification/notification.int.test.ts::admin fan-out and the SSE bell > reaches every admin who may see the event, over SSE, and nobody else`
- `packages/core/src/notification/notification.int.test.ts::admin fan-out and the SSE bell > leaves a disabled account out, so a departed colleague stops accruing 站内信`
- `packages/core/src/notification/notification.int.test.ts::admin fan-out and the SSE bell > reaches a super admin without any explicit grant`

### NOTIF-001

A notification is recorded inside the business transaction and sent after it commits, so a send can never fail an order, a payment or a refund, and a rolled-back change leaves no message behind.

- `packages/core/src/notification/notification.int.test.ts::notify > writes an effect row inside the caller transaction and sends nothing yet`
- `packages/core/src/notification/notification.int.test.ts::notify > is rolled back with the business change it belongs to`
- `packages/core/src/notification/notification.int.test.ts::notify > drops an event nobody registered rather than failing the order`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::shopper notifications > tells each paid member 拼团失败 in the transaction that opened their refund`
- `packages/core/src/presale/presale.int.test.ts::shopper notifications > tells a shopper whose payment the quota refused, in the transaction that opened the refund`

### NOTIF-002

The same event for the same aggregate notifies once, however many callers ask and however many dispatchers run; two aggregates are two notifications.

- `packages/core/src/notification/notification.int.test.ts::notify > records the same event for the same aggregate once, twice for two aggregates`
- `packages/core/src/notification/notification.int.test.ts::fan-out > delivers the same notification once when two dispatchers race it`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::shopper notifications > tells the leader 开团成功 and a joiner 参团成功, once each however often the effect runs`
- `packages/core/src/presale/presale.int.test.ts::shopper notifications > tells the shopper the ship date their payment fixed, once, on every channel switched on`

### NOTIF-003

A channel that fails retries only itself: the effect goes back to pending with the error on the row, and the channels that already went out are not re-sent. A channel that merely does not apply — no provider, no template code, no openid — is skipped, not failed, so it never parks a row an operator cannot act on.

- `packages/core/src/notification/notification.int.test.ts::a channel that fails > retries the effect, keeps the message it already delivered, and never duplicates it`
- `packages/core/src/notification/notification.int.test.ts::a channel that fails > skips, rather than fails, a channel no provider is wired for`
- `packages/core/src/notification/notification.int.test.ts::a channel that fails > skips a channel the operator left unconfigured`

### NOTIF-004

The events that can fire are compiled in, and a template row is seeded from the registry on first use with in-app on and every channel that costs money or needs a credential off.

- `packages/core/src/notification/notification.int.test.ts::fan-out > seeds the template from the registry and writes the in-app message`
- `packages/core/src/notification/notification.int.test.ts::fan-out > does not send at all when the operator turned the event off`
- `packages/core/src/notification/notification.int.test.ts::fan-out > sends in-app from a template shell the reference-data seed wrote with no channels`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::shopper notifications > lists the four events in 通知管理 with in-app on, over the empty shells the seed writes`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::shopper notifications > sends nothing for an event the operator switched off in 通知管理`
- `packages/core/src/presale/presale.int.test.ts::shopper notifications > sends nothing for an event the operator switched off in 通知管理`

### NOTIF-005

Rendering cannot lose a message: an unknown placeholder renders empty rather than as itself, a value that itself contains `{{…}}` is not re-expanded, and a WeChat field that renders empty or overlong is dropped or clamped rather than failing the whole message's type check.

- `packages/core/src/notification/notification.render.test.ts::render > renders an unknown placeholder as nothing, never as itself`
- `packages/core/src/notification/notification.render.test.ts::render > does not re-render what a value itself contains`
- `packages/core/src/notification/notification.render.test.ts::renderFields > drops a field that rendered empty instead of sending ""`

### USER-010

An SMS verification code is spent exactly once: two concurrent verifications of one code produce one sign-in and one refusal, and a wrong code burns an attempt.

- `packages/core/src/user/user.concurrency.int.test.ts::SMS codes > lets exactly one of six concurrent verifications spend a code`
- `packages/core/src/user/storefront-auth.int.test.ts::code verification > destroys the code on use, so it cannot be replayed`

### USER-011

Any password change — by the shopper, by a reset, or by an operator — revokes every live session of that account.

- `packages/core/src/user/storefront-auth.int.test.ts::sessions > kills every session when the password changes`

### USER-012

A disabled account's already-issued token stops resolving immediately, not at expiry.

- `packages/core/src/user/storefront-auth.int.test.ts::sessions > rejects a live token the moment the account is disabled`
- `packages/core/src/user/user.concurrency.int.test.ts::disabling an account > bumps the version once and leaves no live session`

### USER-013

Login throttling counts an account+IP window and an account-only window separately, both over 900 s.

- `packages/core/src/user/storefront-auth.int.test.ts::login throttling > counts the account window and the account+IP window separately`

### USER-014

Account and phone uniqueness is case-insensitive and enforced by the database, not by a prior read.

- `packages/core/src/user/user.int.test.ts::account uniqueness > is case-insensitive on the account name`

### USER-015

One phone number is one account and one openid is one account, however many registrations arrive at the same instant.

- `packages/core/src/user/user.concurrency.int.test.ts::registration > six concurrent creations of one phone number leave one account`
- `packages/core/src/user/user.concurrency.int.test.ts::registration > six taps on 微信登录 create one account and sign every caller into it`

### USER-016

A customer keeps at most 20 live 发票抬头 and at most one default, including when their own writes race: every write to one customer's book queues on a per-user advisory lock, so six simultaneous promotions all succeed and leave one default, six simultaneous first titles leave one default, and creates racing the cap let exactly the free slots through.

- `packages/core/src/user/invoice-title.int.test.ts::invoice titles > USER-016 — refuses a title past the cap of 20`
- `packages/core/src/user/invoice-title.int.test.ts::USER-016 — one customer’s title writes, raced > leaves exactly one default when six titles are promoted at once, and every caller succeeds`
- `packages/core/src/user/invoice-title.int.test.ts::USER-016 — one customer’s title writes, raced > makes exactly one of six simultaneous first titles the default`
- `packages/core/src/user/invoice-title.int.test.ts::USER-016 — one customer’s title writes, raced > lets exactly the free slots through when six creates race the cap`

### USER-017

A saved 发票抬头 always prefills a `POST /orders/:id/invoice` body the route accepts: the title form and the request share one header schema and its rules, the service re-checks them after trimming, and `invoiceRequestFromTitle` copies only the non-empty header fields.

- `packages/contracts/src/user/invoice-title.test.ts::USER-017 — a saved title prefills the invoice request > copies <label> into a body the request schema accepts`
- `packages/core/src/user/invoice-title.int.test.ts::invoice titles > USER-017 — every saved title prefills a request body the invoice route accepts`

### USER-018

A 发票抬头 belongs to the customer who saved it: reading, editing, deleting or promoting somebody else's title answers exactly like one that does not exist, and changes nothing.

- `packages/core/src/user/invoice-title.int.test.ts::invoice titles > USER-018 — never reads, edits, deletes or promotes another customer’s title`
- `apps/web/app/api/v1/user.int.test.ts::/api/v1/invoice-titles > USER-018 — keeps every title route to its owner: a stranger gets 404 on all four`

### USER-019

A shopper's avatar is a picture we hold: `PUT /profile` takes an `avatarUrl` only when it is a live image in our storage, the account's current avatar re-sent, or the shop's configured default avatar (`''` clears it); anything else is `USER_AVATAR_NOT_ALLOWED` and nothing in the request is saved.

- `packages/core/src/user/user.int.test.ts::USER-019 — the avatar comes from our own storage > takes an image our uploads stored, whoever uploaded the bytes first`
- `packages/core/src/user/user.int.test.ts::USER-019 — the avatar comes from our own storage > refuses a URL on somebody else’s server, and changes nothing`
- `packages/core/src/user/user.int.test.ts::USER-019 — the avatar comes from our own storage > refuses a deleted attachment and one that is not an image`
- `packages/core/src/user/user.int.test.ts::USER-019 — the avatar comes from our own storage > takes the current avatar back unchanged, as every legacy save re-sends it`
- `apps/web/app/api/v1/user.int.test.ts::/api/v1/profile > USER-019 — takes the avatar our upload returned and refuses one on another server`

## Coupons

### COUPON-001

The storefront offers only live, in-stock coupons that a shopper claims by hand. A coupon the shop issues by itself — to new users, with an order, or by an operator's grant — is never claimable, and there is no member-only coupon: the claim modes are `manual`, `new_user`, `order_gift` and `admin_grant`.

- `packages/core/src/coupon/coupon.int.test.ts::listClaimable > lists only live, in-stock, manually claimable templates`
- `packages/core/src/coupon/coupon.int.test.ts::listClaimable > advertises new-user coupons but never marks them claimable`

### COUPON-002

Claiming anything but a live, manually claimable template is refused before any write: a draft, disabled, deleted or unknown template answers the same way, and a template that is issued rather than claimed is refused.

- `packages/core/src/coupon/coupon.int.test.ts::claim > refuses a draft, disabled, deleted or unknown template the same way`
- `packages/core/src/coupon/coupon.int.test.ts::claim > refuses a template that is issued rather than claimed`

### COUPON-003

An ordinary coupon can be claimed and consumes one from `remain_count`.

- `packages/core/src/coupon/coupon.int.test.ts::claim > puts a coupon in the wallet and decrements the supply — COUPON-003`

### COUPON-004

Redeeming the same coupon twice succeeds once: the first redemption marks the row used and records the use time, and a second attempt in a later second changes nothing and does not rewrite the use time.

- `packages/core/src/coupon/coupon.int.test.ts::redeem > refuses a second redemption — COUPON-004`

### COUPON-005

A coupon that is not usable by this holder is refused in one conditional update and left in the state it was found: already used, marked failed, expired, not yet valid, and a coupon held by another uid each return zero affected rows.

- `packages/core/src/coupon/coupon.int.test.ts::redeem > refuses every unusable shape with one code — COUPON-005`

### COUPON-006

Two redemptions of one coupon released together from separate processes leave exactly one winner: the loser observes zero affected rows and the row records a single use.

- `packages/core/src/coupon/coupon.concurrency.int.test.ts::COUPON-006 — one coupon, two orders at the same instant > lets exactly one redemption win`

## Group buys

### RISK-D-001

Opening a team is part of placing the order, not of paying for it: no code path can leave a paid order without a team. The team row, the seat row and the expiry clock are written in the order's own transaction, and the clock is a delayed effect rather than a queue message, so a rolled-back order takes its timer with it.

- `packages/core/src/groupbuy/groupbuy.int.test.ts::placing an order > opens a team with no seat taken and holds the activity stock`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::placing an order > starts the team clock in the same transaction, as a delayed effect`

### RISK-D-002

The last seat goes to exactly one of N simultaneous payers, and the team is completed exactly once: the seat is a conditional update against `seats_taken < seats_total` under the team's row lock, never a check followed by a save. A payer who loses the seat is refunded rather than left paid and unseated.

- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::the last seat > goes to exactly one of five simultaneous payers`
- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::the last seat > completes the team once and only once`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::paying > completes the team in the same transaction as the last seat`

### RISK-D-003

A refund recomputes the team once: the seat is freed, the leader is replaced by the earliest remaining paid member, and a team that is emptied by a refund fails rather than reading cancelled. Two members refunding at once cannot deadlock — every path locks the team row first and re-reads the membership under it.

- `packages/core/src/groupbuy/groupbuy.int.test.ts::refunding a paid order > promotes the earliest remaining paid member when the leader refunds`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::cancelling an unpaid order > hands the team to the next member when the leader walks away`
- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::leadership > passes to exactly one heir while a join is in flight`
- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::leadership > survives two members refunding at once`

### RISK-D-004

A payment landing as the team expires ends in exactly one of two states — the seat is taken, or the money is refunded — never neither and never both, whichever side commits first. Colliding sweeps settle the team once.

- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::a payment landing as the team expires > either takes the seat or is refunded — never neither, never both`
- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::a payment landing as the team expires > settles once even when two sweeps collide`

### RISK-D-005

An expired under-filled team refunds every paid member exactly once, through the effect ledger (`refund.refundSystemInitiated`): every paid member ends up with exactly one `refunds` row however many sweeps run and however often the effect is re-driven, and a member who never paid gets none.

- `packages/core/src/groupbuy/groupbuy.int.test.ts::the expiry sweep > fails an under-filled team and asks for one refund per paid member`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::the expiry sweep > is idempotent — a second sweep records no second refund`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::the system refund for a failed team > gives every paid member exactly one refund, however many sweeps run`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::the system refund for a failed team > lets a test substitute the refund seam`

### RISK-D-006

虚拟成团 never happens (decided 2026-09-23: the mini-program is the only storefront, and a team completed with invented members reads as a fake transaction there). A team that has not filled by its deadline fails and every paid member is refunded, even in a shop that had the retired `virtualFillOnExpiry` switch stored as on; migration `0005_groupbuy_virtual_fill_off` deletes that stored key so a rollback to the previous image cannot revive it. 立即成团 is refused on an under-filled team whatever is stored, records no `groupbuy.settle`, and is refused to an admin who may read teams but not complete them.

- `packages/core/src/groupbuy/groupbuy.int.test.ts::the expiry sweep > RISK-D-006 — fails and refunds an under-filled team even with the retired 虚拟成团 switch stored as on`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::the expiry sweep > RISK-D-006 — migration 0004 deletes a stored 虚拟成团 switch`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::the admin surface > RISK-D-006 — refuses 立即成团 on an under-filled team, whatever the retired switch says`
- `apps/web/app/admin-api/groupbuy-activities/groupbuy.int.test.ts::/admin-api/groupbuy-groups and /admin-api/groupbuy-statistics > refuses 立即成团 to an admin who may read teams but not complete them`
- `packages/core/src/groupbuy/groupbuy.smoke.int.test.ts::立即成团 says so > RISK-D-006 — refuses an under-filled team and records no groupbuy.settle`

### RISK-D-007

Editing a campaign keeps its counters: an edit is an update of the per-SKU rows, never a delete and re-insert, so 已售 and the sold stock survive every save, and the admin page reads the activity before it writes it back.

- `packages/core/src/groupbuy/groupbuy.int.test.ts::the admin surface > keeps the sales counter across an edit`
- `apps/web/app/admin/(shell)/groupbuy/activities/groupbuy-activities.test.tsx::拼团活动 > reads the activity before editing it, and sends the SKU rows back`

### RISK-D-008

One shopper cannot hold two seats in one team however fast they click, and a team is only offered to strangers once its leader has paid for their own seat.

- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::one shopper, two clicks > joins the same team once`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::beforeCreate > refuses joining a team the shopper is already in`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::the storefront surface > offers a team only once its leader has paid`

### RISK-D-009

The 拼团价 is what a group-buy order charges, and an ordinary order for the same SKU still charges the catalogue price. The activity price reaches the order through the pricing contributor, and the kind handler checks the _result_: `afterCreate` compares what the written lines charge against what the activity says they cost and rolls the whole order back if the goods cost more. Charging less is allowed — a coupon on top is the shopper's business.

- `packages/core/src/groupbuy/groupbuy.int.test.ts::the group-buy price through the real checkout > prices a group-buy order at the activity price, preview and create`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::the group-buy price through the real checkout > leaves the same SKU at its ordinary price on an ordinary order`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::the group-buy price through the real checkout > prices a shopper joining an open team the same way`
- `packages/core/src/groupbuy/groupbuy.int.test.ts::beforeCreate > refuses an order whose draft is not at the activity price`

## 页面装修 (DIY)

### DIY-001

A saved page survives parse → serialise byte for byte, including keys no schema in this build knows, for every production export. Validation hands back the caller's own object rather than zod's rebuilt one.

- `packages/contracts/src/diy/schema/round-trip.test.ts::page value round trip > %s: parse -> serialise is byte-identical`
- `packages/core/src/diy/diy.test.ts::validateDiyContent > hands back the caller’s own object, so the bytes never change`

### DIY-002

Retired components and links to removed storefront pages are filtered on **read**, never on write: the stored row keeps every node, and the storefront is served the page with those nodes stripped.

- `packages/core/src/diy/diy.test.ts::cleanDiyData — parity fixtures > covers every branch of the filter`
- `packages/core/src/diy/diy.int.test.ts::the storefront read > serves the home page with the retired components stripped`

### DIY-003

Cleaning preserves key order and returns its input by identity when nothing is stripped, so a cleaned page still serialises byte for byte.

- `packages/core/src/diy/diy.test.ts::cleanDiyData — parity fixtures > keeps key order, so a cleaned page still serialises byte for byte`

### DIY-004

Two editors saving the same page do not overwrite each other: the version token covers both `updated_at` and the envelope's `version`, so a save from a stale editor fails with `DIY_VERSION_CONFLICT`.

- `packages/core/src/diy/diy.int.test.ts::saving content > lets exactly one of several simultaneous saves win`

### DIY-005

The editor writes back a page it did not change, unchanged: timestamps and their derived `id`s are only rewritten once the page's order has actually moved.

- `apps/web/src/admin/diy/store.test.ts::serialising > reproduces an untouched page byte for byte`
- `apps/web/src/admin/diy/store.test.ts::serialising > rewrites timestamps and ids only once the order actually moves`

### DIY-006

Hiding a component never deletes it: `isHide` stays in the payload and the renderer skips it.

- `apps/web/src/admin/diy/store.test.ts::editing > hides without deleting`

### DIY-007

A page kind that owns a footer always saves one (`pageFoot` on 首页, `bottomMenu` on 商品详情) and it always sorts last.

- `apps/web/src/admin/diy/store.test.ts::serialising > appends the factory footer to a home page that has none`
- `apps/web/src/admin/diy/store.test.ts::serialising > pushes the footer past the body when the body is restamped`

### DIY-008

PostgreSQL `jsonb` reorders the keys inside a node; the guarantee that survives storage is "every key and value is preserved", not the byte order. Pinned so nobody mistakes it for a bug in this code.

- `packages/core/src/diy/diy.int.test.ts::saving content > is the database, not this code, that reorders the keys inside a node`

### DIY-009

超级组件 (`customComponent`) is renderable but not creatable: the palette does not offer it, because the shop has no designer for its inner layout and a freshly created 超级组件 could never be filled. Existing nodes keep their config panel and their `customComponents` tree round-trips untouched.

- `packages/contracts/src/diy/schema/round-trip.test.ts::the registry > keeps customComponent renderable but out of the palette`

## Storefront end to end

### SMOKE-002

The DIY home's product lists load on the real stack with no console error and no failed request.

- `e2e/storefront/specs/home-category-product.spec.ts::the DIY home page renders every fixture component with no console error`

### SMOKE-003

The home page, `GET /api/v1/diy/pages/home`, loads for a signed-in shopper on the H5 build.

- `e2e/storefront/specs/home-category-product.spec.ts::the DIY home page renders every fixture component with no console error`

### SMOKE-004

`GET /api/v1/profile` answers 200 after a password login on the H5 build.

- `e2e/storefront/specs/login.spec.ts::password login reaches an authenticated screen`

### SMOKE-005

An order is created `pending_payment`, paid through the cashier with the worker running, and read back `paid`.

- `e2e/storefront/specs/cart-checkout-pay.spec.ts::a shopper pays an order at the cashier and the order is paid`

### SMOKE-006

删除订单 hides a finished order from its buyer (`orders.hidden_by_user_at`); the shop's row stays. A shipped order cannot be hidden and stays in the buyer's list, a stranger cannot hide anybody's order, and a second tap, a stranger and an unknown id all get the same 404.

- `packages/core/src/order/order.hide.lifecycle.int.test.ts::SMOKE-006 — 删除订单 across a real order lifecycle > refuses the owner while the order is shipped, and leaves it in their list`
- `packages/core/src/order/order.hide.lifecycle.int.test.ts::lets the owner delete it once it is finished`
- `packages/core/src/order/order.hide.lifecycle.int.test.ts::refuses a stranger the finished order, and leaves it with its owner`
- `packages/core/src/order/order.int.test.ts::hiding a finished order > answers a second tap, a stranger and an unknown id all with the same 404`

### SMOKE-007

The storefront's public config offers WeChat Pay as the only way to pay, and reports it available only once its credentials are complete.

- `packages/core/src/system/system.int.test.ts::站点公开配置 > says WeChat Pay is available only once the credentials are complete`

### SMOKE-008

The order-type statistic separates the kinds: `orders.kind` is `normal / groupbuy / presale`, each 订单类型 bucket sums only its own kind's paid amount — the fixture's ¥350 normal and ¥300 group-buy, never the ¥650 total — and an absent kind is absent, not 0 %.

- `packages/core/src/stats/stats.int.test.ts::orders > counts paid orders, refunded orders and both breakdowns`

### SMOKE-009

The group-buy poster is drawn by the client: the server composes and uploads nothing, and answers the poster's data and the string the QR code encodes. With every outbound request failing and no WeChat configured, the whole contract shape still comes back, no attachment is written, and an unknown team is the contract's 404.

- `packages/core/src/groupbuy/groupbuy.smoke.int.test.ts::SMOKE-009 — the group-buy poster, offline > answers the whole poster with no network, no WeChat and no upload`
- `packages/core/src/groupbuy/groupbuy.smoke.int.test.ts::answers a second shopper the same poster, still without an upload`
- `packages/core/src/groupbuy/groupbuy.smoke.int.test.ts::answers an unknown team with the contract’s 404, not a 500`

### SMOKE-010

The storefront is served DIY data with the components and navigation entries the shop does not have removed whole, and every other node kept.

- `packages/core/src/diy/diy.test.ts::cleanDiyData — parity fixtures > covers every branch of the filter`
- `packages/core/src/diy/diy.int.test.ts::the storefront read > serves the home page with the retired components stripped`

### SMOKE-011

Presale expiry unlists only expired presale products.

- `packages/core/src/presale/presale.int.test.ts::the window sweep > closes a campaign whose window has passed and records it once`
- `packages/core/src/presale/presale.int.test.ts::the window sweep > leaves a running campaign alone`
- `packages/core/src/presale/presale.int.test.ts::the window sweep > records a campaign opening exactly once, and never twice`
- `packages/core/src/presale/presale.int.test.ts::the storefront surface > shows only campaigns inside their window, and says whether they are buyable`
- `packages/core/src/presale/presale.concurrency.int.test.ts::the other conditional updates > closes an expired campaign once, however many sweeps collide`

### SMOKE-012

A successful group updates leader and members once, without repeated notifications: success is one conditional update of the team row, which leader and members read their status from, and the notification is the `groupbuy.settle` effect. Once a team fills, its expiry timer, the sweep, a direct settle and an operator's 立即成团 change nothing and record nothing; concurrent last payments complete it once.

- `packages/core/src/groupbuy/groupbuy.smoke.int.test.ts::SMOKE-012 — a team succeeds once, and says so once > completes leader and members together, and nothing completes it again`
- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::the last seat > completes the team once and only once`

## Scope of the shop

### CORE-002

The shop has no 砍价, 秒杀, 抽奖, 直播, 分销, 积分, 签到, 付费会员, 充值, 余额支付, 支付宝, 线下支付, 核销, 门店自提, 自建客服 or the other features `pnpm guards`' `retired` check lists: no identifier or URL token for any of them exists in the application source, the uni-app API layer or the mini-program (with `@shop/api-client` and `@shop/storefront-blocks`), and every route file is described by a contract, so there is no unlisted surface for one to come back through.

- `guards/src/checks/retired.test.ts::the retired blacklist > finds no retired identifier in the workspace, the uni-app API layer or the mini-program`
- `guards/src/checks/contracts.test.ts::contracts and route files > leaves no route file that no contract describes`

## Test strength and stability

### SEQ-001

A fixed-seed sequence of real operations (create payment, gateway payment, cancel, refund, duplicate notification, close task) interleaved over three orders keeps every invariant after every step: a cancelled order keeps no collectible gateway payment, a paid attempt carries its trade number, money taken at the gateway is recorded locally, completed refunds never exceed the payment, and each stock layer keeps every unit in stock or sold. Four seeds run in the suite, and a failure prints the seed and the full event log for an exact replay.

- `packages/core/src/order/order.sequence.int.test.ts::SEQ-001 — a fixed-seed interleaving of real operations > holds every invariant after every step, seed <seed>`

### MUT-001

Removing any of ten protections (the payment/cancel order lock, attempt immutability, the gateway-confirmed close, the refund amount freeze, the coupon remaining-count guard, the virtual-card atomic claim, the service-generated refund completion, TLS peer verification, response signature validation, the cancelled-order payment branch) in a temporary copy makes the corresponding test fail; no protection is left unexercised. The proof is `pnpm --filter @shop/guards mutations`, run nightly; the tests below keep its catalogue honest on every commit.

- `guards/src/mutations.test.ts::MUT-001 — the mutation catalogue > names the ten protections MUT-001 lists, once each`
- `guards/src/mutations.test.ts::MUT-001 — the mutation catalogue > still applies the <id> mutant to exactly one place`
- `guards/src/mutations.test.ts::MUT-001 — the mutation catalogue > still finds every test that guards <id>`

### STAB-001

The concurrency set (payment creation vs cancellation, refund agreement in two processes, coupon races, the virtual-card race, multi-item rollback, group-buy joins and refunds, the fixed-seed sequence) runs clean round after round in a shuffled order: the `concurrency-soak` job in `ci.yml` runs every test of the set 50 times nightly, with a new ordering seed each round, and fails on the count of failed rounds. The tests below are one per race this names; the soak runs all of them.

- `packages/core/src/payment/payment.concurrency.int.test.ts::QUEUE-003 — a callback racing an order cancel > never cancels an order whose money arrived, whichever side gets there first`
- `packages/core/src/order/order.concurrency.int.test.ts::cancel racing the paid transition > lets exactly one of them through`
- `packages/core/src/order/order.concurrency.int.test.ts::two checkouts for the last unit > hands back every line it already took when a later line is short`
- `packages/core/src/refund/refund.concurrency.int.test.ts::REFUND-002 — approval racing the buyer withdrawing > queues one gateway call however many times the operator presses 同意`
- `packages/core/src/coupon/coupon.concurrency.int.test.ts::COUPON-008 — one user tapping 领取 twice > never lets simultaneous taps exceed a limit above one`
- `packages/core/src/order/order.fulfil.concurrency.int.test.ts::two dispatchers replaying the same virtual delivery > gives the last card to exactly one of two orders racing for it`
- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::leadership > passes to exactly one heir while a join is in flight`
- `packages/core/src/groupbuy/groupbuy.concurrency.int.test.ts::a join into a team that fails a moment before > queues behind a transaction holding the team, then sees what it decided`
- `packages/core/src/order/order.sequence.int.test.ts::SEQ-001 — a fixed-seed interleaving of real operations > holds every invariant after every step, seed <seed>`
- `guards/src/checks/pipeline.test.ts::readPipeline > STAB-001 — fails when the soak loses its schedule, its rounds or its logs`

## Backup, upgrade and rollback

### OPS-005

`upgrade.sh` refuses a moving tag, records the running digests as the rollback target, and refuses a release that does not name all three candidates (`web`, `worker`, `edge`); afterwards each service is verified to be running its own image.

- `deploy/rehearsal/drill.sh::upgrade/refuses-moving-tag`
- `deploy/rehearsal/drill.sh::upgrade/requires-all-three-candidates`
- `deploy/rehearsal/drill.sh::upgrade/deploys-and-records-rollback-target`

### OPS-006

A dry run reports the plan without stopping writers or taking a backup.

- `deploy/rehearsal/drill.sh::upgrade/dry-run-changes-nothing`

### OPS-007

A failing migration ends the upgrade on the previous digests, and says so: migrations are additive, so the previous image tolerates the new schema and a stack that serves is a better place to end than a stack that is down. The release reports that the schema had already moved and names the verified dump it will not restore for you. The condition is enforced, not assumed: the `migrations` guard fails the build when a migration drops a table or a column, or retypes one, without a per-statement `-- destructive: approved` marker.

- `deploy/rehearsal/drill.sh::upgrade/failed-migration-ends-on-previous`
- `deploy/rehearsal/drill.sh::upgrade/unhealthy-worker-ends-on-previous`
- `guards/src/checks/migrations.test.ts::unmarkedDestructive > finds an unmarked DROP TABLE, DROP COLUMN and column retype`
- `guards/src/checks/migrations.test.ts::unmarkedDestructive > does not let a marker on one statement bless the next`

### OPS-008

A truncated backup is diagnosed before any migration, and the upgrade aborts with the previous images still pinned and running.

- `deploy/rehearsal/drill.sh::backup/refuses-truncated-dump`

### OPS-009

A backup that cannot be restored (contents disagree with the live database) stops the upgrade before any migration.

- `deploy/rehearsal/drill.sh::backup/refuses-tampered-dump`

### OPS-010

A valid upgrade dumps, verifies the dump by restoring it into an isolated database and comparing row counts, runs the migrations, resumes traffic and reports the rollback target.

- `deploy/rehearsal/drill.sh::backup/verifies-restore`
- `deploy/rehearsal/drill.sh::upgrade/deploys-and-records-rollback-target`

### OPS-011

`rollback.sh` refuses an unavailable target instead of changing the deployment, and never claims a database was restored.

- `deploy/rehearsal/drill.sh::rollback/refuses-unavailable-target`
- `deploy/rehearsal/drill.sh::rollback/last-upgrade-returns-previous`

### OPS-012

Every long-running service declares a memory limit, the limits together stay under the 1.6 GB the host can spare, and every service that runs node carries an explicit `--max-old-space-size` — V8 sizes its heap from the _host's_ memory, not the cgroup's, so a container without one is OOM killed with no diagnostic.

- `deploy/rehearsal/drill.sh::static/memory-budget`

### OPS-013

No tracked file under `deploy/` or `docker/` carries a credential, and `deployment.env` — the one file that does — is gitignored.

- `deploy/rehearsal/drill.sh::static/no-secrets-in-repo`

## Release publishing

### REL-001

A release is published under the tag `sha-<commit>` and reported by the digest the registry holds for it, which is what a deploy names.

- `.github/scripts/publish-release.test.sh::a first publish creates sha-<sha> and reports its digest`

### REL-002

Publishing the same commit again is a no-op that reports the same digest, so a re-run workflow cannot change what a release is.

- `.github/scripts/publish-release.test.sh::republishing the same commit is a no-op with the same digest`

### REL-003

A candidate whose content differs from an existing tag fails the publish and names the digest it found, instead of silently republishing. The workflow publishes through `publish-release.sh`, and the script keeps its `refusing a conflicting release` abort.

- `guards/src/checks/pipeline.test.ts::readPipeline > REL-003 and REL-004 — fails when the script stops refusing`
- `.github/scripts/publish-release.test.sh::a conflicting candidate fails the publish and moves no tag`

### REL-004

A registry query that cannot tell whether a tag exists aborts instead of being read as "absent". The workflow publishes through `publish-release.sh`, and the script keeps its `refusing to guess` abort.

- `guards/src/checks/pipeline.test.ts::readPipeline > REL-003 and REL-004 — fails when the script stops refusing`
- `.github/scripts/publish-release.test.sh::an unanswerable registry query aborts instead of guessing`

### REL-006

The workflow publishes image tags through the tested `publish-release.sh`, carries no publish helpers of its own (`resolve_digest()`, `imagetools create`), and never moves a deployment tag: a release is deployed by digest.

- `guards/src/checks/pipeline.test.ts::readPipeline > REL-006 — fails when tags are not published through the script`
- `guards/src/checks/pipeline.test.ts::readPipeline > REL-006 — fails when the workflow carries publish helpers of its own`
- `guards/src/checks/pipeline.test.ts::readPipeline > REL-006 — fails when the workflow promotes`
- `guards/src/checks/pipeline.test.ts::readPipeline > REL-006 — fails when the script the workflow calls is missing`

### REL-007

Releases are serialized repository-wide and never cancelled mid-publish: the merge-gate jobs cancel in progress, which is right, so the image job declares its own `next-images-${{ github.repository }}` group with `cancel-in-progress: false`.

- `guards/src/checks/pipeline.test.ts::readPipeline > REL-007 — fails when the image job may be cancelled mid-publish`

## Deployment topology

### OPS-002

The worker's health probe (`docker/healthcheck/worker.mjs`) reads `worker:heartbeat` over the container's configured `REDIS_URL` and requires it to be **recent**: the key is refreshed from the same event loop that runs the jobs and is deleted before draining on SIGTERM, so a worker that is up and consuming nothing turns unhealthy. **Known gap:** the probe shares the worker's own `REDIS_URL`, so a worker pointed at the _wrong_ Redis would still find its own heartbeat there, and `/api/v1/readyz` reads it from `web`, which shares that URL too. Closing it means reading the heartbeat from a second vantage point.

- `deploy/rehearsal/drill.sh::upgrade/unhealthy-worker-ends-on-previous`

### OPS-003

A release is gated on readiness. `GET /api/v1/readyz`, proxied by the edge at `/readyz`, checks the database, Redis, migrations and the worker heartbeat, and answers 503 `HEALTH_NOT_READY` with `details.checks` and **no error text, host, connection string or credential** — the int test asserts the whole body, not a subset. `deploy/lib/readiness.sh` reads that endpoint and additionally requires `drizzle.__drizzle_migrations` to be populated and every table in `NEXT_READINESS_TABLES` to exist, because which tables _this_ release needs is something the app cannot know. An upgrade whose schema is short ends on the previous digests.

- `apps/web/src/server/health.int.test.ts::GET /api/v1/readyz`
- `deploy/rehearsal/drill.sh::upgrade/readiness-gate-ends-on-previous`

### OPS-004

Every service the production topology starts — `postgres`, `redis`, `web`, `worker` and `edge` — has a healthcheck. The assertion is static: it parses the rendered Compose configuration (`docker compose config`, so profiles, overrides and variable substitution are applied) and needs no running stack. `migrate` is exempt: it is a one-shot that exits, and a healthcheck on it has nothing to report.

- `deploy/rehearsal/drill.sh::static/healthcheck-per-service`

## Route integrity

### ROUTE-001

Every contract has a route file that exports its method, and every route file is described by a contract.

- `guards/src/checks/contracts.test.ts::contracts and route files > matches every contract to a route file that exports its method`
- `guards/src/checks/contracts.test.ts::leaves no route file that no contract describes`

## System, storage and uploads

### SYS-001

An admin route answers 401 with no session and 403 for a signed-in admin who does not hold its atom; the atom-holder gets 200.

- `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/admins > 401s without a session and 403s without the atom`

### SYS-002

Read and write are separate atoms: a caller holding only `system:config:read` is refused the save.

- `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/system/config > 403s a write for a caller holding only the read atom`

### SYS-003

An entry whose atom the role does not hold is absent from the sider, and a role holding nothing sees no entries at all; a super admin sees every one.

- `apps/web/src/admin/menu/system.menu.test.ts::system sider entries > never shows an entry whose atom the role does not hold`
- `apps/web/src/admin/shell/route-permission.test.tsx::RouteGuard > renders the 403 inside the chrome for a page outside the role`
- `apps/web/src/admin/shell/route-permission.test.tsx::requiredPermissions > covers every page under the shell but the 403 page — a new page needs a menu entry`

### SYS-004

A config read never returns a stored secret — only a boolean "is set" — over the service and over the wire.

- `packages/core/src/system/system.int.test.ts::config > never returns a stored secret — only whether one is set`
- `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/system/config > never returns a stored secret — only whether it is set`

### SYS-005

Saving a group without retyping a secret leaves the stored secret intact, so an unrelated edit cannot blank a credential.

- `packages/core/src/system/system.int.test.ts::config > leaves the stored secret alone when the form is saved without retyping it`

### SYS-006

No descriptor field a browser renders as text can hold a secret, and every credential field in every registered group is marked `secret`.

- `packages/core/src/system/system.test.ts::describeGroup > never describes a secret field as anything a browser would render as text`
- `packages/core/src/system/system.test.ts::describeGroup > marks every credential in every registered group as secret`

### SYS-007

A password change revokes every session of that account, the caller's own included, and is refused without the current password.

- `packages/core/src/system/system.int.test.ts::own profile > changes my password and revokes every session I hold`
- `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/profile > revokes every session, including the caller’s, on a password change`
- `packages/core/src/auth/admin-session.revoke.int.test.ts::revoking every session of an admin > reaches a session that has been kept alive past four TTLs`

### SYS-008

Disabling an account, resetting its password, or changing the grants of a role somebody holds each revoke the affected sessions immediately.

- `packages/core/src/system/system.int.test.ts::admins > revokes the account’s sessions when it is disabled`
- `packages/core/src/system/system.int.test.ts::roles > revokes the sessions of everybody holding a role whose grants changed`

### SYS-009

An admin with no grants at all can still read their own profile.

- `packages/core/src/system/system.int.test.ts::own profile > is readable by an admin holding no grants at all`

### SYS-010

The permission tree is built from the atoms the running build declares, not from a table, and a grant naming an undeclared atom is refused.

- `packages/core/src/system/system.test.ts::permissionTree > groups atoms into sections and keeps them sorted`
- `packages/core/src/system/system.int.test.ts::roles > refuses an atom the running build does not declare`

### SYS-011

The last enabled super admin cannot be disabled or deleted, and nobody can lock themselves out.

- `packages/core/src/system/system.int.test.ts::admins > will not let the last enabled super admin be disabled`
- `packages/core/src/system/system.int.test.ts::admins > will not let an admin lock themselves out`

### SYS-012

A write is audited with its actor, route and target; every credential-named field and every field the config registry marks secret is stripped at any depth; a read is not audited, and the reader cannot undo the redaction. Staff-surface writes are audited with `actor_kind = 'staff'` and the 店员's user id, and every admin sign-in outcome is audited under `auth.adminLogin` without the body.

- `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/admins > creates with 201 and writes an audit row without the password in it`
- `apps/web/app/admin-api/admins/system.int.test.ts::/admin-api/audit-logs > does not record a read`
- `packages/core/src/auth/audit.redact.test.ts::what the operation log keeps of a request body > redacts the same credential one level down, as the config form sends it`
- `apps/web/src/server/handle.int.test.ts::what the operation log keeps of a config save > leaves no part of the payment keys in audit_logs`
- `packages/core/src/auth/admin-login.trail.int.test.ts::what a password-guessing run leaves behind > leaves a readable trail of the failed attempts, without the password`
- `apps/web/app/api/v1/staff/products/catalog-staff.int.test.ts::/api/v1/staff/products/:id/skus > records the reprice in the operation log, naming the 店员 and the product`
- `apps/web/src/server/handle.int.test.ts::the 操作日志 reader lists both kinds of actor > returns admin and staff rows, each naming its actor, and filters by kind`

### SYS-013

A save is refused whole when the schema rejects a value or the group does not declare the key, and nothing is written.

- `packages/core/src/system/system.int.test.ts::config > refuses a value the schema rejects, and writes nothing`
- `packages/core/src/system/system.int.test.ts::config > refuses a key the group does not declare`

### SYS-014

`GET /api/v1/app/config` is public and never carries a secret: every `secret: true` field of every registered config group, given a distinctive stored value, is absent from the serialised payload.

- `packages/core/src/system/app-config.int.test.ts::SYS-014 — the app config leaks nothing > answers a request with no session, and the answer matches the contract`
- `packages/core/src/system/app-config.int.test.ts::SYS-014 — the app config leaks nothing > cannot leak any secret in any registered group`

### SYS-015

The `storefront-appearance` group answers a fresh install with every field defaulted (the contract's `appAppearanceDefaults`), always yields exactly the four fixed tabs — 首页, 分类, 购物车, 我的 — in that order, falls back to the default label when one is blanked, and refuses any colour that is not `#RRGGBB` (and a radius off the scale, and an over-long label) whole, writing nothing.

- `packages/core/src/system/app-config.int.test.ts::SYS-015 — 小程序外观 > answers a fresh install with every appearance default`
- `packages/core/src/system/app-config.int.test.ts::SYS-015 — 小程序外观 > serves the theme and the tab bar the operator saved`
- `packages/core/src/system/app-config.int.test.ts::SYS-015 — 小程序外观 > falls back to the default label when the operator blanks one`
- `packages/core/src/system/app-config.int.test.ts::SYS-015 — 小程序外观 > refuses <label>, and writes nothing`
- `packages/contracts/src/system/app.schemas.test.ts::SYS-015 — hexColor > refuses <label>`
- `packages/contracts/src/system/app.schemas.test.ts::SYS-015 — appearance defaults > are a valid appearance, with the four fixed tabs in order`

### SYS-016

A save to any group `GET /api/v1/app/config` is built from drops its cache and moves its `version` (the weak `ETag`) at once, a save to any other group does not, and a caller holding the current version gets a bodyless 304. The values it shares with `GET /api/v1/site/config` and with `GET /api/v1/wechat/subscribe-templates` are built by the same code and agree with them.

- `packages/core/src/system/app-config.int.test.ts::SYS-016 — one payload, always current > is built from exactly the groups that drop its cache`
- `packages/core/src/system/app-config.int.test.ts::SYS-016 — one payload, always current > drops the cache and moves the version when <label> is saved`
- `packages/core/src/system/app-config.int.test.ts::SYS-016 — one payload, always current > leaves the cache alone when a group it does not read is saved`
- `packages/core/src/system/app-config.int.test.ts::SYS-016 — one payload, always current > carries the same subscribe ids as GET /wechat/subscribe-templates, all four scenes`
- `packages/core/src/system/app-config.int.test.ts::SYS-016 — one payload, always current > says whether a first WeChat sign-in will ask for a phone`
- `packages/core/src/system/app-config.int.test.ts::SYS-016 — one payload, always current > agrees with GET /site/config on every value the two share`
- `apps/web/app/api/v1/app/config.int.test.ts::GET /api/v1/app/config — conditional > answers a caller holding the current version with a bodyless 304`
- `apps/web/app/api/v1/app/config.int.test.ts::GET /api/v1/app/config — conditional > sends the new settings once the <label> group is saved`

### SYSC-001

Six concurrent disables of one account report exactly one session revocation, and the sessions are gone once.

- `packages/core/src/system/system.concurrency.int.test.ts::disabling an account > lets exactly one of six disables claim the session revocation`

### SYSC-002

Six concurrent deletions of one account leave one winner; the losers are told the account is gone.

- `packages/core/src/system/system.concurrency.int.test.ts::deleting an account > lets exactly one of six deletions win`

### SYSC-003

Six identical account creates are settled by the unique index, not by the pre-check, and one row exists.

- `packages/core/src/system/system.concurrency.int.test.ts::creating an account > lets the unique index, not the pre-check, settle six identical creates`

### SYSC-004

Six concurrent role deletions leave one winner, and a loser is told the role is gone rather than "in use by 0 admins".

- `packages/core/src/system/system.concurrency.int.test.ts::roles > lets exactly one of six deletions of the same role win`

### SYSC-005

A role deletion racing a grant of that role ends either deleted-and-grant-refused or granted-and-deletion-refused, never both.

- `packages/core/src/system/system.concurrency.int.test.ts::roles > never deletes a role that a concurrent admin edit just granted`

### SYSC-006

Six concurrent disables of one role revoke its holders' sessions exactly once.

- `packages/core/src/system/system.concurrency.int.test.ts::roles > lets exactly one of six disables of a role revoke its holders`

### STOR-001

An upload is refused when the bytes are a server script (`<?php`), HTML, an SVG (script or not), an executable or an archive, however the file is named or declared.

- `packages/core/src/storage/file-type.test.ts::sniffFileType — the files that must never get in > refuses a PHP script however it is named or declared`
- `packages/core/src/storage/file-type.test.ts::sniffFileType — the files that must never get in > refuses HTML, which would run as our own origin`
- `packages/core/src/storage/file-type.test.ts::sniffFileType — the files that must never get in > refuses SVG — always, script or not`
- `packages/core/src/storage/file-type.test.ts::sniffFileType — the files that must never get in > refuses executables`

### STOR-002

Those refusals hold over HTTP, for admins and for shoppers, and write no row and no object.

- `apps/web/app/admin-api/attachments/storage.int.test.ts::/admin-api/attachments > refuses what a naive uploader would accept > refuses <each of five>`
- `apps/web/app/admin-api/attachments/storage.int.test.ts::/api/v1/uploads > refuses an executable from a shopper too`

### STOR-003

A declared content type that disagrees with the bytes is refused, not silently corrected.

- `packages/core/src/storage/file-type.test.ts::mimeAgrees > refuses a real mismatch rather than silently correcting it`
- `packages/core/src/storage/storage.int.test.ts::upload > refuses a PNG declared as a PDF rather than silently correcting it`

### STOR-004

A remote import is refused for private, loopback, link-local and cloud-metadata addresses **after** DNS resolution, for a name that resolves to both a public and a private address, and on a redirect into the private network.

- `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > refuses a public name that RESOLVES to a private address`
- `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > refuses a name that resolves to one public AND one private address`
- `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > refuses a redirect into the private network`
- `packages/core/src/storage/safe-fetch.test.ts::classifyAddress > blocks every address family a fetch must never reach`

### STOR-005

The connection is made to the address that was judged, presenting the original Host, so a second resolution cannot return a different answer.

- `packages/core/src/storage/safe-fetch.test.ts::safeFetch — the happy path > connects to the address it judged, presenting the original Host`
- `packages/core/src/storage/safe-fetch.tls.test.ts::safeFetch over real TLS > imports an https source: judged address, real name for SNI and the certificate`
- `packages/core/src/storage/safe-fetch.tls.test.ts::dials each redirect hop at that hop’s own judged address`

### STOR-006

A remote import refuses anything but https (http only where the caller allows it), credentials in the URL, a non-standard port, a redirect chain that will not end, and a body over the ceiling even when Content-Length lied.

- `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > refuses a non-standard port, so this is not a port scanner`
- `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > stops reading at maxBytes even when Content-Length lied`
- `packages/core/src/storage/safe-fetch.test.ts::safeFetch — refusals > refuses plain http unless the caller allows it`
- `packages/core/src/storage/safe-fetch.test.ts::refuses an https source that redirects to plain http`

### STOR-007

A scan-upload token is single-use, bound to the admin who minted it, and is not burned when the file is refused.

- `packages/core/src/storage/storage.int.test.ts::scan-to-upload > mints a token, accepts one upload, and refuses the second`
- `packages/core/src/storage/storage.int.test.ts::scan-to-upload > does not burn the token when the file is refused`
- `packages/core/src/storage/storage.int.test.ts::scan-to-upload > reports the status to the minting admin and hides it from everybody else`

### STOR-008

The storage key is generated by the server; a caller cannot choose a path.

- `packages/core/src/storage/s3.test.ts::createS3Storage > generates the key itself — a caller cannot choose a path`

### STOR-009

Identical bytes are stored once: the second upload returns the existing row.

- `packages/core/src/storage/storage.int.test.ts::upload > returns the existing row for identical bytes instead of storing them twice`

### STOR-010

The storefront upload needs a shopper session, takes images only (never an SVG, whatever it is named), refuses a file over the shopper size ceiling, enforces a per-user hourly budget and answers with the file rather than the library row.

- `apps/web/app/admin-api/attachments/storage.int.test.ts::/api/v1/uploads > requires a shopper session`
- `packages/core/src/storage/storage.int.test.ts::storefront upload > enforces the per-user hourly budget`
- `packages/core/src/storage/storage.int.test.ts::storefront upload > accepts an image and answers with the file, not the library`
- `packages/core/src/storage/storage.int.test.ts::storefront upload > refuses an SVG from a shopper whatever it is called`
- `packages/core/src/storage/storage.int.test.ts::storefront upload > refuses an image over the shopper ceiling, and stores nothing`

### STOR-011

A folder that still holds anything cannot be deleted, and a folder cannot become its own descendant.

- `packages/core/src/storage/storage.int.test.ts::categories > refuses to delete a folder that still holds anything`
- `packages/core/src/storage/storage.int.test.ts::categories > refuses to make a category its own descendant`

### STOR-012

The orphan sweep leaves a tombstone alone until retention has passed, then purges both the row and the object, and does nothing when retention is disabled.

- `packages/core/src/storage/storage.int.test.ts::cleanOrphans > leaves a tombstone alone until the retention window has passed`
- `packages/core/src/storage/storage.int.test.ts::cleanOrphans > purges the row and the object once it is old enough`

### STORC-001

Six uploads of identical bytes at once store the object once and hand every caller the same row.

- `packages/core/src/storage/storage.concurrency.int.test.ts::sha256 dedupe under concurrency > stores identical bytes exactly once when six uploads collide`

### STORC-002

Six phones scanning one QR code produce exactly one upload; the other five are refused.

- `packages/core/src/storage/storage.concurrency.int.test.ts::scan tokens are single-use > lets exactly one of six phones upload through one QR code`

### STORC-003

Six concurrent deletions of one folder leave one winner.

- `packages/core/src/storage/storage.concurrency.int.test.ts::deleting a folder > lets exactly one of six deletions of the same folder win`

### STORC-004

A folder delete racing an upload into that folder, or racing the creation of a child under it, settles as some serial order would: exactly one of the two succeeds, and no live file or live folder is ever left hanging off a tombstone. Proved over 30 rounds each.

- `packages/core/src/storage/storage.concurrency.int.test.ts::deleting a folder > never deletes a folder that a concurrent upload just filed into`
- `packages/core/src/storage/storage.concurrency.int.test.ts::deleting a folder > never creates a child under a folder that is being deleted`

## Freight, cities and content

### FREIGHT-001

A template prices by piece, weight or volume with first-unit and continuation rates, and the units are the ones the address's rule names.

- `packages/core/src/shipping/shipping.freight.rules.test.ts::unitsOf > converts grams to kilograms and cubic centimetres to cubic metres`
- `packages/core/src/shipping/shipping.freight.rules.test.ts::firstAndContinuation > charges the first price while the cart fits the first unit`
- `packages/core/src/shipping/shipping.freight.rules.test.ts::firstAndContinuation > rounds each continuation up`
- `packages/core/src/shipping/shipping.int.test.ts::FreightPort.quote > charges a fixed postage per unit`
- `packages/core/src/shipping/shipping.int.test.ts::FreightPort.quote > charges by weight when the template says so`

### FREIGHT-002

The rule that applies is the narrowest one covering the address — district, then city, then province — and the fallback 「默认全国」 rule when none matches.

- `packages/core/src/shipping/shipping.freight.rules.test.ts::regionFor > prefers the narrowest rule an operator wrote`
- `packages/core/src/shipping/shipping.freight.rules.test.ts::regionFor > falls back to the province rule when no city rule matches`
- `packages/core/src/shipping/shipping.freight.rules.test.ts::regionFor > falls back to the fallback rule when nothing matches`
- `packages/core/src/shipping/shipping.int.test.ts::FreightPort.quote > prices a template line through the city rule that covers the address`

### FREIGHT-003

A free-shipping rule waives the freight for the lines it covers when the order reaches its quantity or its amount threshold, and 满额包邮 (the shop-wide threshold) waives all of it.

- `packages/core/src/shipping/shipping.freight.rules.test.ts::isFreeByRule > needs both thresholds`
- `packages/core/src/shipping/shipping.freight.rules.test.ts::isFreeByRule > treats an unused threshold as satisfied`
- `packages/core/src/shipping/shipping.int.test.ts::FreightPort.quote > drops the group once its free rule is satisfied`
- `packages/core/src/shipping/shipping.int.test.ts::FreightPort.quote > zeroes the postage once the shop-wide 满额包邮 threshold is met`

### FREIGHT-004

A no-delivery region refuses the quote and names the lines that cannot be delivered, rather than pricing them at zero.

- `packages/core/src/shipping/shipping.freight.rules.test.ts::computeFreight > reports every undeliverable line instead of quoting one`
- `packages/core/src/shipping/shipping.int.test.ts::FreightPort.quote > refuses an address the template will not deliver to`

### FREIGHT-005

A region whose continuation unit is `0` charges the first-unit price and nothing more, never nothing at all once the cart passes the first unit — a bigger order does not ship free.

- `packages/core/src/shipping/shipping.freight.rules.test.ts::firstAndContinuation > charges the first price — not zero — when there is no continuation rule`

### FREIGHT-006

A quote with no address (the cart preview before one is chosen) is zero and says so, rather than guessing a province.

- `packages/core/src/order/order.int.test.ts::checkout preview > quotes zero freight while no address is chosen yet, and asks for one (FREIGHT-006)`

### SMOKE-001

Freight is quoted through the `FreightPort` contract in `core/src/order/ports.ts`, which every freight rule above exercises.

- `packages/core/src/shipping/shipping.int.test.ts::FreightPort.quote > charges a fixed postage per unit`

### CITY-001

The 省市区 tree is immutable seed data served with a fingerprint and a weak ETag, so no cache can go stale without the data changing, and there is nothing to clear by hand.

- `packages/core/src/shipping/shipping.int.test.ts::city tree > nests three levels and fingerprints the data`
- `packages/core/src/shipping/shipping.int.test.ts::city tree > rebuilds when the seeded data changes`

### CMS-001

Stored article HTML is sanitised on write against an allow-list: no `script`, no `on*` handler, no `javascript:` / `data:text/html` URL, and no `url(`/`expression(` style.

- `packages/core/src/cms/cms.int.test.ts::文章 > sanitises the body on write, so the stored html is already safe`

### CMS-002

Concurrent reads of an article lose no view: the counter is one atomic `UPDATE … SET views = views + 1 RETURNING views`, never a read-modify-write.

- `packages/core/src/cms/cms.int.test.ts::文章 storefront > loses no view under concurrency`

### SHIP-001

A 运费模板 is written whole: the head and every child row change in one transaction, so two operators saving at once leave one operator's rules rather than a mixture, and a template is soft-deleted exactly once however many screens ask.

- `packages/core/src/shipping/shipping.concurrency.int.test.ts::two operators saving the same template > leaves one operator’s rules, never a mixture of both`
- `packages/core/src/shipping/shipping.concurrency.int.test.ts::deleting one template from two screens at once > deletes it once and tells the loser it is gone`

### SHIP-002

A courier code identifies one company: a duplicate is refused by the unique index and reported as `SHIPPING_EXPRESS_COMPANY_CODE_TAKEN` carrying the offending code, even when both operators submit on the same tick.

- `packages/core/src/shipping/shipping.concurrency.int.test.ts::creating the same courier code twice at once > keeps one row and refuses the rest by their code`
- `apps/web/app/admin-api/shipping/shipping.int.test.ts::/admin-api/shipping/express-companies > refuses a duplicate code as 409 with its Chinese message`

### CMS-004

An article slug belongs to one article: concurrent publishes of the same slug leave one winner and `CMS_ARTICLE_SLUG_TAKEN` for the rest, and deleting an article releases its slug rather than squatting on the URL.

- `packages/core/src/cms/cms.concurrency.int.test.ts::two editors publishing the same slug > gives it to one of them and refuses the rest`
- `packages/core/src/cms/cms.int.test.ts::文章 > refuses a duplicate slug and frees it again on delete`

### CMS-003

The storefront serves published, visible articles only — in the list and by id.

- `packages/core/src/cms/cms.int.test.ts::文章 storefront > serves published articles only, by id as well as in the list`

## Page decoration (装修 v2)

### DECOR-001

A block type is declared once, with `defineBlock`, and a declaration that could not be served safely fails at load: its props carry the shared base props (`style`, `visibility`), every stored version below the current one has exactly one migration step, the type name and `minClient` are well-formed, and no type is registered twice. Stored props are migrated step by step to the current version.

- `packages/contracts/src/decor/decor.test.ts::defineBlock — DECOR-001 > refuses a props schema without the base props`
- `packages/contracts/src/decor/decor.test.ts::defineBlock — DECOR-001 > refuses a version without a migration for every older version`
- `packages/contracts/src/decor/decor.test.ts::defineBlock — DECOR-001 > refuses a bad type name, a bad minClient and a registry with a type twice`
- `packages/contracts/src/decor/decor.test.ts::defineBlock — DECOR-001 > migrates stored props step by step up to the current version`
- `packages/contracts/src/decor/decor.test.ts::defineBlock — DECOR-001 > compares client versions numerically, and a garbled one as unknown`

### DECOR-002

A decorated link stores what it opens (`LinkTarget`), never a path: a catalogue route by key with strict params and only among the `linkable` keys, an https page for a web-view, or a well-formed mini-program AppID. It resolves to a catalogue route without zod, so the mini-program can follow it.

- `packages/contracts/src/decor/decor.test.ts::LinkTarget — DECOR-002 > is a typed target, never a path string`
- `packages/contracts/src/decor/decor.test.ts::LinkTarget — DECOR-002 > links to catalogue routes by key with strict params, linkable keys only`
- `packages/contracts/src/decor/decor.test.ts::LinkTarget — DECOR-002 > opens only https pages in a web-view and checks a mini-program AppID`
- `packages/contracts/src/decor/decor.test.ts::LinkTarget — DECOR-002 > resolves to a catalogue route without zod`

### DECOR-003

A draft save is lenient and a publish is strict. A draft whose envelope fails (schema version, block count, byte size) is refused outright; anything inside it that fails — invalid props, an unknown block type, a block type newer than this build, a block the page kind may not hold — is stored as it came and reported as an issue with its path, so an operator's half-finished work is never thrown away. Known blocks are stored migrated with their defaults filled in.

- `packages/contracts/src/decor/decor.test.ts::checkDocument — DECOR-003 > keeps an unknown block type as it came, warns, and blocks publishing it`
- `packages/contracts/src/decor/decor.test.ts::checkDocument — DECOR-003 > treats a known type stored at a newer version like an unknown one`
- `packages/contracts/src/decor/decor.test.ts::checkDocument — DECOR-003 > saves invalid props as they came and reports them with a path`
- `packages/contracts/src/decor/decor.test.ts::checkDocument — DECOR-003 > refuses the envelope outright: schema version, block count, byte size`
- `packages/contracts/src/decor/decor.test.ts::checkDocument — DECOR-003 > limits the blocks that need server data`
- `packages/core/src/decor/decor.int.test.ts::decor documents — DECOR-003 > DECOR-003: a draft with content issues is saved and the issues reported; a broken envelope is refused`
- `packages/core/src/decor/decor.int.test.ts::decor documents — DECOR-003 > DECOR-003: an unknown block type is kept as it came, with a warning`
- `packages/core/src/decor/decor.int.test.ts::decor documents — DECOR-003 > DECOR-003: a known block is stored migrated, with its defaults filled in`
- `packages/core/src/decor/decor.int.test.ts::decor documents — DECOR-003 > DECOR-003: a new page starts empty and titled after its name; a new 个人中心 starts from the built-in one`
- `packages/core/src/decor/decor.int.test.ts::decor documents — DECOR-003 > DECOR-003: lists, renames, duplicates and soft-deletes documents`

### DECOR-004

A link or a data source naming a record the shopper cannot see (off the shelf, deleted, unpublished, outside its window, or an id that never existed) is a warning on save and on publish, never an error; the storefront resolver skips it silently. Links and sources are found through the editor metadata, not by block name.

- `packages/contracts/src/decor/decor.test.ts::collectReferences — DECOR-004 > finds links and sources through the editor metadata, not by block name`
- `packages/core/src/decor/decor.int.test.ts::references — DECOR-004 > DECOR-004: a record the shopper cannot see is a warning on save, never an error`

### DECOR-005

The storefront always has a 个人中心: with none designated, `GET /api/v1/pages/user-center` serves the built-in one (which passes the strict check for its kind), and a new 个人中心 document starts from it.

- `packages/contracts/src/decor/decor.test.ts::the built-in 个人中心 — DECOR-005 > passes the strict check for a user-centre page, unchanged`
- `packages/core/src/decor/decor.int.test.ts::the built-in 个人中心 — DECOR-005 > DECOR-005: with nothing designated the storefront gets the built-in 个人中心; once designated, that one`
- `apps/web/app/api/v1/pages/pages.int.test.ts::GET /api/v1/pages/user-center > serves the built-in 个人中心 until one is designated, then that one`

### DECOR-006

Revisions are append-only: the database refuses an `UPDATE` or `DELETE` on `decor_revisions` (trigger), and a revision reads back exactly as published. Concurrent publishes and rollbacks number revisions without gaps or duplicates.

- `packages/core/src/decor/decor.int.test.ts::revisions — DECOR-006 > DECOR-006: the database refuses to update or delete a revision`
- `packages/core/src/decor/decor.int.test.ts::revisions — DECOR-006 > DECOR-006: a revision is read back exactly as published`
- `packages/core/src/decor/decor.concurrency.int.test.ts::concurrent rollbacks — DECOR-011 > DECOR-011: N rollbacks at once each append a revision, numbered without gaps or duplicates`

### DECOR-007

Publishing is atomic and idempotent: in one transaction under the document's row lock, a draft with no issues becomes a new revision and the live pointer moves to it — or nothing is written. A draft already live is `DECOR_NOTHING_TO_PUBLISH`, so N simultaneous publishes make one revision; a publish naming a version other than the draft's is a conflict.

- `packages/core/src/decor/decor.int.test.ts::publishing — DECOR-007 > DECOR-007: publish writes revision 1 and moves the live pointer; the same draft again is nothing to publish`
- `packages/core/src/decor/decor.int.test.ts::publishing — DECOR-007 > DECOR-007: a draft with issues is not published, and nothing is written`
- `packages/core/src/decor/decor.int.test.ts::publishing — DECOR-007 > DECOR-007: a block not allowed on the page kind blocks publishing`
- `packages/core/src/decor/decor.int.test.ts::publishing — DECOR-007 > DECOR-007: publishing a version other than the draft is a conflict`
- `packages/core/src/decor/decor.concurrency.int.test.ts::concurrent publishes — DECOR-007 > DECOR-007: N publishes of the same draft make one revision; the rest are nothing to publish`
- `packages/core/src/decor/decor.concurrency.int.test.ts::concurrent publishes — DECOR-007 > DECOR-007: publishes racing saves never publish a version the publisher did not name`

### DECOR-008

At most one document is the 首页 and at most one the 个人中心 (partial unique index, and an advisory lock per designation so concurrent switches queue), and only a published document of the matching kind can be designated. Designating another document moves the designation; `null` clears it.

- `packages/core/src/decor/decor.int.test.ts::designations — DECOR-008 > DECOR-008: only a published document of the matching kind can be designated`
- `packages/core/src/decor/decor.int.test.ts::designations — DECOR-008 > DECOR-008: designating another document moves the designation; null clears it`
- `packages/core/src/decor/decor.int.test.ts::designations — DECOR-008 > DECOR-008: the database allows one document per designation`
- `packages/core/src/decor/decor.concurrency.int.test.ts::concurrent designations — DECOR-008 > DECOR-008: N documents designated as 首页 at once leave exactly one designated`

### DECOR-009

The designated 首页 or 个人中心 cannot be deleted (`DECOR_DOCUMENT_IN_USE`); a delete racing a designation leaves either a live designated document or a deleted undesignated one, never a deleted designated one. A deleted document's revisions stay.

- `packages/core/src/decor/decor.int.test.ts::deletion — DECOR-009 > DECOR-009: the designated document cannot be deleted; once undesignated it can`
- `packages/core/src/decor/decor.concurrency.int.test.ts::delete against designate — DECOR-009 > DECOR-009: a delete racing a designation never leaves a deleted document designated`

### DECOR-010

A draft save is optimistically locked on `draftVersion`: a save on a stale version is `DECOR_VERSION_CONFLICT` carrying the current version and changes nothing, so of N saves on the same version exactly one lands, whole.

- `packages/core/src/decor/decor.int.test.ts::draft saves — DECOR-010 > DECOR-010: a save on a stale version is refused with the current version, and changes nothing`
- `packages/core/src/decor/decor.int.test.ts::draft saves — DECOR-010 > DECOR-010: a save on a deleted document is not found, not a conflict`
- `packages/core/src/decor/decor.concurrency.int.test.ts::concurrent draft saves — DECOR-010 > DECOR-010: of N saves on the same version exactly one lands; the rest are version conflicts`

### DECOR-011

A rollback republishes an old revision's content as a new revision (`restoredFrom` set), checked like any publish; nothing is rewritten and the draft is left as it is.

- `packages/core/src/decor/decor.int.test.ts::rollback — DECOR-011 > DECOR-011: rollback republishes old content as a new revision and leaves the draft alone`
- `packages/core/src/decor/decor.int.test.ts::rollback — DECOR-011 > DECOR-011: rolling back to a revision that does not exist writes nothing`
- `packages/core/src/decor/decor.concurrency.int.test.ts::concurrent rollbacks — DECOR-011 > DECOR-011: N rollbacks at once each append a revision, numbered without gaps or duplicates`

### DECOR-012

A preview token opens the current draft of the one document it was issued for, and nothing else; it is 256 random bits, kept in Redis only as its SHA-256, and expires after `PREVIEW_TOKEN_SECONDS`. A preview is never cached and is marked `preview: true`. Without a token an unpublished document does not exist for the storefront.

- `packages/core/src/decor/decor.int.test.ts::preview tokens — DECOR-012 > DECOR-012: a token opens the draft of its own document, uncached and marked preview`
- `packages/core/src/decor/decor.int.test.ts::preview tokens — DECOR-012 > DECOR-012: a token does not open another document, and a made-up token opens nothing`
- `packages/core/src/decor/decor.int.test.ts::preview tokens — DECOR-012 > DECOR-012: the token expires with Redis and is stored only as a hash`
- `apps/web/app/api/v1/pages/pages.int.test.ts::GET /api/v1/pages/:id > with a preview token serves the draft of that document only`

### DECOR-013

A page serves only what the shopper could see, by each domain's own rule, through that domain's `index.ts`: products on the shelf (a manual list keeps the operator's order and marks a sold-out pick; a category or label rule leaves sold-out products out), claimable coupons, published articles, campaigns in their window. A resolver that fails costs its slot (`null`), never the page.

- `packages/core/src/decor/decor.int.test.ts::resolved data — DECOR-013 > DECOR-013: a manual product list keeps the operator order, skips what is off the shelf and marks what is sold out`
- `packages/core/src/decor/decor.int.test.ts::resolved data — DECOR-013 > DECOR-013: a category or label rule returns on-shelf products with stock only, at most the limit`
- `packages/core/src/decor/decor.int.test.ts::resolved data — DECOR-013 > DECOR-013: coupons, 新人券 and articles come back only when the shopper could see them`
- `packages/core/src/decor/decor.int.test.ts::resolved data — DECOR-013 > DECOR-013: a resolver that fails costs its slot, not the page`

### DECOR-014

The public part of a page is cached per revision (`decor:page:rev:<id>`, `DECOR_CACHE_SECONDS`); the live revision is read from the database on every request, so a publish or a rollback serves the new revision at once, and the old entry is deleted. The storefront's ETag changes with it.

- `packages/core/src/decor/decor.int.test.ts::page cache — DECOR-014 > DECOR-014: the public page is cached per revision, and a publish serves the new revision at once`
- `packages/core/src/decor/decor.int.test.ts::page cache — DECOR-014 > DECOR-014: a rollback also moves the page off the cached revision`
- `packages/core/src/decor/decor.int.test.ts::page cache — DECOR-014 > DECOR-014: no home designated is DECOR_HOME_NOT_SET`
- `apps/web/app/api/v1/pages/pages.int.test.ts::GET /api/v1/pages/home > answers 304 to a matching If-None-Match, and a publish changes the ETag`

### DECOR-015

Per-shopper state (coupons claimed / claimable) is resolved only when a shopper's session comes with the request, is never part of the cached page, and is `null` for a guest or an admin.

- `packages/core/src/decor/decor.int.test.ts::per-shopper state — DECOR-015 > DECOR-015: with a session the page carries the coupon state of that shopper; without one, none`
- `packages/core/src/decor/decor.int.test.ts::per-shopper state — DECOR-015 > DECOR-015: the cached public page holds nothing per shopper`

### DECOR-016

Blocks are filtered per request from the one cached page: `visibility.audience` against the session, `visibility.platforms` against `X-Client-Platform`, and each type's `minClient` against `X-Client-Version` (an unreadable version sees everything). Unknown types, types newer than this build and props that do not parse are skipped, never served broken.

- `packages/core/src/decor/decor.int.test.ts::per-request filtering — DECOR-016 > DECOR-016: blocks are filtered by audience and X-Client-Platform, per request, from one cached page`
- `packages/core/src/decor/decor.int.test.ts::per-request filtering — DECOR-016 > DECOR-016: a block type newer than the client is left out for that client only`
- `packages/core/src/decor/decor.int.test.ts::per-request filtering — DECOR-016 > DECOR-016: unknown, newer-than-this-build and unparseable blocks are skipped, never served broken`
- `packages/core/src/decor/decor.int.test.ts::per-request filtering — DECOR-016 > DECOR-016: blockVisibleTo ignores a client version it cannot read`
- `apps/web/app/api/v1/pages/pages.int.test.ts::GET /api/v1/pages/home > filters blocks per request: session, X-Client-Platform, X-Client-Version`
