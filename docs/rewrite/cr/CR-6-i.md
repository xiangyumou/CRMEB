# CR-6-i — an address without a city is quoted ¥0 freight

- **Stream:** I (storefront e2e) observation, filed by the orchestrator; routed to **R2**
- **Status:** RESOLVED (R2, `rewrite/ws-r2-payments`; commit in `docs/rewrite/status/r2.md`)
- **Affects:** `next/packages/core/src/shipping/shipping.freight.rules.ts` (`regionFor`), the freight quote port

Stream I's journey seed first created addresses with no `cityId`; the confirm page then quoted ¥0
freight on a template whose fallback (`isFallback`) region charges. The template's fallback region
is skipped instead of applied when the address carries no division codes, so `regionFor` finds no
region and the quote is free. Production addresses migrated without a `city_id` (the ETL nulls
unknown cities, CR-3-j) would ship free.

**Ask:** an address with no (or unknown) division resolves to the template's fallback region, the
same as an address in a province the template does not list. A unit test in
`shipping.freight.rules.test.ts` (empty division list → fallback) and an int test through the
freight port (address with `cityId: null` → the fallback price, not 0). If the template has no
fallback region, keep today's answer and say which it is in the test name.

## Resolution (R2)

`computeFreight` no longer skips a template line when `cityPath` is empty; the
empty path goes through `regionFor`, which matches no city rule and returns the
fallback region (or `null` → free when the template has none, today's answer).
Free-shipping and no-delivery rules still need a named division to apply. "No
address yet" is unaffected: checkout returns zero before it asks the port.

- `shipping.freight.rules.test.ts`: `regionFor > gives an address with no known division the fallback rule (CR-6-i)`,
  `regionFor > returns null for an address with no known division when there is no fallback rule`,
  `computeFreight > prices an address with no known division at the fallback region (CR-6-i)`
  (replaces `quotes zero when there is no address yet`), and
  `… > quotes zero for an address with no known division when the template has no fallback region`.
- `shipping.int.test.ts::FreightPort.quote > prices an address with no known division at the fallback region, not free (CR-6-i)`
  (`addressCityId: null` and an id missing from the city table → ¥40, not ¥0).

**Ledger (FREIGHT-006).** The replaced test was FREIGHT-006's evidence. The
"no address yet → zero" rule is checkout's (it returns zero before it asks the
port), and it is now pinned in
`order/order.int.test.ts::checkout preview > quotes zero freight while no address is chosen yet, and asks for one (FREIGHT-006)`.
The ledger edit is requested in **CR-2-r2**, and `pnpm guards` fails on that
row until it is applied.
