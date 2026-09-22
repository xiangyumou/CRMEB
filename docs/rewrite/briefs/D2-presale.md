# Stream D2 — Presale (split from D)

**Worktree** `../CRMEB-wt/ws-d2` · **Branch** `rewrite/ws-d2-presale` (cut from D's branch at the split; group-buy core and both contract sets are in your tree) · **Owns** `core/src/presale/**`, `app/admin-api/presale-*/**`, `app/api/v1/presales/**`, `app/admin/(shell)/presale/**`, `apps/web/src/admin/presale/**`, `apps/web/src/admin/menu/presale.menu.ts`, `worker/src/jobs/presale.*`, `packages/etl/src/mappers/presale.ts` if the brief asks for one, `docs/rewrite/status/d2.md` · D keeps `groupbuy` and will not touch your paths

Read `docs/rewrite/briefs/D-marketing.md` (§"How you attach to orders", §Presale, invariants, fix-don't-port), `docs/rewrite/status/d.md` (contracts table; decisions D already took about the order seams — reuse the same patterns: `PricingContributor`, activity `StockPort`, `onOrderPaid/Cancelled/Refunded`, `OrderKindHandler` for `presale`), and `core/src/groupbuy/` as the worked example of how D wired one activity kind. Contracts in `contracts/src/presale/` are merged and frozen — a change is a CR.

## Do
Full-payment presale only (deposit columns stay inert). Admin CRUD + orders view; storefront list/detail; window jobs open/close on time; presale stock as its own counter, every ledger that moves on create moves back on cancel and refund. Concurrency tests mandatory: last unit by two checkouts → one order; cancel racing pay on a presale order leaves all four ledgers balanced. Invariant rows under "presale" in `docs/rewrite/invariants.md`.

## Rules
Never push, never SSH, only your paths; commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`; lockfile never. When the orchestrator says D has merged, `git rebase --onto rewrite/integration <split-commit> rewrite/ws-d2-presale` and re-verify.
