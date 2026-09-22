import { registerEffectHandler } from '../effects';
import { onOrderCancelled, onOrderCompleted, onOrderPaid, onOrderRefunded } from '../order/ports';
import { registerFulfilmentNotifier } from '../order';
import {
  fanOut,
  notify,
  NOTIFICATION_EVENT_TYPE,
  NOTIFICATION_SCOPE,
} from './notification.service';

/**
 * Where notifications hook into the rest of the system.
 *
 * Two kinds of seam, and the difference is about who owns the transaction:
 *
 * - **Order hooks** (`onOrderPaid`, `onOrderCancelled`, …) run *inside* the
 *   business transaction, which is exactly where `notify` belongs: the effect
 *   row and the state change commit together, so a rolled-back payment leaves
 *   no "payment received" message behind and a committed one can never lose the
 *   notification.
 * - **`FulfilmentNotifier`** (B2's port) is called *after* commit, from B2's
 *   own effect handler, because shipping's notification is already behind the
 *   ledger. There `notify` opens a short transaction of its own; the effect key
 *   makes the second call free, so B2 retrying its handler does not enqueue a
 *   second notification.
 *
 * Everything here is registered from `installNotificationHooks()` rather than
 * at module scope, because `resetOrderPorts()` in an integration test clears
 * every hook registry — B2 learned this the hard way and left the comment that
 * this one copies.
 */

registerEffectHandler(NOTIFICATION_SCOPE, NOTIFICATION_EVENT_TYPE, async (ctx, effect) => {
  await fanOut(ctx, effect);
});

export function installNotificationHooks(): void {
  onOrderPaid.register('notification:order-paid', async (tx, ctx, event) => {
    const data = {
      orderId: event.orderId,
      orderNo: event.orderNo,
      amount: event.paidAmount.toString(),
    };
    await notify(tx, ctx, {
      event: 'order_paid',
      subject: { scope: 'order', id: event.orderId },
      userId: event.userId,
      data,
    });
    await notify(tx, ctx, {
      event: 'admin_order_paid',
      subject: { scope: 'order', id: event.orderId },
      data,
    });
  });

  onOrderCancelled.register('notification:order-cancelled', async (tx, ctx, event) => {
    await notify(tx, ctx, {
      event: 'order_cancelled',
      subject: { scope: 'order', id: event.orderId },
      userId: event.userId,
      data: {
        orderId: event.orderId,
        orderNo: event.orderNo,
        reason: CANCEL_REASONS[event.reason],
      },
    });
  });

  onOrderCompleted.register('notification:order-completed', async (tx, ctx, event) => {
    await notify(tx, ctx, {
      event: 'order_completed',
      subject: { scope: 'order', id: event.orderId },
      userId: event.userId,
      data: { orderId: event.orderId, orderNo: event.orderNo },
    });
  });

  onOrderRefunded.register('notification:order-refunded', async (tx, ctx, event) => {
    // The refund domain fires this once per settled refund, partial or not, so
    // the key carries the refund id rather than the order id: two partial
    // refunds of one order are two notifications, and the same refund settled
    // twice by a replayed callback is one.
    await notify(tx, ctx, {
      event: 'refund_settled',
      subject: { scope: 'refund', id: event.refundId },
      userId: event.userId,
      data: {
        refundId: event.refundId,
        orderNo: event.orderNo,
        amount: event.refundedAmount.toString(),
      },
    });
  });

  registerFulfilmentNotifier({
    async notify(ctx, notice) {
      const event = FULFILMENT_EVENTS[notice.kind];
      if (event === undefined) return;
      const payload = notice.payload as { orderNo?: string; company?: string; trackingNo?: string };
      await ctx.withTx((tx) =>
        notify(tx, ctx, {
          event,
          subject: { scope: 'order', id: notice.orderId },
          userId: notice.userId,
          data: {
            orderId: notice.orderId,
            orderNo: payload.orderNo ?? '',
            company: payload.company ?? '',
            trackingNo: payload.trackingNo ?? '',
          },
        }),
      );
    },
  });
}

/**
 * `virtual.delivered` maps onto `order_shipped` rather than getting an event of
 * its own: from the buyer's side a card key arriving *is* the delivery, and a
 * separate 虚拟发货 template would be one more thing for an operator to
 * configure and forget.
 */
const FULFILMENT_EVENTS: Record<string, string | undefined> = {
  'shipment.dispatched': 'order_shipped',
  'virtual.delivered': 'order_shipped',
  'order.received': 'order_received',
  'order.completed': 'order_completed',
};

const CANCEL_REASONS: Record<string, string> = {
  user: '买家取消',
  timeout: '超时未付款',
  admin: '后台取消',
  'payment-failed': '支付失败',
};

installNotificationHooks();

/** Imported for its side effects; this keeps a bundler from eliding the module. */
export const notificationEffectsInstalled = true;
