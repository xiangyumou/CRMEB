import type { OrderCancelBody, OrderDetail } from '@shop/contracts/order/schemas';
import type { Tx } from '@shop/db';
import * as coupon from '../coupon';
import { requireUserId, type Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { fromId } from '../kernel/ids';
import { resolvePaymentPort, resolveStockPort } from './catalog.port';
import { orderConfig } from './order.config';
import { autoCancelKey } from './order.checkout.service';
import { detailOf } from './order.query.service';
import * as repo from './order.repo';
import { onOrderCancelled, type OrderStatus, type PaymentState } from './ports';
import { orderStateMachine } from './order.state-machine';

/**
 * Cancellation — the user's, the timeout's and the admin's — behind **one**
 * entry point.
 *
 * Legacy had three: `StoreOrderServices::cancel`, a queue consumer and an
 * admin action, each with its own idea of what to give back. The stock came
 * back in two of them and the coupon in one, so a timed-out order with a
 * coupon quietly ate it.
 *
 * The order of operations is the whole safety argument:
 *
 *  1. `SELECT … FOR UPDATE` on the order, so a payment cannot start underneath;
 *  2. ask `PaymentPort` whether money can still arrive, **while holding it**:
 *     `closed` proceeds, `paid` refuses, `unknown` refuses and releases
 *     *nothing* (risk matrix §4 — never guess);
 *  3. one conditional `pending_payment -> cancelled` transition. Exactly one
 *     caller can win it, which is what makes the auto-cancel job and the user's
 *     tap safe to race;
 *  4. only the winner gives back the stock and the coupon, in the same
 *     transaction, so QUEUE-006's "both or neither" holds by construction.
 *
 * A paid order is never cancelled — `ORDER_TRANSITIONS` has no such edge. It
 * leaves through stream C's full refund.
 */

export type CancelReason = 'user' | 'timeout' | 'admin' | 'payment-failed';

export interface CancelInput {
  orderId: number;
  reason: CancelReason;
  /** Free text for the timeline and for `orders.cancel_reason`. */
  message?: string;
  /** Set for a user-initiated cancellation; recorded on the audit row. */
  userId?: number;
  /**
   * `true` turns "somebody else got there first" into an error. The job path
   * leaves it false: losing that race to the shopper is the system working.
   */
  strict?: boolean;
  /** Refuse to cancel an order whose payment window has not closed yet. */
  onlyIfExpired?: boolean;
}

export interface CancelOutcome {
  cancelled: boolean;
  /** The status the order ended up in, whoever won. */
  status: OrderStatus;
}

const DEFAULT_MESSAGE: Record<CancelReason, string> = {
  user: '用户取消订单',
  timeout: '超时未支付，系统自动取消',
  admin: '管理员取消订单',
  'payment-failed': '支付失败，订单已取消',
};

async function paymentState(ctx: Ctx, tx: Tx, orderId: number): Promise<PaymentState> {
  const port = resolvePaymentPort();
  if (port) return port.ensureNoOpenAttempts(tx, orderId);
  ctx.logger.debug({ orderId }, 'no PaymentPort registered; treating payment as closed');
  return 'closed';
}

/**
 * The one cancellation. Everything else in the system — the route, the delayed
 * job, the sweep, a future admin action — calls this.
 */
export async function cancelOrder(ctx: Ctx, input: CancelInput): Promise<CancelOutcome> {
  const now = ctx.clock.now();
  const strict = input.strict ?? false;
  const message = input.message?.trim() || DEFAULT_MESSAGE[input.reason];

  const outcome = await ctx.withTx(async (tx): Promise<CancelOutcome> => {
    const order = await repo.lockOrder(tx, input.orderId);
    if (!order) throw new DomainError('ORDER_NOT_FOUND');

    if (order.status !== 'pending_payment') {
      if (strict)
        throw new DomainError('ORDER_NOT_CANCELLABLE', { details: { status: order.status } });
      return { cancelled: false, status: order.status };
    }

    // A delayed job can fire early after a clock change or a re-enqueue; the
    // window is re-read here, under the lock, rather than trusted.
    if (input.onlyIfExpired && (order.payExpiresAt === null || order.payExpiresAt > now)) {
      return { cancelled: false, status: order.status };
    }

    const state = await paymentState(ctx, tx, input.orderId);
    if (state === 'paid') throw new DomainError('ORDER_ALREADY_PAID');
    if (state === 'unknown') throw new DomainError('ORDER_PAYMENT_STATE_UNKNOWN');

    const moved = await orderStateMachine.transition(
      tx,
      order.id,
      ['pending_payment'],
      'cancelled',
      { at: now, cancelReason: message, payExpiresAt: null },
    );
    if (!moved.won) {
      if (strict) throw new DomainError('ORDER_NOT_CANCELLABLE');
      return { cancelled: false, status: moved.observed ?? order.status };
    }

    // Stock first: it is ours, it cannot refuse, and it must come back even if
    // the order had no coupon.
    const lines = await repo.stockLinesOf(tx, order.id);
    await resolveStockPort().release(tx, order.id, lines);

    if (order.userCouponId !== null) {
      const released = await coupon.release(tx, ctx, {
        userCouponId: order.userCouponId,
        orderId: order.id,
      });
      // QUEUE-006: the coupon and the stock come back together or not at all.
      // Throwing here rolls the transition back too, leaving the order live.
      if (!released.released) throw new DomainError('ORDER_COUPON_RELEASE_FAILED');
    }

    await repo.insertStatusLog(tx, {
      orderId: order.id,
      changeType: input.reason === 'timeout' ? 'auto_cancelled' : 'cancelled',
      fromStatus: 'pending_payment',
      toStatus: 'cancelled',
      message,
      operatorKind:
        input.reason === 'user' ? 'user' : input.reason === 'admin' ? 'admin' : 'system',
      ...(input.reason === 'user' && input.userId !== undefined
        ? { operatorUserId: input.userId }
        : {}),
    });

    // Hooks run inside this transaction, so a stream that cannot do its part
    // (group-buy releasing a team seat) aborts the cancellation rather than
    // leaving the two halves disagreeing.
    await onOrderCancelled.dispatch(tx, ctx, {
      orderId: order.id,
      orderNo: order.orderNo,
      userId: order.userId,
      at: now,
      reason: input.reason,
    });

    return { cancelled: true, status: 'cancelled' };
  });

  if (outcome.cancelled) {
    // The delayed auto-cancel has nothing left to do. Dropping it is a
    // courtesy: the job is idempotent and would simply find the order gone.
    await ctx.queue.cancel(autoCancelKey(input.orderId));
    ctx.logger.info({ orderId: input.orderId, reason: input.reason }, 'order cancelled');
  }
  return outcome;
}

/** `POST /api/v1/orders/:id/cancel`. */
export async function cancel(
  ctx: Ctx,
  params: { id: string },
  body: OrderCancelBody,
): Promise<OrderDetail> {
  const userId = requireUserId(ctx);
  const orderId = fromId(params.id);

  // Ownership first, so a stranger gets 404 rather than a lock and a 409.
  const owned = await repo.findOrderForUser(ctx.db, { id: orderId, userId });
  if (!owned) throw new DomainError('ORDER_NOT_FOUND');

  await cancelOrder(ctx, {
    orderId,
    reason: 'user',
    userId,
    strict: true,
    ...(body.reason ? { message: body.reason } : {}),
  });
  return detailOf(ctx, { orderId, userId });
}

/**
 * The per-order delayed job. Never throws for a lost race: by the time it runs
 * the shopper may have paid, or cancelled it themselves, and both are fine.
 */
export async function autoCancel(ctx: Ctx, input: { orderId: number }): Promise<CancelOutcome> {
  return cancelOrder(ctx, {
    orderId: input.orderId,
    reason: 'timeout',
    onlyIfExpired: true,
  });
}

/**
 * The backstop sweep. The delayed job does the real work; this exists because
 * a queue can lose a job and an order must not stay `pending_payment` forever
 * holding stock. Nothing depends on it for correctness.
 */
export async function sweepExpiredOrders(ctx: Ctx, options: { limit?: number } = {}) {
  const { autoCancelSweepLimit } = await ctx.config.get(orderConfig);
  const ids = await repo.listExpiredUnpaid(ctx.db, {
    now: ctx.clock.now(),
    limit: options.limit ?? autoCancelSweepLimit,
  });

  let cancelled = 0;
  for (const orderId of ids) {
    try {
      const outcome = await autoCancel(ctx, { orderId });
      if (outcome.cancelled) cancelled += 1;
    } catch (error) {
      // One order that cannot be cancelled — a gateway that will not answer —
      // must not stop the sweep reaching the rest.
      ctx.logger.warn({ err: error, orderId }, 'expired order sweep: cancel failed');
    }
  }
  return { scanned: ids.length, cancelled };
}
