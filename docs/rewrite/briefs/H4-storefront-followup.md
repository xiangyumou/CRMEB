# Stream H4 — storefront follow-up: fix what stream I found, lift every `blockedBy`

**Worktree** `../CRMEB-wt/ws-h4` · **Branch** `rewrite/ws-h4-storefront-followup` (cut by the orchestrator from `rewrite/integration` after I and W5T merged) · **Owns** `template/uni-app/{api,utils,tests,scripts,static}/**`, `template/uni-app/App.vue` (§4 only), the uni-app page files CR-4-i names plus the **minimal** page edits the units below need (a changed call, a URL string, a `data-testid` attribute — no page rewrites), `next/e2e/storefront/**`, `next/packages/testing/src/**` fake WeChat gateway (CR-5-i only), `next/apps/web/next.config.ts` (`experimental.cpus` only), the test files it must add under `next/packages/core/src/**` for §6 (`*.int.test.ts` beside the domain; no production code), `docs/rewrite/cr/CR-{4,5,7}-i.md`, W5T's default product page in `next/packages/contracts/src/diy/**` (CR-7-i only), `docs/rewrite/cr/CR-<n>-h4.md`, `docs/rewrite/status/h4.md`. **Read-only**: everything else — `crmeb/**` (copying image files out of it is fine), `template/admin/**`, `next/guards/**`, `invariants.md`, `STATUS.md`, other core/contracts/apps code. A backend defect is a CR to the orchestrator with a failing `test.fails`.

Read first: `docs/rewrite/status/i.md` (the suite, how to run it, the journey matrix, the `data-testid` table, known gaps, the SMOKE mapping table), `docs/rewrite/cr/CR-4-i.md` and `CR-5-i.md` in full, `docs/rewrite/status/w5t.md` (the six `blockedBy`s it unblocks and `SHOP_FAKE_SMS`), `docs/rewrite/status/h.md` / `h3.md` (the uni-app layer's shape).

## 1. CR-4-i §3–§14 — the uni-app mapper and page layer

Apply each section. The CR's patches were proved by the suite on a copy; they are the evidence, not the required shape — keep mappers pure and tested (`template/uni-app/tests/*.test.mjs`). Decisions the CR leaves open:

- **§4** — drop the `/api/get_script` fetch from `App.vue` (the custom-script feature is not ported).
- **§5** — ship the referenced legacy images inside the uni-app build: copy exactly the files the pages reference from `crmeb/public/statics/images/` into `template/uni-app/static/images/legacy/` and re-point the references to the local static path (a URL-string edit per call site). Nothing in `next/apps/web/public` or the edge.

Commit per section or per tightly related pair. Remove the matching entries from `next/e2e/storefront/src/known-gaps.ts` as each gap closes (the list may only shrink).

## 1b. CR-7-i — the default product page (found at I's merge)

Read `docs/rewrite/cr/CR-7-i.md`: the built-in `product_detail` default renders no 分享 and prints the product as raw JSON. Fix the default page (or the uni-app mapping of its components), lift the `blockedBy`, add the no-raw-JSON assertion. Do it early: every product-page journey you lift in §3 depends on it.

## 2. CR-5-i — the fake gateway answers each create endpoint with its real shape

`h5` → `h5_url`, `native` → `code_url`, `jsapi`/`app` → `prepay_id`, on the fresh create and on the repeat path, with a `@shop/testing` test for each. Then delete `src/h5-pay-shim.ts` from the suite and let the cashier journey go through the real H5 create.

## 3. Lift every `blockedBy`

W5T merged (CR-2-h3, CR-3-i, CR-2-i): lift those six (`status/w5t.md` lists them); **write** the presale journey's body (`presale.spec.ts`: presale price is what the order shows, not the catalogue price) now that `presell_details` is reachable. Lift the nine CR-4-i journeys as §1 lands. At the end `grep -rn blockedBy next/e2e/storefront/specs` must find nothing, or only lines naming an open CR you filed (with the reason in your status).

## 4. The `data-testid`s stream I asked for

Add the 23 attributes from `status/i.md`'s table (attribute-only page edits) and move the suite's locators onto them.

## 5. `experimental.cpus` for the web build

Stream I saw `next build` OOM-killed under a memory cap on a many-core box (Next sizes its worker pool from `os.cpus()`). Set `experimental.cpus` in `next/apps/web/next.config.ts` from an env var with a small default (e.g. `NEXT_BUILD_CPUS ?? 2`), and check the standalone build and the admin e2e still pass.

## 6. The SMOKE rows parked on stream I

The orchestrator mapped SMOKE-002…005 at I's merge. For **SMOKE-006, 007, 008, 009, 012**, verify the candidates in `status/i.md` §"Merge-time" against the row text in `invariants.md`: map only when a test really asserts the whole row (write the missing half as a new test beside the domain if it is small — test files only); for SMOKE-007 retire with evidence if the rewrite has no such flags. Put the exact row text you propose in `status/h4.md`; the orchestrator applies it and deletes the `pending-edits.ts` entries.

## Done

From `next/`: `pnpm turbo run gen typecheck lint test:unit build`, `pnpm turbo run test:int --force --concurrency=4`, `pnpm exec prettier --check .`, `pnpm guards` (0 failures), web rebuilt then `pnpm --filter @shop/e2e-admin e2e` and `pnpm --filter @shop/e2e-storefront test` — **all journeys green, none blocked**. From `template/uni-app`: `npm test`, `npm run build:h5`, `npm run build:mp-weixin` (no "export … was not found"). `status/h4.md`: per unit the change and tests, the SMOKE row text, the final journey matrix. Final report: those, the final commit hash and merge-time notes.

## Rules

Never push, never SSH, never modify `crmeb/`, `template/admin/**`, or another stream's worktree. No real WeChat / SMS / Aliyun calls; fakes only. Do not spawn sub-agents. Other executors build in sibling worktrees: contention is expected, rerun when load drops. Commit after every unit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
