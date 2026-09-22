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
 * | `recordCartAdd`         | B1         | 加购件数, inside the cart's add transaction          |
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
 * `checkPurchaseAllowance`, `issueVirtualCard` and `recordCartAdd` take
 * `(tx, …)` — a
 * transaction the *caller* owns — matching `recordEffect(tx, ctx, input)`, the
 * platform's other "join the transaction you are already in" primitive.
 *
 * ## What importing this file registers
 *
 * Importing `@shop/core/catalog` registers the `StockPort` (from
 * `catalog.stock.ts`), the `CatalogPort` the cart and checkout read variants
 * through (from `catalog.sale.ts`) and the 商品设置 config group. The two ports
 * go through `registerCatalogDomain()`, the idempotent shape
 * `@shop/core/domains` looks for, so a test that `resetOrderPorts()` can put
 * them back with one call. (The `OrderFactsPort` stand-in that used to live
 * here moved into the order domain at merge — CR-2-a closed.)
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

import { registerCatalogPort } from '../order';
import { registerStockPort } from '../order/ports';
import { catalogSalePort } from './catalog.sale';
import { catalogStockPort } from './catalog.stock';
// The config group registers itself on import.
import './catalog.config';

/** Registers the stock and sale ports; called once on import, again after a reset. */
export function registerCatalogDomain(): void {
  registerStockPort(catalogStockPort);
  registerCatalogPort(catalogSalePort);
}

registerCatalogDomain();

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
  recordCartAdd,
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

/** 移动端商家管理 — 商品管理 (CR-4-h2). Ten calls, `auth: 'staff'`, no new capability. */
export {
  staffAssignCategories,
  staffAssignLabels,
  staffProductCategories,
  staffProductCreate,
  staffProductLabels,
  staffProductList,
  staffProductSkus,
  staffSetVisibility,
  staffUpdateSkus,
} from './catalog.staff.service';

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
  categoryVersion,
  clearSearchHistory,
  favoriteAdd,
  favoriteAddBatch,
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

/** Test helper for the streams that move stock through the port (order, refund). */
export { stockAndSalesOf } from './catalog.repo';

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
