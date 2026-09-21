# Rewrite status

Maintained by the orchestrator. Per-stream detail lives in `status/<ws>.md`.

| Gate | State |
|---|---|
| G0 foundation freeze (`rewrite-p0-freeze`) | in progress |
| G1a contract PRs merged | not started |
| Cutover | not started |

| Stream | State | Branch |
|---|---|---|
| P0-S business schema | merged (`77eee035`) | `rewrite/ws-p0s-schema` |
| P0-A platform runtime | in progress | `rewrite/ws-p0a-platform` |
| P0-B admin shell and kit | merged (`d029a973`); Playwright smoke deferred to K | `rewrite/ws-p0b-shell` |
| Golden slice (coupon) | brief written; waiting on P0-A | `rewrite/ws-golden-coupon` |
| A, B1, C, F1, G1 (wave 1) | waiting on G0 | — |
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
