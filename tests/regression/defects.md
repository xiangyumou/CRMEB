# Regression defects

## STOCK-003: inventory deduction was not atomic

`BaseDao::decStockIncSales()` read the row and then issued an unconditional decrement. A competing order could pass the read before another request consumed the remaining stock. The update now includes `stock >= requested` and, for quota-backed products, `quota >= requested` in the same SQL statement. Non-positive deductions are rejected. The affected-row count is the success signal.

## PAY-005: payment transition could dispatch side effects twice

`StoreOrderSuccessServices::paySuccess()` previously updated an order by ID after a separate `paid` read. Concurrent callbacks could both pass the read and dispatch payment events. `StoreOrderDao::markPaid()` now updates only rows with `paid = 0`. A losing external callback re-reads the order and acknowledges it when the competing callback completed; a losing balance transaction receives `false` so its debit is rolled back.

## BALANCE-003: concurrent balance changes could overwrite each other

`BaseDao::bc()` previously read a balance, calculated it in PHP, and saved the absolute value. Concurrent payments or refunds could overwrite one another. It now uses one SQL increment or a conditional decrement (`balance >= amount`). Negative changes are rejected, and the affected-row result reports insufficient funds or a missing record.
