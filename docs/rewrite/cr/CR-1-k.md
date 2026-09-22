# CR-1-k — `domains.gen.ts` installs half the domains, in bundles only

**Stream:** K (hardening) **Status:** OPEN — needs the orchestrator (generator is orchestrator-owned)
**Files:** `next/packages/core/scripts/gen-config-groups.ts` (generator), `next/packages/core/src/domains.gen.ts` (generated), `next/apps/web/src/server/domains.test.ts`

## What

`domains.gen.ts` installs the four domains that export a registrar by calling
it, and installs the other eight by importing them for their side effects —
written as a namespace import whose binding is never read:

```ts
import * as diy from './diy/index';
```

**esbuild deletes an unused namespace import.** It is allowed to: the binding is
unused and the module is not marked as having side effects, so the import is
dead code. The domain's `definePermissions(...)` and `defineConfigGroup(...)`
calls never run, and the registry is short.

Which bundler you use decides whether the application works:

| toolchain | namespace import | result |
| --- | --- | --- |
| SWC (`next dev`, `next build`) | kept | 12 domains, correct |
| oxc (vitest) | kept | 12 domains, every test green |
| **esbuild (tsup → `apps/worker`, and tsx)** | **elided** | **6 domains** |

Proven three ways on this tree:

1. `pnpm --filter @shop/worker build`, then
   `grep -c '查看装修页面' apps/worker/dist/main.js` → `0`. The bundle's source
   map lists only `catalog`, `effects`, `order`, `payment` and `refund` indexes.
2. Loading `@shop/core/domains` under `tsx` registers 44 permission atoms from
   6 domains; the same import under vitest registers 69 atoms from 10.
3. `pnpm guards` reported 19 undeclared DIY route atoms and 4 undeclared DIY
   menu atoms until `guards/src/lib/install-domains.ts` started importing all
   twelve domains by name.

## Why it matters

`apps/worker` is the process that runs the effect dispatcher, the reconciliation
sweep and the queues. Six domains' effect handlers, permission atoms and config
groups are missing from its bundle. What that costs depends on the domain — an
unregistered config group reads as "unconfigured", an unregistered effect
handler is an effect nobody consumes — and none of it shows up in a test,
because the test runner is the one toolchain that keeps the import.

`domains.test.ts` cannot catch it either: it asserts the four domains with
explicit registrars, which are exactly the four that survive.

## Proposed fix

1. `gen-config-groups.ts` emits a bare side-effect import next to the namespace
   one (or instead of it), which no bundler may remove:

   ```ts
   import './diy/index';
   ```

2. `domains.test.ts` asserts the property rather than a sample: for every name
   in `DOMAIN_NAMES`, something was registered — at least one permission atom,
   config group, port or effect handler carrying that domain's prefix.

3. A build-time assertion in `apps/worker`: after the bundle is written, check
   that `DOMAIN_NAMES.length` domains are present in it. Cheap, and it fails in
   CI rather than in production.

Until (1) lands, `guards/src/lib/install-domains.ts` imports every domain by
name and `pnpm guards`' `domains` check reports the elision as
`pending(orchestrator)`. The guard's own list is compared against
`DOMAIN_NAMES`, so a thirteenth domain fails the guard rather than joining the
missing six quietly.
