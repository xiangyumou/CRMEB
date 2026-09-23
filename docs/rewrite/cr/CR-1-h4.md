# CR-1-h4 — the confirm page cannot ask which category-scoped coupons apply

- **Stream:** H4 (storefront follow-up), raised against the checkout / coupon contracts (B1 / B3
  ownership: `next/packages/contracts/src/{order,coupon}/**`, `next/packages/core/src/coupon/**`).
  The orchestrator routes it.
- **Status:** **open**
- **Found on:** `rewrite/ws-h4-storefront-followup`, while closing CR-4-i §11.
- **Severity:** a shopper holding a 品类券 (`scope: 'categories'`) sees it greyed out in the
  确认订单 picker even when the cart is in that category. Store-wide and product-scoped coupons
  are unaffected; journey `cart-checkout-pay.spec.ts` › coupon (a store-wide coupon) passes.

## What happens

`POST /api/v1/user-coupons/applicable` takes `{ lines: [{ productId, categoryIds, amount }] }`
and matches a category-scoped coupon **only** against the `categoryIds` the caller sends
(`core/src/coupon/coupon.service.ts` `listApplicable` → `quoteLines`; nothing looks the
product's categories up). The only thing the confirm page holds about its lines is the
`checkoutPreview` response, and `checkoutLine` (`contracts/src/order/schemas.ts`) carries
`productId`, `skuId`, amounts — no category ids. So the uni-app wrapper
(`template/uni-app/api/mappers/coupon.js` `fromLegacyApplicableInput`) sends `categoryIds: []`
for every line, and every 品类券 comes back `usable: false`.

## Ask (either)

1. **Preferred:** `listApplicable` resolves each line's categories itself from `productId`
   (the server owns the catalogue; a client-supplied category list is also a client-controlled
   eligibility input). `categoryIds` becomes optional/ignored on the body.
2. Or `checkoutLine` gains `categoryIds: id[]`, and the wrapper forwards them.

## Proof

`template/uni-app/tests/mappers.misc.test.mjs` › `CR-1-h4 — …` is an `it.fails`: it builds the
applicable body from the contract's own `checkoutPreview` example exactly as the confirm page does
and expects every line to carry categories. It fails today because the preview line has none.
With fix 2 the uni-app side then forwards them (`toLegacyCheckoutLine` → `cartInfo` →
`fromLegacyApplicableInput`) and the test flips to `it`; with fix 1 the test is deleted and the
wrapper stops sending `categoryIds`.
