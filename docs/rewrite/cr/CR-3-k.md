# CR-3-k — AUTH-005: nothing asserts a stranger cannot read another shopper's after-sale

**Stream:** K (hardening) **Status:** OPEN — for stream C (refund)
**Files:** `next/packages/core/src/refund/refund.service.ts` (the behaviour), `next/packages/core/src/refund/` (the missing test)

## What

`AUTH-005` in the parity ledger reads:

> A stranger gets `订单不存在` (never the after-sale detail) from the storefront
> refund surface, and the admin refund route refuses an unauthenticated call
> without completing the after-sale.

The behaviour is there. `refund.service.ts` guards the shopper-facing reads and
writes with the same clause in four places:

```ts
if (!row || row.userId !== userId) throw new DomainError('REFUND_NOT_FOUND');
```

`!row` and "somebody else's row" deliberately answer the *same* error, so the
storefront cannot be used to probe which refund ids exist. That is the property
AUTH-005 is about, and **nothing asserts it.** The row is `unmapped` and stream
C has merged, so no one is going to notice if a later refactor splits the two
conditions into a distinct `REFUND_FORBIDDEN`, or drops the `userId` comparison
while keeping a passing test suite.

## Asked for

One test in C's suite, pointed at by AUTH-005, that seeds two shoppers and one
refund and asserts:

1. the owner reads the after-sale detail;
2. the stranger gets `REFUND_NOT_FOUND` — the same code and the same message as
   a refund id that does not exist at all, compared field by field, not merely
   "an error";
3. the stranger's attempt to act on it (withdraw, and the other mutating
   storefront entry point) is refused the same way, and **writes nothing**: the
   refund's status and the order's status are unchanged afterwards.

Point 2 is the one worth being strict about: an assertion that only checks "it
throws" would pass a change that turns this into a 403, which is the information
leak AUTH-005 exists to prevent.

`executeRefund` (line 455) is intentionally not part of this: it is called by
the dispatcher with no shopper in hand, which is why it checks `!row` alone.

## Until then

`pnpm guards` reports AUTH-005 as `pending(C)` via
`guards/src/lib/pending-edits.ts`, and CR-2-k asks for `**Owner: stream C**` to
be written into the ledger row so the ownership is visible without reading the
guard's source.
