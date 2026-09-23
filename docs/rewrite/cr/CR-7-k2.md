# CR-7-k2 — the OA callback accepts a signature triple forever, for any body, in any mode

**Stream:** K2 (hardening) **Status:** OPEN — for the orchestrator (E2/E3 WeChat OA, merged)
**Files:** `next/packages/core/src/wechat-oa/wechat-oa.webhook.service.ts:108-160` (`handleEvent`: mode taken from `encrypt_type` at :112, plain-mode `verifySignature` at :145), `next/packages/core/src/wechat-oa/wechat-oa.crypto.ts:64-72` (`verifySignature`, no freshness)
**Pinned by:** `next/packages/core/src/wechat-oa/wechat-oa.webhook-forgery.int.test.ts::K-SEC-O1 — what a valid signature triple is good for > refuses a plaintext callback when the account is configured in 安全模式`, `> refuses a triple whose timestamp is outside a five-minute window`, `> refuses a second, different body under a triple that was already used` (all `it.fails`)

## What

In 明文 mode WeChat's `signature` is `sha1(sort(token, timestamp, nonce))`. It
does **not** cover the body. WeChat puts `signature`/`timestamp`/`nonce` on the
query string of every callback — in 安全模式 too, next to `msg_signature` — so
every access-log line of `/api/v1/webhooks/wechat-oa` holds a valid triple.
What the endpoint does with a triple is therefore the whole defence, and today:

1. **No freshness window.** A triple from last month verifies. (The existing
   suites all sign with `1767668400`, months before their own `NOW`, and pass.)
2. **No single use.** Under one triple, any number of different bodies are
   accepted; the body-derived dedupe key does not help because each body is a
   new key. The pinned test turns one genuine follow into 11 recorded scans.
3. **Downgrade.** The plaintext path is chosen by the request (`encrypt_type`
   absent), not by the configured `messageMode`. An operator who chose 安全模式
   so that bodies are authenticated gets plaintext accepted anyway: drop
   `encrypt_type` and `msg_signature` from a logged query string and post any
   XML.

What a forged body can do: set any follower's `subscribed` flag (which gates
their OA template messages), inflate or deflate 渠道二维码 scan and follow
counts, and make the account send its configured passive replies. With
CR-8-k2, anybody holding `system:config:read` can also mint fresh triples.

## Asked for

- Refuse (403) a plaintext callback when `messageMode` is `safe`; in
  `compatible`, prefer the encrypted body when present.
- Refuse a `timestamp` more than 300 s from `ctx.clock`.
- Spend each `(timestamp, nonce)` once: `SET wechat-oa:nonce:<nonce>:<ts> NX EX 600`;
  a second use is 403.
- Refuse when the group is not `enabled`.
- Move the other suites' fixtures onto a fresh timestamp and flip the three
  `it.fails`.

## Until then

Run the account in 安全模式 does **not** help (point 3). Keeping the webhook's
query strings out of shared logs limits who holds a triple.
