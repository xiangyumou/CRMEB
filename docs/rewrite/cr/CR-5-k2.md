# CR-5-k2 — the amount inside a refund notification is never read

**Stream:** K2 (hardening) **Status:** OPEN — for stream C (refund)
**Files:** `next/packages/core/src/refund/refund.service.ts:883-931` (`handleRefundNotify`), `applyRefundNotification`, `reconcileRefund` (same gap on the query path)
**Pinned by:** `next/packages/core/src/refund/refund.webhook.int.test.ts::K-SEC-R6 — the amount inside a refund notification > does not book a refund whose notified amount disagrees with the frozen one (CR-5-k2)` (`it.fails`)

## What

AUDIT K-SEC-R6. The settlement books the refund's own frozen amount — correct,
and asserted by the passing `can never change the amount booked: settlement
uses the frozen amount`. But `resource.amount.refund` is never compared with it,
so a gateway that refunded a different amount (a partial refund made by hand on
the merchant platform against the same `out_refund_no`, a gateway-side
adjustment, or a bug in our own request) is booked as the amount we *asked*
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
