# CR-2-e2 — six notifications have no hook to fire from

**Status (R5 sweep, 2026-09-23): RESOLVED** — N1 (`fa65145d8`) wired `notify` at the missing call sites; every registered event now has a caller (`refund_rejected` from `refund.admin.ts`). The status line below is kept as history.

- **Stream:** E2 (notification)
- **Status:** the templates ship and are configurable; six of them can never fire
  until the owning stream calls `notify`
- **Affects:** B1 (order creation, price change), C (refund lifecycle, payment
  exceptions), B2 or A (low stock)

## What is wired, and what is not

`core/src/notification/notification.effects.ts` hooks everything the retained
seams offer: `onOrderPaid`, `onOrderCancelled`, `onOrderCompleted`,
`onOrderRefunded` and B2's `FulfilmentNotifier`. That covers eight of the
eighteen registered events.

Six registry entries have wording, channels, an admin screen and no caller:

| event | who can fire it | when |
| --- | --- | --- |
| `order_created` | B1 | the order-create transaction, after the order row exists |
| `admin_order_created` | B1 | same transaction |
| `order_price_changed` | B1 or the admin order console | after 改价, with `oldAmount` |
| `refund_applied` / `admin_refund_applied` | C | the buyer's request transaction |
| `refund_approved` / `refund_rejected` | C | the review transaction, with the rejection reason |
| `admin_low_stock` | B2 (or whoever owns the stock decrement) | when a SKU crosses its warning threshold |
| `admin_payment_exception` | C | when a `payment_exceptions` row is written |

`refund_settled` **is** wired, through `onOrderRefunded`.

## Why E2 cannot do this itself

`notify` has to be called inside the business transaction — that is the whole
guarantee (NOTIF-001). A hook registered from outside only works where a hook
registry already exists, and there is none for order creation, price change,
refund review or the stock threshold. Adding one is a change inside another
stream's domain.

## What this asks for

Either of the two, per event — the notification side is identical:

**A. A hook registry**, the way the order domain already does it:

```ts
export const onRefundApplied = new HookRegistry<RefundAppliedEvent>('refund.applied');
```

E2 then registers into it from `installNotificationHooks()` and nothing else
changes. This is preferred for anything more than one stream will want.

**B. A direct call**, where the event has exactly one caller:

```ts
import { notify } from '@shop/core/notification';

await notify(tx, ctx, {
  event: 'refund_applied',
  subject: { scope: 'refund', id: refund.id },
  userId: refund.userId,
  data: { refundId: refund.id, refundNo: refund.no, orderNo, amount: amount.toString() },
});
```

Rules for a caller, all of them enforced by the ledger rather than by
discipline:

- inside the transaction that made the change, never after it;
- `subject` identifies the **aggregate the notification is about** — the refund
  for a refund event, the order for an order event. Two partial refunds of one
  order must be two subjects or the second is silently deduplicated away;
- `data` keys are the event's `variables` (the admin screen lists them); a key
  that is not one renders as nothing;
- the return value is not an error signal. `false` means somebody already asked
  for the same notification.

`@shop/core/notification` exports `notify` and nothing else is needed.

## Until then

The six templates are visible in 通知模板 and configurable, and never send. That
is preferable to hiding them: an operator who configures 退款申请 and sees no
messages files a bug, which is the correct outcome, whereas a missing row looks
like a feature the shop does not have.
