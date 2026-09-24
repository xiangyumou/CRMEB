# R1 — release prep: status

Branch `storefront/mini-R1-release-prep`, from `storefront/mini` (`f0a0b50`).

## Done

- **`api-compat` guard** (16th check): `guards/src/checks/api-compat.ts`, diff in
  `guards/src/lib/api-compat.ts`, unit tests `guards/src/lib/api-compat.test.ts` (20 cases),
  baseline `guards/baselines/storefront-api.json` (185 operations, `"release": null`), refresh
  command `pnpm --filter @shop/guards api-compat:refresh --release <x.y.z> | --unreleased`
  (`guards/scripts/api-compat-refresh.ts`). Report-only: `ENFORCED = false` in the check.
  Documented in `guards/README.md`.

## In progress

- Landing page for `/` in `apps/web`.
- `docs/mini/cutover.md`: §2.10 edge change, §5 the guard's switch.

## Pending

## Page-form changes

None in the mini-program.

## Backend gaps

## Open questions

## Tests for the orchestrator to run

- After merging H6 (optional `bindToken` on `auth.passwordLogin`) or any other `/api/v1` change:
  `pnpm --filter @shop/guards api-compat:refresh --unreleased`, commit the baseline.
