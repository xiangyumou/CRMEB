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
| A, C, F1 (wave 1) | in progress | `rewrite/ws-{a,c,f1}-*` |
| G2 DIY panels | in progress | `rewrite/ws-g2-panels` |
| B2 fulfilment, H uni-app API layer | dispatched 2026-09-22 | `rewrite/ws-b2-fulfillment`, `rewrite/ws-h-uniapp` |
| D, E1, E2 (wave 2) | waiting (D on A, E2 on C, E1 on a free slot) | — |
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
