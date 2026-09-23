# Stream B — shopping pages (status)

Worktree `CRMEB-mini-wt/B-shopping`, branch `storefront/mini-B-shopping` (from `storefront/mini`).
Updated at every commit so the work can resume after an interruption.

## Done

- Copy: 秒杀 removed from the UI gallery demo and the `ProductCard` doc comment (限时活动 / 拼团).
- `features/decor`: `DecorPage` (shared by 首页 and 微页面), `openLinkTarget`, `SplashOverlay`, `DecorSkeleton`. `ui/nav-bar.tsx` (custom bar) and
  `platform/chrome.ts` (`navBarMetrics`, `openMiniProgram`). `data/visits.ts` (`useRecordVisit`).
- 首页 (custom bar + search entry, 404 `DECOR_HOME_NOT_SET` empty state, pull-to-refresh, share,
  refetch on sign-in change) and 微页面 (`packages/page`), with tests.
- Merged `storefront/mini` (H2 + G1). `DecorPage` passes `personal` and answers the block
  intents: 联系客服 is wrapped in `ContactArea` (`ui/contact-button.tsx`: native
  `open-type="contact"` button, a call, or a note), 登录 goes through `requireLogin(route)`.
  The Taro fake gained `RichText`.
- 分类 (level-1 rail, banner, level-2 grid, product list with 加购), `features/product/sku-select`
  - `SkuSheet`, `features/cart/quick-add` (`useQuickAdd`).

- 分类 and 加购 tests; `test/catalog-fixture.ts`; the fake API records each request's query.
- `goods` sub-package: 商品列表 (title from category / keyword, sort, price filter, 1/2 columns
  remembered, 加购; `features/catalog/list-query.ts`), 搜索 (hot words, server history when
  signed in, clear; submit `redirectTo` 商品列表), 精品推荐 (tabs best / hot / new / benefit),
  商品评价 (score, rating tabs with counts, picture preview; `features/product/review-item.tsx`).
  All with tests.

- 商品详情: gallery, price / sales, 拼团 / 预售 entries (`features/product/activities.ts`),
  领券 sheet (`features/product/product-coupons.tsx`, shop-wide coupons only), 已选 → SkuSheet,
  服务 / 参数 sheets, reviews summary + first two, description through the 富文本 block,
  为你推荐, action bar (客服, 购物车 badge, 收藏, 加入购物车, 立即购买), sold-out and 404
  「商品已下架」, share sheet with the poster entry reserved for stream D
  (`features/share/poster.ts`). `features/checkout/draft.ts` now types cart / buy-now and
  kind / kindMeta.
- Merged `storefront/mini` (F2 + H3). 微页面 takes `previewToken` (`platform/nav.ts`
  `usePreviewToken`, validated): the draft, uncached, under a 「草稿预览」 banner, never shared;
  「预览已过期」 / 「页面不存在」 states. 开屏浮层 opens `splashAd.link` as a `LinkTarget`.
  Stable paths for streams D / E: `features/decor/decor-page.tsx` (`DecorPage`) and
  `ui/contact-button.tsx` (`ContactArea`, `useContactIcon`, `sessionFromOf`).

- 购物车 (tab): rows ticked on the server (`cart.setSelection`, optimistic), quantity through
  `cart.updateItemPut`, 改规格 through the SkuSheet, 失效商品 with reasons, 「改为 N 件」 and 清空,
  a coupon line from `coupon.applicableList` (best usable, or 「再买 ¥X 可用…」), 管理 (删除,
  移入收藏 via `catalog.favoriteAddBatch`), 结算 → `{ source: 'cart' }` draft, 为你推荐, guest
  and empty states. `features/cart/cart-view.ts` + `cart-row.tsx`; `test/cart-fixture.ts`.

## In progress

- 下单 (确认订单) rewrite.

## Next

1. Merge `storefront/mini` again once A2 lands (subscribe scenes, server clock, theme).
2. 下单 / 收银台 / 支付结果.
3. Vitest per page, e2e page objects and specs in `e2e/storefront/specs-mini` (seed a decor v2
   home).
4. `docs/mini/pages.md` for page-form changes; guard allow-lists; sizes; 375px screenshots in
   `docs/mini/status/B-screens/`.

## Backend gaps found (not changed; for a later backend task)

- (Resolved by H2) `cart.updateItem` is `PATCH`, which `wx.request` cannot send; the mini app uses
  the `PUT` alias `cart.updateItemPut`.
- `X-Client-Version` is sent, but as `0.0.0` until a release version is wired (I1); decor
  visibility by client version cannot tell builds apart until then.
- `groupbuy.list` / `presale.list` take no `productId` filter; `catalog.productDetail` does not
  say which activities a product is in.
- `coupon.claimableList` takes no `productId` filter and does not say which products / categories
  a scoped coupon covers: 商品详情「领券」 shows shop-wide (`all_products`) coupons only.
- `productList { couponId }` (我的优惠券「去使用」) cannot narrow the list: the storefront API
  neither filters products by coupon nor exposes a user coupon's scope ids. The list shows
  everything with a note.
- `app/config` has no switches for 分类「显示二级类目」 or 商品详情「评价 / 推荐 / 服务标签」.
  (`splashAd.link` as a `LinkTarget`: resolved by H3.)
- `order.create` takes no invoice; invoices are asked for after payment (`order.invoiceRequest`).
