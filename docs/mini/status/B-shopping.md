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
- Merged `storefront/mini` (H2 + G1). `DecorPage` passes `personal` and answers the block
  intents: 联系客服 is wrapped in `ContactArea` (`ui/contact-button.tsx`: native
  `open-type="contact"` button, a call, or a note), 登录 goes through `requireLogin(route)`.
  The Taro fake gained `RichText`.
- 分类 (level-1 rail, banner, level-2 grid, product list with 加购), `features/product/sku-select`
  - `SkuSheet`, `features/cart/quick-add` (`useQuickAdd`).

## In progress

- Tests for 分类 and `useQuickAdd`.

## Next

1. 商品列表, 搜索, 精品推荐, 商品评价 (`goods` sub-package).
2. 商品详情 (fixed design, SkuSheet, coupons, favourite, share, activity entries).
3. 购物车 (tab; quantity through `cart.updateItemPut`).
4. 下单 / 收银台 / 支付结果.
5. Vitest per page, e2e page objects and specs in `e2e/storefront/specs-mini` (seed a decor v2
   home).
6. `docs/mini/pages.md` for page-form changes; guard allow-lists; sizes; 375px screenshots in
   `docs/mini/status/B-screens/`.

## Backend gaps found (not changed; for a later backend task)

- (Resolved by H2) `cart.updateItem` is `PATCH`, which `wx.request` cannot send; the mini app uses
  the `PUT` alias `cart.updateItemPut`.
- `X-Client-Version` is sent, but as `0.0.0` until a release version is wired (I1); decor
  visibility by client version cannot tell builds apart until then.
- `groupbuy.list` / `presale.list` take no `productId` filter; `catalog.productDetail` does not
  say which activities a product is in.
- `coupon.claimableList` takes no `productId` filter.
- `app/config` has no switches for 分类「显示二级类目」 or 商品详情「评价 / 推荐 / 服务标签」;
  `splashAd.link` is a legacy path string, not a `LinkTarget`.
- `order.create` takes no invoice; invoices are asked for after payment (`order.invoiceRequest`).
