# CR-3-k2 — a signed event posted to the wrong webhook burns its notify id

**Stream:** K2 (hardening) **Status:** RESOLVED (R2; commit in `docs/rewrite/status/r2.md`)
**Files:** `next/packages/core/src/wechat/wechat.pay.ts:493` (`eventType` parsed, never compared), `next/packages/core/src/payment/payment.service.ts:682-760` (`handleTransactionNotify`), `next/packages/core/src/refund/refund.service.ts:883-931` (`handleRefundNotify`)
**Pinned by:** `next/packages/core/src/refund/refund.webhook.int.test.ts::K-SEC-P6 — a signed event delivered to the other webhook > lets the genuine delivery book the payment after a misrouted copy of it (CR-3-k2)` (`it.fails`)

## What

Both webhooks verify the signature and decrypt the resource, and neither
compares `event_type` with the endpoint. Both then insert into the one
`payment_callbacks` table, unique on `(mch_id, provider_notify_id)`, **before**
they decide whether the event is one they handle.

The attacker's request: take any genuine, signed `TRANSACTION.SUCCESS` body
(a network position is not needed — WeChat retries, logs, a misconfigured notify
URL on the merchant platform) and POST it to `/api/v1/webhooks/wechat-refund`
first. The refund handler verifies it, inserts the callback row with WeChat's
notify id, finds no `out_refund_no` and ignores it. When WeChat then delivers
the same notification to `/api/v1/webhooks/wechat-pay`, the insert conflicts,
the handler treats it as a replay and returns 200 — **the order stays
`pending_payment` although the shopper paid**. The reverse (a refund
notification to the payment endpoint first) swallows a refund result the same
way. In the pinned test the order ends `pending_payment` instead of `paid`.

Reconciliation (`reconcilePayment`) eventually asks the gateway and repairs it,
so this is a delay and a support call rather than lost money — but it is a
delay an outsider can cause per order.

## Asked for

Check `event_type` in each handler before the callback insert: the payment
webhook takes `TRANSACTION.*` only, the refund webhook `REFUND.*` only; anything
else is answered 200 (so WeChat stops retrying a misroute) and writes **no**
callback row. Flip the `it.fails` to `it`. The two passing tests beside it
(`books nothing when a refund notification reaches the payment endpoint` and the
reverse) must keep passing.

## Until then

Reconciliation is the backstop; nothing is booked wrongly, only late.

## Resolution (R2)

Both handlers check `notification.eventType` right after verification and
before the transaction: the payment webhook takes `TRANSACTION.*`, the refund
webhook `REFUND.*`. Anything else is answered 200 (`SUCCESS`), logged at warn,
and writes **no** `payment_callbacks` row. `wechat.pay.ts` is unchanged (it
already exposed `eventType`).

- Flipped: `packages/core/src/refund/refund.webhook.int.test.ts::K-SEC-P6 — a signed event delivered to the other webhook > lets the genuine delivery book the payment after a misrouted copy of it`.
- Added: `… > answers a misroute 200 and records no callback row, in either direction (CR-3-k2)`
  (and the refund's own delivery still settles after its misrouted copy).
- The two neighbouring passing tests still pass.
