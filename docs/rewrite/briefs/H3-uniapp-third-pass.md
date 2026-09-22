# Stream H3 — uni-app third pass: bind the wave-4 routes, remove the captcha, fix the wrappers

**Worktree** `../CRMEB-wt/ws-h3` · **Branch** `rewrite/ws-h3-uniapp-third-pass` (from `rewrite/integration` at or after `31ec0782e`) · **Owns** `template/uni-app/api/**`, `template/uni-app/utils/request.js`, `template/uni-app/tests/**`, `template/uni-app/scripts/**`, the **minimal page call-site edits** listed in §4, and `next/guards/src/lib/marker-reassignments.ts` (only to delete entries whose marker you deleted). **Read-only**: `next/**` otherwise, `crmeb/**`. A gap in a route is a CR to the owning stream (`docs/rewrite/cr/CR-<n>-h3.md`), not a fix — but every route this pass binds is already merged, so expect none.

Read first: `docs/rewrite/status/h.md` (the layer's shape: `utils/request.js`, `api/*.js` one function per legacy export, `api/mappers/<domain>.js` pure DTO → legacy view model, `tests/*.test.mjs` on the contracts' own examples), the H2 section of `docs/rewrite/STATUS.md`, and the per-route field tables the wave-4 streams left for you: `docs/rewrite/status/a2.md` (ten staff product routes), `docs/rewrite/status/e4.md` (phone binding, mini-program codes, six staff user routes, visits beacon — and its "H3 must fix three wrappers" section), `docs/rewrite/status/f4.md` §6 (`GET /api/v1/site/config`, `POST /api/v1/attachments/base64`, the three DIY reads, with the two shape deviations it records), `docs/rewrite/status/b3.md` (gift-coupons, staff coupons, coupon-grants, groupbuy summary). The contracts are the truth: `next/packages/contracts/src/<domain>/*.contract.ts` and their `examples`, served by the mock server (`pnpm --filter @shop/testing mock` or however `status/h.md` says the live smoke is run).

## 1. The marker list

`pnpm guards` (from `next/`) prints every item as `pending(H3)`; it is your worklist and your exit test. Run it first and keep the output. Each `CONTRACT-PENDING(<stream>)` marker in `template/uni-app/api/*.js` falls in one of three classes:

1. **Route landed at the marked URL** — delete the marker, bind the call for real (URL + mapper), add the example-driven unit test and the live smoke entry. 25 calls: staff products ×10 (`admin.js:254–318`), staff users ×6 (`admin.js:332–369`), staff coupons (`admin.js:384`), gift-coupons (`order.js:338`), groupbuy summary (`activity.js:145`), mini-qrcodes ×3 (`activity.js:155`, `store.js:270`, `user.js:420`), phone/wechat-mini (`user.js:343`), site/config (`public.js:185`), diy layouts / navigation / user-center (`api.js:108`, `public.js:207`, `user.js:358`).
2. **Route landed under a different shape** — re-point the call and delete the marker. `POST /api/v1/staff/users/:uid/coupons` → `POST /api/v1/staff/coupon-grants` (B3, flat body; see `status/b3.md`). The five `GET /api/v1/site/{copyright,customer-service,splash-ad,logo,share}` calls → one `GET /api/v1/site/config` (F4; read it once and select in the mapper, do not fetch five times). `POST /api/v1/site/image-data-urls` ×2 (`public.js imageBase64`, `user.js imgToBase`) → `POST /api/v1/attachments/base64` with body `{ url }`, one image per call.
3. **Route will never exist** — delete the call and the screen code that used it. `GET /api/v1/auth/captcha` and `POST /api/v1/auth/captcha/verifications` (`api.js:326, 330`): E4 decided **no behaviour captcha**; SMS spend is bounded by per-phone/per-IP budgets and a resend cooldown (limits in `status/e4.md`). Delete `pages/users/components/verify/**` and every call site of it (登录, 注册, 找回密码, 绑定/更换手机号 screens) so the code request goes straight to the SMS call; the code input stays.

When a marker is gone, delete its row in `next/guards/src/lib/marker-reassignments.ts` in the same commit (the guard fails on an entry that matches no marked call). The list must be empty when you are done.

## 2. The three wrappers E4 found (`api/admin.js`)

Written against CR-2-h2's sketch, wrong against the landed contract: `postUserSetLabel` must send `{ labelIds: string[] }` (its caller already passes an array); `getUserLabel(0)` passes a literal `0` where `:uid` must match `/^[1-9]\d*$/` — the two call sites want "all labels", which is `GET /api/v1/staff/user-groups`/labels per `status/e4.md`, fix the wrapper and the two call sites; `postUserSetGroup` turns the `null` that clears a group into `"null"` — pass `{ groupId: null }` through.

## 3. Dangling imports (seven, all older than H)

Listed in `docs/rewrite/status/h.md` § Known dangling imports. Fix each at the import site: `postAddress` (delete the import), `newcomerList` (delete the import and the dead branch — 新人专享 is retired), `VUE_APP_API_URL` and the four validators in `pages/users/login/index.vue` (delete the imports; the page's own regexes do the validation), `handleError` from `vue` in `pages/admin/goods/components/label/index.vue` (a local `catch`). Both builds (`npm run build:h5`, `build:mp-weixin`) must finish with zero `export … was not found` warnings.

## 4. Page call-site edits you may make

Only what §1–§3 need: the verify component's call sites, the two `getUserLabel` call sites, the import lines above, and — where a mapper cannot hide a semantic change — the exact lines `status/f4.md` §6 names (`goods_cate.vue` reads the layout as a number; the navigation read returns the raw `pageFoot` component). Anything else is a note in your status file, not an edit. Stream I (storefront Playwright, running now) will leave `data-testid` requests in `docs/rewrite/status/i.md`; if that file exists when you reach the end, add the attributes it asks for (attribute-only edits, no behaviour), otherwise leave them for K2.

## 5. Tests

`template/uni-app/tests/**` (Vitest, `npm test` from `template/uni-app`): one example-driven test per bound call, mapper tests for the new shapes (site config selection, coupon-grants body, base64 body, the staff user item, the staff product list/create), and the live smoke list extended so `tests/smoke.live.test.mjs` hits every newly bound call against the mock server. `scripts/check-api-routes.mjs --json` must report 0 pending.

## Done

`pnpm guards` from `next/` reports **0 failures and 0 `pending(H3)`**; `MARKER_REASSIGNMENTS` is empty (keep the export with a comment); `npm test` green; both uni-app builds clean of dangling-import warnings; `docs/rewrite/status/h3.md` with the per-call table (call → route → mapper → test), the deleted captcha surface, the wrapper fixes, the page lines touched, and the `data-testid`s added (or "none requested yet"). Final report: counts before/after, CRs filed (expected none), final commit hash.

## Rules

Never push, never SSH, never modify `crmeb/`, `next/**` (except the one guards list file above) or another stream's worktree. Commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Before the final commit: `npm test` in `template/uni-app`, both builds, and from `next/`: `pnpm guards`, `pnpm exec prettier --check .`.
