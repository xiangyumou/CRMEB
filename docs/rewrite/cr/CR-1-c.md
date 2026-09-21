# CR-1-c — `ORDER_STATUSES` does not match the `orders_status` enum

**Stream** C · **Target** `next/packages/core/src/order/ports.ts` (orchestrator-owned) and/or `next/packages/db/src/schema/order.ts` · **Severity** medium, silent

**Status: resolved.** `ORDER_STATUSES` and `ORDER_TRANSITIONS` were widened to the
column's vocabulary exactly as asked for below — `unpaid` is gone, `refunded` is a
declared state, and `paid → refunded` / `shipped → refunded` / `received →
refunded` are in the table. The translation layer the "Meanwhile" describes was
never needed in the end: `payment.testkit.ts` no longer exists and stream C codes
against the column names throughout. Kept as the record.

## What

`order/ports.ts` freezes the lifecycle as

```ts
export const ORDER_STATUSES = [
  "unpaid",
  "paid",
  "shipped",
  "received",
  "completed",
  "cancelled",
];
```

while `db/src/schema/order.ts` declares

```ts
export const ordersStatus = pgEnum("orders_status", [
  "pending_payment",
  "paid",
  "shipped",
  "received",
  "completed",
  "cancelled",
  "refunded",
]);
```

Two mismatches:

1. `unpaid` (port) vs `pending_payment` (column).
2. `refunded` exists in the column and not in the port, so a full refund has no
   target state in `ORDER_TRANSITIONS` — and `refunded` is exactly what stream C
   must move an order to.

`ORDER_TRANSITIONS` also lacks `paid -> refunded` and `received -> refunded`,
both of which the schema's own diagram (`order.ts`, the `ordersStatus` comment)
draws.

## Why it matters

Whoever implements `OrderStateMachine.transition` has to translate, and if two
streams translate differently the guard `WHERE status = $from` silently matches
nothing — a conditional update that affects zero rows looks exactly like "somebody
else got there first". That is the one failure mode this architecture is built to
make impossible, so the mapping must exist in one place.

## Asked for

Either widen the port to the column's vocabulary:

```ts
export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "shipped",
  "received",
  "completed",
  "cancelled",
  "refunded",
] as const;

export const ORDER_TRANSITIONS = Object.freeze({
  pending_payment: ["paid", "cancelled"],
  paid: ["shipped", "cancelled", "refunded"],
  shipped: ["received", "refunded"],
  received: ["completed", "refunded"],
});
```

or keep `unpaid` and publish the mapping in `ports.ts` itself.

## Meanwhile

Stream C codes against the port's names and keeps this mapping local to its own
test state machine (`packages/core/src/payment/payment.testkit.ts`):

| port            | column            |
| --------------- | ----------------- |
| `unpaid`        | `pending_payment` |
| everything else | itself            |

plus a `'refunded'` target that the port does not declare, passed through the
`patch` argument as a status the refund service asks for explicitly.
