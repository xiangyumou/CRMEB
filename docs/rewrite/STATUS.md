# Rewrite status

Maintained by the orchestrator. Per-stream detail lives in `status/<ws>.md`.

| Gate | State |
|---|---|
| G0 foundation freeze (`rewrite-p0-freeze`) | in progress |
| G1a contract PRs merged | not started |
| Cutover | not started |

| Stream | State | Branch |
|---|---|---|
| P0-a platform | in progress | `rewrite/ws-p0a-platform` |
| P0-b admin shell | in progress | `rewrite/ws-p0b-shell` |
| Golden slice (coupon) | waiting on P0-a, P0-b | — |
| A, B1, C, F1, G1 (wave 1) | waiting on G0 | — |
| H | waiting on G1a | — |
| D, B2, E1, E2, G2 (wave 2) | waiting | — |
| F2, I, J (wave 3) | waiting | — |
| K (wave 4) | waiting | — |

## Decisions log

- 2026-09-21 — Plan approved. Branch `rewrite/integration` cut from `master` at `01bb567e`.
- 2026-09-21 — Ant Design 6.x (current major) used; the choice made was "Ant Design", and 6 supports React 19 / Next 16.
