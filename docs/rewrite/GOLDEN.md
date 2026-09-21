# GOLDEN.md — the coupon slice, as a pattern

The coupon domain is the worked example: small, finished, and touching every
file kind — contracts with truthful examples, a repo of conditional updates, a
service, ten route files, two admin pages, two jobs, an ETL mapper, and 110
tests including fourteen `runConcurrently` races against real PostgreSQL.

Build your domain in the order below; each step compiles against the one before
it. Read `CONVENTIONS.md` for the rules — this is what they look like when they
have been followed. Every path is a real file worth opening.

---

## 1. Contract — `packages/contracts/src/<domain>/`

Three files: `schemas.ts` (shapes), `errors.ts` (refusals), `*.contract.ts`
(routes). Nothing else may be written until these exist; everything downstream
is typed from them.

`packages/contracts/src/coupon/coupon.admin.contract.ts`

```ts
export const couponAdminSetStatus = defineRoute({
  id: "coupon.adminSetStatus",
  method: "POST",
  path: "/admin-api/coupons/:id/status",
  auth: "admin",
  permission: "coupon:template:write",
  summary: "启用/停用优惠券",
  tags: ["coupon"],
  params: templateParams,
  body: couponTemplateStatusBody,
  response: couponTemplateDetail,
  errors: ["COUPON_TEMPLATE_NOT_FOUND"],
  examples: [
    {
      name: "disable",
      params: { id: "1" },
      body: { status: "disabled" },
      response: { ...couponTemplateDetailExample, status: "disabled" },
    },
  ],
});
```

- **Examples are tested, so they must be true.** `check:examples` parses every
  one against its own schemas. Build the fat ones once as
  `couponTemplateExample` and spread them, so an added field is one edit.
- **Contracts are the bottom layer.** No import from `@shop/db` or `@shop/core`.
  The zod enums duplicate the PostgreSQL enums by hand; the service keeps them
  honest by assigning one to the other, and stops compiling if they drift.
- **Not-CRUD is a POSTed sub-resource**, never `?action=` and never a PATCH
  with a magic field. Each gets its own permission and audit entry.
- One error code per _decision the caller can act on_, not per internal branch.
  `COUPON_NOT_USABLE` covers used / revoked / expired / not-yet-valid / someone
  else's, because `redeem` learns "no" from an UPDATE that affected zero rows
  and genuinely cannot tell which.

## 2. Repo — `packages/core/src/<domain>/<domain>.repo.ts`

The only file allowed to import `@shop/db/schema/*` (ESLint enforces it).
Statements, not decisions.

`packages/core/src/coupon/coupon.repo.ts`

```ts
/** Spend the coupon. One conditional update carrying every precondition:
 *  the owner, the state and both ends of the validity window. */
export async function redeemUserCoupon(
  tx: Tx,
  args: { id: number; userId: number; now: Date },
): Promise<ConditionalUpdateResult> {
  return conditionalUpdate(tx, userCoupons, {
    where: and(
      eq(userCoupons.id, args.id),
      eq(userCoupons.userId, args.userId),
      eq(userCoupons.status, "unused"),
      lte(userCoupons.validFrom, args.now),
      gte(userCoupons.validTo, args.now),
    ),
    set: { status: "used", usedAt: args.now, updatedAt: args.now },
  });
}
```

- **Every precondition goes in the `WHERE`.** Zero affected rows is the _only_
  correct way to learn that a coupon was already spent; a prior
  `SELECT … status = 'unused'` proves nothing about the instant of the UPDATE.
  If you read a row to check something and then write it, you wrote a race.
- **Wire types stop at the door.** Repos take `number` ids and `Date`; the
  service converts from the contract's decimal strings and ISO instants. Money
  stays a `Money`/numeric string all the way down — never a float.
- Repos take `(tx, args)` or `(db, args)` and return rows. No `DomainError`, no
  `ctx`, no logging, no business rules.

## 3. Rules — `packages/core/src/<domain>/<domain>.rules.ts`

Optional, and worth it whenever arithmetic or eligibility can be decided
without the database: scope matching, the min-spend comparison, the discount
cap, the validity window. Pure functions, with a plain `*.test.ts` — no Docker,
milliseconds — holding the fiddly cases (`coupon.rules.test.ts`, 24 of them).
The integration test is then free to be about _state_, not arithmetic.

## 4. Service — `packages/core/src/<domain>/<domain>.service.ts`

Plain exported `async function`s. No classes, no DI container, no `this`.

`packages/core/src/coupon/coupon.service.ts`

