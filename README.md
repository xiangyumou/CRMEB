# CRMEB Shop

[简体中文](./README_ZH.md) | English

A single-merchant online shop for the Chinese market. Shoppers buy through a mobile storefront,
served as H5 in any phone browser (WeChat's included) and as a WeChat mini-program. The merchant
runs the shop from a web admin console.

What it does:

- **Catalog**: products with specifications and SKUs, categories, labels, parameters, reviews,
  keyword search.
- **Buying**: cart, checkout with shipping templates and coupon allocation, orders, invoices on
  request, automatic cancellation and receipt.
- **Payment and after-sales**: WeChat Pay v3 (JSAPI, mini-program and H5), reconciliation of stale
  payments, refunds with approval.
- **Marketing**: coupons, group buying (拼团) and presale (预售).
- **Fulfilment**: shipping, split shipments, logistics tracking, and store-staff (店员) screens on
  mobile.
- **Content**: a drag-and-drop page designer (装修) with themes, articles, agreements.
- **Customers**: SMS, password, mini-program and WeChat official-account sign-in; addresses, labels
  and groups.
- **WeChat official account**: menus, auto-replies, QR codes, media.
- **Operations**: roles built from permission atoms, an audit log, notifications (in-app, message
  templates, subscription messages), a statistics dashboard, local or S3-compatible storage.

## Stack

| Part           | What it is                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`     | Next.js 16 (App Router, standalone). The admin at `/admin` (React 19, Ant Design 6), its API at `/admin-api/*`, the storefront API at `/api/v1/*`. |
| `apps/worker`  | The BullMQ worker: scheduled jobs, on-demand jobs, and the dispatcher of post-commit side effects.                                                 |
| PostgreSQL 17  | The only database. Schema and migrations in Drizzle.                                                                                               |
| Redis 7        | Admin sessions, the config cache, rate limits, the job queue, pub/sub for live admin notifications.                                                |
| `apps/uni-app` | The mobile client (uni-app, Vue 2): the H5 storefront and the WeChat mini-program, built from one tree.                                            |
| edge           | nginx in front of everything: serves the H5 build at `/`, proxies `/admin`, `/admin-api`, `/api` and `/scan-upload` to `web`, serves `/uploads/`.  |

Everything but the uni-app is strict TypeScript on Node 24 and pnpm. Every endpoint is declared
once, as a zod contract in `packages/contracts`; the OpenAPI document, the typed admin client, the
mock server and the guards all derive from it. See [docs/architecture.md](docs/architecture.md).

## Repository layout

```
apps/
  web/          Next.js: admin pages, /admin-api, /api/v1
  worker/       the BullMQ worker and its jobs
  uni-app/      the mobile client (an npm project, outside the pnpm workspace)
packages/
  config/       shared ESLint, TypeScript and Vitest presets
  contracts/    route contracts (zod) → OpenAPI; the single source of truth for the API
  core/         the domain logic, one directory per domain, plus kernel/
  db/           Drizzle schema, migrations, the reference-data seed
  testing/      Testcontainers harness, factories, fake WeChat and SMS gateways, the mock server
e2e/            Playwright suites: admin/ and storefront/
guards/         whole-tree static checks (pnpm guards)
load/           the load smoke
docker/         the web, worker and edge images
deploy/         the production Compose stack and its scripts
docs/           architecture, conventions, contributing, the business-rule catalogue
```

## Local development

### Prerequisites

- Node 24 and pnpm 12 (`corepack enable` gives you the pinned version).
- Docker, for PostgreSQL and Redis, the integration tests and the e2e suites.

### Start

```sh
pnpm install
pnpm gen          # the generated aggregates (*.gen.ts, openapi.json) are not committed

docker run -d --name shop-pg -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=shop -e POSTGRES_PASSWORD=shop -e POSTGRES_DB=shop postgres:17
docker run -d --name shop-redis -p 127.0.0.1:6379:6379 redis:7 \
  redis-server --maxmemory-policy noeviction

export DATABASE_URL=postgres://shop:shop@127.0.0.1:5432/shop
export REDIS_URL=redis://127.0.0.1:6379
export UPLOADS_DIR="$PWD/.uploads"
export VALIDATE_RESPONSES=1       # check every response against its contract

pnpm --filter @shop/db db:migrate   # the schema
pnpm --filter @shop/db db:seed      # reference data: cities, express companies, templates
pnpm dev                            # web on http://localhost:3000, and the worker
```

The seed loads reference data only. It creates no admin account, and nothing in the product can
grant `is_super`, so create the first one in the database. The hash is bcrypt; the password is read
from the terminal, not from the command line:

```sh
(cd packages/core && read -rs PW && PW="$PW" node --input-type=module \
  -e "import b from 'bcryptjs'; console.log(await b.hash(process.env.PW, 10))")
docker exec -i shop-pg psql -U shop shop <<'SQL'
insert into admins (account, password_hash, name, is_super)
values ('admin', '<the hash>', '超级管理员', true);
SQL
```

Then sign in at <http://localhost:3000/admin>. `/admin/dev/kit` shows every admin kit component
live.

For a stack already seeded with an admin, a product, a coupon and a shopper, start the admin e2e
server instead: `pnpm --filter @shop/e2e-admin exec tsx scripts/serve.ts`. It runs its own
PostgreSQL and Redis in Testcontainers, and signs in as `e2e-super` / `e2e-Passw0rd!`.

### The mobile client

`apps/uni-app` is an npm project of its own:

```sh
cd apps/uni-app
npm ci
npm test                  # the API layer, mappers, store and utils
npm run build:h5          # dist/build/h5, which the edge image serves
npm run build:mp-weixin
```

The H5 build talks to the origin it is served from. The mini-program build reads its API origin
from `VUE_APP_CRMEB_API_ORIGIN`. The modules in `api/` call the `/api/v1` routes, and
`api/mappers/` turns each response into the field names the pages read.

## Checks

A change merges when all of these pass. [docs/contributing.md](docs/contributing.md) has the full
checklist and what each step proves.

```sh
pnpm turbo run gen typecheck lint test:unit build
pnpm turbo run test:int --force --concurrency=4     # needs Docker
pnpm --filter @shop/contracts check:examples
pnpm exec prettier --check .
pnpm guards                                          # 0 failures
pnpm --filter @shop/e2e-admin e2e                    # serves the build of apps/web
pnpm --filter @shop/e2e-storefront test
(cd apps/uni-app && npm test && npm run build:h5)
```

CI (`.github/workflows/ci.yml`) runs all of these, plus shellcheck, the deploy drill and, on a push, the build of the three production images.

## Deployment

The shop runs as one Docker Compose project on one host: PostgreSQL, Redis, `web`, `worker` and the
nginx `edge`, behind Traefik. Images are built in CI and deployed by digest. First deploy, upgrade,
rollback, backup and restore are in [deploy/README.md](deploy/README.md).

## Documentation

- [docs/architecture.md](docs/architecture.md): how the system is put together.
- [docs/conventions.md](docs/conventions.md): the engineering rules the code follows.
- [docs/contributing.md](docs/contributing.md): the merge checklist; how to add a domain, a route
  or a contract.
- [docs/invariants.md](docs/invariants.md): the business rules, each with the tests that prove it.
- [deploy/README.md](deploy/README.md): operating the production stack.

## Licence

[Apache-2.0](LICENSE).
