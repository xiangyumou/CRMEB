# Rewrite status

Maintained by the orchestrator. Per-stream detail lives in `status/<ws>.md`.

| Gate | State |
|---|---|
| G0 foundation freeze (`rewrite-p0-freeze`) | **passed** 2026-09-21 |
| G1a contract PRs merged | passed 2026-09-22 — coupon, A, B1, C, G1, F1 in (186 routes parse) |
| Cutover | not started |

| Stream | State | Branch |
|---|---|---|
| P0-S business schema | merged (`77eee035`) | `rewrite/ws-p0s-schema` |
| P0-A platform runtime | merged (`08135d13`) | `rewrite/ws-p0a-platform` |
| P0-B admin shell and kit | merged (`d029a973`); Playwright smoke deferred to K | `rewrite/ws-p0b-shell` |
| Golden slice (coupon) | merged (`ac928729`) | `rewrite/ws-golden-coupon` |
| G1 DIY core | merged; panel API frozen (see `status/g1.md`) | `rewrite/ws-g1-diy` |
| B1 checkout | merged (`97ecc873`, fix-up `fa7f825b`) | `rewrite/ws-b1-checkout` |
| F1 system and storage | merged (`94f5720d`) | `rewrite/ws-f1-system` |
| A catalog | merged 2026-09-23 | `rewrite/ws-a-catalog` |
| C payment and refund | merged (`f02d4d56`); fix-up pass running (CR-4-c, CR-5-c, configText removal) | `rewrite/ws-c-payment` |
| G2 DIY panels | merged (`978af854`) | `rewrite/ws-g2-panels` |
| B2 fulfilment | merged 2026-09-23 | `rewrite/ws-b2-fulfil` |
| H uni-app API layer | in progress | `rewrite/ws-h-uniapp` |
| G3 DIY follow-up; fix-ups for B1 (CR-7-c, CR-3-b2), C (CR-4/5/6-c) | in progress | `rewrite/ws-g3-diy-followup`, stream branches |
| E1 user and login; kit maintenance (CR-1..5-f1) | dispatched 2026-09-23 | `rewrite/ws-e1-user`, `rewrite/ws-kit-f1crs` |
| D, E2 (wave 2) | waiting (D on A, E2 on C) | — |
| F2, I, J (wave 3) | waiting | — |
| K (wave 4) | waiting | — |

## Decisions log

