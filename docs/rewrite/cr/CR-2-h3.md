# CR-2-h3 — the product page is a DIY page the storefront cannot read

- **Stream:** H3 (uni-app third pass), raised against the DIY domain (G1/G3, F4 for the storefront reads)
- **Status:** **RESOLVED** by W5T in `5d6e181dd` — fixed-path read with a built-in default (orchestrator's decision)
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

## Resolution (W5T, `5d6e181dd`)

Decision: **fixed-path read with a built-in default**.

- `GET /api/v1/diy/pages/product-detail` (`diy.productDetailPage`, `auth:
  'public'`) — contract in `next/packages/contracts/src/diy/storefront.contract.ts`,
  service `getProductDetailPage` in `next/packages/core/src/diy/diy-storefront.service.ts`,
  route `next/apps/web/app/api/v1/diy/pages/product-detail/route.ts`.
- Answers the newest published `product_detail` page (a draft is never served),
  in the `pages/user-center` envelope. When none is published it answers the
  **built-in default** (`PRODUCT_DETAIL_DEFAULT_VALUE`,
  `next/packages/contracts/src/diy/product-detail.default.{ts,json}`) with
  `id: null` — the response schema is `diyStorefrontPage` with a nullable `id`,
  because the default has no row to name. It never 404s.
- The default is the legacy install's own default detail page
  (`eb_theme.detail_default_data` of 经典红) minus `home_paid_vip` (retired) and
  `goodRecommend` (指定商品 with no products — a heading over nothing):
  `productInfo`, `productService`, `reviews`, `productDesc`, `bottomMenu`, props
  verbatim. It passes `parseDiyPageValue` and the editor's own save.
- Cached 60 s in Redis like 个人中心 (`diy:product-detail:v1`); every 装修
  write drops it.
- uni-app: `getThemeInfo('detail')` reads it with `toLegacyDiyPage`; the
  empty-page stub is gone.

Migration note for the orchestrator: legacy never kept the product page in
`eb_diy` (the seed's `eb_diy` has no product-detail row); it is
`eb_theme.detail_data`, which the ETL's `diy` group already carries into
`themes.data.productDetail`. No `diy_pages` row is made from it, and nothing on the storefront reads
`themes.data.productDetail`, so a migrated shop that customised its product page
gets the built-in default until an operator rebuilds it as a 商品详情 page and
publishes it (恢复默认 on that page pulls the theme's *factory* copy,
`defaultData.productDetail`, before `data.productDetail`, so it does not bring
the customisation back either). If that matters, the fix is an ETL step that
turns the active theme's `data.productDetail` into a published `product_detail`
page — `packages/etl` is outside W5T. `pages/user-center` has the same shape
(legacy `eb_theme.user_data`).
