# Stream A — Catalog

**Worktree** `../CRMEB-wt/ws-a` · **Branch** `rewrite/ws-a-catalog` · **Domain** `catalog` · reference-map section "A — Catalog"

## Scope
Categories (tree), products, spec templates, spec matrix → SKUs, descriptions, labels + label categories, param templates, protections, reviews (incl. admin-written reviews, reply, moderation), favorites, browse history, search (pg_trgm) + search history/hot words, virtual card inventory import (the pool only; claiming belongs to B2), per-product gift-coupon links, stock-warning list, product export (CSV/XLSX stream). Auto-review job (`productReplay` → `catalog.auto-review`).

Storefront routes under `/api/v1/catalog/*`, `/api/v1/me/favorites`, `/api/v1/me/history`; admin under `/admin-api/catalog/*`.

## Exports other streams rely on (put in `core/src/catalog/index.ts`)
- `getSkuForSale(ctx, skuId)` → price, stock, product status, kind, freight template id, weight/volume, snapshot payload for order items.
- The `StockPort` implementation for ordinary SKUs: `reserve` / `release` as single conditional UPDATEs (`stock >= n`), sales counter moved in the same statement.
- `ProductCard` DTO schema in contracts, reused by DIY, marketing and cart.

## Invariants to prove
risk-matrix §1 (shelf on/off hides and refuses order; last-unit stock race), cases "Stock". Search: case-insensitive, Chinese substring, excludes off-shelf and deleted.

## Fix, don't port
- `incStockDecSales` read-then-write → one atomic UPDATE.
- `virtual_type` passed as `$is_virtual`; model it as `products.kind`.
- Protections registered under the wrong permission group — give them their own atoms.

## Out of scope
Taobao/1688 product copy (all of it), product migration export/import, member price, the mobile staff product editor (B2 calls your services).
