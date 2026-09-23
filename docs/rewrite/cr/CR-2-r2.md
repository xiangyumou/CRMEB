# CR-2-r2 — FREIGHT-006's test id went with CR-6-i

**Stream:** R2 → orchestrator **Status:** **RESOLVED** — applied by the orchestrator at R2's merge
**Files:** `docs/rewrite/invariants.md` (FREIGHT-006 row) — orchestrator's

## What

FREIGHT-006 ("a quote with no address — the cart preview before one is chosen
— is zero and says so") cites
`packages/core/src/shipping/shipping.freight.rules.test.ts::computeFreight > quotes zero when there is no address yet`.

CR-6-i, which the orchestrator routed to R2, changed what that test asserted.
At the rules level, an empty division list meant both "no address yet" and
"an address whose city we do not know", and both were quoted ¥0. CR-6-i asks
for the second case to be priced at the template's fallback region. The test
was therefore replaced by
`computeFreight > prices an address with no known division at the fallback region (CR-6-i)`.
Its old title would now describe the opposite of what the code does.

The invariant still holds, one layer up. Checkout
(`order.checkout.service.ts::quoteFreight`) returns zero **before** it asks the
freight port when there is no address. The preview carries `receiver: null`
and `addressRequired: true`, which is the "says so". A test now pins exactly
that, on a product that charges postage, so a zero cannot come from a free
product.

## Asked for

Replace FREIGHT-006's test cell with:

`packages/core/src/order/order.int.test.ts::checkout preview > quotes zero freight while no address is chosen yet, and asks for one (FREIGHT-006)`

and leave the row `ported`. Until then, `pnpm guards` reports this one
failure on R2's branch:
`invariants.md FREIGHT-006: … shipping.freight.rules.test.ts contains no test named "quotes zero when there is no address yet"`.

Optionally, add CR-6-i's evidence to the same row, or to a new one:
`packages/core/src/shipping/shipping.int.test.ts::FreightPort.quote > prices an address with no known division at the fallback region, not free (CR-6-i)`.
