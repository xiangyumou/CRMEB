# Stream R5 — wave-6 tail: what R1–R4 handed back, STAB-001 to 10/10, and the CR sweep

**Worktree** `../CRMEB-wt/ws-r5` · **Branch** `rewrite/ws-r5-wave6-tail` (cut by the orchestrator from `rewrite/integration` after R1–R4 merged). Read `docs/rewrite/briefs/R-k2-findings.md` § "Common rules" — they apply here unchanged (no push, no SSH, no real WeChat / SMS / Aliyun, commit per unit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, no sub-agents, status in `docs/rewrite/status/r5.md`). Then read `docs/rewrite/status/r1.md`, `r2.md`, `r3.md`, `r4.md` (their merge notes are the source of most units below).

**Owns:** `next/packages/core/src/{groupbuy,order,shipping,effects}/**` (not `order/ports.ts`), `next/packages/core/scripts/gen-config-groups.ts`, `next/apps/web/src/server/{handle,container}.ts` (+ tests), `next/packages/contracts/src/catalog/errors.ts`, `next/guards/src/checks/{tx-pool,banned}.ts` (granted: delete entries / fix a comment, no new checks), `next/e2e/admin/{playwright.config.ts,src/**,scripts/**}`, `deploy/next/**` (env passthrough only), `docs/rewrite/cr/**`. **Read-only:** `template/**` and `next/e2e/storefront/**` (H4 is in flight there), `invariants.md`, `STATUS.md`, `pending-edits.ts`, `streams.ts`, `order/ports.ts`, `contracts/src/_conventions/**`, `apps/web/src/admin/kit/**`.

## 1. CR-2-r1 — the group-buy join/refund deadlock, then STAB-001 to 10/10

Do what the CR asks: in `groupbuyOrderHooks.afterCreate`, when joining a team, `repo.lockGroup(tx, groupId)` **before** the activity-stock loop, and re-check `forming` under the lock (a join into a team that failed a moment ago is refused with the existing error). Add a test for the re-check. Then run the STAB-001 soak — from `next/packages/core`: `timeout 900 pnpm exec vitest run --project int --sequence.seed=<n> --sequence.shuffle concurrency.int.test.ts order.sequence.int.test.ts` for seeds **1–10**, one after the other, and record every round in the status. Ten clean rounds earn the row: put the exact `ported` STAB-001 row text in the status (its proof is the soak command over seeds 1–10, the way MUT-001 names its script). A new failure in a file you own is yours to fix; outside it, CR it with the seed.

## 2. CR-1-r1 — three config reads inside a transaction

`order.checkout.service.ts` (`buildDraft`), `shipping.freight.port.ts` (the freight quote) and `autoDeliver` read `ctx.config.get(...)` while holding the checkout / delivery transaction. Use `ctx.config.getIn(tx, group)` (R1's CR-53-k2 API) or hoist the read before the transaction. Then delete the three `TX_POOL_OWED` entries in `guards/src/checks/tx-pool.ts`; `pnpm guards tx-pool` must pass with none owed.

## 3. CR-1-r2 — the paid hook's position

Option 2: the generator (`core/scripts/gen-config-groups.ts`) emits `registerOrderDomain()` first in `registerAllDomains()`, with a comment saying why (the one domain whose hooks others build on). Add the `resetOrderPorts()` + `registerAllDomains()` case to `order/order.stock.hooks.test.ts` asserting `order:commit-sale` runs first. Regenerate; mark the CR RESOLVED.

## 4. CR-1-s — `handle()` answers `If-None-Match` with a 304

Apply the patch in `docs/rewrite/cr/CR-1-s.md` (or its equivalent against today's `handle.ts`: R4 changed the audit path and R3 `clientIp()` since it was written — keep both). Then finish CR-42-k2's second half: the DIY home route answers 304 on a matching `If-None-Match` from the cached entry, with a route test. Any other route whose contract already advertises an ETag gets the same treatment only if it is a one-liner; list the rest.

## 5. Small items from the R1–R4 merge notes

- `apps/web/src/server/container.ts` passes `onConnectionError` with its logger, as the worker does (R1 note 7), with a test if one fits.
- Delete `CATALOG_CARD_POOL_EMPTY` from `contracts/src/catalog/errors.ts` if nothing references it (grep `template/uni-app` too; read-only there — if the app names it, leave it and say so).
- `guards/src/checks/banned.ts`: the doc comment still says `fetchImpl`; the seam is `transport` now (R3 note 7).
- `deploy/next/**`: pass `DB_POOL_ACQUIRE_TIMEOUT_MS` and `DB_IDLE_IN_TX_TIMEOUT_MS` through compose to web and worker (defaults unchanged) and document them where the other `DB_*` variables are.
- **The admin e2e must never drive a server it did not start.** Today `reuseExistingServer: !process.env.CI` plus the default port 3210 and the shared stack file in `tmpdir()` let one worktree's run drive a sibling's stack (it cost R1, R2 and the orchestrator a failed run each). Make reuse opt-in (`SHOP_E2E_REUSE=1`), and default the port and stack file to something unique per checkout (e.g. derived from a hash of the repo path) so two worktrees never collide by default. Document it in the suite's README. The storefront suite has the same problem; do **not** edit it (H4 owns it) — write the equivalent change as a CR for the orchestrator to apply after H4 merges.

## 6. The CR sweep

List every `docs/rewrite/cr/*.md` whose status is not RESOLVED / closed / decided (skip CR-4-i, CR-5-i, CR-7-i — H4's). For each one, check it against today's code and do exactly one of:

1. **Already done** by a later stream — mark it **RESOLVED** with the evidence (the commit that did it, or the test id / file that proves it). Many of the `-h2`, `-e2`, `-e3`, `-e4`, `-b1`, `-p0b` CRs are probably in this bucket: later waves built the routes and `MARKER_REASSIGNMENTS` is empty.
2. **Small and inside your ownership** — fix it, test it, mark it RESOLVED.
3. **Otherwise** — leave it open and write, in the status, one line per CR: what is still missing, who should own it, and your recommendation (build / drop / product question). The orchestrator decides.

Do not re-open anything. Do not touch `invariants.md`: if a CR implies a ledger change, put the text in the status.

## Done

As in the common rules: from `next/`, `pnpm turbo run gen typecheck lint test:unit build`, `pnpm turbo run test:int --force --concurrency=4`, `pnpm exec prettier --check .`, `pnpm --filter @shop/contracts check:examples`, `pnpm guards` (0 failures; pending only on H4 and R5), `pnpm --filter @shop/guards mutations` (10/10), rebuild web, then `pnpm --filter @shop/e2e-admin e2e` on your own port. Final report: per unit its status and commit, the STAB-001 ten rounds, the STAB-001 row text, the sweep table (bucket per CR), the storefront-reuse CR, the final commit hash and merge-time notes.
