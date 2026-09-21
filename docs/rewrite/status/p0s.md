# P0-S — business schema

Branch `rewrite/ws-p0s-schema`, worktree `../CRMEB-wt/ws-p0s`.
Last updated 2026-09-21.

## State

**Done.** The complete PostgreSQL schema for all 17 business domains, the
reference-data seed and its extraction script, `packages/db/docs/SCHEMA.md`, and
the constraint sanity suite. Verified against a throwaway PostgreSQL 17.

| Item | State |
|---|---|
| 17 domain schema files, 86 tables, 69 enums | done |
| Reference seed (cities, couriers, agreements, notification keys) | done |
| `scripts/extract-legacy-seed.mjs` + committed JSON | done |
| `packages/db/docs/SCHEMA.md` | done |
| `scripts/check-constraints.sql` | done, 22/22 PASS |
| `CR-1-p0s` filed | open |

Not in scope and **not** created: `schema/auth.ts`, `schema/system.ts`
(executor P0-a), `migrations/` (the orchestrator generates the single
`0000_init` after merging every stream's schema files — the generated output was
deleted before each commit).

## Table count per domain

| Domain | Tables |
|---|--:|
| `catalog` | 18 |
| `user` | 9 |
| `order` | 7 |
| `wechat` | 7 |
| `shipping` | 6 |
| `coupon` | 5 |
| `payment` | 4 |
| `groupbuy` | 4 |
| `presale` | 4 |
| `diy` | 4 |
| `reference` | 3 |
| `refund` | 3 |
| `cms` | 3 |
| `notification` | 3 |
| `stats` | 3 |
| `storage` | 2 |
| `cart` | 1 |
| **Total** | **86** |

---

## Verification

Throwaway database:

```
docker run --rm -d --name p0s-pg -e POSTGRES_PASSWORD=shop -e POSTGRES_USER=shop \
  -e POSTGRES_DB=shop -p 55432:5432 postgres:17
```

(port 55432 because 5432 was taken; the container was removed afterwards).

### 1. Install and typecheck — PASS

```
$ corepack pnpm install
Scope: all 3 workspace projects
Already up to date
Done in 3ms using pnpm v12.5.1

$ corepack pnpm --filter @shop/db typecheck
$ tsc -p tsconfig.json
TYPECHECK_EXIT=0
```

### 2. Migration generation and application — PASS

```
$ drizzle-kit generate
[✓] Your SQL migration file ➜ migrations/0000_mixed_agent_zero.sql 🚀

$ psql -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE EXTENSION pg_trgm;'
pg_trgm

$ psql -v ON_ERROR_STOP=1 -f 0000_mixed_agent_zero.sql
7 identifier-truncation notices, 0 errors
tables=86
```

The seven notices are PostgreSQL's 63-byte identifier limit trimming
Drizzle-generated foreign-key constraint names on `shipping_template_*`,
`groupbuy_activities`, `presale_activities` and `presale_stock_ledger`. The
truncated names are distinct and the migration applies cleanly; noted in
SCHEMA.md §5 for the orchestrator.

```
enums=69
check_constraints=109
foreign_keys=129
indexes=284
```

### 3. Seed — PASS, idempotent

```
$ tsx src/seed/index.ts
seeded cities=3939 express_companies=1101 agreements=4 notification_templates=17
$ tsx src/seed/index.ts          # second run
seeded cities=3939 express_companies=1101 agreements=4 notification_templates=17

cities=3939
express_companies=1101
agreements=4
notification_templates=17
city_tree_roots=34
city_max_level=2
```

3939 cities and 1101 courier rows match the legacy row counts named in the
brief. 34 roots = 31 provinces/municipalities + HK + Macao + Taiwan. The
extractor's own integrity pass (duplicate ids, duplicate division codes,
dangling parents) reported nothing.

### 4. Constraint sanity checks — 22/22 PASS

`psql -f packages/db/scripts/check-constraints.sql`, verbatim:

```
=== stock and counters ===
PASS  1. negative SKU stock -- new row for relation "product_skus" violates check constraint "product_skus_stock_non_negative" [23514]
PASS  1b. oversell by conditional update backstop -- new row for relation "product_skus" violates check constraint "product_skus_stock_non_negative" [23514]
PASS  2. coupon remaining_count below zero -- new row for relation "coupon_templates" violates check constraint "coupon_templates_counts_non_negative" [23514]

=== group buy seats ===
PASS  3. seats_taken above seats_total -- new row for relation "groupbuy_groups" violates check constraint "groupbuy_groups_seats_within_total" [23514]
PASS  3b. second leader in one group -- duplicate key value violates unique constraint "groupbuy_members_leader_uq" [23505]

=== payment ===
PASS  4. duplicate out_trade_no -- duplicate key value violates unique constraint "payment_attempts_out_trade_no_uq" [23505]
PASS  4b. second open attempt on one order -- duplicate key value violates unique constraint "payment_attempts_open_uq" [23505]
PASS  4c. closed attempt without a confirmed close -- new row for relation "payment_attempts" violates check constraint "payment_attempts_closed_shape" [23514]
PASS  5. duplicate capital flow for one payment -- duplicate key value violates unique constraint "capital_flows_reference_uq" [23505]
PASS  6. duplicate order effect -- duplicate key value violates unique constraint "order_effects_order_event_uq" [23505]

=== refunds ===
PASS  7. second open refund for one order item -- duplicate key value violates unique constraint "refund_items_open_uq" [23505]
PASS  8. refunded more than paid (REFUND-007) -- new row for relation "orders" violates check constraint "orders_refunded_within_paid" [23514]
PASS  8b. refunded more units than bought -- new row for relation "order_items" violates check constraint "order_items_refunded_within_quantity" [23514]
PASS  8c. duplicate out_refund_no -- duplicate key value violates unique constraint "refunds_out_refund_no_uq" [23505]

=== coupons ===
PASS  9. second claim of a one-per-user coupon -- duplicate key value violates unique constraint "user_coupons_slot_uq" [23505]
PASS  10. gift coupon issued twice for one order (FULFILL-001) -- duplicate key value violates unique constraint "user_coupons_order_gift_uq" [23505]

=== virtual cards (VIRTUAL-001) ===
PASS  11. second card claimed by one order item -- duplicate key value violates unique constraint "product_virtual_cards_order_item_uq" [23505]
PASS  11b. claimed card without an order item -- new row for relation "product_virtual_cards" violates check constraint "product_virtual_cards_claim_consistent" [23514]

=== identity and lifecycle ===
PASS  12. duplicate account differing only in case -- duplicate key value violates unique constraint "users_account_lower_uq" [23505]
PASS  13. two default addresses for one user -- duplicate key value violates unique constraint "user_addresses_default_uq" [23505]
PASS  14. paid order without a payment time -- new row for relation "orders" violates check constraint "orders_paid_shape" [23514]
PASS  15. two home DIY pages -- duplicate key value violates unique constraint "diy_pages_home_uq" [23505]

PASS=22 FAIL=0
```

