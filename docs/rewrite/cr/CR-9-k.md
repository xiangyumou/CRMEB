# CR-9-k — the audit log redacts only the top level, and every secret is one level down

**Stream:** K (hardening) **Status:** OPEN — for the orchestrator / P0-A (`handle()` + audit repo)
**Files:** `next/packages/core/src/auth/audit.repo.ts`, `next/packages/contracts/src/system/schemas.ts`

## What

Every mutating admin request has its body written to `audit_logs.payload`, after
`redactPayload` removes the dangerous keys:

```ts
const STRIP = new Set(['password', 'oldPassword', 'newPassword', 'passwordHash',
                       'token', 'captchaToken', 'secret', 'appSecret',
                       'apiV3Key', 'privateKey']);

if (typeof payload === 'object' && !Array.isArray(payload)) {
  value = Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).map(([key, entry]) =>
      STRIP.has(key) ? [key, '[redacted]'] : [key, entry]),
  );
}
```

`Object.entries` of the top level: **the redaction is one level deep.** The list
even names the right keys — `apiV3Key`, `privateKey`, `appSecret` — which are
exactly the fields of the `payment` and `wechat` config groups.

And the route that carries them nests them:

```ts
export const configSaveBody = z.object({
  values: z.record(z.string(), z.unknown()),
});
```

`PUT /admin-api/system/config/payment` therefore writes

```json
{"values":{"mchId":"16…","apiV3Key":"<the key>","privateKey":"-----BEGIN PRIVATE KEY-----…"}}
```

into `audit_logs.payload`, in the clear. The merchant private key and the v3 API
key — the two credentials that let anything sign a WeChat Pay request as this
shop — are in an ordinary table, readable by anything that can read the
database: a support query, a backup, a `SELECT * FROM audit_logs` in a console,
or an ETL dump.

The 4000-character cap does not save it. A PEM private key is well under that,
and a truncated key is still a disclosed key.

The existing test does not catch it because it checks the one route whose secret
*is* top level: `handle.int.test.ts::writes an audit row for the logout, with no
secret in it` asserts the login password (a top-level `password`) is absent.

## Why it matters

This is a "fix, don't port" item in spirit: the audit log is supposed to be the
record you hand to somebody investigating an incident, which means it is read by
more people than hold the credentials. A credential store that fills itself in
passing is worse than no log, because the log is copied around on the assumption
that it is safe to copy.

## Proposed fix

1. **Redact recursively**, with a depth cap, and on arrays as well as objects.
   The key list stays; what changes is that it is applied at every level.

2. **Redact by contract, not by name.** `handle()` knows the route, and the
   config group descriptor already marks every secret field (`ui.secret` /
   `type: 'password'`) — the same information that makes a secret travel as an
   "is set" boolean on the way *out*. The write path should use it: strip what
   the contract says is secret, and keep the key list only as a backstop for
   routes with no descriptor.

3. A test per direction: a nested secret is redacted, and a config-group save of
   the `payment` group leaves no part of the key in `audit_logs`.

Point 2 is the one that keeps being true. The key list is a list of names
somebody has to remember to extend; the descriptor is already the thing that
knows.

## Related

`pnpm guards`' `secrets` check asserts the same property in the other direction
— that no secret config field can leave through a *response* schema, walking
every route's zod tree (5521 nodes). The write path is the half nothing
asserted.