- 2026-09-21 — Plan approved. Branch `rewrite/integration` cut from `master` at `01bb567e`.
- 2026-09-21 — Ant Design 6.x (current major) used; the choice made was "Ant Design", and 6 supports React 19 / Next 16.
- 2026-09-21 — Phase 0 split three ways (schema / platform / admin shell) so it runs in parallel; the orchestrator wrote the shared seams (`_conventions`, `db/_shared.ts`, `db/client.ts`) first.
- 2026-09-21 — `docs/rewrite/invariants.md` generated from `tests/regression/cases.md` (131 rows) as the parity ledger.
- 2026-09-21 — P0-S merged. No order splitting (shipments + `order_items.shipped_quantity`); one open refund per order item via partial unique index; `virtual_card` items limited to quantity 1. CR-1-p0s (pg_trgm, admin FKs) to be applied when P0-A lands.
- 2026-09-21 — P0-B merged. CR-1-p0b applied (`ParamsOf`/`QueryOf`/`BodyOf` under `exactOptionalPropertyTypes`). Sort convention `sortBy` + `sortOrder`, helper `sortQuery`. Lint runs on a TypeScript 6 alias until typescript-eslint supports TS 7.
- 2026-09-21 — Executors hit the account usage limit once with three running; wave 1 starts with four and scales with headroom.
- 2026-09-21 — P0-A merged and the three streams wired (`67bd50ff`): generic `effects` ledger kept, `order_effects` dropped; admin and user FKs wired; `0000_init` generated with `pg_trgm`. Verified: typecheck, lint, format, build, 304 unit + 121 integration tests, 22 constraint checks.
- 2026-09-21 — Golden slice merged; its CRs applied: route files mirror the contract path (CONVENTIONS fixed), `@shop/core/<domain>` directory imports, worker tests no longer enumerate job names, `next/navigation` stubbed globally in web tests. Gate G0 passed: typecheck, lint, format, build, 352 unit + 199 integration tests, 18 routes' examples. Tag `rewrite-p0-freeze`.
- 2026-09-22 — CR-1-c applied: `ORDER_STATUSES` now mirrors the `orders_status` enum (`pending_payment`, `refunded`); only an unpaid order can be cancelled, a paid one leaves through a full refund. CR-2-c: config groups live in `core/src/<domain>/`. CR-3-c: stream C owns the fake WeChat gateway. Wave 1 contracts for A, B1, C merged early (126 routes parse).
- 2026-09-22 — Second usage-limit interruption (four executors); all resumed from committed checkpoints, nothing lost.
- 2026-09-22 — G1 merged (33 component schemas, DIY core, 18 routes, editor shell, 30 previews, 3 reference panels, ETL mapper; 350 tests). CR-1-g1 decided: `diy_pages.content` stays `jsonb`; "byte-compatible" means no key or value is ever changed on the wire, and ETL verification compares parsed JSON, not text. Mock server now prefers static path segments over `:param`. Workspace: 622 unit + 240 integration tests, 149 routes.
- 2026-09-22 — B1 merged (14 routes, 111 tests, six races). CR-1-b1 applied: `orders.idempotency_key` with a partial unique index, folded into `0000_init`; the code still claims the key through the effects ledger and moves to the column in the fix-up pass. CR-3-b1: `orders.coupon_discount` holds every goods-level discount. CR-4-b1: PRICE-001/002 retired with points; STOCK-004 and QUEUE-008 go to stream D. Known gap until F2: template freight quotes zero.
- 2026-09-22 — B1 fix-up merged (`fa7f825b`): duplicate submit is stopped by `orders_idempotency_uq`, with a fast-path read of the key before pricing so a sequential replay returns the first order instead of `ORDER_EMPTY`. F1 contracts merged early (system + storage, 37 routes); gate G1a passed with 186 routes. H and B2 unblocked.
- 2026-09-22 — Stream A's CRs decided. CR-1-a: `StockPort.release` takes `options?: {committed, refundId}` — `committed` brings `sales` down with the restock in one statement; `refundId` makes a refund release idempotent per refund, because an order is refunded line by line and a per-order key would swallow the second partial refund. CR-2-a: `OrderFactsPort` moves into `order/ports.ts` as the one inbound seam; A's read-only bridge moves into the order domain at A's merge. CR-3-a: superseded by CR-2-c (config groups live in `core/src/<domain>/<group>.config.ts`); `system/index.ts` stays F1's.
- 2026-09-23 — Third usage-limit interruption (six executors); all resumed from committed checkpoints. B2 contracts merged early (42 routes; 228 in total). CR-1-b2: B2 keeps `express-companies` until F2 lands, then F2 takes both routes over with identical paths and shapes (written into F2's brief). CR-2-b2: exports stay CSV-in-JSON, capped by config — no binary escape hatch in `handle()`, no XLSX; F2's statistics exports use the same mechanism.
- 2026-09-23 — F1 merged (37 routes, 9 config groups, 8 pages, 193 tests; no new dependencies, no thumbnails). Workspace: 784 unit + 422 integration tests, 228 routes. CR-1..5-f1 accepted and handed to a kit-maintenance executor (`visibleWhen` and `section` on config fields, `profile:*` implicit atoms, the generated config-group bucket, multipart in `callRoute`). CR-6-f1 decided: the domain that owns the behaviour owns the setting — `trade` is dissolved after A, C, B2 and F2 land (receive/review timers and the staff roster → `order`; stock warning → `catalog`; refund reasons and return address → `refund`; free-shipping threshold → `shipping`); until then it stays as it is.
- 2026-09-23 — A merged (65 routes, 45 route files, 11 admin pages, 2 jobs, ETL mapper, 202 tests, 12 races; no new dependencies). Workspace: 900 unit + 508 integration tests. A config group's `permission` is its read atom (write is derived) — catalog's fixed at merge. Open after this merge: (1) domain registrations are import side effects, so a route only gets the ports of the domains it imports — the kit-maintenance executor adds a generated `@shop/core/domains` bucket loaded by `handle.ts` and the worker; (2) `catalog.order-bridge.repo.ts` stays in catalog until B2 lands, because A's `catalog.autoReview` and B2's received → completed job overlap and must be reconciled together; (3) B1's fallback catalogue adapter is removed in the same pass.
- 2026-09-23 — G2 merged (27 panels; all 30 creatable keys have one; 282 panel tests). CR-1/2/3-g2 open, to be decided with G1's executor.
- 2026-09-23 — C merged (29 routes + 2 webhooks, first-party WeChat client, 4 sweeps, 交易 console, 148 tests, 7 races; no new dependencies). Workspace: 1258 unit + 585 integration tests. CR-6-c fixed platform-wide: `@shop/db` makes json/jsonb reach drizzle as text so they are parsed once (a stored `"1900000001"` no longer reads back as a number); a raw `db.execute` now gets jsonb as text. CR-5-c: `refunds.return_address jsonb` folded into `0000_init`. CR-8-c (nothing calls `register<Domain>Domain()`) → the generated `@shop/core/domains` bucket, with the kit-maintenance executor. CR-7-c (cancel must call `closeOrderPayments` before its transaction) → B1's executor. CR-4-c (effects list + un-park) → C's executor, with leave to edit `core/src/effects`.
- 2026-09-23 — F1 race found at merge: folder delete vs concurrent upload both succeed under READ COMMITTED (the NOT EXISTS guard cannot see the other transaction). Back with F1's executor: serialise on the category row.
- 2026-09-23 — G2's CRs decided: CR-1-g2 accepted (eight editors promoted into `fields/`); CR-2-g2 option 3 (超级组件 leaves the palette — no production or demo page uses it and its inner designer is unscheduled; existing nodes stay editable and round-trip); CR-3-g2 accepted (factory defaults gain the groups the legacy panels inject on open; panels still never write on open). Brief `G3-diy-followup.md`, dispatched when a slot frees; it also swaps the DIY id-input pickers for real catalog pickers.
- 2026-09-23 — F1's storage race fix merged (both sides lock the category row; 30-round tests). B2 merged (40 route handlers, 3 admin pages, 141 tests, 10 races; no new dependencies). Workspace int: core 569, web 105. CR-3-b2 accepted: a `virtual_card` line is quantity 1 — refused in cart and checkout (B1 fix-up). Integration pass still owed once the fix-ups land: register C's refund service behind B2's `StaffRefundPort`, prove ship-vs-refund with both real services, move the order-facts bridge into the order domain and reconcile A's `catalog.autoReview` with B2's received → completed job, delete B1's fallback catalogue adapter.
