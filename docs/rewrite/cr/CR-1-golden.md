# CR-1-golden — the route-file convention cannot be `admin-api/<domain>/`

**Status (R5 sweep, 2026-09-23): RESOLVED** — the CONVENTIONS row is reworded as asked (`6fd2f32b3`). The status line below is kept as history.

**Stream:** Golden slice (coupon) **Status:** convention needs rewording; no code change
**Files:** `docs/rewrite/CONVENTIONS.md` §"A domain owns exactly these paths"

## What

The table says:

| Concern        | Path                                          |
| -------------- | --------------------------------------------- |
| Admin API      | `apps/web/app/admin-api/<domain>/**/route.ts`  |
| Storefront API | `apps/web/app/api/v1/<domain>/**/route.ts`     |

In the App Router the directory *is* the URL. `apps/web/app/admin-api/coupon/coupons/route.ts`
serves `/admin-api/coupon/coupons`, not `/admin-api/coupons`, so a per-domain folder
silently moves every URL the contract declares. Taken literally the convention
would require every contract path to start `/admin-api/<domain>/…`, which is not
what the coupon contract — or any of the REST paths in PLAN §3 — says:

```
/admin-api/coupons          /admin-api/coupons/:id/grants      /admin-api/user-coupons
/api/v1/coupons/:id/claims  /api/v1/user-coupons/applicable
```

Note also that one domain owns **two** top-level resources (`coupons` and
`user-coupons`), which no single folder can contain. Order will have
`orders` + `refunds`, catalog `products` + `categories`, and so on.

## What the golden slice did

Mirrored the URL, one directory per resource segment:

```
apps/web/app/admin-api/coupons/route.ts                  GET  POST  /admin-api/coupons
apps/web/app/admin-api/coupons/[id]/route.ts             GET  PUT  DELETE
apps/web/app/admin-api/coupons/[id]/status/route.ts      POST
apps/web/app/admin-api/coupons/[id]/grants/route.ts      POST
apps/web/app/admin-api/user-coupons/route.ts             GET
apps/web/app/api/v1/coupons/route.ts                     GET
apps/web/app/api/v1/coupons/new-user/route.ts            GET
apps/web/app/api/v1/coupons/[id]/claims/route.ts         POST
apps/web/app/api/v1/user-coupons/route.ts                GET
apps/web/app/api/v1/user-coupons/applicable/route.ts     GET
```

Ownership is then by *resource*, not by folder, which is fine for conflicts —
two streams still never write the same file — but it is not something an
executor can infer from the table. Every one of the 15 streams will hit this in
its first hour.

## Ask

Reword the two rows to:

| Admin API      | `apps/web/app/admin-api/**/route.ts` — the directory mirrors the contract path exactly; a domain owns the resource segments its contracts declare (coupon owns `coupons/**` and `user-coupons/**`) |
| Storefront API | `apps/web/app/api/v1/**/route.ts` — same rule                                                                                                                                                      |

and add to OWNERSHIP.md: a stream owns the route directories matching the
`path:` of its own contracts, and nothing else under `app/admin-api` or
`app/api/v1`.

Optional and worth it: a `pnpm gen` (or `check:examples`) assertion that every
route in `routes.gen.ts` has a file at the path its `path:` implies, and that
every `route.ts` under `app/admin-api` / `app/api/v1` is reachable from a
contract. That turns "did I put it in the right folder" into a build error
instead of a 404 someone finds in week six.
