# Orchestrator handoff — 2026-09-24

Written by the previous orchestrator session (Claude Fable 5.1) for the next one. Everything below is
also reflected in `STATUS.md` (per-stream table + decisions log) and in the orchestrator's memory
files; this page is the one-stop summary of **where the rewrite stands, what is in flight, and what
the next session does first**.

## 1. What this is

The CRMEB core shop is being rewritten as `next/` (Next.js 16 App Router, TypeScript strict, Drizzle
on PostgreSQL 17, Redis 7 + BullMQ, antd 6, Vitest + Testcontainers, Playwright). The plan is
`PLAN.md`; conventions are `CONVENTIONS.md`; ownership is `OWNERSHIP.md`; the parity ledger is
`invariants.md`; per-stream detail is `status/<ws>.md`; change requests are `cr/CR-<n>-<ws>.md`.

Execution model: **one orchestrator session, parallel executor agents** (Agent tool, background),
each in its own git worktree `../CRMEB-wt/ws-<id>` on branch `rewrite/ws-<id>-<slug>`. The
orchestrator writes briefs (`briefs/<ID>-*.md`), squash-merges finished branches into
`rewrite/integration` (never pushes, never opens PRs unless asked), runs the merge gate, and keeps
`STATUS.md` + `guards` in step. Concurrency cap **5**. Since 2026-09-24 the user wants **every
executor on Opus 5.5 at high effort** — no Sonnet.

## 2. State of `rewrite/integration` (HEAD `607d02912`)

Merged (all verified with the full gate): P0-S/A/B, golden, A, A2, B1, B2, B3, C, D, D2, E1, E2,
E3, E4, F1, F2, F3, F4, G1, G2, G3, H, H2, J, J2, J3, K1, kit, N1, S, W4T, CR-2-k.

Last full gate on HEAD: `pnpm turbo run gen typecheck lint test:unit build` green (web unit suite
663 — run standalone if it dies under turbo, known flake, K2 §5 pins it); int suites core 1131 /
web 231 / etl 10 (+382 unit) / worker 6 / testing 9; `prettier --check` clean; 426 routes' examples
parse; `pnpm guards` **10 checks, 0 failures, 53 pending on H3, I, K**; admin Playwright 30/30.

## 3. In flight — three executors, all killed by a usage-limit 429, all with committed WIP

Nothing is lost; each worktree holds its commits. **None of the three has written its
`docs/rewrite/status/<ws>.md` yet** — the resume prompt must not assume one exists.

| Stream | Worktree / branch | Brief | Committed so far | Uncommitted | Left |
|---|---|---|---|---|---|
| **H3** uni-app third pass | `../CRMEB-wt/ws-h3`, `rewrite/ws-h3-uniapp-third-pass`, HEAD `1fe0f7470` | `briefs/H3-uniapp-third-pass.md` | captcha deleted with all call sites; A2's ten staff product routes bound; 3 of 7 dangling imports; wave-4 example fixtures refreshed | `template/uni-app/api/admin.js`, `api/mappers/staff.js` — half-written mappers for E4's six `/api/v1/staff/users*` routes | staff users ×6, gift-coupons, staff coupons, coupon-grants re-point, groupbuy summary, mini-qrcodes ×3, phone/wechat-mini, site/config (+5 re-points), base64 ×2 re-point, diy ×3; the three wrappers; 4 imports; empty `MARKER_REASSIGNMENTS`; tests; status file |
| **I** storefront e2e | `../CRMEB-wt/ws-i`, `rewrite/ws-i-storefront-e2e`, HEAD `726175337` (integration merged in) | `briefs/I-storefront-e2e.md` | whole harness (stack, seed, fake-gateway control, H5 build, serve), shared flow helpers, the eight journey specs, CR-2-i (presale unreachable), CR-3-i (no cross-process fake SMS) | none (clean) | run the turbo gate + prettier, run `pnpm --filter @shop/e2e-storefront test` for real, un-`fixme` journeys whose routes landed (E4/F4/B3 all merged), CR-1-i (CI YAML), `status/i.md` with the journey matrix, run time/memory, `data-testid` requests for H3 |
| **K2** hardening second pass | `../CRMEB-wt/ws-k2`, `rewrite/ws-k2-hardening`, HEAD `3b1cdb06d` (integration merged in, before W4T) | `briefs/K2-hardening-second-pass.md` | AUTH-005 refund isolation test (CR-3-k) | `next/packages/core/src/order/order.sequence.int.test.ts` — SEQ-001 driver, half-wired (`currentStatuses` / `currentRefunds` into the loop) | finish SEQ-001; §1 AUDIT re-read; MUT-001, STAB-001; §4 load smoke under compose limits; §5 web unit flake; §6 guard lists + four deferred admin e2e specs; status file |

