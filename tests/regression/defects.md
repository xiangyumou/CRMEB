# Regression defects

## Launch blockers: payment, refund and fulfillment consistency (2026-09-19, this round)

Found by the independent review behind `risk-matrix.md`. Every entry below
lists the baseline commit, the failing assertion observed before the fix (the
command is always `sh docker/run-regression.sh crmeb-test`), the fix commit and
the passing result. Failures are business assertions — no missing class, no
environment failure.

### PAY-007 (P1, plan 3.1): payment creation and cancellation did not share the order lock

`StoreOrderController::pay()` read the order, rewrote the payer and recorded
the payment attempt with no transaction around any of it, and its
`FOR UPDATE` re-read ran outside a transaction (a no-op) with the result
discarded. A cancellation that completed while a payment request was in flight
therefore left a collectible gateway payment standing on a cancelled order:
baseline commit 1559a52a, case
`PaymentConcurrencyTest::testNoCollectibleGatewayPaymentSurvivesACancelledOrder`
failed with *"a cancelled order ended up with a collectible gateway payment
(open)"* — the create landed on the gateway only after the cancel had released
the stock and the coupon. The creation path also treated a lost response as
"never happened": case `testACreateResponseTimeoutKeepsTheAttemptAsUnknown`
failed with *"Failed asserting that 0 is identical to 3"* — the attempt stayed
`STATUS_SUBMITTED` after the gateway accepted the create and the response was
lost.

Fix (one commit with PAY-008/PAY-009): `StoreOrderServices::createPayment()` —
transaction one locks the original order row, checks paid/cancel/deleted/pink
state, renumbers for a payer swap and records the attempt inside the lock;
transaction two re-locks, re-reads and only then calls the gateway, with the
5 s `innodb_lock_wait_timeout` set for the section and the gateway create
covered by the order lock. Refusals close the attempt (`create:refused`);
gateway-boundary errors (`PayGatewayException`, wrapped in `PayServices::pay`)
mark it `STATUS_UNKNOWN` and keep it. The controller now delegates to this one
entry. WeChat v2/v3 transports get connect-timeout 3 s and total timeout 15 s.

### PAY-008 (P1, plan 3.1): the attempt context was mutable and unverified

`StoreOrderPaymentAttemptServices::record()` overwrote driver, merchant, app,
channel, amount and payer on every re-record, and nothing compared the
recorded merchant identity with the current configuration.
`PaymentConcurrencyTest::testPaymentAttemptContextIsImmutable` fails on the
baseline code with *"a changed amount must not overwrite the recorded
attempt"* (the row was silently rewritten to 12.00), and
`testConfigIdentityMismatchStopsCancellationForManualHandling` fails with *"a
config identity mismatch must stop the cancellation"*.

Fix: `record()` is now write-once — an identical replay is idempotent, any
context change (including the driver after a `pay_wechat_type` switch) is
refused with 请人工核对后处理, a `STATUS_UNKNOWN` or paid attempt refuses
re-recording, and a refused-create attempt reopens in place. The attempt now
also stores the configured merchant/app identity (`mch_id`, `app_id`, keys
only, no secrets), and `PayTradeServices::identityMatches()` refuses to settle
a mismatched attempt: cancellation stops with 支付配置与记录身份不匹配，请人工
核对后处理 and releases nothing.

### PAY-009 (P1, plan 3.2): a discovered payment was not confirmed locally

When cancellation's settlement found a paid attempt, the old code marked the
attempt paid and threw 订单已支付 — the order itself stayed unpaid, its
fulfillment waiting for a callback that might never come, and the fresh trade
number from the query was discarded (`settleAttempt` returned a bare string).
The paid case now runs the unified confirmation inside the original order
lock: `QueueTest::testAGatewayPaymentFoundDuringCancellationKeepsTheOrderAlive`
(fixed expectation) proves `paySuccess()` receives the query's trade number,
the cancel then reports failure and the order stays alive; the confirmation
commits before 订单已支付，无法取消 is returned. `PayTradeServices::settleResult()`
returns the standard result (state, fresh trade number, amount, driver,
merchant identity, `not_exist`), and a "查无此单" answer for an attempt that
was created keeps 待核对 state instead of being read as "safe to release".

