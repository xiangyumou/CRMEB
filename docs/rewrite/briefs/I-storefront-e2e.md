# Stream I — Storefront end-to-end (Playwright on the H5 build against the real stack)

**Worktree** `../CRMEB-wt/ws-i` · **Branch** `rewrite/ws-i-storefront-e2e` (from `rewrite/integration`) · **Owns** `next/e2e/storefront/**` (a new workspace package `@shop/e2e-storefront`), `template/uni-app/tests/e2e/**` if you need fixtures beside the app, and its own devDependencies — this stream **may commit the lockfile** for the new package (add `next/e2e/*` to `pnpm-workspace.yaml`; do not upgrade anything else). **Read-only**: everything else. A bug you find is a CR (`docs/rewrite/cr/CR-<n>-i.md`) to the owning stream, not a fix.

This supersedes §2 of `docs/rewrite/briefs/I-storefront-tests.md`; §1 (unit tests for the api layer) already lives with H (`template/uni-app/tests/**`, `npm test`) and is not yours.

Read first: `docs/rewrite/CONVENTIONS.md`, `docs/rewrite/status/{h,h2,j2}.md` (the H5 build: `npm ci && npm run build:h5` → `dist/dev/h5`; the API origin is `VUE_APP_CRMEB_API_ORIGIN` in `template/uni-app/config/app.js`), `next/docker/edge/**` (how the H5 bundle is served next to the API in production — mirror it), `packages/testing/src/**` (factories, Testcontainers, the fake WeChat Pay gateway), `apps/web/app/api/v1/checkout.int.test.ts` (how a full checkout is driven at the API level), and whatever K1 has under `rewrite/ws-k-hardening` for admin Playwright (`git show rewrite/ws-k-hardening --stat`, `git show rewrite/ws-k-hardening:<path>`) so the two suites share one Playwright version and one way of starting the stack.

## 1. The harness
One command, `pnpm --filter @shop/e2e-storefront test`, that: starts PostgreSQL 17 + Redis 7 (Testcontainers or a compose file under `next/e2e/storefront/`), runs the migrations and the seed, starts `web` (standalone build or `next start`) and `worker`, starts the fake WeChat gateway and points the payment config at it, builds the H5 bundle once (skip when `dist/dev/h5` is fresher than `template/uni-app/src`), serves it the way the edge does (static + `/api` proxy to `web`, same origin so no CORS surprises), and runs Playwright (chromium, mobile viewport, `X-Client-Platform: h5`). Seed through `@shop/testing` factories: one shop config, categories, two products (one multi-spec, one with a fixed-postage freight), one coupon, one group-buy activity, one presale activity, the DIY home page from the six production fixtures, the test user with an address and a second user for group buy. Everything runs offline.

## 2. Journeys (each a spec file, each independent, each idempotent)
1. **Home → category → product**: the DIY home renders every component present in the fixture without a console error (assert on `page.on('console')` errors and on failed requests); category list; product detail shows price, SKUs, freight.
2. **Cart → checkout → pay**: add to cart, change quantity, checkout with the address and the coupon, order created, fake-pay (drive the gateway callback), order detail shows 已支付.
3. **Ship → receive → review**: ship through the admin API (`/admin-api/…` with an admin session), storefront shows the parcel, confirm receipt, write a review.
4. **Refund**: apply from the order, approve through the admin API, storefront shows 已退款.
5. **Login**: SMS code (fake SMS — read `core/src/sms` for the test hook), password login, and a forced 401 mid-session returns to login exactly once.
6. **Group buy**: user A opens a team, user B joins, both see 拼团成功.
7. **Presale**: the presale price is what the order shows (D2's "quotes 预售价, not the catalogue price" at the UI level).
8. **Site config / share**: the pages that read `GET /api/v1/site/config` (F4, in flight — `test.fixme` with the reason until it merges) and the JS-SDK config call on H5 do not error.

Selectors: prefer text and roles; where the uni-app DOM gives nothing stable, note the page in your status file for H3 to add a `data-testid`. A journey blocked by a missing route lands as `test.fixme('<CR id>')` with the CR filed — the CONTRACT-PENDING markers in `template/uni-app/api/*.js` are the known ones (A2, E4, F4, B3 are building them now; do not file CRs for those).

## 3. CI
A `storefront-e2e` job for `.github/workflows/next.yml` comes as a CR with the exact YAML (`docs/rewrite/cr/CR-1-i.md`); do not edit the workflow. Artifacts: traces on failure, the console-error log per journey.

## Done
`pnpm --filter @shop/e2e-storefront test` green locally (report the wall-clock time and the memory the stack needed — the target host has 2 cores / 3.6 GB); `docs/rewrite/status/i.md` with the journey matrix (journey × status × CRs), the stack start-up steps, and every `data-testid` request for H3.

## Rules
Never push, never SSH, never modify `crmeb/`, `template/uni-app/{pages,components,api,utils}/**`, `next/{apps,packages}/**` or another stream's worktree. Commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Before the final commit, from `next/`: `pnpm turbo run gen typecheck lint test:unit build` (your package must join the turbo graph with `typecheck` and `lint`), `pnpm exec prettier --check .`, plus your own suite. Final report: journeys green/fixme with reasons, run time and memory, CRs filed.
