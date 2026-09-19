# Regression defects

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