The container was stopped and removed after this run.

---

## Judgment calls other streams must know

Full reasoning in `packages/db/docs/SCHEMA.md` §6. The short list:

1. **No order splitting.** `pid` / `old_cart_id` / `split_status` /
   `surplus_num` have no successor. Partial shipment is `shipments` +
   `shipment_items` + `order_items.shipped_quantity`; money is never
   re-prorated, so the refund ceiling is one row check. **B2, C.**
2. **`orders.status` has seven values**, not the six in the brief: `received`
   sits between `shipped` and `completed` so the storefront's 待评价 tab
   survives. **B1, B2, H.**
3. **One open refund per order *item*,** not per order — a partial unique index
   on `refund_items(order_item_id) WHERE is_open`. `is_open` is a denormalised
   mirror of the parent refund's status and **stream C must flip it in the same
   statement that changes `refunds.status`**; it is the one hand-maintained
   invariant in the schema. **C.**
4. **`user_coupons.claim_slot`** carries the 1-based ordinal of a user's claim;
   `UNIQUE (template_id, user_id, claim_slot)` makes concurrent claims collide.
   The service computes `slot = count + 1` and asserts
   `slot <= per_user_limit`. **Golden slice / coupon stream.**
5. **A `virtual_card` order item is limited to quantity 1**, because
   `product_virtual_cards_order_item_uq` allows one card per order item (as the
   orchestrator specified). B1 must enforce quantity 1 for card products at
   checkout. **B1, B2.**
6. **`order_effects.event_type` is `varchar(64)`, not an enum** — a registry key
   owned by `core/<domain>/effects.ts`. An enum would need
   `ALTER TYPE … ADD VALUE`, which cannot run inside a migration transaction.
   `order_status_logs.change_type` *is* an enum (fixed audit vocabulary).
   **All streams.**
7. **Presale deposits are declared but inert.** No legacy order code reads
   `eb_store_advance.type` / `deposit` / `pay_start_time` / `pay_stop_time`; a
   presale order is one order paid once in full. The columns and
   `presale_orders.stage` exist so D can switch the flow on without a schema
   change. **D.**
8. **The coupon ↔ order link runs one way.** `orders.user_coupon_id` = the
   coupon spent; `user_coupons.source_order_id` = the order that earned a gift
   coupon. There is no `used_order_id`. **B1, coupon stream.**
9. **`cart_items` is only the cart.** No "buy now" row, no `combination_id`, no
   `advance_id`. Direct purchase, group-buy join and presale build the order
   from a request payload. **B1.**
10. **`products.stock` / `sales` / `price` are denormalised mirrors.** The
    authoritative values live on `product_skus`; stock is only ever decremented
    there. Stream A keeps the mirrors in step with aggregate updates. **A, B1.**
11. **`payment_callbacks` is a new table** (not in the brief): every gateway
    notification, `UNIQUE (mch_id, provider_notify_id)`, so a replay is a
    database no-op. C may ignore it. **C.**
12. **Schema files import each other in cycles** (`catalog ↔ order`,
    `coupon ↔ order`). Safe — `.references()` is a lazy thunk — but TypeScript
    needs `(): AnyPgColumn => other.id` on one side of each cycle. If you add a
    cross-file reference and hit `TS7022`, that is the fix. **All streams.**
13. **`page_links` / `page_link_categories` exist but are not seeded** — the
    legacy rows point at uni-app routes, several of them retired. **G1** either
    seeds a vetted list or drops the tables via a CR.
14. **Reserved-word renames:** `unique` → `sku_code` (SKU) / `item_key` (order
    line), `key` → `code`, `trigger` → `trigger_kind`. **ETL.**

## Open CRs

- **CR-1-p0s** — three items:
  1. `CREATE EXTENSION IF NOT EXISTS pg_trgm;` at the top of `0000_init` and in
     the Testcontainers harness. **Required** — the two GIN trigram indexes on
     `products` will not build without it.
  2. Ten `admins` foreign keys to wire at merge (SCHEMA.md §5). **Required.**
  3. `sortOrder()` / `counter()` helpers in `_shared.ts`. Cosmetic; do not land
     during Phase 0 if it conflicts.

## Nothing is unfinished

Every deliverable in the brief and in the orchestrator's addendum is in the
branch. Two things are deliberately *not* enforced by the database and are
therefore service obligations, both stated above and in SCHEMA.md:
`refund_items.is_open` (item 3) and payment-attempt context immutability
(SCHEMA.md §3.4). The schema has no triggers, by convention.
