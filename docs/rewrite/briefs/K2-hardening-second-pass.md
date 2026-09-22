# Stream K2 — hardening second pass

**Worktree** `../CRMEB-wt/ws-k2` · **Branch** `rewrite/ws-k2-hardening` (from `rewrite/integration` at or after `d62ea784b`) · **Owns** `next/guards/**`, `next/e2e/admin/**`, `next/load/**` (new), `docs/rewrite/AUDIT.md`, `docs/rewrite/status/k2.md`, `docs/rewrite/cr/CR-<n>-k2.md`, and — granted for this pass only — the **test files** it must add under `next/packages/core/src/**` (`*.test.ts` / `*.int.test.ts` beside the domain they exercise; no production code) and `next/apps/web/vitest.config.ts` for §5. **Read-only**: everything else. A defect is a CR to the owning stream; a defect in a merged stream with nobody in flight is a CR to the orchestrator, filed with the failing test committed as `test.fails`/`it.fails` so it flips green when fixed.

Read first: `docs/rewrite/status/k.md` § 第二遍（K2）— K1 wrote your checklist; `docs/rewrite/briefs/K-hardening.md` §4–5; `docs/rewrite/AUDIT.md`; `docs/rewrite/invariants.md` rows SEQ-001, MUT-001, STAB-001 (owner K) and AUTH-005 (owner C, but C has merged — it is yours, see `docs/rewrite/cr/CR-3-k.md`); `.github/workflows/next.yml` (`concurrency-soak`, `e2e-admin`, `guards` steps, all landed by J3, **never yet executed by GitHub Actions**); `deploy/next/compose.yml` (memory limits per service: the 1.6 GB budget); `next/packages/testing/src/**`.

Streams still in flight while you work: **H3** (uni-app third pass — the `uniapp` and `marker-reassignments` pending items are theirs), **I** (storefront Playwright, `next/e2e/storefront`), **W4T** (CR-2-e4 + a DIY ETL row). Do not do their work; the final all-`merged` guard run (§6) is the orchestrator's after they land — you make it possible.

## 1. AUDIT.md re-read (first, not last)

Every `pending:` and "re-check in K2" line (K-SEC-A4, P6, P7, R6, R10, U8; E1's SMS replay = plan §5 item 8; E2/E3's 19 公众号 admin routes, never read as an attacker; E4's new surfaces: `POST /api/v1/auth/phone/wechat-mini`, `GET /api/v1/wechat/mini-qrcodes`, six `/api/v1/staff/users*`, `POST /api/v1/visits`; F4's `POST /api/v1/attachments/base64` SSRF guard and `GET /api/v1/site/config`; B3's `gift-coupons` owner check and `POST /api/v1/staff/coupon-grants`; A2's ten `/api/v1/staff/products*`; J3's `/api/v1/readyz` — what it leaks in its 503 body). Each line ends as a test reference or a CR.

## 2. AUTH-005 / CR-3-k

The refund isolation test C never wrote: two shoppers, one refund, the stranger gets `REFUND_NOT_FOUND` on every shopper-facing read and write (same error as an unknown id), and the admin refund route refuses an unauthenticated call without completing the refund. Point the ledger row at it (the ledger is orchestrator-owned: put the exact row text in your status file; the orchestrator applies it at merge).

## 3. SEQ-001, MUT-001, STAB-001

- **SEQ-001** — a fixed-seed interleaving of real operations (checkout, gateway payment via the fake gateway, cancel, refund apply/approve, duplicate payment notification, the auto-cancel/auto-receive jobs, a group-buy join and a presale window flip) over three orders, asserting after every step: a cancelled order holds no collectible payment, a paid attempt carries its trade number, money taken at the gateway is recorded locally, completed refunds never exceed the payment, every stock layer keeps each unit in stock or sold, effects ledger has no duplicate `(order, event)`. Four seeds in the suite; a failure prints the seed and the full event log. Lives in `packages/core/src/order/order.sequence.int.test.ts` (or split per domain if the harness wants it).
- **MUT-001** — mutation testing of the ten protections listed in the ledger row: a script under `next/guards/scripts/mutations/` that applies each mutation to a temporary copy (git worktree or `cp -r` of the package into the scratchpad — never the live tree), runs the named test, and asserts it **fails**; a protection whose test does not fail is a finding. Wire it as `pnpm --filter @shop/guards mutations` and as a CR with YAML for a nightly job (do not edit the workflow).
- **STAB-001** — run the concurrency set (payment vs cancel, two-process refund approval, coupon races, virtual-card race, multi-item rollback, SEQ-001) 10× consecutively locally; report flakes with the seed/log. `groupbuy.concurrency.int.test.ts::leadership > passes to exactly one heir while a join is in flight` flaked once for J3 — reproduce or clear it. The 50-round CI job exists (CR-4-k); confirm its YAML actually invokes the suites it names.

## 4. Load smoke (K-hardening §4)

`next/load/` — an autocannon (or k6, if already vendored; do not add a binary download) script against the stack started the way `next/e2e/admin` starts it, but under `deploy/next/compose.yml`'s memory limits (`docker compose` with the same `limits`, or cgroup-limited `next start` — whichever gives honest RSS numbers on this machine; state which). Mix: DIY home, category, product detail, cart add, checkout preview, order create + fake pay, at modest concurrency (10–20 VUs, 60 s). Report p50/p95/p99, error rate, RSS of web/worker/postgres/redis against the 1.6 GB budget, and the top statements from `pg_stat_statements` — N+1s become CRs with the query text. The target host is 2 cores / 3.6 GB; note the machine you ran on.

## 5. Pin the `@shop/web` unit flake

Under turbo alongside `build`, the web unit suite occasionally dies with react-scheduler `window is not defined`; standalone it passes every time (654). Find the cause (environment per file? a test that imports a client component into a node environment? worker pool + jsdom teardown?) and fix it in `apps/web/vitest.config.ts` or the offending test file — reproduce it first (`pnpm turbo run test:unit build --force` in a loop) and show the fix survives 10 runs.

## 6. Guards: make the final run possible

Every pending list must be reducible to empty once H3, I and W4T merge: `pending-implementations.ts` (already empty — delete the file if nothing imports it), `HAND_BUILT`'s SSE item, `AUDIT_EXEMPT`'s 22 `cr` entries (CR-5-k, CR-17-k — both closed: delete the entries and prove the guard still passes), `FETCH_ALLOW`'s `wechat-oa/` entry (E3 merged: is the outbound call behind the seam now?), CR-7-k's `component-fixtures` check (is `respondWith` landed?). Add the admin e2e specs K1 deferred: 预售 (D2), 统计 (F3), 公众号 (E3), 通知 (N1) — `next/e2e/admin/README.md` has the list. Leave `streams.ts` as it is; the orchestrator flips the last three.

## Done

From `next/`: `pnpm turbo run gen typecheck lint test:unit build`, `pnpm turbo run test:int`, `pnpm exec prettier --check .`, `pnpm guards` (0 failures; pending only on H3, I, W4T), `pnpm --filter @shop/e2e-admin e2e` (all specs including the new ones), `pnpm --filter @shop/guards mutations`, the 10× stability run, the load report committed under `next/load/REPORT.md`. `docs/rewrite/status/k2.md`: the AUDIT outcome table, the three ledger rows' test ids (exact text for the orchestrator), the flake root cause, the load numbers, CRs filed. Final report: the same, plus the final commit hash.

## Rules

Never push, never SSH, never touch the production host, never modify `crmeb/`, `template/**`, `next/{apps,packages}/**` production code, `packages/db/**`, or another stream's worktree. Never run the load smoke against anything but the local stack. Commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
