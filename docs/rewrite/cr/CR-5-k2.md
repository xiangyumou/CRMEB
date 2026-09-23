# CR-5-k2 — the amount inside a refund notification is never read

**Stream:** K2 (hardening) **Status:** RESOLVED (R2; commit in `docs/rewrite/status/r2.md`)
**Files:** `next/packages/core/src/refund/refund.service.ts:883-931` (`handleRefundNotify`), `applyRefundNotification`, `reconcileRefund` (same gap on the query path)
**Pinned by:** `next/packages/core/src/refund/refund.webhook.int.test.ts::K-SEC-R6 — the amount inside a refund notification > does not book a refund whose notified amount disagrees with the frozen one (CR-5-k2)` (`it.fails`)

## What

AUDIT K-SEC-R6. The settlement books the refund's own frozen amount — correct,
and asserted by the passing `can never change the amount booked: settlement
uses the frozen amount`. But `resource.amount.refund` is never compared with it,
so a gateway that refunded a different amount (a partial refund made by hand on
the merchant platform against the same `out_refund_no`, a gateway-side
adjustment, or a bug in our own request) is booked as the amount we _asked_
for. The ledger then disagrees with the bank and nothing says so. The payment
side already does this right (K-SEC-P5, `GATEWAY-001`).

## Asked for

Compare `amount.refund` (fen) with the frozen amount on both the webhook and
`reconcileRefund`. Equal → settle as today. Different, absent or unparseable →
record it on the callbacks row, raise a refund exception for an operator, and
do not move the refund to `succeeded`. Mirror `GATEWAY-001`'s shape so the two
webhooks read alike.

## Until then

The booked figure is always the one we asked for, never more than was paid
(K-SEC-R2 holds), so this cannot over-refund; it can only hide a discrepancy.

## Resolution (R2)

`handleRefundNotify` reads `amount.refund` (a positive integer of 分, else
"absent") and, for a `SUCCESS`, compares it with the frozen `refunds.amount`;
`reconcileRefund` compares the query's `refundFen` the same way. Equal →
settled as before. Different or absent → the refund keeps its status,
`last_error` reads e.g. `网关退款金额 0.01 与退款单金额 50.00 不符`, one refund
log entry and one `admin_refund_exception` notification are written (idempotent
on the message, so the reconciliation sweep does not repeat them every five
minutes), the callback row's `result` is
`exception: amount_mismatch (notified …, frozen …)`, and the webhook answers 200. `reconcileRefund` answers `unknown` / `网关退款金额与退款单不符，待人工核对`.

- Flipped: `packages/core/src/refund/refund.webhook.int.test.ts::K-SEC-R6 — the amount inside a refund notification > does not book a refund whose notified amount disagrees with the frozen one (CR-5-k2)`.
- Changed (title kept): `… > can never change the amount booked: settlement uses the frozen amount`
  — the 100.00-vs-50.00 body is now not booked at all; the matching body that
  follows books exactly 50.00.
- Added: `… > raises a disagreeing or missing amount to an operator (CR-5-k2)`,
  `… > reads the amount on the query path too, and says so once however often the sweep asks (CR-5-k2)`.

Not done: the payment domain's exception refunds (`applyExceptionRefundNotification`)
still do not compare the notified amount with the exception's `paid_amount`.
Same shape, lower stakes (the whole payment goes back); left as a note.

**Operator follow-up (product question).** A refund left `processing` with a
`last_error` has no admin action that resolves it other than a later matching
answer; the reconciliation sweep keeps querying it. Whether an operator should
be able to close it by hand (mark 已退款 at the gateway's figure, or 失败) is a
product decision, not built.
