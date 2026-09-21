# Stream I — Storefront tests

**Worktree** `../CRMEB-wt/ws-i` · **Branch** `rewrite/ws-i-storefront-tests` · **Owns** `template/uni-app/tests/**`, `template/uni-app/vitest.config.*`, test-only devDependencies in `template/uni-app/package.json`, `next/e2e/storefront/**` · starts after stream H is merged

The uni-app storefront has never had a test. Stream H rewrote its transport and `api/` layer against the new REST API; you prove that layer and pin the shopper's main paths. You do not change pages or `api/` code: a bug you find is a CR to H (or to the backend stream whose contract is wrong), with a failing test marked `it.fails`/`test.fixme` and the CR id.

## 1. Unit (Vitest, plain Node — no uni runtime)
- A tiny `tests/setup/uni.js` stub (`uni.request`, storage, `showToast`, navigation) — record calls, no behaviour.
- `utils/request.js`: header computation per platform, bearer handling, 2xx / 401 (single de-duplicated `toLogin`) / 4xx-5xx rejection shape `{status, code, message, msg, details}` / network failure / timeout; no hanging promise in any branch.
- `api/mappers/*`: for every mapper, feed the **contract example** of its route (import the OpenAPI document or the examples JSON the contracts package builds — add a script that exports them to `tests/fixtures/contract-examples.json`, regenerated, not hand-edited) and assert the legacy view-model fields listed in H's `extract-page-fields` report are present with the right types. This is the drift alarm: a contract change that pages would feel fails here.
- `api/*.js`: every export calls a method + path that exists in the OpenAPI document (path-template match) — the storefront half of the contract-closure guard. `CONTRACT-PENDING` entries in `status/h.md` are an explicit allow-list that must shrink to empty before cutover; fail on any pending entry whose route now exists but whose marker was not removed.
- Pure store modules and `utils/` helpers that survive (cart badge, price formatting, validators).

## 2. End-to-end (`next/e2e/storefront`, Playwright against the H5 build)
Stack: real `web` + `worker` + PostgreSQL + Redis (compose file under `next/e2e/`, or Testcontainers), seeded through `@shop/testing` factories, the fake WeChat gateway for payment, H5 build of `template/uni-app` served statically with the API base pointed at the stack. Mobile viewport. Journeys, each independent and seeded by API, not by clicking:
1. home (DIY page renders every component present in the six production fixtures without a console error) → category → product detail;
2. add to cart → cart edit → checkout with address and coupon → order created → fake-pay → order detail shows paid;
3. confirm receipt after an admin-side shipment (seed through the service) → review;
4. refund request → admin approval (through the API) → storefront shows refunded;
5. login by SMS code (fake SMS) and by password; 401 mid-session returns to login once;
6. group-buy with two users filling a team (after stream D is merged; `test.fixme` with the reason until then).
If the H5 build cannot be produced headlessly in CI (HBuilderX-only project), document exactly why, fall back to `vite`/`@dcloudio/vite-plugin-uni` CLI if the project supports it, and otherwise deliver journeys 2–5 at the API level through the real `api/*.js` modules running in Node against the live stack — still through H's code, not through raw fetch.

## Done
`pnpm --dir template/uni-app test` green and wired into `.github/workflows/next.yml` via a CR with the exact YAML; e2e runnable with one documented command; status file lists coverage by api module and every CR filed.
