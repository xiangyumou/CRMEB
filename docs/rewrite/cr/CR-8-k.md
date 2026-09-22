# CR-8-k — an admin session older than 32 hours survives a password change

**Stream:** K (hardening) **Status:** OPEN — for the orchestrator / P0-A (auth kernel)
**Files:** `next/packages/core/src/auth/admin-session.store.ts`, `next/packages/core/src/auth/admin-auth.service.ts`

## What

`changePassword` bumps `password_version` and calls `revokeAll`, and
`revokeAllForAdmin` deletes every token listed in a per-admin Redis set:

```ts
async revokeAllForAdmin(adminId) {
  const hashes = await redis.smembers(indexKey(adminId));   // the index
  if (hashes.length > 0) await redis.del(...hashes.map((h) => `${keyPrefix}${h}`));
  ...
}
```

The index is the *only* list of an admin's sessions, and it expires:

```ts
// create()
.sadd(indexKey(session.adminId), hashed)
.pexpire(indexKey(session.adminId), ttlMs * 4)      // 32 h, set once
```

The session key has a **sliding** TTL — `resolve()` does
`redis.pexpire(key, ttlMs)` on every request — but nothing slides the index.
So an admin who keeps working:

- hour 0 — logs in. Session key 8h, index 32h.
- hours 0–32 — every request pushes the session key out another 8 hours.
- hour 32 — **the index expires.** The session key is still alive and still
  being refreshed.
- any time after — `changePassword` runs `smembers` on a key that no longer
  exists, gets `[]`, deletes nothing, and reports `revoked: 0`.

The session keeps working, for as long as it keeps being used.

The store's own comment says the version is kept "as a second belt in case a
revoke ever misses":

```ts
 * bumps `password_version` *and* calls `revokeAllForAdmin` … — the
 * version is kept as a second belt in case a revoke ever misses.
```

**There is no second belt.** `resolve()` reads the session out of Redis and
returns it; nothing compares `session.passwordVersion` with the admin row, and
there is no database read on that path by design. `grep -rn passwordVersion`
finds the comparison on the *storefront* side only
(`user-session.service.ts:88`), which is where the plan's "商城令牌不绑定密码"
item was fixed. The admin side has the same hole the plan set out to close.

## Why it matters

This is the path an operator takes after "I think my account was compromised".
They change the password, the UI says it is done, and the attacker's session —
which is precisely the session most likely to be old and continuously used —
keeps its access.

`auth.int.test.ts::admin sessions > changing the password bumps password_version
and kills every session` does not catch it: it logs in and revokes in the same
millisecond of fake-clock time, while the index is fresh.

## Proposed fix

Either one closes it; the pair is better.

1. **Slide the index with the session.** In `resolve()`, alongside
   `pexpire(key, ttlMs)`, refresh `pexpire(indexKey(session.adminId), ttlMs * 4)`.
   One extra Redis command on the hot path, and the index then outlives every
   session it lists.

2. **Make the second belt real.** Give the session an absolute expiry
   (`createdAt + maxLifetimeMs`) that sliding cannot extend, so a session cannot
   outlive its index in the first place. 24 h absolute against an 8 h sliding
   window costs a working admin one login a day.

3. If the `passwordVersion` comparison is meant to exist, it has to read the
   admin row — which is a database round-trip per request the design
   deliberately avoids. Prefer (1) + (2) and **delete the comment**, so the
   next reader does not trust a belt that is not there.

A test that fails today: create a session, advance the fake clock past
`ttlMs * 4` while resolving it (so the session slides but the index does not),
change the password, and assert the token no longer resolves.
