# Contributing

How a change gets in. Read [conventions.md](conventions.md) first;
[architecture.md](architecture.md) explains where things live.

## The merge checklist

Run from the repository root. Every step must pass; a step that cannot run is reported as not run,
with the reason, never as passed.

```sh
pnpm gen            # after adding or removing a contract, job, config group, menu or domain
pnpm turbo run gen typecheck lint test:unit build
pnpm turbo run test:int --force --concurrency=4
pnpm exec prettier --check .
pnpm --filter @shop/contracts check:examples
pnpm guards
pnpm turbo run build --filter @shop/web && pnpm --filter @shop/e2e-admin e2e
pnpm --filter @shop/e2e-storefront test
```

| Step                | What it proves                                                                                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typecheck`, `lint` | Strict types, and the import boundaries: no business logic in route files, `core` free of Next.js and React, the admin UI free of `core` and `db`, tables touched only by `*.repo.ts`.                                                                                                                                           |
| `test:unit`         | The pure logic. If the web suite flakes under turbo's parallelism, rerun `pnpm --filter @shop/web test:unit` on its own before calling it a failure.                                                                                                                                                                             |
| `test:int`          | Services against real PostgreSQL and Redis, including every concurrency test. `--force` because a cached pass proves nothing about the current database. Needs Docker.                                                                                                                                                           |
| `prettier --check`  | Formatting.                                                                                                                                                                                                                                                                                                                      |
| `check:examples`    | Every contract example parses against its route's schemas, so the mock server and the docs show valid payloads.                                                                                                                                                                                                                  |
| `pnpm guards`       | The whole-tree checks: contracts and routes agree, permission atoms are declared and used, retired features stay out, no secrets, migrations are additive, the uni-app resolves every call and page, the business-rule catalogue is consistent, the release pipeline keeps its rules. It must end with 0 failures and 0 pending. |
| admin e2e           | The admin console in a real browser, against the production build of `apps/web`. Build first: the suite serves whatever build exists, and a stale one hides fixes.                                                                                                                                                               |
| storefront e2e      | The H5 storefront in mobile Chromium, through the edge, against the built app and worker.                                                                                                                                                                                                                                        |

Depending on what the change touches, also run:

- `apps/uni-app/**`: `cd apps/uni-app && npm test && npm run build:h5` (and `npm run
build:mp-weixin` if a `#ifdef MP-WEIXIN` block changed).
- `deploy/**` or `docker/**`: `shellcheck deploy/*.sh deploy/lib/*.sh deploy/rehearsal/*.sh` and the
  drill, `deploy/rehearsal/drill.sh` (it builds the three images; allow about fifteen minutes).
- `.github/**`: `actionlint`, and `.github/scripts/publish-release.test.sh` if the publish script
  changed.

CI (`.github/workflows/next.yml`) runs the checklist, shellcheck, the publish-script proof and the
drill on every pull request that touches the code; the uni-app's `npm test` is yours to run.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(coupon): …`,
`fix(order): …`).

## Adding a route to an existing domain

1. **Contract.** In `packages/contracts/src/<domain>/<domain>.<surface>.contract.ts` add a
   `defineRoute({...})` with `id`, `method`, `path`, `auth`, `summary`, `tags`, `response` and
   `examples`, plus `permission`, `params`, `query`, `body`, `status` and `errors` as needed. Reuse
   the shapes in `_conventions/common.ts` (`id`, `money`, `instant`, `pageQuery`, `paged`,
   `sortQuery`). Give it at least one example.
2. **Errors.** A new failure the client must tell apart gets a code in the domain's `errors.ts`
   (`defineErrors`), with its HTTP status and a Chinese message; list it in the route's `errors`.
3. **Permission.** An admin route names an atom. If it is new, add it to the domain's
   `permissions.ts` (`definePermissions('<domain>', { '<resource>:<action>': '中文说明' })`).
4. **Service.** Implement it in `packages/core/src/<domain>/`: a service function taking
   `(ctx, input)`, database access in the domain's `*.repo.ts`. Follow the domain rules in
   [conventions.md](conventions.md#domain-rules): `withTx`, conditional updates, `Money`, `Clock`,
   third-party calls through the effects ledger.
5. **Route file.** Create `apps/web/app/<admin-api|api/v1>/<path>/route.ts` mirroring the contract
   path (`:id` becomes `[id]`):

   ```ts
   export const POST = handle(couponAdminCreate, async (ctx, { body }) => {
     const created = await coupon.adminCreate(ctx, body);
     ctx.audit(`coupon:${created.id}`);
     return created;
   });
   export const dynamic = 'force-dynamic';
   ```

6. **Tests.** A unit test for pure logic, an integration test for the service, and a
   `runConcurrently` test for every conditional state change.
7. **Admin page** (if any): under `apps/web/app/admin/(shell)/<domain>/`, built from the kit,
   calling the route through `useRouteQuery` / `useRouteMutation`. Add a menu entry in
   `apps/web/src/admin/menu/<domain>.menu.ts` with the atom that guards it.
8. **Mobile client** (if the storefront uses it): a function in the matching module under
   `apps/uni-app/api/` (`order.js`, `user.js`, …) calling the path, and a mapper in
   `api/mappers/<domain>.js` that turns the response into the field names the page reads.
9. `pnpm gen`, then the checklist.

## Adding a domain

1. `packages/db/src/schema/<domain>.ts` for the tables, then a migration (below).
2. `packages/contracts/src/<domain>/`: `schemas.ts`, `errors.ts`, one `*.contract.ts` per surface
   (admin, storefront, staff).
3. `packages/core/src/<domain>/`: `index.ts` (the domain's only public face), services, repos,
   `permissions.ts`, and as needed `effects.ts` (post-commit handlers), `*.config.ts` (settings) and
   port registrations. The domain installs itself either as a side effect of `index.ts` or through
   one exported `register<Domain>Domain()`; `pnpm gen` picks up both.
4. Routes, pages, menu and jobs as for any route.
5. If the domain acts on orders, go through the ports in `packages/core/src/order/ports.ts` (hooks,
   `PricingContributor`, `OrderKindHandler`), never through another domain's tables.

No shared index needs editing: `pnpm gen` finds the new files.

## Other additions

- **A job**: `apps/worker/src/jobs/<domain>.<verb>.ts` exporting `defineJob({...})` with a `name`,
  a payload `schema` and a `handler`, plus `repeat` for a scheduled one. The handler calls a
  service; the service enqueues through `ctx.queue`.
- **A settings screen**: `packages/core/src/<domain>/<name>.config.ts` with `defineConfigGroup`.
  Every field has a default. Read it with `ctx.config.get('<group>')`. The admin screen is a
  `<ConfigGroupForm>`.
- **A side effect**: record it in the transaction that changes state, and register an idempotent
  handler in the domain's `effects.ts`.
- **A third-party call**: behind a port in `core`, with a fake in `@shop/testing`. Tests never call
  the real service.

## Changing the schema

Edit `packages/db/src/schema/<domain>.ts`, then generate the migration:

```sh
pnpm --filter @shop/db db:generate
```

- A migration that has been applied (anything already merged) never changes. Fix forward with a new
  one.
- Migrations are additive. A `DROP TABLE`, `DROP COLUMN` or `ALTER COLUMN … TYPE` needs a
  `-- destructive: approved` comment on the statement and a reason in the pull request; the guard
  refuses it otherwise. Production upgrades roll back to the previous images, which must still run
  on the new schema.
- Check it with `pnpm --filter @shop/db db:migrate` against a scratch database and with the
  integration tests.

## Business rules

[invariants.md](invariants.md) is the catalogue of the shop's business rules. Each rule has an ID
(`COUPON-007`, `PRICE-004`: an upper-case area and a three-digit number), a statement of the rule,
and the tests that prove it.

- **Cite a rule from a test** by starting the `describe` or `it` title with its ID:

  ```ts
  describe('COUPON-007 — the last coupon, claimed by two people at once', () => { … });
  ```

- **Cite a test from the catalogue** as `<file>::<title path>`, where the file is relative to the
  repository root and the title path joins the nested `describe` and `it` titles with `>`:

  ```
  packages/core/src/coupon/coupon.concurrency.int.test.ts::COUPON-007 — the last coupon, claimed by two people at once > …
  ```

- **A new rule** gets the next free number in its area, a row in the catalogue, and at least one
  test that proves it. A rule that a guard enforces cites the guard's check instead.
- **Changing a rule's behaviour** means changing its row in the same pull request. Renaming or
  moving a test means updating the rows that cite it.

The `invariants` guard fails when a row cites no test, when a cited test does not exist, when an ID
appears twice, or when a test names an ID the catalogue does not have.
