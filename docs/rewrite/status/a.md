# Stream A — Catalog

Branch `rewrite/ws-a-catalog`, worktree `../CRMEB-wt/ws-a`. Nothing pushed.

## Contracts ready

`packages/contracts/src/catalog/` is committed and green. **65 catalog routes**,
every one with at least one truthful example.

```
$ pnpm --filter @shop/contracts gen
contracts: aggregated 9 contract file(s), 3 error file(s)
contracts: wrote openapi.json (83 route(s), 60 path(s))
$ pnpm --filter @shop/contracts typecheck    [exit 0]
$ pnpm --filter @shop/contracts lint         [exit 0]
$ pnpm --filter @shop/contracts check:examples
contracts: 83 route(s) OK, every example parses.
$ pnpm --filter @shop/contracts test:unit
Test Files  1 passed (1)   Tests  15 passed (15)
```

Files:

| File                                         | Routes |
| -------------------------------------------- | -----: |
| `catalog/catalog.category.admin.contract.ts` |      6 |
| `catalog/catalog.product.admin.contract.ts`  |     13 |
| `catalog/catalog.taxonomy.admin.contract.ts` |     18 |
| `catalog/catalog.review.contract.ts`         |     11 |
| `catalog/catalog.storefront.contract.ts`     |     17 |
| `catalog/schemas.ts`, `catalog/errors.ts`    |      — |

### What other streams can build against right now

Import by path, e.g.
`import { catalogProductList } from '@shop/contracts/catalog/catalog.storefront.contract'`.

- **`productCard`** (`catalog/schemas.ts`) is _the_ shared product DTO. DIY (G1/G2),
  marketing (D), cart (B1) and search all render this one shape — add a field
  here rather than inventing a parallel one. `salesDisplay` is already
  `sales + displaySalesBoost`; `canAddToCart` is the server's decision, not the
  client's.
- **`storefrontSku`** is the SKU shape the cart popup and checkout read.
- **H (uni-app)**: the storefront surface is `/api/v1/catalog/*` plus
  `/api/v1/me/{favorites,history,search-history,reviews}`. The mock server
  answers every one of them from the first example.
- **B1**: `catalog.productSkus` and `catalog.skuPrice` replace `v2/get_attr/:id/:type`
  and `product/real_price/:id/:unique`.
- **Coupon (golden slice)**: `catalog.adminProductList` and
  `catalog.adminCategoryTree` are the two routes the product / category pickers
  need; the `mode: 'tags'` fields in `coupon-enums.tsx` can swap to a
  `select` / `treeSelect` with `loadOptions` over them.

## Decisions

Recorded rather than asked, per the brief.

1. **URL prefix is `/admin-api/catalog/*` and `/api/v1/catalog/*`**, as the
   stream brief fixes it, not a bare `/admin-api/products`. Reason: "category",
   "labels" and "params" are words three domains use, the App Router makes the
   directory the URL, and an unqualified segment is a merge collision waiting to
   happen. The two shopper-scoped lists keep the brief's `/api/v1/me/*` shape.
2. **Spec templates (`eb_store_product_rule`) are out of scope.** The stream
   brief lists them, but the frozen schema drops them — SCHEMA.md §4.1: "Dropped:
   an admin convenience list of spec presets, re-enterable." There is no table,
   so there are no routes. Not a CR: the schema decision is the later one.
3. **Product export answers with JSON rows, not a CSV/XLSX stream.** `handle()`
   serialises every response as JSON, and a second, unvalidated response
   pipeline for file streams would bypass response validation, the audit write
   and the error mapping. `catalog.adminProductExport` returns
   `{ filename, columns, rows, total, truncated }` and the admin page writes the
   file in the browser. Ceiling 10 000 rows; over that the route refuses with
   `CATALOG_EXPORT_TOO_LARGE` and asks for a narrower filter.
4. **Browse history is `product_events` with `kind = 'view'`**, not a second
   table. `user_visits` (page views, geo, dwell time) stays with F2/stats — a
   product view is recorded once and read twice rather than written twice.
   Search history and hot words read `search_logs`, also in `schema/stats.ts`.
   **F2 must not also write `product_events` rows of kind `view`** or the
   footprint list doubles.
5. **`product_gift_coupons` is written from the product form.** The table lives
   in `schema/coupon.ts` and its comment says the coupon domain owns it, but the
   coupon slice shipped no route for it and legacy edits the link on the product
   page (`StoreProductCouponServices`). The catalog repo owns the rows;
   `adminProductForm.giftCouponIds` is the editor. If C/coupon later wants a
   route of its own, the rows are already there.
6. **The category tree is three levels, written out rather than recursed.**
   `z.lazy` makes an OpenAPI `$ref` cycle, and legacy caps the tree at three
   levels anyway. A fourth level is `CATALOG_CATEGORY_TOO_DEEP` (422).