```ts
export async function claim(ctx: Ctx, input: { id: string }): Promise<ClaimResult> {
  const userId = requireUserId(ctx);
  const now = ctx.clock.now();

  return ctx.withTx(async (tx) => {
    const template = await repo.findTemplate(tx, Number(input.id));
    if (!template || template.status !== 'active') throw new DomainError('COUPON_TEMPLATE_NOT_FOUND');
    if (template.claimMode !== 'manual') throw new DomainError('COUPON_NOT_CLAIMABLE');
    if (!isClaimWindowOpen(template, now)) throw new DomainError('COUPON_CLAIM_WINDOW_CLOSED');

    const outcome = await issueOne(tx, ctx, { template, userId, sourceKind: 'claim' });
    if (outcome.kind === 'limit-reached') throw new DomainError('COUPON_PER_USER_LIMIT_REACHED');
    if (outcome.kind === 'sold-out') throw new DomainError('COUPON_SOLD_OUT');
    return { coupon: …, remainingCount: outcome.remainingCount };
  });
}
```

- **Two signatures, and the difference matters.** A service the _route_ calls
  takes `(ctx, input)` and opens its own transaction with `ctx.withTx`. A
  service _another domain_ calls inside its transaction takes `(tx, ctx, input)`
  — the same order as the platform's `recordEffect(tx, ctx, input)`. `redeem`,
  `release`, `grantNewUser` and `grantOrderGifts` are all the second kind.
- **Never `new Date()`.** `ctx.clock.now()`, always, or the fixed-clock tests
  cannot pin anything down.
- **A function called behind the effects ledger returns a flag, not an
  exception** — the ledger retries, so a second `release` must be a quiet
  `{ released: false }`. One called inside a user-facing transaction throws,
  because the rollback is the point.
- Internal helpers return a **discriminated union** of outcomes
  (`{ kind: 'sold-out' } | { kind: 'limit-reached' } | …`) and let the exported
  function pick the error code. The same helper then serves `claim` (which must
  fail) and `grantNewUser` (which must not fail a registration over a sold-out
  welcome coupon).
- Order your writes so the loser cleans up. `issueOne` inserts the wallet row
  **then** decrements the supply — the reverse leaks a unit of stock per
  concurrent double-tap — and deletes its own insert when the decrement loses,
  rather than trusting the caller to roll back.

## 5. Tests — `<domain>.int.test.ts` and `<domain>.concurrency.int.test.ts`

Split them. The integration test is long and sequential; the concurrency test
is the one reviewers read.

`packages/core/src/coupon/coupon.concurrency.int.test.ts`

```ts
it("hands the last one to exactly one claimant", async () => {
  const templateId = await makeTemplate({ totalCount: 1, remainingCount: 1 });
  const userIds = await Promise.all(
    Array.from({ length: 12 }, () => makeUser()),
  );

  const report = await runConcurrently(userIds.length, (index) =>
    service.claim(racer(userIds[index]!), { id: String(templateId) }),
  );

  expect(report.fulfilled).toHaveLength(1);
  expect(report.rejected).toHaveLength(11);
  for (const e of report.rejected)
    expect(e).toMatchObject({ code: "COUPON_SOLD_OUT" });
  expect((await templateRow(templateId)).remainingCount).toBe(0);
  // The eleven losers left nothing behind: no half-issued wallet rows.
  expect(await walletRows()).toHaveLength(1);
});
```

- **Every conditional state change owes a race test.** Not only the ones in
  `invariants.md`: this slice has fourteen, including the admin status toggle and
  the expiry sweep, because "only one worker may do this" is a claim you either
  test or do not get to make.
- **One `Ctx` per racer**, from `forkTestCtx(harness, …)`. Racers sharing a
  pooled connection serialise, and every assertion passes for the wrong reason.
- **`isWinner` when the result is a `conditionalUpdate`.** The default counts
  any resolved promise as a win, so `{ affected: 0, won: false }` reads as a
  winner and the test proves nothing: pass `{ isWinner: (r) => r.won }`.
- Assert the _losers_ too — no orphan rows, stock not consumed, counter not
  negative. A winner-only assertion passes on a badly broken system.
- `beforeEach`: `truncateAll()` **and** `clock.set(NOW)`. The clock is shared
  state, and a test that advanced it looks like flakiness in the next file.
- Real foreign keys need real rows: keep small `makeUser` / `makeOrder` /
  `makeTemplate` fixtures at the top and build every row through them.

## 6. Public surface — `packages/core/src/<domain>/index.ts`

What other domains may call, and nothing else. Re-export the service functions
and the types in their signatures; never the repo.

