# Stream K1 — Hardening, first pass (what can be proved before the last domains land)

**Worktree** `../CRMEB-wt/ws-k` · **Branch** `rewrite/ws-k-hardening` · **Owns** `next/guards/**`, `next/e2e/admin/**`, `docs/rewrite/AUDIT.md`, `docs/rewrite/status/k.md` · the second pass (`K-hardening.md` §4 load smoke, the final guard/invariant run) starts after E1 / D / F2 / E2 / S / J are merged

Read `docs/rewrite/briefs/K-hardening.md` first — this is the same stream, started early so the parts that only need the *merged* domains (auth, cart, catalog, coupon, diy, effects, order, payment, refund, storage, system, wechat) are not left for the tail. You add no features; every defect is a CR to the owning stream (`docs/rewrite/cr/CR-<n>-k.md`, patch attached for trivial ones), never a fix inside someone else's path. Read `docs/rewrite/CONVENTIONS.md`, `STATUS.md`, `status/p0b.md` (the deferred Playwright smoke) and `status/h.md` (the `CONTRACT-PENDING` list).

## Do now
1. **Guards** — `K-hardening.md` §1 in full, as `next/guards/` run by `pnpm guards` from `next/`. The uni-app half must treat `CONTRACT-PENDING` markers in `template/uni-app/api/*.js` as an allow-list (they resolve once E1 / E2 / D / F2 / S land): fail on a pending marker whose route now exists. Write the CI YAML you want as a CR (you do not edit `.github/`).
2. **Invariant audit** — `K-hardening.md` §2 for every row of `tests/regression/cases.md` and `risk-matrix.md` whose subject is a merged domain; rows owned by unmerged streams are marked `pending:<ws>` and the checker treats them as open, not as failures, until the second pass. The 50-round concurrency CI job is designed now and filed as the same CI CR.
3. **Admin Playwright** — `K-hardening.md` §3 for the merged domains: login + lockout, product create → storefront API sees it, coupon create/grant, DIY page edit → save → publish → storefront read returns the same JSON, order ship → receipt, refund review, restricted role (no menu, 403 on direct call), config group save masks secrets, upload + asset picker, and the P0-B smoke. Real stack: `next/e2e/` compose or Testcontainers, seeded through `@shop/testing` factories, fake gateways only. If a page you need is not merged yet, `test.fixme` with the stream id.
4. **Security review pass** — `K-hardening.md` §5 for auth, payment, refund, upload (all merged), against plan §5 "Fix, don't port". `docs/rewrite/AUDIT.md`, one row per item: test reference or CR id.

## Not now
Load smoke (§4) needs J's `deploy/next/compose.yml`; the final guard and invariant run needs every stream merged. Both are the second pass; leave a "second pass" section in `status/k.md` listing exactly what re-runs.

## Rules
Never push, never SSH, never touch `crmeb/`, `template/admin`, or another stream's paths; never commit the lockfile (list new devDependencies in your status file — Playwright browsers, k6/autocannon later). Commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Real WeChat / SMS / Aliyun endpoints are never called.

## Done
`pnpm guards` green on the integration branch with the pending allow-list; invariants checker green with pending rows counted; admin e2e runnable with one documented command; `AUDIT.md` covers the four areas; `status/k.md` lists CRs filed, CI YAML CR, and the second-pass checklist.
