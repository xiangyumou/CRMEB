# Regression defects

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