CRs open for the orchestrator: none. CR-2-i / CR-3-i are I's findings for the owning streams —
read them at I's merge (both streams are merged, so the orchestrator either fixes on integration or
files them under K2's "CR to the orchestrator" rule).

## 4. What the next session does, in order

1. Read this file, `STATUS.md` (table + last ten decision-log lines), and the memory files.
2. **Re-spawn the three executors on Opus 5.5 high** (fresh Agent calls — the old agents belong to
   the dead session). Use the resume prompts in §6 verbatim; each starts with `git status`, reads
   its brief, finishes the uncommitted unit, then continues to its Definition of Done.
   Executors' commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
3. While they run, nothing else is queued. Optional orchestrator chores: none pending.
4. **Merge each as it finishes** with the gate in §5. Merge-time specifics:
   - **H3**: flip `H3: 'merged'` in `next/guards/src/lib/streams.ts`; `MARKER_REASSIGNMENTS` must be
     empty; `uniapp` check 0 pending; both uni-app builds clean of "export … was not found".
   - **I**: may bring `next/pnpm-lock.yaml` changes for `@shop/e2e-storefront` only (`pnpm install
     --offline` after merge); flip `I: 'merged'`; run its suite (`pnpm --filter @shop/e2e-storefront
     test`) as part of the gate from then on; apply CR-1-i's job to `.github/workflows/next.yml`.
   - **K2**: flip `K: 'merged'`; apply the ledger rows it hands over (AUTH-005, SEQ-001, MUT-001,
     STAB-001 test ids) to `invariants.md`; delete any pending list that is now empty; then the
     **final guard run must be 0 failures / 0 pending**.
