# CR-6-k — 25 `CONTRACT-PENDING` markers name a stream that has already merged

**Status (R5 sweep, 2026-09-23): RESOLVED** — `MARKER_REASSIGNMENTS` is empty (H3, `503fbcf35`). The status line below is kept as history.

**Stream:** K (hardening) **Status:** OPEN — for stream H (uni-app), second pass
**Files:** `template/uni-app/api/*.js`
**Machine-readable copy:** `next/guards/src/lib/marker-reassignments.ts`

## What

Every call in `template/uni-app/api/*.js` either resolves to a contract or
carries a `// CONTRACT-PENDING(<stream>)` marker naming who owes it one. Of the
104 pending calls, **25 name a stream that has already merged** — A (10), B1 (4),
B2 (3), F1 (7) and G1 (1 group of 2). Read literally, each one says "waiting for
a stream that finished without shipping it".

They are not stale. The gaps H found were raised as CR-1-h … CR-5-h, and the
orchestrator did not send them back to the merged streams: they were collected
into **stream S — storefront contract gaps**, dispatched 2026-09-23
(`STATUS.md`). The markers were written before that decision and still point at
the original owner.

## Why it matters

The marker is the allow-list. `pnpm guards`' `uniapp` check fails both ways — a
call with no contract and no marker is broken now, and a marker whose route has
since landed is a marker to delete — and the level it reports depends entirely
on whom the marker names. A marker naming a merged stream can only be read as a
failure, so H's own `scripts/check-api-routes.mjs` and K's guard would both
have to grow a permanent exception, which is how an allow-list turns into a
place to hide things.

## Asked for

Re-point the 25 markers at `S`, keeping the explanatory comment, e.g.

```js
// CONTRACT-PENDING(S)  // was (A): CR-4-h, collected into stream S
```

The affected calls, as `guards/src/lib/marker-reassignments.ts` lists them:

| Marked | Calls | Owed by |
| --- | --- | --- |
| A | the 10 `/api/v1/staff/products…`, `/staff/product-labels`, `/staff/product-categories`, `/staff/shipping-templates` calls (staff 商品管理) | S |
| B1 | `DELETE /orders/:id` (CR-4-h §6), `GET /orders/:id/gift-coupons`, `GET /staff/coupons`, `POST /staff/users/:id/coupons` | S |
| B2 | `GET /staff/statistics/orders`, `GET /staff/statistics/timeline` (CR-4-h §1), `POST /staff/refunds/:id/remark` (CR-4-h §2) | S |
| F1 | the 7 `/api/v1/site/*` reads plus `POST /site/image-data-urls` | S |
| G1 | `GET /diy/layouts/:id`, `GET /diy/navigation` | S |

## Until then

The guard carries the reassignment table and reports these 25 as `pending(S)`
with the reason, so `pnpm guards` is green and the ownership is still visible in
the output. The table is compared exactly: an entry that matches no marked call
any more is a failure telling you to delete it, so applying this CR and deleting
the table are one change — and if S lands a route while its marker still says
`A`, the "marked pending but the route exists" failure fires regardless of which
stream the marker names.
