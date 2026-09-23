# Stream W5T — wave-5 tail: the five CRs H3 and I filed against merged streams

**Worktree** `../CRMEB-wt/ws-w5t` · **Branch** `rewrite/ws-w5t-wave5-tail` (from `rewrite/integration` at the H3 merge commit or later) · **Owns**, for the units below only: `next/packages/contracts/src/{coupon,diy,system}/**`, `next/packages/core/src/{coupon,diy,system,sms}/**`, the matching route handlers and their tests under `next/apps/web/app/api/v1/**`, `next/apps/web/src/server/{env,container}.ts` (§5 only), `template/uni-app/api/**`, `template/uni-app/tests/**` (not `tests/e2e/**`), `template/uni-app/pages.json` and `template/uni-app/pages/activity/presell/index.vue` (§4 only), `docs/rewrite/cr/CR-{1,2,3}-h3.md`, `docs/rewrite/cr/CR-{2,3}-i.md`, `docs/rewrite/status/w5t.md`. **Read-only**: everything else — `packages/db/**`, `core/src/kernel/**`, `contracts/src/_conventions/**`, `apps/web/src/admin/kit/**`, `next/guards/**` (K2 is in flight there), `next/e2e/**` (I and K2 are in flight there), `invariants.md`, `STATUS.md`, `crmeb/**`, `template/admin/**`, uni-app pages other than the two named.

Every owning stream of these CRs has merged, so the orchestrator decided each one; the decisions below are binding. Five independent units — commit each on its own, contract + implementation + route + tests + uni-app binding together. **No schema migration**: if a unit seems to need one, stop and write a CR to the orchestrator instead.

Read first: the five CR files (CR-1/2/3-h3 are on integration; CR-2-i and CR-3-i are on I's branch — `git show rewrite/ws-i-storefront-e2e:docs/rewrite/cr/CR-2-i.md`, same for CR-3-i — copy them into your tree when you resolve them), `docs/rewrite/status/h3.md` (how the uni-app currently stubs each gap), `docs/rewrite/status/h.md` (the uni-app layer's shape), `docs/rewrite/CONVENTIONS.md`.

## 1. CR-1-h3 — a 店员 can read one customer's coupons (decision: **yes**)