5. After all three: the final all-merged guard run, then cutover prep per `deploy/next/cutover.md`
   (J3's runbook). Two things need the **user's explicit OK** before they happen: an ETL rehearsal
   against a copy of the production dump (data egress from the production host, which is read-only
   by default), and any push / PR (nothing has ever been pushed; `next.yml` has never run on GitHub).

## 5. The merge gate (run from `next/`)

```
export PATH=/tmp/claude-1000/-home-xiangyu-Projects-CRMEB/<session>/scratchpad/bin:$PATH   # pnpm 12.5.1 shim, or any pnpm 12
git merge --squash rewrite/ws-<id>-<slug>          # from the repo root; resolve conflicts keeping HEAD for guards/kit files unless the stream owns them
pnpm turbo run gen typecheck lint test:unit build   # web unit flake: rerun `pnpm --filter @shop/web test:unit` standalone
pnpm turbo run test:int --force --concurrency=4
pnpm exec prettier --check .
pnpm --filter @shop/contracts check:examples
pnpm guards                                          # or from next/guards
pnpm turbo run build --filter @shop/web && pnpm --filter @shop/e2e-admin e2e   # the e2e stack serves the standalone build; a stale build hides fixes
node ../tests/static/release-pipeline-guard.cjs && node ../tests/static/next-migration-guard.cjs
```

Commit with the stream's `Co-Authored-By` plus the orchestrator's own; then a `docs(status)` commit
updating the stream row and the decisions log. Remove the worktree (`git worktree remove`) only
after the merge commit exists.

## 6. Resume prompts for the three executors

Common preamble for each (fill in the stream block):

> You are the executor for workstream **<ID — title>** of the CRMEB Next.js rewrite, resuming work a
> previous executor started before it was killed by a usage limit. Its progress is committed in your
> worktree; nothing is lost. **Worktree:** `/home/xiangyu/Projects/CRMEB-wt/ws-<id>`, branch
> `rewrite/ws-<id>-<slug>`. Work ONLY there; never touch `/home/xiangyu/Projects/CRMEB` or any other
> worktree. **Resume protocol:** (1) `git status`, `git log --oneline -8`; (2) read
> `docs/rewrite/briefs/<brief>.md` in full — it is binding (ownership, units, Definition of Done,
> rules: never push, never SSH, never modify `crmeb/`, or paths outside your ownership); (3) finish
> the uncommitted unit described below, commit; (4) `git merge rewrite/integration` (HEAD `607d02912`
> or later); (5) continue to the Definition of Done. **Environment:** pnpm 12.5.1 (`corepack` or the
> shim), Node 24, Docker for Testcontainers/compose, Playwright chromium in `~/.cache/ms-playwright`;
> rebuild web (`pnpm turbo run build --filter @shop/web`) before any Playwright run; other executors
> build in sibling worktrees — mass `ERR_CONNECTION_REFUSED` / OOM-killed builds are contention,
> rerun when load drops; everything offline, fakes from `@shop/testing` only. Commit after every unit
> with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Write `docs/rewrite/status/<ws>.md`
> as you go (it does not exist yet). **Final report:** what the brief's Done section asks for, plus
> the final commit hash and merge-time notes for the orchestrator.

Stream blocks:

- **H3** — brief `H3-uniapp-third-pass.md`. Uncommitted: `template/uni-app/api/admin.js` and
  `api/mappers/staff.js`, half-written mappers/bindings for E4's six `/api/v1/staff/users*` routes
  (field table in `docs/rewrite/status/e4.md`). Then `pnpm guards` from `next/` — the `pending(H3)`
  list is the remaining worklist and the exit test. uni-app uses `npm` from `template/uni-app`
  (`npm test`, `npm run build:h5`, `npm run build:mp-weixin`). Only `next/` file it may edit:
  `next/guards/src/lib/marker-reassignments.ts` (delete entries whose marker it deleted). If
  `docs/rewrite/status/i.md` exists by the end, add the `data-testid`s it requests.
- **I** — brief `I-storefront-e2e.md`. Tree clean. Next: turbo gate + prettier, then run the suite
  for real; every wave-4 route is merged now, so journeys parked with `test.fixme` for E4/F4/B3
  routes are un-parked; CR-1-i (CI YAML) still to write; `status/i.md` with the journey matrix,
  wall-clock time and memory, and every `data-testid` request for H3 (running concurrently). May
  commit `next/pnpm-lock.yaml` for its own package only.
- **K2** — brief `K2-hardening-second-pass.md`. Uncommitted:
  `next/packages/core/src/order/order.sequence.int.test.ts` (SEQ-001 fixed-seed driver; the loop
  still needs `currentStatuses` / `currentRefunds` wired in and dead helpers removed). Then the
  remaining sections in the brief's order (§1 AUDIT re-read first). Test-file grant under
  `packages/core` and `apps/web/vitest.config.ts` only; never production code. Never run load
  against anything but the local stack.

## 7. Standing rules the next orchestrator must keep

- Production host `ubuntu@43.142.105.205` is **read-only by default**; anything beyond a read-only
  query needs the user's explicit confirmation; never print secret values from `eb_system_config`.
- Executors never push, never SSH, work only in their own worktree; `crmeb/` and `template/admin`
  are read-only behavioural references; `template/uni-app` pages are not rewritten (only `api/`,
  `utils/request.js`, minimal call-site fixes).
- Orchestrator-only files: root configs, `packages/db/**`, `core/src/kernel/**`, `core/order/ports.ts`,
  `contracts/src/_conventions/**`, `apps/web/src/admin/kit/**`, CI, `STATUS.md`, `invariants.md`
  (granted per stream when a brief says so).
- No real WeChat / SMS / Aliyun calls anywhere; no production dump or credential in the repo, logs
  or snapshots.
- Rules learned (see `STATUS.md` decisions log for the why): no fallback behind an unregistered
  port; ports reading inside a caller's tx take `db` first; `dedupeKey` is opaque to producers
  (`toJobId` in the BullMQ adapter); a comparator returning 0 for unrelated items is not a total
  order; config-group permission atoms may be non-`:read` when the same atom guards the save; fixed
  postage is per unit; `pnpm --filter @shop/etl test` is a silent no-op (use `test:unit` /
  `test:int`).
- On a usage-limit 429 the user says the limit has reset; resume every executor first (fresh Agent
  call with the resume prompt if the session changed, `SendMessage` otherwise), merge what finished,
  then fill free slots. Keep the 5 slots busy; split work off where something can start early.
