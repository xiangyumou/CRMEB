# CR-5-k — minting a scan-to-upload token writes an audit row with no target

**Stream:** K (hardening) **Status:** RESOLVED — by CR-30-k2 at K2's merge
**Files:** `next/apps/web/app/admin-api/attachments/scan-tokens/route.ts`

## What

`handle()` writes an audit row for every mutating admin request by itself, but
the *target* — which coupon, which order, which token — can only come from the
handler, through `ctx.audit(target)`. `POST /admin-api/attachments/scan-tokens`
never calls it:

```ts
export const POST = handle(storageScanTokenCreate, (ctx, { query }) =>
  storage.scanTokenCreate(ctx, query),
);
```

So the audit log gains a row saying "an admin called POST
/admin-api/attachments/scan-tokens" and nothing else.

## Why it matters

This is the one route that mints a credential. The token is a bearer secret that
lets an *unauthenticated phone* upload into the library as that admin — that is
the whole feature, and it is why the route was rewritten in the first place
(the old system kept one token under a fixed cache key, so a phone scanning an
older code uploaded into whichever admin had opened the dialog last).

The two questions an audit log exists to answer about a credential are "which
one" and "who has it". The row as written answers neither: given a file that
appeared in the library through a scan upload, there is no way to walk back from
the upload to the minting event, because the two rows share no identifier.

## Asked for

`ctx.audit({ token: <the token's id or a prefix of it>, purpose, expiresAt })`,
with `scanTokenCreate` returning enough for the handler to name it. **Not the
token itself** — an audit row is read by more people than hold the credential,
and a full bearer token in a log is a credential in a log.

The token's id (or a short prefix, if the id is the token) is enough to join the
mint to the upload, which is the property worth having.

## Until then

`pnpm guards`' `route-hygiene` check carries this as a named exemption pointing
at this CR, so it reports `pending(F1)` rather than passing silently. The
exemption list is compared exactly: when the route starts naming a target, the
guard fails until the entry is deleted.

Two other admin writes are exempt for reasons that are decisions rather than
defects, recorded there and in `AUDIT.md`:

- `POST /admin-api/auth/login` — `auth: 'public'`, so there is no admin actor
  yet and `handle()` writes no row at all (see **K-SEC-A4** in `AUDIT.md`).
- `POST /admin-api/catalog/sku-matrix` — a POST-shaped read: the spec axes go in
  the body and nothing is written.
