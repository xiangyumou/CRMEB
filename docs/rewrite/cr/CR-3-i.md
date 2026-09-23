# CR-3-i — no way to make `web` send a fake SMS code out of process

- **Stream:** I (storefront e2e), raised against E4 (owns `core/src/sms/**`)
- **Status:** **RESOLVED** by W5T in `5d70ff5cf` — env-gated registration in `web` (orchestrator's decision: suggestion 1, not a `fake` provider value)
- **Affects:** `next/packages/core/src/sms/sms.port.ts`, `next/apps/web/**`
  (a bootstrap hook would live here — outside this stream's ownership)

## What is missing

`registerSmsSender()` is a module-level `let override` in
`core/src/sms/sms.port.ts`, documented as existing "for two callers … the
integration tests, which register `fakeSmsSender()`, and a future stream that
needs to route SMS through something the config group cannot describe." Both
of those callers run **in the same process** as the code they are calling —
`*.int.test.ts` imports `sendVerificationCode` directly.

This suite runs a real `next start` server as a separate OS process (the way
`@shop/e2e-admin` and production both do), driven only through HTTP. There is
no config-group value that selects a sender that just succeeds in memory —
`smsConfig.provider` is `'none' | 'aliyun' | 'tencent'`, and only `'none'`
(the default) and an unreachable `'aliyun'`/`'tencent'` are possible without
real credentials; both resolve to `nullSmsSender`, which always returns
`ok: false`.

I tried the one workaround available from outside `next/apps/web/**`: preload
a script that calls `registerSmsSender(fakeSmsSender())` into the `next start`
process before it accepts a request, via `NODE_OPTIONS=--import`. It does not
work. `next build`/`next start` bundles `@shop/core` into the compiled route
handler chunk (it is not in `transpilePackages`, and nothing marks it
`serverExternalPackages`), so the route handler's `@shop/core/sms` and my
preload's `@shop/core/sms` are two separate module instances with two separate
copies of the `let override` — registering one never touches the other. I
confirmed this empirically: the preloaded process's `POST
/api/v1/auth/sms-codes` still logs `"provider":"none"` and returns
`AUTH_SMS_SEND_FAILED`.

## Why it matters

Journey 5 of `docs/rewrite/briefs/I-storefront-e2e.md` ("SMS code (fake SMS,
read `core/src/sms` for the test hook)") cannot complete the SMS half of login
against the real built app. The password-login half, and the "a forced 401
mid-session returns to login exactly once" half, are unaffected and are
covered in this suite; only the code-request-and-verify path is blocked.

## Suggested fix

One of:

1. An env-var-gated line in a `next/apps/web` bootstrap path that already runs
   once per process (or a new one) — `if (process.env.SMS_FAKE_SENDER === '1')
registerSmsSender(fakeSmsSender())` — mirroring how `paymentConfig` and
   `wechatConfig` already let an e2e harness redirect a real integration to a
   fake one through data (config in Postgres) rather than in-memory state.
   Since `web`'s own module graph is the one place both the route handler and
   the registration would share, this has to land inside
   `next/apps/web/**`, which this stream cannot touch.
2. Alternatively, make `smsConfig.provider` support a fourth value (`'fake'`
   or similar) that `resolveSender()` resolves to `fakeSmsSender()` — config
   is already real cross-process shared state (Postgres), so this sidesteps
   the module-instance problem entirely and needs no process bootstrap change.
   `apiBaseUrl`-style "point it at a fake" is the pattern `payment` already
   uses successfully; the SMS domain doesn't have anywhere to send a fake
   provider's request, but the point of a fake sender is precisely that it
   never sends one — it only has to satisfy `SmsSender` and return `ok: true`.

Either fix removes the fixme without any change on this stream's side; the
Redis code the fake sender would still write (`sms:code:<scene>:<phone>`, via
the existing `issueCode()`) is exactly what the spec already expects to read.

## Until then

`next/e2e/storefront/specs/login.spec.ts` fixmes only the SMS-code sub-tests
(`test.fixme('CR-3-i: …')`); password login and the 401-redirect-once
assertion are not fixme'd and run for real. `docs/rewrite/status/i.md` records
the same.

## Resolution (W5T, `5d70ff5cf`)

The variable is **`SHOP_FAKE_SMS`** (not the `SMS_FAKE_SENDER` suggested
above), value **`'1'`**.

- `next/apps/web/src/server/env.ts` — `SHOP_FAKE_SMS: z.enum(['', '0', '1']).optional()`.
  Unset, `''` and `'0'` are off; anything else (`true`, `yes`) refuses to boot.
- `next/apps/web/src/server/container.ts` — `buildContainer()` calls
  `applyProcessOverrides(env, logger)`, which on `'1'` runs
  `registerSmsSender(fakeSmsSender())` in web's own module graph and logs
  `warn` "fake SMS sender active — codes are not delivered" once per process.
  `getContainer()` builds the container on the first request of any route, so
  the sender is registered before the first `POST /api/v1/auth/sms-codes`
  runs whichever route the app hits first.
- **Not** a value of `sms.provider`: a shop must never be able to pick it from
  the console.
- `next/apps/web/src/server/env.test.ts` fails if anything under
  `deploy/next/**` or `next/docker/**` mentions the variable.
- The code lands where it always does: `issueCode()` writes the hash
  `sms:code:<scene>:<phone>` (`codeKey(scene, phone)`), field `code`, with the
  code's TTL; `fake-sms.int.test.ts` reads it there and signs in with it.
- Module instances: in the Turbopack production build every route chunk that
  carries `@shop/core/sms` carries it under the same module id, and the
  runtime's module cache is per process, so the container's registration and
  every route handler share one `override` — the module-instance split the
  preload attempt hit does not apply to a registration made from inside the
  bundle. The e2e journey is the end-to-end proof once the fixmes are lifted.
