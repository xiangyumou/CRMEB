# Rewrite conventions

Binding for every workstream. The approved plan is summarised in `docs/rewrite/PLAN.md`. Change anything here only through a change request (`docs/rewrite/cr/`), applied by the orchestrator.

The old system (`crmeb/`, `template/admin/`) is a **read-only behavioural reference**. Never edit it, never import from it.

## Layout

```
next/
  apps/web        Next.js App Router: admin UI, /admin-api/*, /api/v1/*
  apps/worker     BullMQ workers and repeatable jobs
  packages/contracts   route contracts (zod) → OpenAPI; the single source of truth
  packages/core        domain logic; kernel/ holds shared primitives
  packages/db          Drizzle schema, migrations, reference seeds
  packages/etl         one-shot MySQL → PostgreSQL
  packages/testing     Testcontainers harness, factories, fake gateways, mock server
  packages/config      shared eslint / tsconfig / vitest presets
  e2e/, guards/        Playwright suites and static guards
```

Package scope is `@shop/*`. Node ≥ 24, pnpm via corepack (`corepack pnpm …`), TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. UI is Ant Design (current major, 6.x) with React 19.

## Where a domain's files go

A domain (`coupon`, `catalog`, `order`, …) owns exactly these paths and nothing else:

| Concern | Path |
|---|---|
| Contracts | `packages/contracts/src/<domain>/*.contract.ts`, `errors.ts`, `schemas.ts` |
| Domain logic | `packages/core/src/<domain>/` (`*.service.ts`, `*.repo.ts`, `permissions.ts`, `effects.ts`) |
| Admin API | `apps/web/app/admin-api/<domain>/**/route.ts` |
| Storefront API | `apps/web/app/api/v1/<domain>/**/route.ts` |
| Admin pages | `apps/web/app/admin/(shell)/<domain>/**` |
| Admin menu | `apps/web/src/admin/menu/<domain>.menu.ts` |
| Jobs | `apps/worker/src/jobs/<domain>.*.ts` |
| Config groups | `packages/core/src/system/config/<group>.config.ts` (group named after the domain) |
| ETL | `packages/etl/src/mappers/<domain>.ts` |
| Tests | next to the code as `*.test.ts` (unit) and `*.int.test.ts` (needs PG/Redis) |

Aggregation files (`*.gen.ts`) are produced by `pnpm gen` and gitignored. Add a file in the right place and it is picked up; there is no shared index to edit, so parallel streams do not conflict.

## Import boundaries (ESLint-enforced)

- `route.ts` files contain no business logic: `export const GET = handle(route, (ctx) => service.fn(ctx, ctx.input))`.
- `packages/core` never imports `next/*`, React, or `apps/*`.
- Admin UI imports `@shop/contracts` and the generated client only — never `@shop/core` or `@shop/db`.
- A domain in `core` may import another domain only through that domain's `index.ts` or through ports in `core/src/order/ports.ts`. No reaching into another domain's repo or tables.
- Only `*.repo.ts` files touch Drizzle tables.

## Contracts

Every endpoint is a `defineRoute({...})` (see `packages/contracts/src/_conventions/route.ts`). Rules:

- Paths are plural nouns, kebab-case, `:param` placeholders. Actions that are not CRUD are sub-resources with POST: `POST /api/v1/orders/:id/cancel`.
- JSON keys are camelCase. IDs are decimal strings. Money is a `"12.00"` string (`money`). Time is ISO-8601 with offset (`instant`). Booleans are booleans. Absent optional values are omitted or `null`, never `""` or `0`.
- Lists use `pageQuery` and `paged(item)`.
- Every route has at least one example; examples must parse against the schemas (CI checks). The mock server answers with the first example.
- Errors: real HTTP status + `{code, message, details?}`. Declare domain codes with `defineErrors` in `contracts/src/<domain>/errors.ts`, prefixed by the domain. Messages are Simplified Chinese and user-safe.
- Admin routes must declare `permission`. Storefront platform comes from the `X-Client-Platform` header.

## Domain rules

- **Transactions:** `withTx(async (tx) => …)`. Anything that calls a third party happens *after* commit, via the effects ledger — never inside the transaction.
- **State changes are conditional updates.** `UPDATE … WHERE id = $1 AND status = 'expected'` and decide on the affected row count. Read-then-write on status, stock, seats or counters is a defect. Use `lockRow` (`SELECT … FOR UPDATE`) when several rows must agree.
- **Every conditional state change ships a concurrency test** using `runConcurrently` from `@shop/testing`.
- **Money:** integer fen inside the domain via `Money`; never floats.
- **Time:** inject `Clock`; never call `Date.now()` in domain code.
- **Side effects:** register handlers in `core/<domain>/effects.ts`; they must be idempotent because the ledger retries.
- **Permissions:** declare atoms in `core/<domain>/permissions.ts` as `<domain>:<resource>:<action>`.
- **Config:** read through the typed registry (`config.get('payment')`), never ad-hoc keys.
- **Never:** `eval`, `new Function`, `fetch` of a user-supplied URL outside `core/storage/safe-fetch.ts`, trusting a client-supplied file path, logging secrets or tokens.

## Admin UI

- Pages compose the kit in `apps/web/src/admin/kit/` (`CrudTable`, `ZodForm`, `ModalForm`, `AssetPicker`, `LinkPicker`, `ConfigGroupForm`, `Can`). If the kit lacks something, file a CR rather than forking a private copy.
- Data access goes through the generated TanStack Query hooks; no hand-written `fetch`.
- Forms are typed from the contract's zod body schema.
- All user-facing text is Simplified Chinese. No i18n layer.

## Scope guard

Not ported, do not reintroduce: bargain, seckill, lottery, live streaming, distribution/agent/brokerage, points and sign-in, paid membership and levels, balance/recharge, Alipay/AllInPay/offline/balance payment, store pickup and write-off, same-city delivery, self-built chat, native app, upstream upgrade and licence phone-home, CRUD code generator, online file manager, DB backup/clear-data screens, `system_route` registry, custom eval timers/events, PC storefront API and decoration, outapi and MCP, multi-language content, 一号通 cloud, receipt printers, e-invoice provider. Payment is WeChat Pay v3 only.

## Workflow

- Integration branch `rewrite/integration`. Stream branches `rewrite/ws-<id>-<slug>`, one git worktree each. Commit early and often on your stream branch; the orchestrator squash-merges.
- Touch only your owned paths (`docs/rewrite/OWNERSHIP.md`). Need a change elsewhere? Write `docs/rewrite/cr/CR-<n>-<ws>.md`, keep going behind a local adapter.
- Keep `docs/rewrite/status/<ws>.md` current: done, in progress, blocked, open CRs.
- **Definition of done:** contracts implemented with response validation on; unit + integration tests; a concurrency test per conditional state change; admin pages built from the kit; permission and menu files present; ETL mapper if the domain migrates data; the invariants named in your brief mapped to test IDs in `docs/rewrite/invariants.md`; `corepack pnpm typecheck lint test` green.
- Report honestly: a failing or skipped test is stated as such, with output.
