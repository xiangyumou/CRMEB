# Stream F3 — Statistics (split from F2)

**Worktree** `../CRMEB-wt/ws-f3` · **Branch** `rewrite/ws-f3-stats` (cut from F2's branch at the split, so shipping + cms + all three contract sets are already in your tree) · **Owns** `core/src/stats/**`, `app/admin-api/stats*/**` (whatever the stats contracts' paths are), `app/admin/(shell)/stats/**` and the dashboard home page, `apps/web/src/admin/stats/**`, `worker/src/jobs/stats.*`, `docs/rewrite/status/f3.md` · F2 keeps `shipping` and `cms` and will not touch your paths

Read `docs/rewrite/briefs/F2-ops-content.md` §3 (`stats`), the invariants line for stats, and `docs/rewrite/status/f2.md` (contracts table, the charts-dependency TBD, the permission atoms F2 already declared under `stats:*`). The contracts in `contracts/src/stats/` are merged and frozen — a change is a CR.

## Do
Everything §3 says: `stats.repo.ts` views only (read-only SQL over orders / order_items / refunds / users / products; never a write), `DEFINITIONS.md` with one definition per figure used everywhere, Shanghai-day bucketing in SQL, 60 s Redis cache keyed by range, dashboard blocks + the four pages, CSV-in-JSON exports capped by config (CR-2-b2 shape). Charts: pick the package, record it under new dependencies in `status/f3.md` (do not commit the lockfile — the orchestrator installs). Fixture test: 6 orders / 2 refunds across a Shanghai day boundary give the documented numbers on every block. Retired figures dropped, not zero-filled.

## Rules
Never push, never SSH, only your paths; commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. When the orchestrator says F2 has merged, run `git rebase --onto rewrite/integration <split-commit> rewrite/ws-f3-stats` (the split commit is named in your dispatch message) so only stats commits remain on your branch, then re-run gen/typecheck/lint/tests.
