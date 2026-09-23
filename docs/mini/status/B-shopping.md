# Stream B — shopping pages (status)

Worktree `CRMEB-mini-wt/B-shopping`, branch `storefront/mini-B-shopping` (from `storefront/mini`).
Updated at every commit so the work can resume after an interruption.

## Done

- Copy: 秒杀 removed from the UI gallery demo and the `ProductCard` doc comment (限时活动 / 拼团).
- `features/decor`: `DecorPage` (shared by 首页 and 微页面), `openLinkTarget`, `SplashOverlay`
  (legacy link string parsed), `DecorSkeleton`. `ui/nav-bar.tsx` (custom bar) and
  `platform/chrome.ts` (`navBarMetrics`, `openMiniProgram`). `data/visits.ts` (`useRecordVisit`).
- 首页 (custom bar + search entry, 404 `DECOR_HOME_NOT_SET` empty state, pull-to-refresh, share,
  refetch on sign-in change) and 微页面 (`packages/page`), with tests.

## In progress

- Merge `storefront/mini` (H2): cart quantity through `cart.updateItemPut`; `X-Client-Version`.

## Next

1. 分类 (tab).
2. 商品列表, 搜索, 精品推荐, 商品评价 (`goods` sub-package).
3. 商品详情 (fixed design, SkuSheet, coupons, favourite, share, activity entries).
4. 购物车 (tab).
5. 下单 / 收银台 / 支付结果.
6. Vitest per page, e2e page objects and specs in `e2e/storefront/specs-mini`.
7. `docs/mini/pages.md` for page-form changes; guard allow-lists; sizes; 375px screenshots in
   `docs/mini/status/B-screens/`.

## Backend gaps found (not changed; for a later backend task)

- `cart.updateItem` is `PATCH`, which `wx.request` cannot send; H2's `PUT` alias
  (`cart.updateItemPut`) is not merged yet.
- `groupbuy.list` / `presale.list` take no `productId` filter; `catalog.productDetail` does not
  say which activities a product is in.
- `coupon.claimableList` takes no `productId` filter.
- `app/config` has no switches for 分类「显示二级类目」 or 商品详情「评价 / 推荐 / 服务标签」;
  `splashAd.link` is a legacy path string, not a `LinkTarget`.
- `order.create` takes no invoice; invoices are asked for after payment (`order.invoiceRequest`).
