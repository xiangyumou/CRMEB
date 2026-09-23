/**
 * The shop's own public settings `src/seed.ts` writes, so journey 8 can tell
 * "the storefront shows *this shop's* logo and copyright" apart from "the
 * storefront shows the bundled CRMEB defaults".
 *
 * The images are on a host nothing resolves: `keepOffline` (`src/fixtures.ts`)
 * answers every off-origin image with a 1×1 PNG, so they load, and the spec
 * asserts on the URL the page asked for — which is the thing that proves the
 * value came from `GET /api/v1/site/config`.
 */
export const SITE = {
  siteName: 'E2E 小店',
  loginLogo: 'https://e2e-assets.invalid/login-logo.png',
  copyrightText: 'E2E 小店 版权所有',
  copyrightImage: 'https://e2e-assets.invalid/copyright.png',
} as const;

/**
 * The 图文详情 `src/seed.ts` gives the fixed-postage product, so a product-page
 * journey can assert the default page's `productDesc` renders the product's
 * own description (CR-7-i) — the other seeded products have none.
 */
export const POSTAGE_PRODUCT_DESCRIPTION = 'E2E 运费商品的图文详情';