7. **Protections have their own permission atoms** (`catalog:protection:*`).
   Legacy registered them under a group labelled 商品参数
   (`crmeb/app/adminapi/route/product.php:164`), so granting "product
   parameters" silently granted "edit the guarantee badges on every product
   page". Listed under "Fix, don't port" in the brief.
8. **Card-key stock is the card pool.** Importing cards bumps
   `product_skus.stock` in the same transaction and the product form refuses a
   hand-typed stock for a `virtual_card` product. Legacy let the two drift and
   sold cards that did not exist.
9. **The product export CSV is written in the browser.** Following from decision
   3: the route answers with rows, and `ExportButton` in
   `products/product-list.tsx` joins them into a
   `Blob` with a UTF-8 BOM and CRLF line endings, because Excel on Windows opens
   a BOM-less UTF-8 CSV as mojibake. When `truncated` is true the page says
   「已导出前 N 条，共 M 条，请缩小筛选范围」 rather than handing over a file that
   quietly stops short.
10. **`customForm` has no editor yet and is carried across untouched.** Legacy
    edits the checkout form with `vue-form-create`; there is no replacement
    renderer, so the product editor reads the loaded value and puts it back on
    save instead of dropping it on the first edit of an unrelated field. Pinned
    by `product-editor.test.tsx`. Whoever builds the form designer only has to
    replace one field.
11. **`shippingTemplateId` is a free text field until B2 ships a template
    contract.** The freight template lives in the fulfilment domain; the catalog
    stores and validates the id, and the editor's hint says so. Swapping in a
    `select` with `loadOptions` is a one-line change when the route exists.
12. **Product and coupon id pickers in the editor are `mode: 'tags'`,** same as
    the coupon slice's, for the same reason — the pickers want routes other
    streams have not finished. `catalog.adminProductList` is ready for whoever
    swaps first.

## Shipped

Everything in the brief's scope. Contracts first, then core, routes, jobs, the
ETL mapper and the admin pages.

### Contracts

**65 routes** in `packages/contracts/src/catalog/`, listed in the table above.
Every one carries at least one example and `check:examples` parses them all.

### Core domain — `packages/core/src/catalog/`