Legacy 商家管理 shows it, and a 店员 already sees the customer and may grant coupons; reading what they hold is the same trust level. Add `GET /api/v1/staff/users/:uid/coupons` (`auth: 'staff'`, the same staff permission E4's staff user routes use) answering `{ items: userCoupon[] }` with the storefront 我的优惠券 item schema (reuse it, do not fork), unused first; `?state=unused|used|expired` optional. Add `couponCount` (unused, unexpired) to E4's staff user **detail** item only if it is one batched query — otherwise leave 「--」 and say why in the status. Bind `getUserCoupon` in `template/uni-app/api/admin.js` and `coupon_num` in `toLegacyStaffUser`; drop the reject stub. Tests: contract examples, a core int test (another customer's coupons never leak; a non-staff user gets 403), an HTTP int test, the uni-app mapper test.

## 2. CR-2-h3 — the product page's DIY design (decision: **fixed-path read with a built-in default**)

Add `GET /api/v1/diy/pages/product-detail` (`auth: 'public'`), the same envelope as `pages/user-center`: the newest published `product_detail` page. When none is published, answer a **built-in default page** defined as a constant in the diy domain (gallery/`productInfo`, `productDesc`, `homeReviews`, `homeProductService` — the components the uni-app's `pageDesign.vue` renders; read the uni-app component list and legacy `crmeb/` default detail template to get the component keys and default props right). The default must pass the same DIY page schema validation a saved page passes (test it). Check whether legacy `eb_diy` carries a product-detail design the ETL's `diy` group should migrate; if it does and the ETL skips it, note it in the status for the orchestrator (do not edit `packages/etl`). Bind `getThemeInfo('detail')` with `toLegacyDiyPage`; remove H3's empty-page stub. Tests: contract example, core int test (default when none published, published page wins, draft ignored), HTTP int test, uni-app mapper test. **This is the most important unit — without it the product page body is blank.**

## 3. CR-3-h3 — login-method switches (decision: **derived booleans on `site/config`**)

Add `auth: { wechatOa: boolean, wechatMini: boolean, phone: boolean }` to `GET /api/v1/site/config`, derived, never a credential (same rule as `payments.wechat`):
- `wechatOa` — the WeChat OA app id and secret are both configured;
- `wechatMini` — the mini-program app id and secret are both configured;
- `phone` — an SMS sender is usable (provider not `none` and its required credentials present; reuse `resolveSender`'s rule, do not duplicate it — extract a predicate if needed).

Map them in `toLegacyBasicConfig` to `wechat_status`, `wechat_auth_switch`, `phone_auth_switch` (legacy truthy spelling the pages expect — read `libs/login.js`, `wechat_login`, `binding_phone`). Tests: core unit/int for each derivation (and that no credential value appears in the response), contract example, uni-app mapper test.

## 4. CR-2-i — presale purchase page reachable (decision: **register it, re-point the list**)

Register `presell_details/index` in the `pages/activity` subpackage of `template/uni-app/pages.json`; point `presell/index.vue`'s `goDetails()` at it. Then make every API call `presell_details/index.vue` makes go through bound `api/*.js` functions against the presale contracts (D2) — checkout with `kind: 'presale'` + the activity id; if a call has no route, that is a CR, not a fix. Page edits limited to those two files and the minimal call-site lines. Tests: uni-app mapper/wrapper tests for the presale detail calls; `npm run build:h5` and `build:mp-weixin` clean.

## 5. CR-3-i — fake SMS for an out-of-process e2e server (decision: **env-gated registration in `web`**)

In `apps/web/src/server/env.ts` add an optional `SHOP_FAKE_SMS` flag; in `container.ts`'s build, when it is `'1'`, `registerSmsSender(fakeSmsSender())` in web's own module graph and log a `warn` once at boot ("fake SMS sender active — codes are not delivered"). Do **not** add a `fake` value to the `sms` config group (a shop must never be able to select it from the console). Add a test that the deploy templates (`deploy/next/**` env examples / compose) never set it — put it beside the existing env tests in `apps/web`, not in `next/guards`. Tests: unit test for env parsing, a web int test that `POST /api/v1/auth/sms-codes` succeeds with the flag and the code lands in Redis under the key `issueCode()` writes. Tell stream I the variable name via your status (the orchestrator relays it).

## Done

From `next/`: `pnpm turbo run gen typecheck lint test:unit build`, `pnpm --filter @shop/core test:int`, `pnpm --filter @shop/web test:int`, `pnpm exec prettier --check .`, `pnpm --filter @shop/contracts check:examples`, `pnpm guards` (0 failures; do not edit guards — if a guard needs a list change, say so in the report). From `template/uni-app`: `npm test`, `npm run build:h5`, `npm run build:mp-weixin` (no "export … was not found"). Each CR file marked RESOLVED with the commit. `docs/rewrite/status/w5t.md`: per unit the routes, the decisions as implemented, tests, and anything left; plus the exact list of storefront e2e `test.fixme`s each unit should unblock (by CR id) so the orchestrator can lift them. Final report: tests added, CR statuses, final commit hash, merge-time notes.

## Rules

Never push, never SSH, never modify `crmeb/`, `template/admin/**`, `packages/db/**`, `core/src/kernel/**`, `next/guards/**`, `next/e2e/**`, or another stream's worktree. No real WeChat / SMS / Aliyun calls — fakes from `@shop/testing` only. Other executors build in sibling worktrees: mass `ERR_CONNECTION_REFUSED` / OOM-killed builds are contention, rerun when load drops. Commit after every unit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