## Retained-path audit (2026-09-19)

The entries below were found by reviewing the deletion batch against the paths it
kept, not by a failing gate: every one of them passed the suite as it stood. Each
fix now has a case in `cases.md`, and every new case was observed failing on the
pre-fix code before it passed.

### REFUND-002/003/004 (P1, pre-existing): presale refunds restored the wrong stock

`StoreOrderRefundServices::regressionStock()` branched on `combination_id` and
otherwise called the ordinary product-stock restore. An order sold from a presale
carries an `advance_id` and a presale SKU; those were handed to the product
service, so the presale activity row and its SKU were never credited back and the
call could not find the id it was given. Cancelling such an order could fail
outright, and `agreeRefund()`/`payOrderRefund()` ignored the return value, so a
refund could be marked successful while the stock stayed deducted. The restore now
dispatches by the layer the order sold from (`incCombinationStock`,
`incAdvanceStock`, `incProductStock`) and both refund paths throw
`库存回退失败` before the payment gateway is reached when the restore returns
`false`.

### GATEWAY-002 (P1): the WeChat version setting was deleted with the retired features

`pay_wechat_type` was listed in the migration's retired settings and removed from
the install SQL, but `PayServices::pay()`, `StoreOrderRefundServices::agreeRefund()`
and the notification handler all still read it to choose the v2 or v3 driver. A
shop configured for v3 fell back to v2 after the migration; a fresh install had no
way to select v3 at all. Both WeChat versions are retained business, so the setting
is out of the retired list, back in the install SQL, and created with default `0`
when an older database lacks it.

### MIG-008/MIG-009/MIG-010: the apply plan lost settings without an error

Three defects shared one cause — the plan decided from the database as it was
*before* the run instead of from the state the run was about to produce.
`apply` read `MAX(id) + 1` once per added row while the rows were still staged in
memory, so two settings added in the same run received the same id and
`recordChange()` merged them; the second vanished silently. The roster merge read
only the stored `order_notice_admin_uids`, so the setting this run created kept an
empty value and the chat members it should have inherited — order alerts and mobile
order management — were dropped. And the retired-setting cleanup judged a row by
the stored `config_tab_id`, so a retained setting that the same run had just moved
off a dead tab was deleted afterwards. Ids are now claimed once per row, the roster
and the deletion rule read the planned state, and a pre-write check asserts unique
ids, unique names and an existing tab for every retained setting.

### MIG-011/MIG-012/MIG-013: rollback could not be trusted, finalize could delete real data

`rollback` ran `RENAME TABLE` after `startTrans()`. The rename commits implicitly,
so a conflict found later left the table names and part of the rows restored while
the command reported a refusal, and a retry could fail again on the rows it had
already restored. It now classifies every row image before the first rename
(`after` → restore, `before` → already restored, anything else → conflict), renames
outside any transaction, and restores the rows in a fresh transaction afterwards;
a DML failure says the names are back and the restore can be retried with the same
backup. `finalize` accepted a dump file that merely *named* every table, so a file
that could restore nothing authorised dropping tables that still held rows — the
old test asserted exactly that. Finalize now counts the rows of every pending
table first and refuses the whole batch with exit code 2 (naming the tables and
counts) when any of them is non-empty; `--yes` and `--dump` cannot bypass it.
Permanent deletion of a non-empty retired table is out of scope until a shop
actually has one.

### COUPON-001/002/003 (P2): member-exclusive coupons were claimable by anyone

The member feature was deleted, but the storefront queries still included
`receive_type = 4` and `issueUserCoupon()` had lost its membership check, so any
user could claim a leftover member coupon by id and take one from `remain_count`.
The install SQL still ships one such row (id 2, 会员专享). The storefront list, PC
list, popup list, quantity counts, `receive_types = 1` search and the DIY
`theme/coupon` component now admit ordinary coupons only — the DIY component's
member audience returns an empty list — and `issueUserCoupon()` refuses `4` with
`该优惠券所属业务已下线` before any write. Records already issued are left
untouched.

