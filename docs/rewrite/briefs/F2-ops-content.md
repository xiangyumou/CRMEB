# Stream F2 — Shipping, articles, statistics

**Worktree** `../CRMEB-wt/ws-f2` · **Branch** `rewrite/ws-f2-ops` · **Domains** `shipping`, `cms`, `stats` (contracts, core, admin pages, routes, jobs) · reference-map section "F2 — Ops content"

Three small domains in one stream. Do them in this order — `shipping` first, because B1 quotes zero freight until your `FreightPort` is registered.

## 1. `shipping`
- **Freight templates.** Schema tables `shipping_templates` + its region / free / no-delivery children (read SCHEMA.md; the seven legacy tables were already collapsed). Admin CRUD with one typed form (charge mode by piece / weight / volume; region rows with first/extra unit and price; conditional free-shipping rows; no-delivery regions). A template in use by a product cannot be deleted (`SHIPPING_TEMPLATE_IN_USE`; ask the catalog through its `index.ts`, or count `products.shipping_template_id` through a catalog export — file a CR if no export exists, do not read `products` yourself).
- **`FreightPort`** (`core/src/order/ports.ts`): implement `quote(ctx, {addressCityId, lines})` and call `registerFreightPort(...)` from `core/src/shipping/index.ts`. Port the rule from `OrderFreightCalculator::computedPayPostage` and `StoreOrderCreateServices.php:449, 509-531`: group lines by template, sort groups by first-unit price descending, the most expensive group pays first-unit + extra, the others pay extra only; free-shipping rules apply per template; a line whose product carries a fixed postage pays that; a no-delivery region makes the quote refuse with `SHIPPING_NOT_DELIVERABLE` naming the lines. `addressCityId = null` quotes zero and says so in the quote (cart preview before an address exists). All arithmetic in `Money`; units are integers (grams, cm³) — read the schema for the column units.
- B1's checkout int tests currently pin "template freight quotes zero". When your port registers, those expectations change: list the affected B1 tests in your status file with the new expected numbers; the orchestrator updates them at merge. Do not edit `core/src/order/`.
- **Cities.** Read-only tree from the seeded `cities` table: `GET /api/v1/cities` (tree, strongly cached with an etag) and an admin tree for the template form. No city editing UI — the legacy add/edit/clean-cache routes are dropped; say so in invariants.
- **Express companies.** Admin list, enable/disable, sort; storefront/staff pick-list. No 一号通 sync. Stream B2 already ships `GET /admin-api/express-companies` and `GET /api/v1/staff/express-companies` from the `order` domain as a stop-gap (CR-1-b2): take both over — move the contracts into `contracts/src/shipping/`, keep paths and the `expressCompanyList` shape identical, export `listExpressCompanies` from `core/src/shipping/index.ts`, and list in your status file the B2 files the orchestrator must then delete.
- **Logistics tracking.** `LogisticsTracker` interface + the Aliyun market implementation (config group `shipping` with the AppCode as a secret field) + a fake for tests. `track(companyCode, trackingNo, phoneTail?)`, results cached in Redis for 30 min, outbound `fetch` only to the fixed Aliyun host with a timeout. Exposed to B2 through `core/src/shipping/index.ts`; B2 codes against your contract until you land. Storefront route `GET /api/v1/orders/:id/shipments/:shipmentId/tracking` belongs to B2 — you provide the service, not the route.

## 2. `cms`
Articles and article categories: admin CRUD (rich text through the kit's editor field if present, otherwise file a CR and use a textarea + `<AssetPicker>`), status, sort, optional related product (`articles.product_id` through the catalog's picker contract). Storefront: category list, article list (by category, hot, banner), detail with a view counter that is one atomic `UPDATE … SET views = views + 1`. Sanitise stored HTML on write (allow-list; no `script`, no event attributes, no `javascript:` URLs) — the old code stored it raw. Register the article link source with DIY's link registry (`@shop/core/diy` — read `status/g1.md`, "LinkSource").

## 3. `stats`
Admin dashboard (`home/header`, order chart, user chart, product rank) and the four statistics pages (user, product, trade, order). Read-only SQL over `orders`, `order_items`, `refunds`, `users`, `products` — this is the one domain allowed to read other domains' tables, **through views you define in `core/src/stats/stats.repo.ts` only**, never writing. Rules:
- Every figure has a written definition in `core/src/stats/DEFINITIONS.md` (what counts as revenue: paid amount minus executed refunds, by `paid_at` in Asia/Shanghai days). The legacy numbers disagreed with each other between pages; pick one definition per figure and use it everywhere.
- Retired figures are dropped, not zero-filled: balance, recharge, commission, points, membership, 资金流水 / 账单记录 pages (they were balance ledgers).
- Time bucketing in SQL with `date_trunc(… AT TIME ZONE 'Asia/Shanghai')`; the `Clock` supplies "now". Cache each dashboard block in Redis for 60 s keyed by range.
- Charts: `@ant-design/plots` is not in the workspace; list it (or your alternative) under new dependencies in your status file and keep chart components under `apps/web/src/admin/stats/`.
- Export (CSV) for the trade and product tables, by the mechanism CR-2-b2 settled: a JSON response `{filename, contentType, rowCount, truncated, content}` capped by a config value, turned into a download client-side. No binary responses, no XLSX.

## Invariants to prove
Freight: the legacy worked examples in `tests/regression/cases.md` §pricing/freight reproduced as table tests (mixed templates, free-shipping threshold by amount and by quantity, fixed-postage line, no-delivery refusal, null address). Stats: a seeded fixture of 6 orders / 2 refunds across a day boundary in Shanghai time gives the documented numbers on every block. CMS: sanitiser table test; concurrent views lose no increment.

## Fix, don't port
City cache-bust route (no cache to bust: the tree is immutable seed data); HTML stored raw; statistics pages each computing revenue differently; the empty 余额统计 shell.

## Out of scope
Electronic waybills, printers, 一号通, city editing, balance/points/commission statistics, PC pages.
