# Stream K — Hardening

**Worktree** `../CRMEB-wt/ws-k` · **Branch** `rewrite/ws-k-hardening` · **Owns** `next/e2e/admin/**`, `next/guards/**`, the audit report `docs/rewrite/AUDIT.md` · starts when every domain stream is merged

You add no features. You prove the whole, and you file defects as CRs to the owning stream (orchestrator routes them); trivial fixes inside someone else's path are still CRs, with the patch attached.

## 1. Guards (`next/guards`, run by `pnpm guards`, wired into CI by CR)
Port the intent of `tests/static/{admin-api-contract,retired-code-guard}.cjs`:
- every URL the admin client can call and every `template/uni-app/api/*.js` call resolves to a registered route; every route file under `app/admin-api` and `app/api` has a contract and vice versa (no orphan either way);
- every admin route declares a permission that exists in a `permissions.ts`; every menu item's permission exists; no permission is unused;
- every write route calls `ctx.audit`; every route file exports `dynamic = 'force-dynamic'`;
- retired-feature blacklist (bargain, seckill, points, distribution, membership, recharge, pickup, kefu, lottery, outapi, PC decoration …) finds no identifier or URL in `next/` or the uni-app `api/`;
- banned constructs: `eval`, `new Function`, `child_process` outside scripts, raw `fetch` to a user-supplied URL outside storage's vetted fetcher, `dangerouslySetInnerHTML` outside the sanitised article/rich-text renderer, `Date.now()`/`new Date()` in core (already linted — assert the rule is on);
- secrets: no config field marked secret is ever present in a response schema unmasked (walk the contracts).

## 2. Invariant audit
`docs/rewrite/invariants.md`: every row of `tests/regression/cases.md` and `risk-matrix.md` must map to a test id that exists and runs, or to "retired" with a reason. A script checks the ids resolve; the build fails on an unmapped row. Then the concurrency suite: every `runConcurrently` scenario (pay vs cancel, last unit, last group seat, duplicate refund, duplicate receipt, coupon claim/redeem, duplicate callback, duplicate submit) runs 50 rounds in a dedicated CI job.

## 3. Admin Playwright (`next/e2e/admin`)
Real stack, seeded by factories: login + wrong password lockout; product create → visible on the storefront API; coupon create/grant; DIY page edit → save → publish → storefront read returns the same JSON; order ship → receipt; refund review; a restricted role sees neither menu nor API (403 by direct call); config group save masks secrets; upload + asset picker. Include the P0-B smoke that was deferred to you.

## 4. Load smoke
k6 or autocannon script, constrained to 2 CPUs / memory limits of `deploy/next/compose.yml`: storefront home + product + checkout mix at modest concurrency; report p95, error rate, RSS of web/worker/postgres/redis against the 1.6 GB budget; find N+1 queries with `pg_stat_statements` and file them.

## 5. Security review pass
For auth, payment, refund, upload: read the code as an attacker with the "Fix, don't port" list in the plan §5 as the checklist; each item gets a test reference or a CR. Write the result to `docs/rewrite/AUDIT.md`.