| File                            | What                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog.repo.ts`               | every table read/write; private to the domain                                                                                                                     |
| `catalog.rules.ts`              | pure rules: `skuMatrix`, `specTextOf`, `canAddToCart`, `checkPurchaseLimit`, `chargesFreight`, `salesDisplay`, `summariseReviews`                                 |
| `catalog.service.ts`            | admin categories, products, SKUs, stock warnings, export, virtual cards, plus `getSkuForSale` / `checkPurchaseAllowance` / `issueVirtualCard` / `productCardsFor` |
| `catalog.taxonomy.service.ts`   | labels, label categories, param templates, protections                                                                                                            |
| `catalog.review.service.ts`     | reviews both sides, replies, `runAutoReview`                                                                                                                      |
| `catalog.storefront.service.ts` | product list/detail/skus/price, category tree, favorites, history, search + history + hot words                                                                   |
| `catalog.stock.ts`              | the `StockPort` implementation                                                                                                                                    |
| `catalog.sale.ts`               | the `CatalogPort` implementation (the batch cart read)                                                                                                            |
| `catalog.order-bridge.repo.ts`  | the `OrderFactsPort` implementation (CR-2-a)                                                                                                                      |
| `catalog.config.ts`             | the 商品设置 config group                                                                                                                                         |
| `permissions.ts`                | `catalogPermissions`                                                                                                                                              |
| `index.ts`                      | the public surface — see its header table                                                                                                                         |

Importing `@shop/core/catalog` registers four things as module side effects: the
`StockPort`, the `CatalogPort`, the config group and the `OrderFactsPort`.

### Route files — `apps/web/app`

- **29** under `admin-api/catalog/`
- **9** under `api/v1/catalog/`
- **7** under `api/v1/me/` (`favorites` ×3, `history` ×2, `search-history`,
  `reviews`)

### Jobs — `apps/worker/src/jobs/`

- `catalog.autoReview.ts` — the 系统默认好评 sweep
- `catalog.pruneHistory.ts` — the 足迹 retention sweep

Both are picked up by `jobs.gen.ts`.

### ETL — `packages/etl/src/mappers/catalog.ts`

Maps the product tree, SKUs, specs, params, labels + label categories, param
templates, protections, virtual cards, favorites and reviews. Legacy columns
with no new home are **counted in the report, not silently dropped**:
`custom_form`, `eb_store_product_attr_value.disk_info` and `.coupon_id`.
`eb_store_visit` / `eb_user_search` belong to F2's `stats` tables, and
`eb_store_product_rule` has nothing to migrate into (decision 2).
`eb_store_product.label_id` is E1's user labels despite the name, and is left
alone.

### Admin pages — `apps/web/app/admin/(shell)/catalog/`

| Page                                            | File                                    |
| ----------------------------------------------- | --------------------------------------- |
| 商品列表 (7 tabs, export)                       | `products/product-list.tsx`             |
| 商品编辑器 (new + edit)                         | `products/product-editor.tsx`           |
| 规格 / SKU 矩阵 / 参数 controls                 | `products/product-sku-editor.tsx`       |
| 卡密库存                                        | `products/[id]/cards/virtual-cards.tsx` |
| 商品分类                                        | `categories/product-categories.tsx`     |
| 商品评价                                        | `reviews/product-reviews.tsx`           |
| 库存预警                                        | `stock-warnings/stock-warnings.tsx`     |
| 商品标签 + 标签分类 (two tabs)                  | `labels/product-labels.tsx`             |
| 参数模板                                        | `params/param-templates.tsx`            |
| 商品保障                                        | `protections/product-protections.tsx`   |
| shared enums, field specs, category tree loader | `catalog-enums.tsx`                     |

Plus 10 thin `page.tsx` server components and
`src/admin/menu/catalog.menu.ts` (8 entries, `products.new` hidden).

### Tests

| File                                                        |                  Tests |
| ----------------------------------------------------------- | ---------------------: |
| `packages/core/src/catalog/catalog.int.test.ts`             |                     64 |
| `packages/core/src/catalog/catalog.rules.test.ts`           |                     56 |
| `packages/core/src/catalog/catalog.concurrency.int.test.ts` | 12 (`runConcurrently`) |
| `packages/etl/src/mappers/catalog.test.ts`                  |                     39 |
| `apps/web/app/admin-api/catalog/catalog.int.test.ts`        |                     10 |
| 5 admin page tests                                          |                     21 |

Every conditional state change — stock reserve/commit/release, the
`incStockDecSales` atom, card issue, favorite add, review submit, the auto-review
sweep — has a `runConcurrently` test against real PostgreSQL.

## CRs

| CR     | Subject                                                         | Outcome                                                                                                                  |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CR-1-a | `StockPort.release` could not tell a cancellation from a refund | **RESOLVED** — accepted and extended. `release(tx, orderId, lines, { committed, refundId })`; no separate `releaseSold`. |
| CR-2-a | the catalog needs four order facts and there is no port         | **RESOLVED** — `OrderFactsPort` now lives in `core/src/order/ports.ts`; `catalog.order-bridge.repo.ts` implements it.    |
| CR-3-a | a domain could not read its own config group                    | **RESOLVED — superseded by CR-2-c.** `catalog.config.ts` moved into `core/src/catalog/`.                                 |

**Open CRs: none.**

### For B1 specifically

`registerCatalogPort(catalogSalePort)` happens on import of
`@shop/core/catalog`, which retires B1's fallback adapter. Every field B1's cart
and checkout read is present — nothing is missing and nothing is stubbed. The
effects-ledger scope for a release is `('refund', refundId)` when a refund id is
supplied and `('order', orderId)` otherwise, so a cancellation and a later
refund of the same order never collide on one ledger key.

## Definition of Done

Verbatim, from `next/` on this worktree:

```
$ pnpm gen
@shop/worker:gen: worker: aggregated 9 job file(s)
 Tasks:    3 successful, 3 total

$ pnpm typecheck
 Tasks:    10 successful, 10 total

$ pnpm lint
 Tasks:    11 successful, 11 total

$ pnpm test:unit
@shop/contracts  Test Files 2 passed (2)    Tests 147 passed (147)
@shop/core       Test Files 9 passed (9)    Tests 258 passed (258)
@shop/etl        Test Files 3 passed (3)    Tests  82 passed (82)
@shop/web        Test Files 19 passed (19)  Tests 265 passed (265)
@shop/worker     Test Files 1 passed (1)    Tests  12 passed (12)
@shop/testing    Test Files 3 passed (3)    Tests  48 passed (48)
@shop/config     Test Files 1 passed (1)    Tests   2 passed (2)
 Tasks:    10 successful, 10 total

$ pnpm test:int -- --maxWorkers=2
@shop/core       Test Files 13 passed (13)  Tests 331 passed (331)
@shop/web        Test Files 5 passed (5)    Tests  55 passed (55)
@shop/worker     Test Files 1 passed (1)    Tests   6 passed (6)
@shop/testing    Test Files 1 passed (1)    Tests   9 passed (9)
 Tasks:    10 successful, 10 total

$ pnpm build
 Tasks:    5 successful, 5 total

$ pnpm --filter @shop/contracts check:examples
contracts: 186 route(s) OK, every example parses.

$ pnpm exec prettier --check .
All matched files use Prettier code style!
```

## New dependencies

None. `next/pnpm-lock.yaml` is not committed, per the brief.
