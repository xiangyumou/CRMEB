# CR-6-k2 — `refund.detail` is exported without an ownership check

**Stream:** K2 (hardening) **Status:** OPEN — for stream C (refund); one-line fix
**Files:** `next/packages/core/src/refund/index.ts:41`, `next/packages/core/src/refund/refund.service.ts:993`

## What

AUDIT K-SEC-R10. `detail(ctx, refundId)` returns any after-sale by id, with
no `userId` comparison. Inside `refund/` every caller checks ownership first.
Outside, **nothing imports it**: the storefront route calls `myDetail`, the
admin route `adminDetail` (`grep -rn "refund\.detail\b" next/apps next/packages`
finds nothing). It is exported from the domain's public surface all the same, so
the next route written against `@shop/core/refund` has a function called
`detail` in autocomplete that leaks every shopper's after-sale when it is handed
a URL id.

## Asked for

Drop `detail` from the `export { … }` list in `refund/index.ts`. The in-domain
callers import it from `./refund.service` and are unaffected. The ownership
behaviour of the public entry points stays asserted by
`refund.isolation.int.test.ts::AUTH-005 — a stranger and another shopper’s after-sale > …`.

## Until then

Not a live leak: no route calls it.
