# CR-1-b1 — `orders` needs an `idempotency_key` column

- **Stream:** B1 (cart and checkout)
- **Status:** worked around locally; needs a schema change owned by the orchestrator
- **Affects:** `next/packages/db/src/schema/order.ts` (schema, frozen), plus one migration

## What is missing

The brief's fix for the double-submit risk (risk matrix §2, "order creation
guarded by a Redis cache lock") is *"an idempotency key with a UNIQUE column"*.
`order.create`'s contract requires `idempotencyKey` and the storefront sends it.
But `orders` has nowhere to put it:

```ts
export const orders = pgTable('orders', {
  id: pk(),
  orderNo: varchar({ length: 32 }).notNull(),
  userId: fk().notNull(),
  …
  // no idempotency_key
});
```

## Why it matters

Without the column there is no way to say, in the database, *"this user has
already submitted this key"*. Every alternative is either a Redis lock (what
legacy did, and what the rewrite is removing) or a second table.

## Suggested fix

```ts
  /** Client-supplied submit key; a replay returns this same order. */
  idempotencyKey: varchar({ length: 64 }),
```

with

```ts
  uniqueIndex('orders_idempotency_uq')
    .on(t.userId, t.idempotencyKey)
    .where(sql`idempotency_key is not null`),
```

A partial index because orders created by an admin, by an import or by a future
non-storefront path have no key, and `NULL`s must not collide.

Then `createOrder` inserts the key with the order — one statement, one
constraint, no separate claim — and on a unique violation re-reads the winner's
order by `(user_id, idempotency_key)`.

## Local workaround in place

`packages/core/src/order/order.repo.ts` claims the key as a row in the generic
`effects` ledger, whose `UNIQUE (scope, scope_id, event_type)` is the same
constraint in a different table:

- `scope = 'order-idem'`, a scope with no registered handler;
- `status = 'done'` with `dispatched_at` set, so the dispatcher — which claims
  `status = 'pending' AND next_run_at <= now()` — never sees the row and never
  tries to deliver it;
- `scope_id = sha256(userId:key)` (64 hex chars), because `scope_id` is
  `varchar(64)` and `userId:key` can be longer;
- the payload carries `{ userId, orderId }`, so a loser can read the winner's
  order id after the winner commits.

The claim is the **first** statement of the creating transaction, so a loser has
written nothing it must undo, and `ON CONFLICT DO NOTHING` blocks until the
concurrent inserter settles: if it committed we lose and can read its order, if
it rolled back the conflicting tuple is dead and our insert goes through.
`order.concurrency.int.test.ts` covers both (`creates exactly one order and
answers every caller with it`, `lets a key be reused after the order it was
claiming rolled back`).

It behaves correctly. What it costs is a row in an operational table per order,
an extra statement on the hot path, and a surprise for whoever reads `effects`
expecting only effects. Three functions change when the column lands —
`claimIdempotencyKey`, `recordIdempotentOrder`, `findIdempotentOrderId` —
and nothing above them does.
