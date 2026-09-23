# I1 — guards, CI, docs: status

Branch `storefront/mini-I1-guards-ci`, from `storefront/mini` (R0's route catalogue merged in at
`6b4f48b96`).

## Done

- **`mini` guard** (`guards/src/checks/mini.ts`, readers in `guards/src/lib/mini.ts`), the 15th
  check. Seven tagged rules: `[pages]`, `[routes]`, `[platform]`, `[nutui]`, `[privacy]`,
  `[retired]`, `[config]` (see `guards/README.md`). `uniapp` is untouched.
  - Route parity runs against R0's catalogue (51 keys). `UNBUILT_ROUTES` excuses the 44 keys whose
    page is not built yet, and `UNCATALOGUED_PAGES` the shell's `pages/home/index` (the catalogue's
    `home` is `pages/index/index`). Both lists are exactly compared, so they only shrink as
    streams A and B register pages.
- **Mutation tests**: `guards/scripts/mutations/mini.ts` (23 mutants, every rule covered) plus one
  shared-package mutant, run by `guards/src/checks/mini.mutations.test.ts` in the unit suite. All
  killed; the baseline copy passes.
- `retired` scans `apps/mini/src`, `packages/api-client/src` and `packages/storefront-blocks/src`;
  `invariants` already read the whole repository and now has a test that proves it reads the
  mini-program's tests.
- `guards/turbo.json`: `test:unit` inputs include `apps/mini` and the two shared packages, so a
  cached pass is not replayed over a changed app.

## In progress

- CI (`.github/workflows/ci.yml`), docs (`contributing.md`, `architecture.md`, `conventions.md`),
  the DevTools / real-device kit (`docs/mini/device-check.md`).

## Open

- Merge order: if stream A's page skeleton merges before this branch, `UNBUILT_ROUTES` /
  `UNCATALOGUED_PAGES` entries for the pages A registers become stale and `pnpm guards` fails
  until they are deleted (by design). Either merge this first and let A shrink the lists, or
  merge A first and I shrink them here.
