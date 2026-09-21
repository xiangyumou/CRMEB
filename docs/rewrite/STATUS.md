# Rewrite status

Maintained by the orchestrator. Per-stream detail lives in `status/<ws>.md`.

| Gate | State |
|---|---|
| G0 foundation freeze (`rewrite-p0-freeze`) | **passed** 2026-09-21 |
| G1a contract PRs merged | A, B1, C, coupon in (126 routes); F1, G1 pending |
| Cutover | not started |

| Stream | State | Branch |
|---|---|---|
| P0-S business schema | merged (`77eee035`) | `rewrite/ws-p0s-schema` |
| P0-A platform runtime | merged (`08135d13`) | `rewrite/ws-p0a-platform` |
| P0-B admin shell and kit | merged (`d029a973`); Playwright smoke deferred to K | `rewrite/ws-p0b-shell` |
| Golden slice (coupon) | merged (`ac928729`) | `rewrite/ws-golden-coupon` |
| G1 DIY core | in progress (started early) | `rewrite/ws-g1-diy` |
| A, B1, C, F1 (wave 1) | dispatched | `rewrite/ws-{a,b1,c,f1}-*` |
| H | waiting on G1a | — |
| D, B2, E1, E2, G2 (wave 2) | waiting | — |
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