## Order, payment and refund consistency (2026-09-19)

These entries were found by reviewing the newly split containers and the order
money paths after the previous round, with fault injection and separate-process
races on a real MySQL. Each one has a case in `cases.md`, and every new case was
observed failing on the pre-fix code first.

### ORDER-004 / COUPON-004 / COUPON-005 / COUPON-006 (P1): a coupon could pay for two orders

`OrderCouponCalculator::useCouponId()` spent the coupon with
`StoreCouponUserServices::useCoupon()` while it was still computing the price, and
the create transaction only covered the order and stock writes. A confirmation
that later failed on stock, on a price check or on the cart update left the coupon
consumed with no order written. The same call updated by id alone, so two
concurrent orders could both spend one coupon — and a spent, failed, expired or
foreign coupon was accepted as long as the id matched. The calculator now only
computes, and `StoreOrderCreateServices` redeems the coupon inside the order
transaction through `StoreCouponUserDao::redeemCoupon()`: a single conditional
update keyed on the holder, the unused state and the validity window, whose
affected-row count is the success signal, so the order is refused unless exactly
one row changed and the coupon, the stock and the order either all commit or all
roll back. The HTTP case submits an order with an already spent coupon and asserts
a non-200 result, no order row, unchanged stock and the coupon still spent; the
unit cases cover the single-use boundary, the unusable coupons and a
two-process race.

### QUEUE-003 … QUEUE-009 (P1): cancellation released stock before it knew the payment state

Three entry points restore an abandoned order — the manual cancel API,
`UnpaidOrderCancelJob` and the timer loop — and they behaved differently. The job
ignored a `false` from the stock or coupon restore, reported success and persisted
the cancel state, so a failure lost the stock for good. The queue path ran the
release and the cancel flag in different places, so a partial failure could
restore stock while leaving the order open. None of them asked the gateway whether
the order had actually been paid, so a cancellation could free the stock and the
coupon of an order whose payment landed a moment later. Cancellation now goes
through one service entry point: inside the transaction it locks and re-reads the
order, settles every recorded payment attempt with the gateway first, and only
when every attempt is closed or provably absent does it return the coupon, restore
the layer the order sold from (`incCombinationStock`, `incAdvanceStock`,
`incProductStock`) and persist the cancel state in the same commit. An
unconfirmed gateway answer, a coupon that cannot be returned or a stock restore
that returns `false` aborts the whole cancellation and leaves the order open for a
retry; a payment discovered during settlement marks the attempt paid with its
trade number and keeps the order alive. Cases QUEUE-003 … QUEUE-009 prove the
ordering, the unknown-answer path, the late payment, both rollback directions, the
four presale ledgers and the two-process race.

### REFUND-005 / REFUND-006 (P1): a refund retry could ask the gateway for a different amount

`agreeRefund()` checked eligibility, asked the gateway and marked the after-sale
row complete in separate steps, and the standard v2/v3 drivers generated a random
`out_refund_no` per call. A retry after "the gateway accepted it but the local
transaction rolled back", or a concurrent second operator, therefore sent a
second differently numbered refund request, and nothing tied the requested amount
to the first attempt — a retry could even ask for more money. `freezeRefundRequest()`
now runs first in its own transaction: it locks the after-sale row, refuses one
that is already complete or in an unsupported state, derives the gateway number
from the persisted unique after-sale number and stores the frozen amount and
payment context in `refund_request`. Every retry replays that row, so the gateway
number and the amount stay identical across failures and across processes, and the
completion update moved out of the controller into the service transaction.

### PAY-006 / QUEUE-010 / QUEUE-011 (P1): the post-payment effects had no second delivery

