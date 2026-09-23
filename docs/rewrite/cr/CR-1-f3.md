# CR-1-f3 — two statistics figures have tables, SQL and tests, but no writer

**Status (R5 sweep, 2026-09-23): RESOLVED** — `user_visits` has a writer, `user/user.visit.repo.ts` (E4, `53ba7a17a`); the cart product event is emitted from catalog (B3, `41883680c`). The status line below is kept as history.

**Stream** F3 · **Status** open · **Blocking** no (the figures read 0 until a
writer exists; every other figure on every page is complete)

## What

Two of the figures the statistics contracts declare are computed from tables
that **nothing in the system inserts into**:

| Figure                              | Reads                          | Written by                      |
| ----------------------------------- | ------------------------------ | ------------------------------- |
| 访客数 / 浏览量, and the 地域访客 column | `user_visits`                  | nobody                          |
| 加购件数 (product + ranking pages)    | `product_events.kind = 'cart'` | nobody                          |

`product_events` is written for `kind = 'view'` (catalog) and `kind = 'favorite'`
(favourites), so the table itself is live — it is the one `kind` that is missing.
`user_visits` has no writer of any kind.

F3 kept both rather than dropping them: the tables exist in the schema, the SQL
is written and covered by `stats.int.test.ts`, the contracts are frozen with the
fields in them, and the gap is one insert in somebody else's domain. A figure
that reads 0 today and the truth the day a writer lands costs nothing; a figure
deleted from a frozen contract costs a contract change.

This is **not** the same as a retired figure. Retired figures (余额, 佣金, 积分,
充值) are dropped from the response entirely rather than zero-filled — see
`core/src/stats/DEFINITIONS.md` §5. These two are declared and defined; they
are merely unfed.

## Why `cart_items` is not a substitute for 加购件数

The obvious shortcut — count `cart_items` instead of a `cart` event — does not
work, because the row is **deleted when the order is placed**. Yesterday's
additions disappear from history exactly when they start to matter, and the
figure would read "items currently sitting in carts", which is a different
number that happens to look plausible. 加购件数 is a flow, so it needs an event.

## Asked of the orchestrator

Two independent decisions; F3 needs no code change for either.

1. **A storefront page-view recorder** writing `user_visits`
   (`user_id` nullable, `session_id`, `path`, `ip`, `province`, `city`,
   `platform`, `created_at`). It belongs to whoever owns the storefront
   middleware, not to `stats` — this domain is select-only on purpose, and
   `stats.repo.ts` being provably free of writes is worth keeping. When it
   lands, 访客数 / 浏览量 and the `visitors` column of 地域分布 start reading
   true with no change here.

2. **A `cart` product event** on add-to-cart, for stream B1 (`cart`): one
   `product_events` insert of `{ productId, skuId, userId, kind: 'cart',
   quantity, createdAt }` next to the existing `cart_items` upsert. The
   catalog domain already writes `view` rows the same way, so there is a
   pattern to copy and a retention sweep (`catalog.pruneHistory`) that already
   covers the new rows.

If the answer to either is "not in this rewrite", say so and F3 will delete the
figure from the page and the contract in one commit — but it should be a
decision, not a 0 that nobody notices.