```ts
/**
 * | Function          | Caller | When                                     |
 * | ----------------- | ------ | ---------------------------------------- |
 * | `quote`           | B1     | pricing the cart and confirming an order |
 * | `redeem`          | B1     | inside `createOrder`'s transaction       |
 * | `grantNewUser`    | E1     | inside the registration transaction      |
 */
export {
  quote,
  redeem,
  release,
  grantNewUser,
  grantOrderGifts,
} from "./coupon.service";
```

Write the table: it is the first thing the stream that has to call you reads,
and where you say which argument order a function takes and what a retry does.

## 7. Permissions — `packages/core/src/<domain>/permissions.ts`

```ts
export const couponPermissions = definePermissions(
  "coupon",
  {
    "template:read": "查看优惠券",
    "template:write": "新建/编辑优惠券",
    "template:delete": "删除优惠券",
    "grant:write": "发放优惠券给用户",
    "user-coupon:read": "查看已领取的优惠券",
  },
  { section: "营销" },
);
```

Five atoms, not fifteen: one per _job somebody actually does_. Split `delete`
from `write` only where deleting means something different from editing (here
it hides every coupon issued from the template). The string a route declares
must exist here, and the label is what an operator reads in the role editor.

## 8. Route files — `apps/web/app/admin-api/**`, `apps/web/app/api/v1/**`

`apps/web/app/admin-api/coupons/[id]/status/route.ts`

```ts
export const POST = handle(
  couponAdminSetStatus,
  async (ctx, { params, body }) => {
    const updated = await coupon.adminSetStatus(ctx, params, body);
    ctx.audit(`coupon:${params.id}`);
    return updated;
  },
);

export const dynamic = "force-dynamic";
```

- **The directory is the URL**, mirroring the contract's `path:` exactly. A
  domain owns the resource segments its contracts declare — coupon owns
  `coupons/**` _and_ `user-coupons/**`.
- **No logic.** Auth, permission, parsing, error mapping and the status code all
  come from the contract through `handle()`. An `if` here belongs in the service.
- `ctx.audit(resource)` on every write, `export const dynamic = 'force-dynamic'`
  on every file, and import the domain rather than the barrel:
  `import * as coupon from '@shop/core/coupon'`.

One HTTP-level test next to the routes
(`apps/web/app/admin-api/coupons/coupons.int.test.ts`) covers what only exists
at this layer: 401 vs 403 vs 200 per permission, the audit row, 422 _before_ any
write, and a domain refusal arriving as its declared status and Chinese
message. Do not re-test the service through HTTP.

## 9. Jobs — `apps/worker/src/jobs/<domain>.<name>.ts`

```ts
export default defineJob({
  name: "coupon.expireUserCoupons",
  schema: z.object({}).default({}),
  concurrency: 1,
  repeat: { pattern: "7 * * * *" },
  handler: async (ctx) => {
    const expired = await expireOverdueCoupons(ctx);
    if (expired > 0) ctx.logger.info({ expired }, "expired overdue coupons");
  },
});
```

- A job is a declaration plus one call into `core`, so all the work lives where
  it can be tested without a queue. Batch and bound it: the sweep takes a
  `limit` and returns a count.
- **Nothing may depend on a job for correctness.** Every read and the redemption
  guard filter on the validity window anyway, so a missed sweep cannot let an
  expired coupon be spent — it only makes the 已过期 tab honest. Write that
  sentence in the job's doc comment; if you cannot, the design is wrong.
- Stagger the crons (`'7 * * * *'`, not `'0 * * * *'`) so fifteen domains do not
  all wake at the top of the hour.

## 10. Admin pages — `apps/web/app/admin/(shell)/<domain>/`

One folder per domain: `<domain>-enums.tsx` next to a folder per page
(`templates/page.tsx` + `templates/coupon-templates.tsx` + its test).

```tsx
<CrudTable
  route={couponAdminList}
  filters={[{ kind: 'text', name: 'keyword', label: '名称' }, …]}
  toolbar={<Can permission="coupon:template:write"><Button …>新建优惠券</Button></Can>}
  columns={[idColumn<CouponTemplateListItem>({ sortable: true }),
            enumColumn<…>({ title: '状态', dataIndex: 'status', map: COUPON_STATUS }), …]}
/>
<ModalForm {...modal.props} schema={couponTemplateForm} fields={couponFields} … />
```

- **No `fetch`, no hand-written validation, no permission logic.** `CrudTable`
  calls the route; `ModalForm` takes the contract's own body schema, including
  the cross-field refinements that mirror the database CHECKs; `<Can>` and
  `permission=` only _hide_ things, and the server checks again.
