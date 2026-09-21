# Path ownership

Executors edit only the paths of their stream. Everything not listed belongs to the orchestrator.

## Orchestrator only

- `next/` root files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, lockfile, dotfiles)
- `next/packages/config/**`
- `next/packages/db/**` (schema, migrations, seeds)
- `next/packages/core/src/kernel/**`, `next/packages/core/src/order/ports.ts`
- `next/packages/contracts/src/_conventions/**`
- `next/packages/testing/**`
- `next/apps/web/src/admin/kit/**`, `next/apps/web/src/server/**` (the `handle()` binder, auth, RBAC)
- `.github/workflows/next.yml`
- `docs/rewrite/*.md` (except `status/<ws>.md`, `cr/*.md`)

During Phase 0 these are delegated to the P0 executors named below and revert to the orchestrator at the `rewrite-p0-freeze` tag.

## Phase 0

| Stream                | Paths                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0-S business schema  | `next/packages/db/src/schema/<domain>.ts` for every business domain, `next/packages/db/{src/seed,seed-data,scripts,docs}/**`                                                                                                                                             |
| P0-A platform runtime | `next/packages/{config,core,testing}/**`, `next/packages/contracts/**` (not `_conventions/`), `next/packages/db/src/schema/{auth,system}.ts`, `next/apps/worker/**`, `next/apps/web/src/server/**`, `next/apps/web/app/{admin-api,api}/**`, `.github/workflows/next.yml` |
| P0-B admin shell      | `next/apps/web/**` except `src/server/**` and `app/{admin-api,api}/**`                                                                                                                                                                                                   |

The orchestrator owns the lockfile, `pnpm-workspace.yaml`, the `0000_init` migration and cross-file foreign keys, and wires them when merging the three.

## Domain streams

For a domain `<d>`, the owning stream owns exactly the paths listed under "Where a domain's files go" in `CONVENTIONS.md`.

| Stream | Domains                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------- |
| A      | `catalog`                                                                                      |
| B1     | `cart`, `order/{create,pricing,cancel}`                                                        |
| B2     | `order/{fulfil,invoice,staff}`, admin pages `orders`                                           |
| C      | `payment`, `refund`, `wechat/core`, and the fake gateway `next/packages/testing/src/wechat/**` |
| D      | `groupbuy`, `presale`                                                                          |
| E1     | `user`, `auth/storefront`, `sms`                                                               |
| E2     | `wechat/oa`, `notification`                                                                    |
| F1     | `system`, `storage`                                                                            |
| F2     | `shipping`, `cms`, `stats`                                                                     |
| G1     | `diy` (contracts, core, admin `diy/{shell,canvas,preview}`)                                    |
| G2     | admin `diy/panels`                                                                             |
| H      | `template/uni-app/{api,utils/request.js,config}`                                               |
| I      | `template/uni-app/tests`, `next/e2e/storefront`                                                |
| J      | `next/packages/etl` (runner; mappers belong to domains), `deploy/next`, `next/docker`          |
| K      | `next/e2e/admin`, `next/guards`                                                                |
