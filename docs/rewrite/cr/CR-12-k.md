# CR-12-k — the public scan-upload endpoint is unthrottled, and `COMPLETE_LUA` does not check the state it claims to

**Stream:** K (hardening) **Status:** OPEN — for stream F1 (storage)
**Files:** `next/packages/core/src/storage/scan-token.ts`, `next/packages/core/src/storage/storage.service.ts`, `next/packages/contracts/src/storage/storage.storefront.contract.ts`

Two small things in the 扫码上传 path. The design is otherwise right — the token
is bound to one admin, single-use through an atomic Lua CAS, short-TTL, and a
rejected file releases the claim instead of burning the code.

## 1. `POST /api/v1/attachments/scan-uploads/:token` has no rate limit

The route is `auth: 'public'` — it has to be, the phone is not logged in — and
`scanUpload` does no throttling:

```ts
export async function scanUpload(ctx: Ctx, params: { token: string }, file: IncomingFile) {
  const settings = await ctx.config.get(storageConfig);
  const store = createScanTokenStore(ctx.redis, () => ctx.clock.now());
  const claimed = await store.claim(params.token);
  if (!claimed) throw new DomainError('STORAGE_SCAN_TOKEN_INVALID');
  …
```

`userUpload`, two hundred lines up, does (`storage.service.ts:665-673`).

Guessing the token is not the worry: 24 characters over a 32-symbol alphabet is
120 bits. The worry is that this is an **unauthenticated multipart endpoint**.
Every attempt parses a body and sniffs it up to `maxUploadBytes` before the
token is found to be wrong, so a single client can make the server do that work
as fast as it can send.

Asked for: the same fixed-window bucket `userUpload` uses, keyed on the client
address (and a second, tighter bucket on the token, so one code cannot be
hammered), applied **before** the body is read.

## 2. `COMPLETE_LUA` checks existence, not state

```lua
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('HSET', KEYS[1], 'state', 'used', 'attachmentId', ARGV[1])
```

`CLAIM_LUA` and `RELEASE_LUA` are both written as compare-and-set on `state`;
this one is not, so it will stamp `used` over a `pending` record. The doc
comment says "Marks a **claimed** token used", which is what the code should
say:

```lua
if redis.call('HGET', KEYS[1], 'state') ~= 'claimed' then return 0 end
```

Not reachable through `scanUpload` today, because it always claims first. It is
a weaker invariant than the file claims to hold, in the one place where the
invariant *is* the security property, and it costs one line.

## Neither has a test

`storage.concurrency.int.test.ts::scan tokens are single-use > lets exactly one
of six phones upload through one QR code` covers the claim path. Suggested
additions: a rate-limit test shaped like the storefront upload one, and a
`complete()` on a `pending` token returning 0.
