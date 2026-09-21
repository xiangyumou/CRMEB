# Stream H — uni-app API layer

**Worktree** `../CRMEB-wt/ws-h` · **Branch** `rewrite/ws-h-uniapp` · **Owns** `template/uni-app/{api/**,utils/request.js,config/**}` and the minimal call-site edits listed below · reference-map section "H — uni-app API layer" · starts at gate G1a (wave 1 contracts merged; `packages/contracts/openapi.json` builds; the mock server serves every example)

## The idea
The storefront pages and components are **not** rewritten. You rewrite the transport and the `api/` modules so they speak the new REST API, and you keep each exported function's **name and resolved shape** so pages keep working. Where the new DTO differs from what pages read, a pure mapper converts it back.

## Scope
1. `utils/request.js`: new client. `Authorization: Bearer <token>`, `X-Client-Platform` (`h5` / `wechat-oa` / `wechat-mini`, computed per request — no shared mutable header object), JSON only, real HTTP status handling: 2xx resolves; 401 clears the token, calls `toLogin()` once (de-duplicated) and rejects; every other error **rejects with an object** `{status, code, message, details}`; network failure rejects with `{status: 0, code: 'NETWORK', message}`. No hanging promises. Timeout 15 s. Drop `Cb-lang`, `Form-type`, the eight-verb loop (keep get/post/put/patch/delete).
2. **Compatibility of the resolved value.** Pages read the old envelope: `res.data` (payload), `res.msg` (71 sites) and sometimes business fields named `status` inside the payload. The client resolves `{data: <mapped payload>, msg: <message or ''>, status: 200}` so those reads keep working; rejected values also carry `msg` (alias of `message`) because pages toast `err` or `err.msg`. Document this in `api/README.md`.
3. `api/*.js`: every live export re-pointed to a `/api/v1/...` route from the OpenAPI document, same function name and parameters. `api/mappers/<domain>.js`: pure functions `toLegacy<Thing>(dto)` / `fromLegacy<Thing>Input(args)` — camelCase → the snake_case view models pages read, money strings stay strings, ISO instants → the legacy display format pages expect (check each usage: some pages want a unix seconds number, some a formatted string), ids → numbers only where a page does arithmetic or strict comparison on them. Build the field list per function from what pages actually read: write `scripts/extract-page-fields.mjs` that greps usages of each api function and the property paths read from its result, and commit its report — it is both your checklist and stream I's test oracle.
4. Deletions: `api/kefu.js`, `api/lottery.js`, `libs/chat.js`, `libs/new_chat.js`, `config/socket.js`, the 83 dead exports listed in the reference map, and every export whose feature is retired (bargain, seckill, points, sign-in, distribution, membership, recharge, live, pickup, staff split-delivery / offline-pay calls that never had a backend). For each deleted export that still has a call site, remove the dead UI branch minimally and list the file in your status report. No new features, no restyling.
5. Uploads (`utils/util.js` `uni.uploadFile` sites): re-point to the new upload endpoint and response shape. Payment: `utils/wechatPayment.js` consumes the new pay-params DTO (JSAPI / mini-program); H5 outside WeChat shows the existing "open in WeChat" path.
6. `config/app.js`: API base, platform detection, timeout. Keep `HTTP_REQUEST_URL` semantics so existing H5/MP build configs work.

## Working against the mock server
`pnpm --filter @shop/testing mock` (see `docs/rewrite/status/p0a.md` "The mock server, live") serves the first example of every route. Build H5 with the API base pointing at it and click through: home (DIY) → category → product → cart → confirm → pay status → orders → refund → user centre → coupons → address → group buy → presale. A route you need that has no contract yet: write `docs/rewrite/cr/CR-<n>-h.md` naming the owning stream and the shape pages need; keep a local stub mapper.

## Proof
Vitest unit tests for `request.js` (status handling, single-flight 401, header computation, no shared state) and for **every mapper** (fixture in = contract example, expected out = legacy shape from the field report). A guard script `scripts/check-api-routes.mjs`: every URL in `api/*.js` resolves to a method+path in `openapi.json`, and no retired-feature URL remains (stream K wires it into CI). H5 production build succeeds; mini-program build (`mp-weixin`) succeeds.

## Out of scope
Rewriting pages or components, the DIY renderer, visual changes, TypeScript migration of the uni-app, end-to-end tests (stream I).
