# CR-3-a — a domain cannot read its own config group without `system/index.ts`

**Stream:** A (catalog) **Status:** RESOLVED — superseded by CR-2-c
**Files:** `next/packages/core/src/system/index.ts` (new, F1-owned)

## What

Two rules that are each reasonable point in opposite directions.

CONVENTIONS, "A domain owns exactly these paths":

| Config groups | `packages/core/src/system/config/<group>.config.ts` (group named after the domain) |

CONVENTIONS, "Import boundaries (ESLint-enforced)":

> A domain in `core` may import another domain only through that domain's
> `index.ts` or through ports in `core/src/order/ports.ts`.

`boundaries/core-cross-domain` implements that literally: from
`core/src/catalog/**`, the only permitted relative import into `system` is
`'../system'`, `'../system/index'` or `'../system/index.ts'`. Everything else,
including `'../system/config/catalog.config'`, is an error.

So a config group must live in the `system` domain, and the domain that owns it
cannot import it. `core/src/system/index.ts` did not exist — stream A is the
first to define a config group, so nobody had hit this yet.

## What stream A did

Created `core/src/system/index.ts` with one line:

```ts
export { catalogConfig } from './config/catalog.config';
```

and imports `catalogConfig` from `'../system'`. The file carries a comment
saying F1 owns it and pointing here.

## Ask

F1 takes the file over when the system domain lands. Either keep it as the
place every config group is re-exported from, or replace it with the system
domain's real index and keep these exports inside it. Nothing outside depends
on its shape — only on `'../system'` resolving.

Worth deciding at the same time: **every stream with a config group will add a
line here**, which is the one shared file CONVENTIONS' "no shared index to
edit, so parallel streams do not conflict" promise was meant to avoid. Two
alternatives that keep the promise:

1. `pnpm gen` aggregates `core/src/system/config/*.config.ts` into a gitignored
   `config.gen.ts` and `system/index.ts` re-exports that. Same as the routes
   and errors buckets; no stream ever edits a shared file.
2. Add `config` to `CORE_SHARED` in `packages/config/eslint/boundaries.js`
   (alongside `kernel`, `effects`, `auth`) and let a domain import
   `../system/config/<its own>.config`. A config group is closer to kernel
   infrastructure than to another domain's internals, so this reading is
   defensible and needs no aggregation step.

(1) is more consistent with the rest of the build; (2) is one line. Stream A
has no preference and will follow whichever lands.

## Risk if nothing happens

None immediately — the one-line index works. The cost is a merge conflict in a
single file every time two streams add a config group in the same wave.

## Resolution

Superseded by CR-2-c, which took the better of the two options this CR offered
and went further: a config group now lives at
`packages/core/src/<domain>/<group>.config.ts` and is registered from that
domain's own `index.ts` (CONVENTIONS, "Where a domain's files go"). There is no
shared file to conflict on at all, which is what this CR actually wanted.

`catalog.config.ts` moved from `core/src/system/config/` to
`core/src/catalog/`, the three services that read it import it directly, and
`core/src/catalog/index.ts` exports `catalogConfig`. The placeholder
`core/src/system/index.ts` and the `core/src/system/config/` directory are
deleted — `system/` belongs to F1, which is landing its own index.
