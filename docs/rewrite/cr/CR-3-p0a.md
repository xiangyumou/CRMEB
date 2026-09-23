# CR-3-p0a — `typescript-eslint` cannot load against TypeScript 7.0

**Status (R5 sweep, 2026-09-23): RESOLVED** — the workaround is accepted and documented in CONVENTIONS' tooling caveats (`scripts/eslint-ts6.mjs`). The status line below is kept as history.

**Stream:** P0-a platform **Status:** worked around, no action needed unless you disagree
**File:** `next/packages/config/package.json`

## What

`typescript-eslint@8.70.0` refuses to run on TypeScript 7.0:

```
$ corepack pnpm lint
typescript-eslint does not support TS 7.0.
Please see https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0
See also https://github.com/typescript-eslint/typescript-eslint/issues/10940
Error: typescript-eslint does not support TS 7.0.
```

TS 7.0 is the native (Go) compiler; typescript-eslint needs the JavaScript
compiler API, which TS 6 is the last release to provide. Upstream tracks TS ≥ 7.1
support in issue 10940.

## The workaround

`@shop/config` — and only `@shop/config` — pins `typescript@6.0.3` as a
devDependency. pnpm resolves `typescript-eslint`'s peer against that, so the
ESLint parser gets the TS 6 API. **Every package still runs `tsc` from TS 7.0.2**;
nothing about typechecking changes.

```
packages/config/package.json
  devDependencies.typescript: "6.0.3"   ← parser only
every other package
  devDependencies.typescript: "^7.0.2"  ← tsc
```

Verified: `corepack pnpm lint` and `corepack pnpm typecheck` are both green.

## The cost

Two TypeScript copies in the store (~50 MB), and lint is not type-aware — which
this stream chose anyway, so that lint stays fast enough for ten streams to run
on every commit.

## When to remove it

When typescript-eslint supports TS ≥ 7.1: drop the `typescript` devDependency
from `@shop/config`. Nothing else changes.
