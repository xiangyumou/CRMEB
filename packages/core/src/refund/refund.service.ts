import type {
  RefundApplyBody,
  RefundDetail,
  RefundItem,
  RefundListItem,
  RefundReturnShipmentBody,
  RefundableItem,
  RefundableItemsResult,
} from '@shop/contracts/refund/schemas';
import type { Tx } from '@shop/db';
import { release as releaseCoupon } from '../coupon';
import { recordEffect } from '../effects';
import { requireUserId, type Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { generateOrderNo, toId, toIdOrNull } from '../kernel/ids';
import { Money } from '../kernel/money';
import { notify } from '../notification';
import { requireOrderRef, resolveStockPort } from '../order';
import { onOrderRefunded } from '../order/ports';
import { isStoredImageUrl } from '../storage';
import {
  applyExceptionRefundNotification,
  findPaidPaymentAttempt,
  markCallbackProcessed,
  payClient,
  recordCallback,
  recordCapitalFlow,
  type WebhookResult,
} from '../payment';
import { REFUND_EXCEPTION_EVENT } from './refund.notifications';
import * as repo from './refund.repo';
import {
  freightRefundable,
  lineRefundAmount,
  normalise,
  orderRefundStatus,
  refundableLine,
  remainingCeiling,
} from './refund.rules';

/**
 * After-sales: the request, the review, and the money going back.
 *
 * ## Three invariants, three mechanisms
 *
 * 1. **One in-flight refund per order line.** Enforced by the partial unique
 *    index `refund_items(order_item_id) WHERE is_open` — two simultaneous
 *    applications for one line end with one insert and one unique violation,
 *    which becomes `REFUND_ALREADY_OPEN`. There is no read-then-write window to
 *    lose, and it does not matter that the two requests arrived at different
 *    processes.
 * 2. **Never give back more than was collected.** Checked under `FOR UPDATE` on
 *    the order row, re-checked inside the settling `UPDATE`'s own `WHERE`, and
 *    backstopped by `orders_refunded_within_paid` (REFUND-007).
 * 3. **The merchant refund number and the amount are frozen at creation.** A
 *    retry re-sends the same number, so WeChat itself deduplicates it; an
 *    unknown answer is *queried* by that number and never re-sent under a new
 *    one (REFUND-005 / REFUND-006).
 *
 * ## Where the gateway call sits
 *
 * Never inside a transaction. `executeRefund` claims the row (`approved →
 * processing`), leaves the transaction, calls WeChat, and records the answer in
 * a second transaction. A crash in between leaves `processing`, which is exactly
 * what the reconciliation sweep looks for.
 *
 * ## What "unknown" means here
 *
 * An unverifiable gateway answer restores nothing — not the order's refunded
 * total, not a line's refunded quantity, not the coupon. The row goes to
 * `unknown` and a human or the sweep resolves it by querying the frozen number.
 * Refunding money twice is recoverable; telling the rest of the system that
 * money came back when it did not is not.
 */

const REFUND_NO_PREFIX = 'RF';
const OUT_REFUND_NO_PREFIX = 'R';

/** The canned reasons the apply screen offers. */
export const REFUND_REASONS = [
  '不想要了',
  '商品破损',
  '与描述不符',
  '发错货',
  '少件/漏发',
  '质量问题',
  '快递一直未送达',
  '其他',
] as const;

export function refundReasons(): { items: string[] } {
  return { items: [...REFUND_REASONS] };
}

// ---------------------------------------------------------------------------
// the apply screen
// ---------------------------------------------------------------------------

export async function applicableItems(
  ctx: Ctx,
  input: { orderId: string },
): Promise<RefundableItemsResult> {
  const { orderId, userId } = await requireOrderRef(ctx, input.orderId, 'REFUND_ORDER_NOT_FOUND');
  const order = await repo.findOrder(ctx.db, orderId);
  if (!order || order.deletedAt !== null || order.userId !== userId) {
    throw new DomainError('REFUND_ORDER_NOT_FOUND');
  }
  if (order.paidAmount === null || order.status === 'cancelled') {
    throw new DomainError('REFUND_ORDER_NOT_REFUNDABLE');
  }

  const [items, openIds, openTotal] = await Promise.all([
    repo.listOrderItems(ctx.db, orderId),
    repo.listOpenItemIds(ctx.db, orderId),
    repo.openRefundTotal(ctx.db, orderId),
  ]);
  const open = new Set(openIds);

  const lines: RefundableItem[] = items.map((item) => {
    const line = refundableLine({
      orderItemId: item.id,
      quantity: item.quantity,
      refundedQuantity: item.refundedQuantity,
      shippedQuantity: item.shippedQuantity,
      totalAmount: item.totalAmount,
      refundedAmount: item.refundedAmount,
      isOpen: open.has(item.id),
    });
    return {
      orderItemId: toId(item.id),
      itemKey: item.itemKey,
      productName: item.snapshot.productName,
      productImageUrl: item.snapshot.productImageUrl,
      specText: item.snapshot.specText,
      quantity: item.quantity,
      refundedQuantity: item.refundedQuantity,
      shippedQuantity: item.shippedQuantity,
      refundableQuantity: line.refundableQuantity,
      unitPrice: item.unitPrice,
      totalAmount: item.totalAmount,
      refundableAmount: line.refundableAmount.toString(),
      blockedReason: line.blockedReason,
    };
  });

  const ceiling = remainingCeiling({
    paidAmount: order.paidAmount,
    refundedAmount: order.refundedAmount,
    openAmount: openTotal,
  });

  return {
    orderId: toId(order.id),
    orderNo: order.orderNo,
    paidAmount: order.paidAmount,
    refundedAmount: order.refundedAmount,
    refundableAmount: ceiling.toString(),
    freightAmount: order.freightAmount,
    freightRefundable: freightRefundable(order.fulfillmentStatus),
    items: lines,
  };
}

// ---------------------------------------------------------------------------
// applying
// ---------------------------------------------------------------------------

/**
 * 申请售后.
 *
 * Every evidence photo must be an image our own storage holds — what
 * `POST /api/v1/uploads` returned (REFUND-014), the rule a review picture
 * (CAT-018) and the avatar (USER-019) already follow. Only the shopper and the
 * merchant see them, but a link to somebody else's server would hand that
 * server the IP and browser of every admin who opens the request. Checked
 * before the order is locked, so a refused photo costs no transaction.
 */
export async function apply(ctx: Ctx, body: RefundApplyBody): Promise<RefundDetail> {
  const userId = requireUserId(ctx);
  const orderId = Number(body.orderId);
  for (const url of new Set(body.images)) {
    if (!(await isStoredImageUrl(ctx, url))) throw new DomainError('REFUND_IMAGE_NOT_ALLOWED');
  }

  const refundId = await ctx.withTx(async (tx) => {
    const order = await repo.lockOrder(tx, orderId);
    if (!order || order.deletedAt !== null || order.userId !== userId) {
      throw new DomainError('REFUND_ORDER_NOT_FOUND');
    }
    if (order.paidAmount === null || order.status === 'cancelled' || order.status === 'refunded') {
      throw new DomainError('REFUND_ORDER_NOT_REFUNDABLE');
    }

    const items = new Map(
      (await repo.listOrderItems(tx, orderId)).map((item) => [item.id, item] as const),
    );
    // Two entries for one line are one claim on that line; summing first is what
    // stops `[{id: 7001, qty: 1}, {id: 7001, qty: 1}]` refunding two units of a
    // one-unit line through two separate remaining-quantity checks.
    const asked = new Map<number, number>();
    for (const line of body.lines) {
      const key = Number(line.orderItemId);
      asked.set(key, (asked.get(key) ?? 0) + line.quantity);
    }

    let amount = Money.ZERO;
    let quantity = 0;
    const lines: repo.NewRefundItemInput[] = [];

    for (const [orderItemId, units] of asked) {
      const item = items.get(orderItemId);
      if (!item || item.orderId !== orderId) throw new DomainError('REFUND_LINE_INVALID');
      const remaining = item.quantity - item.refundedQuantity;
      if (units > remaining) {
        throw new DomainError('REFUND_LINE_INVALID', {
          details: { orderItemId: toId(orderItemId), remaining },
        });
      }
      const lineAmount = lineRefundAmount(
        {
          orderItemId: item.id,
          quantity: item.quantity,
          refundedQuantity: item.refundedQuantity,
          shippedQuantity: item.shippedQuantity,
          totalAmount: item.totalAmount,
          refundedAmount: item.refundedAmount,
          isOpen: false,
        },
        units,
      );
      amount = amount.add(lineAmount);
      quantity += units;
      lines.push({
        refundId: 0,
        orderItemId: item.id,
        quantity: units,
        amount: lineAmount.toString(),
      });
    }

    const freight = body.includeFreight ? refundableFreight(order, items, asked) : null;
    if (freight !== null) amount = amount.add(Money.parse(freight));

    if (!amount.isPositive()) throw new DomainError('REFUND_AMOUNT_ZERO');

    // The ceiling counts what other open requests have already spoken for, so
    // two requests on two different lines cannot together exceed what was paid.
    const ceiling = remainingCeiling({
      paidAmount: order.paidAmount,
      refundedAmount: order.refundedAmount,
      openAmount: await repo.openRefundTotal(tx, orderId),
    });
    if (amount.gt(ceiling)) {
      throw new DomainError('REFUND_EXCEEDS_PAID', {
        details: { requested: amount.toString(), remaining: ceiling.toString() },
      });
    }

    const attempt = await findPaidPaymentAttempt(tx, orderId);
    const refund = await repo.insertRefund(tx, {
      refundNo: generateOrderNo(ctx.clock, { prefix: REFUND_NO_PREFIX }),
      outRefundNo: generateOrderNo(ctx.clock, { prefix: OUT_REFUND_NO_PREFIX }),
      orderId,
      userId,
      paymentAttemptId: attempt?.id ?? null,
      kind: body.kind,
      returnStage: body.kind === 'return_and_refund' ? 'awaiting_shipment' : 'not_required',
      quantity,
      amount: amount.toString(),
      includesFreight: freight !== null,
      reason: body.reason,
      explanation: body.explanation ?? null,
      images: body.images,
      isAutomatic: false,
    });

    try {
      await repo.insertRefundItems(
        tx,
        lines.map((line) => ({ ...line, refundId: refund.id })),
      );
    } catch (error) {
      // `refund_items_open_uq`: somebody else's request already holds one of
      // these lines. The database decided the race; we only name it.
      if (repo.isUniqueViolation(error, 'refund_items_open_uq')) {
        throw new DomainError('REFUND_ALREADY_OPEN');
      }
      throw error;
    }

    await repo.setOrderRefundStatus(
      tx,
      orderId,
      orderRefundStatus(Money.parse(order.refundedAmount), Money.parse(order.paidAmount), true),
    );
    await repo.insertLog(tx, {
      refundId: refund.id,
      fromStatus: null,
      toStatus: 'applied',
      message: `买家发起${body.kind === 'return_and_refund' ? '退货退款' : '仅退款'}申请`,
      operatorUserId: userId,
    });

    // The receipt and the 待处理 badge, both inside this transaction — a
    // request that lost the `refund_items_open_uq` race above must leave
    // neither behind. The subject is the **refund**, not the order: two partial
    // refunds of one order are two notifications, which is exactly what a
    // per-order key would have swallowed.
    const applied = {
      refundId: refund.id,
      refundNo: refund.refundNo,
      orderNo: order.orderNo,
      amount: amount.toString(),
    };
    await notify(tx, ctx, {
      event: 'refund_applied',
      subject: { scope: 'refund', id: refund.id },
      userId,
      data: applied,
    });
    await notify(tx, ctx, {
      event: 'admin_refund_applied',
      subject: { scope: 'refund', id: refund.id },
      data: { ...applied, reason: body.reason },
    });

    return refund.id;
  });

  return detail(ctx, refundId);
}

/**
 * Whether freight goes into this request, and how much.
 *
 * Two conditions: nothing has shipped, and the request covers **every**
 * remaining unrefunded unit of the order. A partial refund never carries
 * freight, because the shop still has to post the parcel the rest of the order
 * is in.
 */
function refundableFreight(
  order: repo.OrderRefundRow,
  items: ReadonlyMap<number, repo.OrderItemRow>,
  asked: ReadonlyMap<number, number>,
): string | null {
  if (!freightRefundable(order.fulfillmentStatus)) {
    throw new DomainError('REFUND_FREIGHT_NOT_REFUNDABLE');
  }
  for (const item of items.values()) {
    const remaining = item.quantity - item.refundedQuantity;
    if (remaining > 0 && (asked.get(item.id) ?? 0) < remaining) {
      throw new DomainError('REFUND_FREIGHT_NOT_REFUNDABLE', {
        details: { reason: 'partial-refund' },
      });
    }
  }
  const freight = Money.parse(order.freightAmount);
  return freight.isPositive() ? freight.toString() : null;
}

// ---------------------------------------------------------------------------
// the shopper's own actions
// ---------------------------------------------------------------------------

/**
 * The buyer withdraws.
 *
 * Only from `applied` or `approved`, and the conditional update is the whole
 * guard: an operator approving-and-executing at the same moment either gets
 * there first (and this answers `REFUND_NOT_ACTIONABLE`) or arrives to find the
 * row already `cancelled` and refuses to execute. Money never leaves on a
 * withdrawn request, and a withdrawal never lands on money already gone.
 */
export async function cancel(ctx: Ctx, input: { id: string }): Promise<RefundDetail> {
  const userId = requireUserId(ctx);
  const id = Number(input.id);

  await ctx.withTx(async (tx) => {
    const row = await repo.lockRefund(tx, id);
    if (!row || row.userId !== userId) throw new DomainError('REFUND_NOT_FOUND');
    const { won } = await repo.transitionRefund(tx, id, ['applied', 'approved'], 'cancelled', {
      cancelledAt: ctx.clock.now(),
    });
    if (!won) throw new DomainError('REFUND_NOT_ACTIONABLE', { details: { status: row.status } });

    await repo.insertLog(tx, {
      refundId: id,
      fromStatus: row.status,
      toStatus: 'cancelled',
      message: '买家撤销申请',
      operatorUserId: userId,
    });
    await refreshOrderRefundStatus(tx, row.orderId);
  });

  return detail(ctx, id);
}

export async function submitReturnShipment(
  ctx: Ctx,
  input: { id: string } & RefundReturnShipmentBody,
): Promise<RefundDetail> {
  const userId = requireUserId(ctx);
  const id = Number(input.id);

  await ctx.withTx(async (tx) => {
    const row = await repo.lockRefund(tx, id);
    if (!row || row.userId !== userId) throw new DomainError('REFUND_NOT_FOUND');
    if (row.kind !== 'return_and_refund') throw new DomainError('REFUND_RETURN_NOT_EXPECTED');

    const { won } = await repo.setReturnShipment(tx, id, {
      returnExpressCompanyId: Number(input.expressCompanyId),
      returnTrackingNo: input.trackingNo,
      returnPhone: input.phone ?? null,
    });
    if (!won) {
      // Not approved yet, or the goods have already been received: either way
      // the shopper is looking at a screen the server has moved past.
      throw new DomainError('REFUND_RETURN_NOT_EXPECTED', {
        details: { status: row.status, returnStage: row.returnStage },
      });
    }
    await repo.insertLog(tx, {
      refundId: id,
      fromStatus: row.status,
      toStatus: row.status,
      message: `买家填写退货物流 ${input.trackingNo}`,
      operatorUserId: userId,
    });
  });

  return detail(ctx, id);
}

/** Hides a finished request from the buyer's own list. Never deletes anything. */
export async function hide(ctx: Ctx, input: { id: string }): Promise<{ deleted: boolean }> {
  const userId = requireUserId(ctx);
  const id = Number(input.id);
  const row = await repo.findRefund(ctx.db, id);
  if (!row || row.userId !== userId) throw new DomainError('REFUND_NOT_FOUND');
  const { won } = await repo.hideRefund(ctx.db, id, userId, ctx.clock.now());
  if (!won) throw new DomainError('REFUND_NOT_ACTIONABLE', { details: { status: row.status } });
  return { deleted: true };
}

export async function myList(
  ctx: Ctx,
  query: { state: 'all' | 'open' | 'succeeded' | 'closed'; page: number; pageSize: number },
): Promise<{ items: RefundListItem[]; total: number; page: number; pageSize: number }> {
  const userId = requireUserId(ctx);
  const { rows, total } = await repo.listMyRefunds(ctx.db, {
    userId,
    state: query.state,
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize,
  });
  const items = await repo.listItemsForRefunds(
    ctx.db,
    rows.map((r) => r.id),
  );
  return {
    items: rows.map((row) => toListItem(row, items.get(row.id) ?? [])),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function myDetail(ctx: Ctx, input: { id: string }): Promise<RefundDetail> {
  const userId = requireUserId(ctx);
  const row = await repo.findRefund(ctx.db, Number(input.id));
  if (!row || row.userId !== userId) throw new DomainError('REFUND_NOT_FOUND');
  return detail(ctx, row.id);
}

// ---------------------------------------------------------------------------
// execution: the gateway call
// ---------------------------------------------------------------------------

export interface ExecuteResult {
  status: 'succeeded' | 'processing' | 'failed' | 'unknown';
  message: string;
}

/**
 * Sends one approved refund to WeChat.
 *
 * Idempotent three times over: the claim only moves a row *out* of a state that
 * allows execution, `out_refund_no` is frozen so WeChat deduplicates a re-send,
 * and the settlement is a conditional update that a racing refund notification
 * simply wins instead.
 */
export async function executeRefund(ctx: Ctx, refundId: number): Promise<ExecuteResult> {
  const claim = await ctx.withTx(async (tx) => {
    const row = await repo.lockRefund(tx, refundId);
    if (!row) throw new DomainError('REFUND_NOT_FOUND');
    if (row.status === 'succeeded') return null;

    // Frozen on the first submit and never rewritten, so a later config change
    // or a second payment attempt cannot redirect a refund already in flight.
    const context = row.requestContext ?? (await freezeContext(tx, row));
    if (context === null) throw new DomainError('REFUND_NO_ORIGINAL_PAYMENT');
    if (!Money.parse(context.refundAmount).eq(Money.parse(row.amount))) {
      // A retry that disagrees with what was frozen is refused, not corrected:
      // the frozen amount is the one WeChat may already have seen (REFUND-005).
      throw new DomainError('REFUND_AMOUNT_MISMATCH', {
        details: { frozenAmount: context.refundAmount, requestedAmount: row.amount },
      });
    }

    const { won } = await repo.transitionRefund(
      tx,
      refundId,
      ['approved', 'processing', 'unknown', 'failed'],
      'processing',
      { requestContext: context, lastError: null },
    );
    if (!won) throw new DomainError('REFUND_NOT_ACTIONABLE', { details: { status: row.status } });
    return { ...row, requestContext: context };
  });

  if (claim === null) return { status: 'succeeded', message: '已退款' };
  const context = claim.requestContext;
  if (context === null) throw new DomainError('REFUND_NO_ORIGINAL_PAYMENT');

  const client = await payClient(ctx);
  if (!client.configured) throw new DomainError('PAYMENT_NOT_CONFIGURED');

  try {
    const gateway = await client.createRefund({
      outRefundNo: claim.outRefundNo,
      outTradeNo: context.outTradeNo,
      transactionId: context.transactionId,
      refundAmount: Money.parse(claim.amount),
      totalAmount: Money.parse(context.totalAmount),
      reason: claim.reason ?? '售后退款',
    });

    if (gateway.status === 'SUCCESS') {
      await ctx.withTx((tx) =>
        settleRefundSucceeded(tx, ctx, refundId, {
          gatewayRefundId: gateway.refundId,
          source: 'refund api',
        }),
      );
      return { status: 'succeeded', message: '退款成功' };
    }

    if (gateway.status === 'PROCESSING') {
      // WeChat will tell us in a callback; the sweep asks if it never does.
      await ctx.withTx((tx) =>
        repo.transitionRefund(tx, refundId, ['processing'], 'processing', {
          gatewayRefundId: gateway.refundId,
        }),
      );
      return { status: 'processing', message: '退款处理中' };
    }

    await ctx.withTx((tx) => failRefund(tx, ctx, refundId, `gateway status ${gateway.status}`));
    return { status: 'failed', message: `退款失败：${gateway.status}` };
  } catch (error) {
    // A refusal is an answer: the gateway did not take the money, so the request
    // becomes retryable. Anything else is silence, and silence restores nothing.
    const refused = error instanceof DomainError && error.code === 'PAYMENT_GATEWAY_REFUSED';
    await ctx.withTx(async (tx) => {
      if (refused) {
        await failRefund(tx, ctx, refundId, messageOf(error));
        return;
      }
      const { won } = await repo.transitionRefund(tx, refundId, ['processing'], 'unknown', {
        lastError: messageOf(error),
      });
      if (won) {
        await repo.insertLog(tx, {
          refundId,
          fromStatus: 'processing',
          toStatus: 'unknown',
          message: `退款结果未知：${messageOf(error)}`,
        });
      }
    });
    ctx.logger.error({ err: error, refundId, refused }, 'refund submit failed');
    return refused
      ? { status: 'failed', message: messageOf(error) }
      : { status: 'unknown', message: messageOf(error) };
  }
}

/** The payment facts this refund is sent with, read from the paid attempt. */
async function freezeContext(
  tx: Tx,
  row: repo.RefundRow,
): Promise<repo.RefundRequestContext | null> {
  const attempt = await findPaidPaymentAttempt(tx, row.orderId);
  if (!attempt || attempt.transactionId === null) return null;
  return {
    outTradeNo: attempt.outTradeNo,
    transactionId: attempt.transactionId,
    provider: attempt.provider,
    mchId: attempt.mchId,
    appId: attempt.appId,
    channel: attempt.channel,
    totalAmount: attempt.amount,
    refundAmount: row.amount,
    currency: attempt.currency,
  };
}

/**
 * The money is back.
 *
 * This is the only function that raises an order's refunded total, and it does
 * everything in one transaction: the refund reaches `succeeded`, its lines stop
 * being open, the order and its lines take the amount, the ledger gets its row,
 * the roll-up is recomputed, a full refund releases the coupon and ends the
 * order, and `onOrderRefunded` fires for stock.
 *
 * Every step is conditional or idempotent, because a refund notification and a
 * query result can arrive at the same instant and both land here. Returns
 * whether *this* call was the one that settled it.
 */
export async function settleRefundSucceeded(
  tx: Tx,
  ctx: Ctx,
  refundId: number,
  facts: { gatewayRefundId: string | null; source: string },
): Promise<boolean> {
  const row = await repo.lockRefund(tx, refundId);
  if (!row) throw new DomainError('REFUND_NOT_FOUND');
  if (row.status === 'succeeded') return false;

  const now = ctx.clock.now();
  const order = await repo.lockOrder(tx, row.orderId);
  if (!order) throw new DomainError('REFUND_ORDER_NOT_FOUND');

  const { won } = await repo.transitionRefund(
    tx,
    refundId,
    ['approved', 'processing', 'unknown'],
    'succeeded',
    {
      succeededAt: now,
      refundedAmount: row.amount,
      gatewayRefundId: facts.gatewayRefundId,
      lastError: null,
    },
  );
  if (!won) return false;

  const amount = Money.parse(row.amount);
  const raised = await repo.addOrderRefundedAmount(tx, row.orderId, row.amount);
  if (!raised.won) {
    // `orders_refunded_within_paid` would have refused this anyway; refusing
    // here keeps the error readable and rolls the whole settlement back rather
    // than half of it.
    throw new DomainError('REFUND_EXCEEDS_PAID', {
      details: { refundId: toId(refundId), amount: row.amount },
    });
  }

  const lines = await repo.listRefundItems(tx, refundId);
  for (const item of lines) {
    // The whole line is the ceiling here: a `refund_only` already took its
    // units at approval and this re-derivation changes nothing, and a return
    // is by definition made of units that were shipped.
    const counted = await repo.recomputeItemRefundedQuantity(tx, item.orderItemId, 'whole-line');
    if (!counted.won) {
      // The database CHECK would refuse anything truly impossible; this is the
      // readable version, and it must not be silent — the money is already
      // back, so somebody has to look at the line.
      ctx.logger.error(
        { refundId: toId(refundId), orderItemId: toId(item.orderItemId) },
        'refunded quantity could not be re-derived for a settled refund line',
      );
    }
    await repo.addItemRefundedAmount(tx, item.orderItemId, item.amount);
  }
  await restock(tx, ctx, { orderId: row.orderId, refundId, lines });

  await recordCapitalFlow(tx, {
    kind: 'order_refund',
    reference: row.outRefundNo,
    direction: 'out',
    amount: row.amount,
    orderId: row.orderId,
    userId: row.userId,
    mchId: row.requestContext?.mchId ?? null,
    transactionId: facts.gatewayRefundId ?? row.requestContext?.transactionId ?? null,
    note: `售后退款 ${row.refundNo}`,
    occurredAt: now,
  });

  const paid = order.paidAmount === null ? Money.ZERO : Money.parse(order.paidAmount);
  const refundedTotal = Money.parse(order.refundedAmount).add(amount);
  const stillOpen = Money.parse(
    normalise(await repo.openRefundTotal(tx, row.orderId)),
  ).isPositive();
  const rollup = orderRefundStatus(refundedTotal, paid, stillOpen);
  await repo.setOrderRefundStatus(tx, row.orderId, rollup);

  const full = rollup === 'refunded';
  if (full) {
    await repo.markOrderRefunded(tx, row.orderId);
    // A fully refunded order gives its coupon back; a partial one does not,
    // because the order it was spent on still stands.
    if (order.userCouponId !== null) {
      await releaseCoupon(tx, ctx, { userCouponId: order.userCouponId, orderId: row.orderId });
    }
  }

  await repo.insertLog(tx, {
    refundId,
    fromStatus: row.status,
    toStatus: 'succeeded',
    message: `退款成功（${facts.source}）`,
  });

  await onOrderRefunded.dispatch(tx, ctx, {
    orderId: row.orderId,
    orderNo: order.orderNo,
    userId: row.userId,
    at: now,
    refundId,
    refundNo: row.refundNo,
    refundedAmount: amount,
    partial: !full,
  });

  // Post-commit work other domains own: the buyer's notification and anything
  // the order domain hangs off a finished order. Recorded in this transaction
  // so it cannot happen for a refund that rolled back.
  await recordEffect(tx, ctx, {
    scope: 'order',
    scopeId: String(row.orderId),
    eventType: 'order.refunded',
    payload: {
      refundId: toId(refundId),
      refundNo: row.refundNo,
      orderId: toId(row.orderId),
      userId: toId(row.userId),
      amount: row.amount,
      full,
      refundedAt: now.toISOString(),
    },
  });

  return true;
}

/**
 * Puts the refunded units back on the shelf — but only the ones that never left
 * the warehouse.
 *
 * The rule is per line: a line whose `shipped_quantity` is still zero goes
 * back, and a line that has gone out does not. A 退货退款 of dispatched goods
 * reaches the shelf through the operator's own inbound step, which is where the
 * inspection that decides whether it is *sellable* belongs — the alternative is
 * a returned broken item silently becoming available stock.
 *
 * `committed: true` because a refund only exists for a paid order, so `commit`
 * has already moved `sales`; `refundId` because an order is refunded line by
 * line and a per-order key would swallow the second partial refund.
 */
async function restock(
  tx: Tx,
  ctx: Ctx,
  input: { orderId: number; refundId: number; lines: readonly repo.RefundItemRow[] },
): Promise<void> {
  const items = new Map(
    (await repo.listOrderItems(tx, input.orderId)).map((item) => [item.id, item] as const),
  );
  const stockLines = input.lines.flatMap((line) => {
    const item = items.get(line.orderItemId);
    if (!item || item.shippedQuantity > 0) return [];
    return [{ skuId: item.skuId, quantity: line.quantity }];
  });
  if (stockLines.length === 0) return;

  await resolveStockPort().release(tx, input.orderId, stockLines, {
    committed: true,
    refundId: input.refundId,
  });
  ctx.logger.info(
    { orderId: input.orderId, refundId: input.refundId, lines: stockLines.length },
    'refund restocked the unshipped lines',
  );
}

async function failRefund(tx: Tx, ctx: Ctx, refundId: number, error: string): Promise<void> {
  const row = await repo.lockRefund(tx, refundId);
  if (!row) return;
  const { won } = await repo.transitionRefund(
    tx,
    refundId,
    ['approved', 'processing', 'unknown'],
    'failed',
    { failedAt: ctx.clock.now(), lastError: error.slice(0, 500) },
  );
  if (!won) return;
  await repo.insertLog(tx, {
    refundId,
    fromStatus: row.status,
    toStatus: 'failed',
    message: `退款失败：${error.slice(0, 200)}`,
  });
  // A failed 仅退款 gives its units back to the warehouse: they were taken out
  // of fulfilment at approval, and the gateway has just said the money is not
  // going anywhere. Re-deriving does it — the refund has dropped out of the set
  // the column is computed from.
  if (row.kind === 'refund_only') {
    for (const line of await repo.listRefundItems(tx, refundId)) {
      await repo.recomputeItemRefundedQuantity(tx, line.orderItemId, 'whole-line');
    }
  }
  await refreshOrderRefundStatus(tx, row.orderId);
}

/** Recomputes `orders.refund_status` from what is settled and what is still open. */
export async function refreshOrderRefundStatus(tx: Tx, orderId: number): Promise<void> {
  const order = await repo.findOrder(tx, orderId);
  if (!order) return;
  const stillOpen = Money.parse(normalise(await repo.openRefundTotal(tx, orderId))).isPositive();
  await repo.setOrderRefundStatus(
    tx,
    orderId,
    orderRefundStatus(
      Money.parse(order.refundedAmount),
      order.paidAmount === null ? Money.ZERO : Money.parse(order.paidAmount),
      stillOpen,
    ),
  );
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 400);
}

// ---------------------------------------------------------------------------
// reconciliation
// ---------------------------------------------------------------------------

/**
 * Asks the gateway what became of a refund whose answer was lost, by the frozen
 * merchant refund number. Never re-sends (REFUND-006).
 */
export async function reconcileRefund(ctx: Ctx, refundId: number): Promise<ExecuteResult> {
  const row = await repo.findRefund(ctx.db, refundId);
  if (!row) throw new DomainError('REFUND_NOT_FOUND');
  if (row.status === 'succeeded') return { status: 'succeeded', message: '已退款' };

  const client = await payClient(ctx);
  if (!client.configured) throw new DomainError('PAYMENT_NOT_CONFIGURED');

  const gateway = await client.queryRefund(row.outRefundNo);
  if (gateway === null) {
    // The gateway never took it, so the request becomes executable again under
    // the same number rather than sitting in `unknown` forever.
    await ctx.withTx((tx) => failRefund(tx, ctx, refundId, 'gateway has no such refund'));
    return { status: 'failed', message: '网关无此退款单' };
  }

  if (gateway.status === 'SUCCESS') {
    // The query path reads the amount exactly as the webhook does.
    const frozenFen = Money.parse(row.amount).fen;
    if (gateway.refundFen !== frozenFen) {
      await ctx.withTx(async (tx) => {
        const locked = await repo.lockRefund(tx, refundId);
        if (!locked || locked.status === 'succeeded') return;
        await raiseRefundException(tx, ctx, locked, amountMismatch(gateway.refundFen, frozenFen));
      });
      return { status: 'unknown', message: '网关退款金额与退款单不符，待人工核对' };
    }
    await ctx.withTx((tx) =>
      settleRefundSucceeded(tx, ctx, refundId, {
        gatewayRefundId: gateway.refundId,
        source: 'query',
      }),
    );
    return { status: 'succeeded', message: '退款成功' };
  }
  if (gateway.status === 'PROCESSING') return { status: 'processing', message: '退款处理中' };

  await ctx.withTx((tx) => failRefund(tx, ctx, refundId, `gateway status ${gateway.status}`));
  return { status: 'failed', message: `退款失败：${gateway.status}` };
}

// ---------------------------------------------------------------------------
// the refund notification
// ---------------------------------------------------------------------------

const ACK: WebhookResult = { status: 200, body: { code: 'SUCCESS', message: '成功' } };

/**
 * `POST /api/v1/webhooks/wechat-refund`.
 *
 * Same three steps, same order, same reasons as the payment webhook: **verify
 * the signature, then insert the callback row, then act.** Nothing before the
 * verification touches the database; nothing after the insert runs twice.
 *
 * The whole body runs in one transaction, so a duplicate delivery and a racing
 * admin retry contend for the same rows instead of both booking a refund. A
 * notification whose `out_refund_no` is not one of ours is offered to the
 * payment domain, because exception refunds carry their own `X` numbers.
 *
 * Three checks after the signature, each answered 200 so WeChat stops
 * redelivering bytes that will never read any better:
 *
 *  - **the event type, before the callback row**: only `REFUND.*`. A
 *    transaction event recorded here would burn its notify id in the shared
 *    `payment_callbacks` table, and the genuine delivery to the payment webhook
 *    would read as a replay.
 *  - **the merchant**: `mchid` present and equal to the one the refund was sent
 *    under (frozen on the row; the configured one otherwise).
 *  - **the amount**: a `SUCCESS` whose `amount.refund` is absent or is not the
 *    frozen amount is not settled.
 *
 * A failed merchant or amount check leaves the refund where it was, records the
 * reason on the callback row, `refunds.last_error` and the refund's log, and
 * tells an operator (`admin_refund_exception`).
 */
export async function handleRefundNotify(
  ctx: Ctx,
  args: { headers: Record<string, string | null>; rawBody: string },
): Promise<WebhookResult> {
  const client = await payClient(ctx);
  if (!client.configured) {
    ctx.logger.error({}, 'refund notify arrived but the payment config is incomplete');
    return { status: 500, body: { code: 'FAIL', message: '支付未配置' } };
  }

  let notification;
  try {
    notification = await client.verifyNotification(args);
  } catch (error) {
    ctx.logger.warn({ err: error }, 'refund notify rejected before parsing');
    return { status: 401, body: { code: 'FAIL', message: '签名验证失败' } };
  }

  if (!notification.eventType.startsWith('REFUND.')) {
    ctx.logger.warn(
      { eventType: notification.eventType, notifyId: notification.notifyId },
      'refund notify: not a refund event; acknowledged without a callback row',
    );
    return ACK;
  }

  const resource = notification.resource;
  const outRefundNo = stringOrNull(resource.out_refund_no);
  const status = stringOrNull(resource.refund_status) ?? '';
  const gatewayRefundId = stringOrNull(resource.refund_id);
  const namedMchId = stringOrNull(resource.mchid);
  // Filed under the merchant the body named, so a foreign one is visible as such.
  const mchId = namedMchId ?? client.mchId;
  const refundFen = notifiedRefundFen(resource.amount);

  try {
    return await ctx.withTx(async (tx) => {
      const callback = await recordCallback(tx, {
        kind: callbackKind(status),
        mchId,
        providerNotifyId: notification.notifyId,
        outTradeNo: stringOrNull(resource.out_trade_no),
        transactionId: stringOrNull(resource.transaction_id),
        signatureVerified: true,
        payload: resource,
      });
      // Already recorded: WeChat is retrying an acknowledgement it never got, or
      // two deliveries raced. Either way the work is done.
      if (!callback) return ACK;

      const result =
        outRefundNo === null
          ? 'ignored: no out_refund_no'
          : await applyRefundNotification(tx, ctx, {
              outRefundNo,
              status,
              gatewayRefundId,
              namedMchId,
              configuredMchId: client.mchId,
              refundFen,
            });

      await markCallbackProcessed(tx, callback.id, { at: ctx.clock.now(), result });
      return ACK;
    });
  } catch (error) {
    // Nothing committed. FAIL asks WeChat to deliver again, which beats
    // acknowledging money we did not record.
    ctx.logger.error({ err: error, outRefundNo }, 'refund notify failed');
    return { status: 500, body: { code: 'FAIL', message: '处理失败，请重试' } };
  }
}

function callbackKind(
  status: string,
): 'refund_success' | 'refund_abnormal' | 'refund_closed' | 'unknown' {
  if (status === 'SUCCESS') return 'refund_success';
  if (status === 'ABNORMAL') return 'refund_abnormal';
  if (status === 'CLOSED') return 'refund_closed';
  return 'unknown';
}

/** Applies a *verified* refund notification inside the webhook's transaction. */
async function applyRefundNotification(
  tx: Tx,
  ctx: Ctx,
  args: {
    outRefundNo: string;
    status: string;
    gatewayRefundId: string | null;
    /** `mchid` as the body stated it; `null` when absent. */
    namedMchId: string | null;
    configuredMchId: string;
    /** `amount.refund` in 分, or `null` when absent or not a positive integer. */
    refundFen: number | null;
  },
): Promise<string> {
  const row = await repo.lockRefundByOutRefundNo(tx, args.outRefundNo);
  if (!row) {
    // Not an after-sales refund: it may be an exception refund, which the
    // payment domain owns and numbers itself. It was sent under the configured
    // merchant, so a body naming any other is not settled against it either;
    // the exception row stays `refunding`, which is on an operator's list.
    if (args.namedMchId !== args.configuredMchId) {
      ctx.logger.error(
        { outRefundNo: args.outRefundNo, mchId: args.namedMchId, expected: args.configuredMchId },
        'refund notify merchant mismatch; not settled',
      );
      return `exception: merchant_mismatch (named ${args.namedMchId ?? 'none'}, expected ${args.configuredMchId})`;
    }
    const handled = await applyExceptionRefundNotification(tx, ctx, {
      refundNo: args.outRefundNo,
      status: args.status,
      gatewayRefundId: args.gatewayRefundId,
    });
    return handled ?? `ignored: unknown refund ${args.outRefundNo}`;
  }

  const expectedMchId = row.requestContext?.mchId ?? args.configuredMchId;
  if (args.namedMchId !== expectedMchId) {
    if (row.status === 'succeeded') return 'ignored: already settled';
    const reason: RefundExceptionReason = {
      code: 'merchant_mismatch',
      message: `退款通知商户号不符：通知 ${args.namedMchId ?? '（缺失）'}，退款单 ${expectedMchId}`,
    };
    await raiseRefundException(tx, ctx, row, reason);
    return `exception: merchant_mismatch (named ${args.namedMchId ?? 'none'}, expected ${expectedMchId})`;
  }

  if (args.status === 'SUCCESS') {
    const frozenFen = Money.parse(row.amount).fen;
    if (args.refundFen !== frozenFen && row.status !== 'succeeded') {
      await raiseRefundException(tx, ctx, row, amountMismatch(args.refundFen, frozenFen));
      return `exception: amount_mismatch (notified ${args.refundFen ?? 'none'} fen, frozen ${frozenFen} fen)`;
    }
    const settled = await settleRefundSucceeded(tx, ctx, row.id, {
      gatewayRefundId: args.gatewayRefundId,
      source: 'notify',
    });
    return settled ? `refund ${row.id}: succeeded` : 'ignored: already settled';
  }

  if (args.status === 'ABNORMAL' || args.status === 'CLOSED') {
    await failRefund(tx, ctx, row.id, `notify: ${args.status}`);
    return `refund ${row.id}: ${args.status.toLowerCase()}`;
  }

  return `ignored: refund_status=${args.status === '' ? 'null' : args.status}`;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** `amount.refund` as WeChat states it: a positive whole number of 分, or nothing. */
function notifiedRefundFen(amount: unknown): number | null {
  const value = (amount as { refund?: unknown } | null | undefined)?.refund;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// a refund answer that does not match the refund
// ---------------------------------------------------------------------------

interface RefundExceptionReason {
  code: 'merchant_mismatch' | 'amount_mismatch';
  /** Shown on the refund (`last_error`), in its log and in the notification. */
  message: string;
}

function amountMismatch(notifiedFen: number | null, frozenFen: number): RefundExceptionReason {
  return {
    code: 'amount_mismatch',
    message:
      notifiedFen === null
        ? `网关未给出退款金额，退款单金额 ${Money.fromFen(frozenFen).toString()}`
        : `网关退款金额 ${Money.fromFen(notifiedFen).toString()} 与退款单金额 ${Money.fromFen(frozenFen).toString()} 不符`,
  };
}

/**
 * Puts a refund the gateway answered for, but not as we asked, in front of an
 * operator — and does nothing else to it.
 *
 * The status stays where it was (`processing`, `unknown`, `approved`): moving it
 * to `succeeded` would book an amount the bank disagrees with, and moving it to
 * `failed` would free the lines for a second refund of money that may well have
 * moved. `last_error`, the refund's log and `admin_refund_exception` say why.
 *
 * Idempotent on the message: the reconciliation sweep re-queries a `processing`
 * refund every few minutes, and the same discrepancy is written and announced
 * once, not once per sweep.
 */
async function raiseRefundException(
  tx: Tx,
  ctx: Ctx,
  row: repo.RefundRow,
  reason: RefundExceptionReason,
): Promise<void> {
  const message = reason.message.slice(0, 500);
  ctx.logger.error(
    { refundId: row.id, outRefundNo: row.outRefundNo, reason: reason.code, message },
    'refund answer does not match the refund; left for an operator',
  );
  if (row.lastError === message) return;

  await repo.setLastError(tx, row.id, message);
  await repo.insertLog(tx, {
    refundId: row.id,
    fromStatus: row.status,
    toStatus: row.status,
    message: `退款异常，待人工核对：${message}`,
  });
  await notify(tx, ctx, {
    event: REFUND_EXCEPTION_EVENT,
    subject: { scope: 'refund', id: `${row.id}:${reason.code}` },
    data: {
      refundId: row.id,
      refundNo: row.refundNo,
      amount: row.amount,
      reason: message,
    },
  });
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export type RefundItemWithSnapshot = repo.RefundItemRow & {
  snapshot: repo.OrderItemRow['snapshot'];
};

export async function detail(ctx: Ctx, refundId: number): Promise<RefundDetail> {
  const row = await repo.findRefund(ctx.db, refundId);
  if (!row) throw new DomainError('REFUND_NOT_FOUND');
  const order = await repo.findOrder(ctx.db, row.orderId);
  const [items, logs, company] = await Promise.all([
    repo.listItemsForRefunds(ctx.db, [row.id]),
    repo.listLogs(ctx.db, row.id),
    row.returnExpressCompanyId === null
      ? Promise.resolve(null)
      : repo.findExpressCompany(ctx.db, row.returnExpressCompanyId),
  ]);

  return {
    ...toListItem(
      { ...row, orderNo: order?.orderNo ?? '', userNickname: null },
      items.get(row.id) ?? [],
    ),
    ...returnDetail(row, company),
    logs: logs.map(toLogEntry),
  };
}

type ReturnDetailFields = Pick<
  RefundDetail,
  | 'explanation'
  | 'images'
  | 'returnExpressCompanyId'
  | 'returnExpressCompanyName'
  | 'returnTrackingNo'
  | 'returnPhone'
  | 'returnAddress'
>;

/**
 * The return half of a detail.
 *
 * The address comes from `refunds.return_address`, frozen by the approval that
 * first asked this buyer to ship something back — **never** from the config
 * group. A shop that edits its return address afterwards must not silently
 * re-address a parcel that is already in the post, and a buyer holding a
 * screenshot of the old one must not be told they got it wrong.
 */
export function returnDetail(
  row: repo.RefundRow,
  company: { id: number; name: string } | null,
): ReturnDetailFields {
  const wantsAddress = row.kind === 'return_and_refund' && row.returnStage !== 'not_required';
  return {
    explanation: row.explanation,
    images: row.images,
    returnExpressCompanyId: toIdOrNull(row.returnExpressCompanyId),
    returnExpressCompanyName: company?.name ?? null,
    returnTrackingNo: row.returnTrackingNo,
    returnPhone: row.returnPhone,
    returnAddress: wantsAddress ? (row.returnAddress ?? null) : null,
  };
}

export function toLogEntry(log: repo.RefundLogRow): RefundDetail['logs'][number] {
  return {
    toStatus: log.toStatus,
    message: log.message,
    createdAt: log.createdAt.toISOString(),
  };
}

export function toListItem(
  row: repo.RefundListRow,
  items: RefundItemWithSnapshot[],
): RefundListItem {
  return {
    id: toId(row.id),
    refundNo: row.refundNo,
    orderId: toId(row.orderId),
    orderNo: row.orderNo,
    kind: row.kind,
    status: row.status,
    returnStage: row.returnStage,
    quantity: row.quantity,
    amount: row.amount,
    refundedAmount: row.refundedAmount,
    includesFreight: row.includesFreight,
    reason: row.reason,
    rejectReason: row.rejectReason,
    items: items.map(toRefundItem),
    createdAt: row.createdAt.toISOString(),
    succeededAt: row.succeededAt === null ? null : row.succeededAt.toISOString(),
  };
}

function toRefundItem(item: RefundItemWithSnapshot): RefundItem {
  return {
    orderItemId: toId(item.orderItemId),
    productName: item.snapshot.productName,
    productImageUrl: item.snapshot.productImageUrl,
    specText: item.snapshot.specText,
    quantity: item.quantity,
    amount: item.amount,
  };
}
