# Regression case matrix

## Automated gate

- [x] PRICE-001 Integral deduction accounts for frozen points and the configured maximum.
- [x] PRICE-002 Disabled integral deduction leaves price and available points unchanged.
- [x] PAY-001 Unknown product order notification is acknowledged without side effects.
- [x] PAY-002 Notification for an already paid product order does not run payment effects again.
- [x] PAY-003 Internal notification failure returns failure so the gateway can retry.
- [x] PAY-004 A valid product payment notification invokes the payment-success service once with its trade number.
- [x] PAY-005 A concurrent notification is acknowledged when another worker atomically paid the order.
- [x] PAY-006 Only the first atomic payment transition updates an order or records its trade number.
- [x] BALANCE-001 A paid recharge is not credited again; a first notification reaches the recharge-success service once.
- [x] BALANCE-002 Insufficient order balance writes nothing; an exact balance writes one ledger entry and pays the order.
- [x] BALANCE-003 Two orders cannot spend the same balance, and concurrent refund credits are not lost.
- [x] BALANCE-004 Negative balance changes are rejected without writing.
- [x] STOCK-001 Zero and negative inventory deductions are rejected.
- [x] STOCK-002 A deduction larger than available stock is rejected without changing stock or sales.
- [x] STOCK-003 Two concurrent deductions of the last item yield one success, final stock 0 and sales 1.
- [x] STOCK-004 Activity inventory requires sufficient stock and quota in the same update.
- [x] QUEUE-001 Paid, deleted, offline and already cancelled orders are not restored.
- [x] QUEUE-002 An eligible unpaid order restores resources and persists cancellation state once.
- [x] AUTH-001 Standard and legacy authorization headers populate the authenticated request.
- [x] AUTH-002 Optional authentication failure continues with an anonymous request.
- [x] REFUND-001 Balance refunds credit the user and record the resulting two-decimal balance; failed credits write no ledger.

## Required follow-up coverage

- [x] PRICE-003 Ordinary item pricing, coupon thresholds and freight boundaries.
- [ ] ORDER-001 Cart, confirmation, creation, payment, delivery and receipt lifecycle.
- [x] BALANCE-005 Competing full order payments with persisted ledger and order assertions.
- [ ] GATEWAY-001 Offline WeChat V2/V3 and Alipay signature, tampering and amount checks.
- [ ] REFUND-002 Full/partial gateway refund, rejection, cancellation, retry and cumulative amount checks.
- [x] AUTH-003 Token expiry and cross-user order read/write isolation through HTTP routes.
- [ ] QUEUE-003 Cancellation failure injection and concurrent payment/cancellation behavior.
- [ ] RACE-001 Concurrent payment, balance, callback, refund and cancellation races.
