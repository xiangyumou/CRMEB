/**
 * The catalog domain's public surface.
 *
 * CONVENTIONS: "A domain in `core` may import another domain only through that
 * domain's `index.ts`." So this file is the contract between the catalog and
 * the rest of the system. `catalog.repo.ts` in particular is private: no other
 * domain may read a product table directly, and none needs to.
 *
 * ## What other streams call
 *
 * | Function / export       | Caller     | When                                              |
 * | ----------------------- | ---------- | ------------------------------------------------- |
 * | `getSkuForSale`         | B1         | pricing the cart, confirming and creating an order |
 * | `checkPurchaseAllowance`| B1         | 起购 / 限购, inside the order transaction           |
 * | `getStockPort()`        | B1 / C / D | reserve, commit, release — via `order/ports.ts`    |
 * | `getCatalogPort()`      | B1         | the batch cart read, via `order/catalog.port.ts`   |
 * | `issueVirtualCard`      | B2         | handing a card key to a paid order line            |
 * | `productCardsFor`       | G1 / G2    | rendering products in a DIY page or a campaign     |
 * | `ProductCard`           | everyone   | the one product-card DTO; add fields, do not fork  |
 * | `catalogPermissions`    | E2         | the permission tree                                |
 * | `catalogConfig`         | F1         | the 商品设置 config group                           |
 * | `runAutoReview`         | worker     | the 系统默认好评 sweep                              |
 * | `pruneBrowseHistory`    | worker     | the 足迹 retention sweep                           |
 *
 * `checkPurchaseAllowance` and `issueVirtualCard` take `(tx, …)` — a
 * transaction the *caller* owns — matching `recordEffect(tx, ctx, input)`, the
 * platform's other "join the transaction you are already in" primitive.
 *
 * ## Four things importing this file does
 *
 * Importing `@shop/core/catalog` registers the `StockPort` (from
 * `catalog.stock.ts`), the `CatalogPort` B1 reads variants through (from
 * `catalog.sale.ts`, which retires B1's fallback adapter), the 商品设置 config
 * group and the temporary `OrderFactsPort` bridge (from
 * `catalog.order-bridge.repo.ts`). All four are module side effects, which is
 * how `registerStockPort` is meant to be reached; see `order/ports.ts`.
 *
 * ## Not an effect handler
 *
 * SCHEMA.md §4.5 reserves `catalog.virtual_card.issue`, but claiming a card is
 * a database operation, not a third-party call, and CONVENTIONS is explicit
 * that the ledger is for "anything that calls a third party". Issuing a card
 * inside B2's paid transaction is both simpler and safer — it either commits
 * with the payment or does not happen — so `issueVirtualCard` is a plain
 * exported function and the key stays free for whoever needs to *notify* the
 * buyer.
 */

// The StockPort, the CatalogPort and the order-facts bridge register
// themselves on import.
import './catalog.stock';
import './catalog.sale';
import './catalog.order-bridge.repo';

export {
  // admin: categories
  adminCategoryCreate,
  adminCategoryDelete,
  adminCategoryDetail,
  adminCategoryList,
  adminCategorySetVisibility,
  adminCategoryTree,
  adminCategoryUpdate,
  // admin: products
  adminProductCreate,
  adminProductDelete,
  adminProductDetail,
  adminProductExport,
  adminProductList,
  adminProductRestore,
  adminProductSetStatus,
  adminProductUpdate,
  adminSkuMatrix,
  adminStockWarnings,
  // admin: virtual cards
  adminVirtualCardImport,
  adminVirtualCardList,
  adminVirtualCardVoid,
  // the domain API other streams call
  checkPurchaseAllowance,
  getSkuForSale,
  issueVirtualCard,
  productCardsFor,
  // shared mappers, for the other catalog service files and the tests
  toProductCard,
} from './catalog.service';

export type { SaleableSku } from './catalog.service';

export {
  adminLabelCategoryCreate,
  adminLabelCategoryDelete,
  adminLabelCategoryList,
  adminLabelCategoryUpdate,
  adminLabelCreate,
  adminLabelDelete,
  adminLabelList,
  adminLabelSetEnabled,
  adminLabelUpdate,
  adminParamTemplateCreate,
  adminParamTemplateDelete,
  adminParamTemplateList,
  adminParamTemplateSetEnabled,
  adminParamTemplateUpdate,
  adminProtectionCreate,
  adminProtectionDelete,
  adminProtectionList,
  adminProtectionSetEnabled,
  adminProtectionUpdate,
} from './catalog.taxonomy.service';

export {
  adminReviewBatchSetStatus,
  adminReviewCreate,
  adminReviewDelete,
  adminReviewList,
  adminReviewReply,
  adminReviewReplyUpdate,
  adminReviewSetStatus,
  myReviews,
  productReviewSummary,
  productReviews,
  reviewSubmit,
  runAutoReview,
} from './catalog.review.service';

export type { AutoReviewResult } from './catalog.review.service';

export {
  categoryTree,
  clearSearchHistory,
  favoriteAdd,
  favoriteList,
  favoriteRemove,
  favoriteRemoveBatch,
  historyClear,
  historyList,
  historyRemove,
  hotKeywords,
  productDetail,
  productList,
  productSkus,
  pruneBrowseHistory,
  searchHistory,
  skuPrice,
} from './catalog.storefront.service';

/**
 * The stock port, also reachable as `getStockPort()`. The refund path is
 * `release(tx, orderId, lines, { committed: true, refundId })` — CR-1-a; there
 * is no separate `releaseSold` any more.
 */
export { catalogStockPort } from './catalog.stock';

/** The batch cart read, also reachable as `resolveCatalogPort()`. */
export { catalogSalePort } from './catalog.sale';

/** The 商品设置 group. Registered by importing this file. */
export { catalogConfig } from './catalog.config';

export { catalogPermissions } from './permissions';

/** Pure rules, re-exported for the streams that render the same numbers. */
export {
  canAddToCart,
  chargesFreight,
  checkPurchaseLimit,
  salesDisplay,
  skuMatrix,
  specTextOf,
  summariseReviews,
} from './catalog.rules';