The payment transaction was made to register "notification, push, printing and
invoice still have to happen" as a row, so no external call could leave the
process before the order was committed. The repair side of that contract was
never wired: nothing ever called the effect job or swept the pending rows, so a
payment whose process died between the commit and the notice — or whose notice
threw — left the order permanently silent with nobody to notice, while the table
slowly filled with pending rows. The registration also passed the recorded id to
`OrderEffectJob::dispatch()` as a bare value, and that signature reads a non-array
argument as a *method name*: the call became `$job->4242()` and threw inside the
wrapper that swallows it, so even the immediate attempt did nothing. The id is now
passed as the argument list, and the delivery has three parts: the queue job runs
the recorded row right after the commit, the timer re-delivers pending rows every
30 seconds (bounded per cycle), and a claim update (`pending → running`) decides
which delivery may call the gateway-facing side, so two deliveries that arrive at
once cannot both run the external call. A record left in `running` by a killed
worker becomes claimable again after `STALE_SECONDS`, a failed effect keeps its
unknown outcome and error text for an operator, and a record that used up
`MAX_ATTEMPTS` stops being re-delivered instead of retrying forever.
`OrderEffectTest` fails on the old code — the recorded row was never handed to
`runById` — and covers the claim, the redelivery filters and the attempt counter.

## STOCK-003: inventory deduction was not atomic

`BaseDao::decStockIncSales()` read the row and then issued an unconditional decrement. A competing order could pass the read before another request consumed the remaining stock. The update now includes `stock >= requested` and, for quota-backed products, `quota >= requested` in the same SQL statement. Non-positive deductions are rejected. The affected-row count is the success signal.

## PAY-005: payment transition could dispatch side effects twice

`StoreOrderSuccessServices::paySuccess()` previously updated an order by ID after a separate `paid` read. Concurrent callbacks could both pass the read and dispatch payment events. `StoreOrderDao::markPaid()` now updates only rows with `paid = 0`. A losing external callback re-reads the order and acknowledges it when the competing callback completed; a losing balance transaction receives `false` so its debit is rolled back.

## BALANCE-003: concurrent balance changes could overwrite each other

`BaseDao::bc()` previously read a balance, calculated it in PHP, and saved the absolute value. Concurrent payments or refunds could overwrite one another. It now uses one SQL increment or a conditional decrement (`balance >= amount`). Negative changes are rejected, and the affected-row result reports insufficient funds or a missing record.

## AUTH-003: refund ownership was not enforced

The API refund detail and return-shipment endpoints accepted a refund identifier without constraining it to the authenticated user. User-facing service methods now verify both the refund identifier and `uid`; administration methods retain their existing unrestricted signatures. Real HTTP tests assert the standard `订单不存在` response and no database changes.

## GATEWAY-001: signed callbacks discarded payment amount

The WeChat V2, WeChat V3, mini-program, and Alipay adapters previously forwarded only order and trade numbers after transport-level signature verification. They now forward normalized `paid_amount`, `currency`, and `merchant_id`; product and member callbacks reject amount or currency mismatches before payment effects run. Full offline cryptographic fixture coverage remains open in `cases.md`.

## PRICE-004: multi-item order creation returned a bare cart row

`StoreOrderCreateServices::computeOrderProductBrokerage()` returned the cart list, but `computeOrderProductTruePrice()` destructured its result as `[cartInfo, spreadIds]`. With a single-item cart the list and the pair happened to agree; with a multi-item cart the destructuring assigned the first row to `$cartInfo` and the second row to the spread ids. `StoreOrderCartInfoServices::updateCartInfo()` then walked that one row's fields and raised `Trying to access array offset on value of type int`, which `orderCreateAfter()` rethrew as `计算订单实际优惠、积分、邮费、佣金失败`. The order row was already inserted at that point, so each failed attempt left an order whose cart info and prices were never finalized. The method returns `[$cartInfo, []]` again; an empty spread list sends both the listener and `OrderCreateAfterJob` down their existing fallback, which resolves `spread_uid` and `spread_two_uid` through `UserServices::getSpreadUid()` while every per-cart brokerage field stays `'0.00'`.
