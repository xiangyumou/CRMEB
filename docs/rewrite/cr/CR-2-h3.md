# CR-2-h3 — the product page is a DIY page the storefront cannot read

- **Stream:** H3 (uni-app third pass), raised against the DIY domain (G1/G3, F4 for the storefront reads)
- **Status:** open
- **Affects:** `next/packages/contracts/src/diy/storefront.contract.ts`

`pages/goods_details/index.vue` renders the whole product page through
`PageDesign` (`subpackage/diyComponents/pageDesign.vue`): `productInfo`,
`productDesc`, `homeReviews`, `homeProductService` are components on a DIY page
of kind `product_detail`, which `diyPageKind` already has and the console
already edits. The page asks for it with `getThemeInfo('detail')`.

The storefront has a fixed-path read for two kinds only — `pages/home` and
`pages/user-center` (F4, CR-3-h2 §1) — plus `pages/:id`, which needs an id the
app does not have. Until H3 the call went to `GET /api/v1/diy/layouts/detail`,
a 422 (`:type` is `category | user`), so `diyData` stayed `{}` and
`PageDesign` rendered **nothing above the bottom bar**: no gallery, no price, no
description. H3 stopped sending the 422 (the wrapper resolves an empty page
without a request) but cannot make the page appear.

**Ask:** `GET /api/v1/diy/pages/product-detail`, `auth: 'public'`, the same
envelope as `pages/user-center` (newest published `product_detail` page), with
a seeded default — a shop that never decorated its product page must still see
one. H binds it in `getThemeInfo('detail')` with `toLegacyDiyPage`; nothing on
the page changes.

If a fixed product page is preferred, say so; then the page's template needs a
non-DIY body, which is a page rewrite and needs an owner.

**Stream I should know:** any storefront journey that asserts on product-page
content is blocked on this, not on its own harness.