- One `StatusMap<ContractUnion>` per enum in `<domain>-enums.tsx`, shared by the
  column, the filter and the form — so removing a value from the contract is a
  compile error here rather than a blank tag in production.
- `visibleWhen` on fields a mode does not use; hiding the day count while a
  fixed window is selected is what stops operators being 422'd by their own form.
- The page test asserts _wiring_ — which route the table called, that
  permissions hid the buttons, what body the action sent — and leaves paging and
  form rendering to the kit's own tests. `src/test/setup.ts` already
  stubs `next/navigation` for every test file.

## 11. Menu — `apps/web/src/admin/menu/<domain>.menu.ts`

```ts
export default defineMenu({
  key: "coupon",
  label: "优惠券",
  icon: "TagsOutlined",
  order: 300,
  children: [
    {
      key: "coupon.templates",
      label: "优惠券列表",
      path: "/admin/coupon/templates",
      permission: "coupon:template:read",
      order: 10,
    },
  ],
});
```

One file, aggregated by `pnpm gen`. The `permission` must be the same atom the
page's list route declares, or the sider shows a link to a 403.

## 12. ETL mapper — `packages/etl/src/mappers/<domain>.ts`

A pure function: legacy rows in, new rows **and a report** out. No connection,
no clock.

```ts
function claimModeOf(issue: LegacyCouponIssue): CouponClaimMode | null {
  if (issue.receive_type === 4) return null;   // 会员券 — retired, dropped and counted
  …
}
```

- **Copy the legacy row shapes out of the real DDL**
  (`crmeb/public/install/crmeb.sql`) and the test fixtures out of the real
  `INSERT`s. A migration test with invented input proves nothing.
- **Nothing is dropped silently.** Every skipped row increments a counter in the
  report, and dropped ids are listed so a human can check them off.
- Fix the data on the way through, to the new CHECK constraints: legacy `0`
  sentinels become `NULL`, `remain_count > total_count` is clamped, a `used`
  row with no `use_time` gets one. An import that dies half way through on a
  constraint violation is worse than a documented clamp. Keep the legacy ids —
  support tickets quote them.

## 13. Invariants — `docs/rewrite/invariants.md`

Fill your rows with `<file>::<describe> > <test name>` and set the state. Name
the test after the invariant while writing it (`'refuses a second redemption —
COUPON-004'`) so the two never drift. A row whose behaviour no longer exists is
`retired`, **with the reason in the Invariant cell and a test for whatever
remains** — for COUPON-001/002 the member claim mode is gone from the schema
entirely, so what is left to prove is that the ETL drops those legacy rows.

---

## Checklist

Copy into your status file and tick as you go.

```
Contract
- [ ] schemas.ts: enums spelled like the PG enums; money as strings; ids as decimal strings
- [ ] errors.ts: one code per decision a caller can act on
- [ ] *.contract.ts: every route has ≥1 truthful example; `pnpm --filter @shop/contracts check:examples` green
- [ ] non-CRUD actions are POSTed sub-resources

Core
- [ ] repo: every precondition in the WHERE of a conditionalUpdate; only file importing @shop/db/schema
- [ ] rules.ts + plain unit test for anything decidable without the database
- [ ] service: (ctx, input) for routes, (tx, ctx, input) for other domains; ctx.clock.now() everywhere
- [ ] ledger-invoked functions return a flag instead of throwing
- [ ] index.ts: caller table, service functions + types only, never the repo
- [ ] permissions.ts: one atom per real job

Tests
- [ ] <domain>.int.test.ts: every service path against real PostgreSQL
- [ ] <domain>.concurrency.int.test.ts: one race per conditional state change
- [ ] forkTestCtx per racer; isWinner: (r) => r.won; losers asserted
- [ ] truncateAll() and clock.set(NOW) in beforeEach

Web
- [ ] route files mirror the contract path; no logic; ctx.audit on writes; force-dynamic
- [ ] one HTTP-level int test: 401/403/200, audit row, 422 before any write, refusal mapping
- [ ] admin pages on CrudTable + ModalForm + Can; enums in one <domain>-enums.tsx
- [ ] page test asserts wiring only
- [ ] menu file, permission matching the list route

Worker / ETL
- [ ] jobs declare + delegate; correctness never depends on one; staggered cron
- [ ] mapper is pure, reports every dropped row, tested against literal legacy rows

Done
- [ ] invariants.md rows filled with real test ids
- [ ] pnpm gen typecheck lint test:unit test:int build
- [ ] pnpm exec prettier --check .
- [ ] status file: decisions, deferrals, new deps, CRs filed
```
