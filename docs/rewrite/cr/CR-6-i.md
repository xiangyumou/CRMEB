# CR-6-i — an address without a city is quoted ¥0 freight

- **Stream:** I (storefront e2e) observation, filed by the orchestrator; routed to **R2**
- **Status:** OPEN
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
