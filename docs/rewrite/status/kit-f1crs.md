# Kit & platform maintenance — CR-1-f1 … CR-5-f1, plus CR-8-c

Branch `rewrite/ws-kit-f1crs`, one commit per CR. All five F1 change requests
are applied and the local workarounds are deleted; CR-8-c arrived mid-task from
the orchestrator and landed with CR-3-f1, because it is the same generator.

## What landed

| CR | Commit | What |
|---|---|---|
| CR-1-f1 | `feat(core): carry visibleWhen on ConfigFieldUi` | `ConfigVisibleWhen` on `ConfigFieldUi`, validated at declaration, carried to the kit form |
| CR-2-f1 | `feat(core): give the "my own account" routes their own atoms` | `auth:profile:read` / `auth:profile:update`, implicit for every admin |
| CR-4-f1 | `feat(kit): let callRoute send a FormData body` | `RouteInput.formData`; `storage/upload.ts` is a wrapper |
| CR-5-f1 | `feat(kit): group ConfigGroupForm fields under section headings` | `section` on the descriptor, first-appearance dividers |
| CR-3-f1 + CR-8-c | `feat(core): generate the config-group and domain buckets` | `pnpm gen` writes `config-groups.gen.ts` and `domains.gen.ts` |

## Decisions

- **`formData` is a field on `RouteInput`, not the overload pair CR-4-f1
  suggested.** The overloads are correct TypeScript and eslint rejects them:
  `packages/config/eslint` does not turn off the base `no-redeclare` in favour
  of the TS-aware rule, so the second signature is `'callRoute' is already
  defined`. The field is also the more useful shape — `useRouteMutation` can now
  carry an upload without a second client.
- **Two generated buckets, not one.** Folding the config groups into the domain
  indexes would close a cycle: `system/config.service.ts` → `domains.gen.ts` →
  `system/index.ts` → `config.service.ts`. So `config.service.ts` imports
  `config-groups.gen.ts` (the groups and nothing else) and the two app
  bootstraps import `domains.gen.ts`.
- **`domains.gen.ts` self-invokes at module scope and exports
  `registerAllDomains()`.** The side-effect import is what the apps use; the
  exported function exists for a test that wants to prove idempotence. Every
  registrar is idempotent, so both are safe.
- **Registrars are found by scanning each `index.ts` for
  `export function register…Domain(`,** never by importing and reflecting: the
  generated file has to be readable, and a build must not execute domain code to
  be built.
- **`payment` reads its own settings behind `payment:config:write`.** The group
  holds the merchant private key, and `writePermissionFor` returns a non-`:read`
  atom unchanged, which is right. F1's sweep in `system.test.ts` asserted
  `/:read$/`; it now asserts `isKnownPermission()` plus `(read|write)`, which is
  the property that actually matters.
- **`system.test.ts` imports `../domains.gen` rather than `./index`,** which is
  what `handle.ts` imports in production. Importing one domain made those
  registry-wide sweeps test a half-loaded registry — `catalog:product:read` was
  not even declared while they ran.

## What other streams must know

- **Three settings screens appeared that nobody could reach**: `payment`,
  `refund` and `wechat` declared config groups that no module imported, so they
  were absent from `/admin/system/settings`. The generated bucket picks them up.
  If a group's fields were never exercised in a browser, this is the first time.
- **A domain registers either at import or through one exported
  `register<Domain>Domain()`, and nowhere else** — now written into
  `CONVENTIONS.md`. Stream C's stop-gap (four job files calling the registrars at
  module scope) is removed; the worker container does it before the dispatcher
  and the job registry are built.
- **`callRoute(route, { formData })`** is the way to upload from an admin page;
  no hand-written `fetch`, and `Content-Type` is deliberately absent so the
  browser writes the multipart boundary.
- **`visibleWhen` and `section`** are declared in a config group's `ui`, so a
  settings screen no longer needs a bespoke page to hide a driver's fields. A
  hidden field is not validated and not sent, and the server keeps its stored
  value.
