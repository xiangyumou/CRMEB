# F1 — DIY v2 backend (`decor` domain): status

Branch `storefront/mini-F1-decor-backend`. Updated at every commit so the work can resume after an
interruption.

## Done

- R0 (storefront route catalogue) merged from `storefront/mini` (fast-forward to 6b4f48b96).
- Contracts `packages/contracts/src/decor/`: zod-free `constants.ts` (+ `ROUTE_LINK_LABELS`),
  `meta.ts` (editor-metadata conventions), `base.ts` (style + visibility base props,
  `blockProps`), `link.ts` / `link-route.ts` (`LinkTarget`, `route` = linkable catalogue route),
  `sources.ts` (data sources, `DataNeed`, resolved shapes), `registry.ts` (`defineBlock`,
  migrations, `compareVersions`), `blocks/*` + `all-blocks.ts` (carousel, imageCube, productGrid,
  userCard, orderEntry, serviceGrid), `document.ts` (envelope, `checkDocument`,
  `collectReferences`), `defaults.ts` (built-in 个人中心), `errors.ts`, `schemas.ts`,
  `examples.ts`, `decor.admin.contract.ts`, `decor.storefront.contract.ts`, `decor.test.ts`.
- `packages/storefront-blocks/src/schema/` is now a re-export shim over the contracts; blocks
  import types only (+ zod-free constants). S3 editor code in `apps/web/src/admin/decor` adapted to
  the new `route` link shape.

## In progress

- DB schema `packages/db/src/schema/decor.ts` + migration 0004.

## Next

1. Core `packages/core/src/decor/`: repo, document service (CRUD, draft lock, publish, rollback,
   designate), preview tokens, resolver + registry of per-need resolvers, cache, permissions.
2. Guards: add `decor` to `guards/src/lib/install-domains.ts`.
3. Admin (`apps/web/app/admin-api/decor/**`) and storefront (`apps/web/app/api/v1/pages/**`)
   route files; int tests incl. `runConcurrently`.
4. `docs/invariants.md` DECOR rows, `docs/mini/decor.md`.
5. Merge checklist.

## Decisions / deviations so far

- `platforms` visibility is `hidden` in the editor until F2 adds a multi-select control.
- Preview token: opaque random token in Redis (no signing secret exists in env).
