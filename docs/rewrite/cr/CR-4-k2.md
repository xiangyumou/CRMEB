# CR-4-k2 — a notification naming another merchant is settled anyway

**Stream:** K2 (hardening) **Status:** RESOLVED (R2; commit in `docs/rewrite/status/r2.md`)
**Files:** `next/packages/core/src/payment/payment.service.ts:704` (`mchId = resource.mchid ?? runtime.mchId`), `:754-758` (mismatch logged, then settled); `next/packages/core/src/refund/refund.service.ts:905` (`mchId = resource.mchid ?? client.mchId`, never compared)
**Pinned by:** `next/packages/core/src/refund/refund.webhook.int.test.ts::K-SEC-P7 — a well-signed notification naming another merchant > never marks an order paid on a transaction another merchant collected (CR-4-k2)` and `> never settles a refund on a notification from another merchant (CR-4-k2)` (both `it.fails`)

## What

AUDIT K-SEC-P7 called this "weak" and deferred it. Read again: the payment
handler logs `payment notify merchant mismatch` at error level and then marks
the order paid and writes the foreign `mchid` onto the capital flow; the refund
handler never looks at `mchid` at all. An absent `mchid` defaults to our own.

The signature and the AEAD seal are what keep an outsider from producing such a
body, and they hold. This is about the cases where they do not separate
merchants: a service-provider (服务商) setup, a platform certificate or APIv3
key shared across two of the operator's own merchant ids, or an APIv3 key that
leaked from the other shop. In each, a genuine "paid" for merchant B books an
order in shop A. In the pinned tests the order ends `paid` and the refund
`succeeded`.

## Asked for

In both handlers: `resource.mchid` must be present and equal the merchant the
attempt / refund was created under (`attempt.mchId`, else the configured one).
On a mismatch, record the callback row with the merchant it named (the passing
test `records the merchant it was told on the callback row` already covers
that), raise a payment/refund exception for an operator, and **do not** settle
or auto-refund. Answer 200 so WeChat stops retrying.

## Until then

The error-level log line is the only signal. A shop with one merchant id and its
own certificate is not exposed.

## Resolution (R2)

- **Payment webhook.** `resource.mchid` must be present and equal
  `attempt.mchId` (the configured merchant when no attempt matches). On a
  mismatch the callback row is filed under the merchant the body named (absent →
  ours), its `result` is `exception: merchant_mismatch (named …, expected …)`,
  an error is logged, and a new admin notification
  `admin_payment_notify_mismatch` (permission `payment:exception:read`,
  registered by `registerPaymentDomain()` from `payment/payment.notifications.ts`)
  is recorded once per delivery. **No `payment_exceptions` row** and so no
  automatic refund: that row's whole purpose is to send money back, and money
  another merchant collected is not ours to refund. A dedicated exception
  reason would need a `payment_exceptions_reason` enum value, i.e. a migration
  outside R2's ownership; the notification + callback row were judged enough.
  Answered 200.
- **Refund webhook.** `mchid` must be present and equal the merchant frozen on
  the refund (`request_context.mchId`, else the configured one). On a mismatch
  the refund keeps its status (never `succeeded`, never `failed`),
  `refunds.last_error` and a refund log entry say why, and
  `admin_refund_exception` (permission `refund:request:read`, registered by
  `registerRefundDomain()`) is recorded. For a payment-exception refund
  (`X…` numbers) the mismatch is logged and not settled; the exception row stays
  `refunding`, which is already on the 支付异常 list. Answered 200.
- Flipped: `packages/core/src/refund/refund.webhook.int.test.ts::K-SEC-P7 — a well-signed notification naming another merchant > never marks an order paid on a transaction another merchant collected (CR-4-k2)`
  and `… > never settles a refund on a notification from another merchant (CR-4-k2)`.
- Added: `… > tells an operator, and neither books nor refunds the foreign payment (CR-4-k2)`,
  `… > refuses a payment notification that names no merchant at all (CR-4-k2)`,
  `… > leaves a refund from another merchant for an operator, on the row and in its log (CR-4-k2)`.
