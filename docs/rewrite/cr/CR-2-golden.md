# CR-2-golden — `@shop/core/<domain>` does not resolve; every import says `/index`

**Stream:** Golden slice (coupon) **Status:** worked around, one-line fix available
**Files:** `next/packages/core/package.json` (P0-A owned)

## What

The export map is:

```json
"exports": {
  ".": "./src/index.ts",
  "./kernel": "./src/kernel/index.ts",
  "./order/ports": "./src/order/ports.ts",
  "./effects": "./src/effects/index.ts",
  "./auth": "./src/auth/index.ts",
  "./*": "./src/*.ts"
}
```

`./*` maps to `./src/*.ts`, a **file**, so `@shop/core/coupon` looks for
`src/coupon.ts` and fails; a domain is a directory with `src/coupon/index.ts` in
it. `kernel`, `effects` and `auth` each got a hand-written line, which is why
nobody noticed: those three are the only directories exported so far.

Every route file in this slice therefore reads:

```ts
import * as coupon from '@shop/core/coupon/index';
```

It works, and it is what 15 streams will copy — an `/index` on the end of every
domain import in the codebase, forever, because the first one did it.

## Ask

Add one line, before the `./*` fallback (order matters — Node takes the most
specific match, but keeping it above is clearer):

```json
"./*/index": "./src/*/index.ts",
"./*": "./src/*.ts"
```

or, better, replace the three hand-written directory entries and the fallback
with:

```json
"./*": ["./src/*/index.ts", "./src/*.ts"]
```

so `@shop/core/coupon` resolves to `src/coupon/index.ts` and
`@shop/core/coupon/ports` still resolves to `src/coupon/ports.ts`. Then
`@shop/core/kernel`, `/effects` and `/auth` need no special-casing either.

When this lands, `sed -i "s#@shop/core/\(\w*\)/index#@shop/core/\1#"` over the
route files is the whole migration; this stream will take it in a follow-up
rather than blocking on it.

## Related, same file

`@shop/core`'s root export (`.` → `src/index.ts`) is a barrel that pulls every
domain into every consumer. Route files import the domain directly to avoid it,
but nothing enforces that. Worth an ESLint `no-restricted-imports` on
`@shop/core` (exact) in `apps/web/app/**`, so a barrel import is a lint error
rather than a slow cold start.
