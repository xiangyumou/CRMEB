import productDetailDefault from './product-detail.default.json' with { type: 'json' };
import type { DiyPageValue } from './schema/page';

/**
 * 商品详情 — the built-in product page.
 *
 * `pages/goods_details/index.vue` draws its whole body through `PageDesign`:
 * gallery, price, title and specs are the `productInfo` component, and so on
 * down the page. A shop that never decorated its product page must still get
 * one, so `GET /api/v1/diy/pages/product-detail` answers this when no
 * `product_detail` page is published.
 *
 * **What it holds.** The 经典红 theme's default product page, with two
 * components left out:
 *
 * - `home_paid_vip` (付费会员): paid membership is retired, and `cleanDiyData`
 *   would strip it on read anyway;
 * - `goodRecommend` (优品推荐): its default is 指定商品 with an empty product
 *   list, so it can only ever render a heading over nothing.
 *
 * What is left is the five components `pageDesign.vue` and `productBottom.vue`
 * render on this page: `productInfo` (轮播图 / 价格 / 标题 / 规格),
 * `productService` (服务保障, rendered by `homeProductService.vue`), `reviews`
 * (商品评价, `homeReviews.vue`), `productDesc` (图文详情), and `bottomMenu`
 * (the bar `productBottom.vue` styles). Keys, timestamps and props are exactly
 * what the editor saves for those components. One choice to note:
 *
 * - `bottomMenu.showContent.type` is `[3, 1, 2, 4]` (首页, 收藏, 购物车,
 *   **分享**). The bar's 分享 entry is the product page's only way to the share
 *   panel (发送给朋友 / 生成海报), so the default page must offer it. An
 *   operator who publishes a page of their own chooses the entries in the
 *   editor.
 *
 * **Why the payload is a JSON file.** It is a saved page, not code — and the
 * bottom bar's 客服 entry carries the iconfont glyph whose name contains the
 * retired 自建客服 module's token. That glyph is not the module (whose page
 * `REMOVED_STOREFRONT_PAGES` drops); the `retired` guard's deny-list records
 * the same reading for the admin's `bottomMenu.default.ts`. As data it sits
 * outside that script scan, like the DIY `__fixtures__`.
 *
 * It must parse as a saved page does — `product-detail.default.test.ts` holds
 * it to `parseDiyPageValue` and to `cleanDiyData` being a no-op on it.
 */
export const PRODUCT_DETAIL_DEFAULT_VALUE: DiyPageValue = productDetailDefault as DiyPageValue;

/**
 * The `version` the default answers with. Constant, so the `ETag` is stable
 * until an operator publishes a page of their own — which changes it, because a
 * saved page's version is its timestamp.
 */
export const PRODUCT_DETAIL_DEFAULT_VERSION = 'builtin-product-detail-1';
