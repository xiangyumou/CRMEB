# CR-1-p0s — three changes the business schema needs outside its owned paths

Stream: P0-S (business schema). Branch `rewrite/ws-p0s-schema`.
Status: open. None of these blocks P0-S; the schema is complete and verified
without them.

---

## 1. `pg_trgm` in the `0000_init` migration — **required**

**What:** the merged `0000_init` migration must run

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

before its `CREATE INDEX` statements, and the Testcontainers PostgreSQL image in
`packages/testing` must allow it (the stock `postgres:17` image ships it).

**Why:** `products_name_trgm_idx` and `products_keyword_trgm_idx` are
`USING gin (… gin_trgm_ops)` and back the storefront product search and the
admin product picker. Drizzle does not emit extension DDL, so without this the
migration fails with `operator class "gin_trgm_ops" does not exist`.

**Affects:** `packages/db/migrations/0000_init.sql` (orchestrator-owned),
`packages/testing` harness. No contract changes.

**Meanwhile:** P0-S verified the schema against a throwaway PostgreSQL 17 with
the extension created by hand.

---

## 2. Ten foreign keys to `admins` — **required at merge**

**What:** `schema/auth.ts` does not exist in the P0-S worktree, so every column
that points at an administrator is a plain `fk()` with no `REFERENCES` clause.
After the merge, add these constraints, all `ON DELETE SET NULL` except the
last:

| Table | Column | `onDelete` |
|---|---|---|
| `attachments` | `uploaded_by_admin_id` | set null |
| `product_reviews` | `reply_by_admin_id` | set null |
| `user_cancellation_requests` | `reviewed_by_admin_id` | set null |
| `order_status_logs` | `operator_admin_id` | set null |
| `shipments` | `operator_admin_id` | set null |
| `order_invoices` | `issued_by_admin_id` | set null |
| `payment_exceptions` | `operator_admin_id` | set null |
| `refunds` | `reviewed_by_admin_id` | set null |
| `refund_logs` | `operator_admin_id` | set null |
| `notification_messages` | `admin_id` | **cascade** |

**Why:** an administrator leaving must never delete business history, so every
operator reference degrades to `NULL` — except an admin's own in-app inbox,
which goes with the admin.

**Affects:** the merged schema files only. Also listed in
`packages/db/docs/SCHEMA.md` §5.

---

## 3. Two helpers in `_shared.ts` — **nice to have**

**What:** add to `packages/db/src/schema/_shared.ts`:

```ts
/** Display ordering. Lower sorts first; ties break on the primary key. */
export const sortOrder = () => integer().notNull().default(0);

/** A non-negative integer counter (stock, sales, views, attempts). */
export const counter = () => integer().notNull().default(0);
```

**Why:** `integer().notNull().default(0)` appears 47 times across the 17 domain
files, and `CHECK (… >= 0)` is written out by hand next to most of them. Two
helpers would make the intent visible and the default consistent.

**Affects:** `_shared.ts` (orchestrator-owned) plus a mechanical substitution in
the domain files.

**Meanwhile:** P0-S writes the columns out in full. This is cosmetic — do not
land it during Phase 0 if it would conflict with another stream's edits.
