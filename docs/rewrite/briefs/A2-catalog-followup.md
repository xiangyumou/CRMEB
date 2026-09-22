# Stream A2 — Catalog follow-up: staff 商品管理, product form fix-ups, `<SkuPicker>`

**Worktree** `../CRMEB-wt/ws-a2` · **Branch** `rewrite/ws-a2-catalog-followup` (from `rewrite/integration`) · **Owns** `contracts/src/catalog/**`, `core/src/catalog/**`, `apps/web/app/api/v1/catalog/**`, `apps/web/app/api/v1/staff/products*/**`, `apps/web/app/api/v1/staff/product-*/**`, `apps/web/app/api/v1/staff/shipping-templates/**`, `apps/web/app/admin/(shell)/catalog/**`, `apps/web/app/admin-api/catalog/**`. **Touches by decision of the orchestrator**: `apps/web/src/admin/kit/sku-picker.tsx` (new, kit is otherwise orchestrator-owned), the activity forms under `apps/web/app/admin/(shell)/groupbuy/**` and `apps/web/app/admin/(shell)/presale/**` (only to replace their SKU input with the picker), `docs/rewrite/status/a2.md`.

Read first: `docs/rewrite/CONVENTIONS.md`, `docs/rewrite/status/a.md` (what A left open), `docs/rewrite/cr/CR-4-h2.md`, then B2's staff routes (`contracts/src/order/order.staff.contract.ts`, `apps/web/app/api/v1/staff/orders/**`) — they are the pattern for `auth: 'staff'`, and F2's `apps/web/app/api/v1/staff/express-companies`. Read-only reference: `crmeb/app/api/controller/v1/admin/StoreProductController.php` (legacy phone product management), `template/uni-app/pages/admin/goods/**` and `template/uni-app/api/admin.js` (the ten calls, marked `CONTRACT-PENDING(A)`).

## 1. CR-4-h2 — accepted in full: the phone keeps product management (ten routes)
Decisions:
- All ten routes under `/api/v1/staff/`, `auth: 'staff'`, exactly the paths in the CR. Reuse A's admin schemas where the shape is the same; a staff list row may be thinner than the admin one but must carry what `pages/admin/goods/**` reads (H2's status file and the page sources say which fields).
- `state: 'low-stock'` **stays** and compares against `catalogConfig.stockWarningThreshold` (the one N1 wired to `admin_low_stock`), not `trade.stockWarningThreshold` (B3 is deleting that duplicate).
- `POST /api/v1/staff/products` creates a **single-spec** product only (`specType: 'single'`, one SKU row). No `logistics` field: 门店自提 is retired, the product ships by 快递 only. Same validation and same `catalog` service call as the admin create, so the storefront sees the product the moment it is created.
- `PUT /api/v1/staff/products/:id/skus` edits price / cost / originalPrice / stock / skuCode / weight / volume per SKU; stock changes go through the same atomic stock path A uses for the admin (never a read-then-write).
- Every route is a thin `handle(route, fn)` over an existing or new `core/src/catalog` service function; a staff caller must not be able to do anything an admin with `catalog:*` could not.

Tests: one integration test per route (auth: a plain shopper session gets 403, a staff session passes); the four `state` filters each pinned with seeded data; create → `GET /api/v1/catalog/products/:id` sees it; sku PUT with a concurrent order reserve does not lose stock (copy the pattern from A's stock concurrency test).

## 2. Product form: `shippingTemplateId` becomes a select
The admin product form still takes the freight template as a bare number. Make it a select fed by F2's shipping-templates list route (look under `contracts/src/shipping/` for the admin list route and use the generated client), with `freightMode` switching the field between 免运费 / 固定运费 (per unit — legacy `postage × cart_num`) / 运费模板. Update the product form unit test.

## 3. `<SkuPicker>` in the kit, used by the two activity forms
D and D2 both hand-rolled a SKU input (a product id plus a typed SKU id). Build `apps/web/src/admin/kit/sku-picker.tsx`: search products (A's admin list route, keyword), expand to SKUs, multi-select returning `{ productId, skuId, specText, price, stock }[]`; only kit primitives + the generated contracts client, no domain imports. Wire it into the group-buy activity form and the presale activity form in place of their current inputs (keep their submit bodies unchanged — the picker only fills what they already send). Add a unit test for the picker (search → expand → select) and keep D/D2's existing form tests green.

## Out of scope
Multi-spec creation from the phone; product reviews; anything under `template/uni-app` (H3 flips the ten markers after you merge — say in your status file which fields each staff route returns so H3 can map them).

## Rules
Never push, never SSH, never touch `crmeb/`, `template/**`, or another stream's worktree; lockfile never. `pnpm gen` after adding routes; contracts first with examples. Commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Before the final commit, from `next/`: `pnpm turbo run gen typecheck lint test:unit build`, `pnpm --filter @shop/core test:int`, `pnpm --filter @shop/web test:int`, `pnpm exec prettier --check .`, `pnpm --filter @shop/contracts check:examples`. Write `docs/rewrite/status/a2.md` (routes with their response fields, decisions taken, CRs filed). Final report: what landed, test counts, anything left.
