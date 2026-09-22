import type {
  PaymentChannel,
  PaymentIntent,
  PaymentStatusResult,
  StartPaymentBody,
} from '@shop/contracts/payment/schemas';
import type { Tx } from '@shop/db';
import { recordEffect } from '../effects';
import { requireUserId, type Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { generateOrderNo, generateOutTradeNo, toId } from '../kernel/ids';
import { Money } from '../kernel/money';
import { notify } from '../notification';
import { requireOrderRef } from '../order';
import { onOrderPaid } from '../order/ports';
import {
  createWechatPayClient,
  findOpenid,
  wechatConfig,
  type GatewayTransaction,
  type WechatPayClient,
} from '../wechat';
import { NOTIFY_PATHS, paymentConfig, paymentCredentials } from './payment.config';
import * as repo from './payment.repo';
import type { PaymentContext } from './payment.repo';

/**
 * Payment: starting one, hearing back about one, and never guessing.
 *
 * ## The one rule
 *
 * Three outcomes exist for every gateway interaction — *it happened*, *it
 * definitely did not happen*, and *we do not know* — and the third is a first
 * class state (`payment_attempts.status = 'unknown'`) rather than a branch that
 * picks one of the other two. The legacy driver had no name for not-knowing, so
 * a timeout during close released stock and a coupon for an order that WeChat
 * then reported paid. Everything below is arranged so that path cannot exist:
 * only `markAttemptClosed`, which requires a confirmation timestamp, ever tells
 * the rest of the system that money can no longer arrive.
 *
 * ## Transaction shape
 *
 * A gateway call never happens inside a transaction (CONVENTIONS). So each
 * operation is: a short transaction that claims a row, a network call with the
 * row already claimed, and a second short transaction that records the answer.
 * If the process dies between them the row stays in its claimed state and the
 * reconciliation job picks it up, because "claimed" states are exactly the ones
 * `listStaleAttempts` looks for.
 */

// ---------------------------------------------------------------------------
// enum bridges
//
// The contracts spell the PostgreSQL enums by hand (contracts are the bottom
// layer and may not import `@shop/db`). These assignments are what keep the two
// honest: a drift on either side stops this file compiling.
// ---------------------------------------------------------------------------

type DbAttemptStatus = repo.AttemptRow['status'];
type ContractAttemptStatus = PaymentIntent['status'];
const attemptStatus = (value: DbAttemptStatus): ContractAttemptStatus => value;
const dbChannel = (value: PaymentChannel): repo.AttemptRow['channel'] => value;

/** Which WeChat app a channel pays through. */
const CHANNEL_APP: Record<PaymentChannel, 'oa' | 'mini'> = {
  wechat_mini: 'mini',
  wechat_oa: 'oa',
  // H5 runs in a mobile browser and is billed against the OA's appid.
  wechat_h5: 'oa',
};

const PAY_DESCRIPTION_MAX = 127;

// ---------------------------------------------------------------------------
// gateway wiring
// ---------------------------------------------------------------------------

export interface PaymentRuntime {
  client: WechatPayClient;
  mchId: string;
  /** Minutes an attempt stays collectible. */
  expiryMinutes: number;
  appId(channel: PaymentChannel): string;
}

/**
 * Everything one request needs from configuration, read once.
 *
 * Secrets go from the config service straight into the client and are never
 * returned, logged or attached to an error — `PaymentRuntime` deliberately
 * exposes only the merchant id and the app ids, which are public.
 */
export async function paymentRuntime(ctx: Ctx): Promise<PaymentRuntime> {
  const [payment, wechat] = await Promise.all([
    ctx.config.get(paymentConfig),
    ctx.config.get(wechatConfig),
  ]);
  const credentials = paymentCredentials(payment);
  const client = createWechatPayClient(ctx, credentials);
  return {
    client,
    mchId: payment.mchId,
    expiryMinutes: payment.payExpiryMinutes,
    appId: (channel) => (CHANNEL_APP[channel] === 'mini' ? wechat.miniAppId : wechat.oaAppId),
  };
}

/** The gateway client alone, for callers that already know it is configured. */
export async function payClient(ctx: Ctx): Promise<WechatPayClient> {
  return (await paymentRuntime(ctx)).client;
}

export { NOTIFY_PATHS };

// ---------------------------------------------------------------------------
// starting a payment
// ---------------------------------------------------------------------------

export interface StartPaymentInput extends StartPaymentBody {
  orderId: number;
}

/**
 * `POST /api/v1/orders/:id/payments` — the route-facing entry point.
 *
 * `:id` is the surrogate id **or** the 24-digit order number (CR-1-h): the
 * cashier is reached from a deep link as often as from the order list. The
 * reference is resolved against the caller's own orders, so an unknown number
 * and a stranger's number are the same `PAYMENT_ORDER_NOT_FOUND`.
 */
export async function start(
  ctx: Ctx,
  params: { id: string },
  body: StartPaymentBody,
): Promise<PaymentIntent> {
  const { orderId } = await requireOrderRef(ctx, params.id, 'PAYMENT_ORDER_NOT_FOUND');
  return startPayment(ctx, { ...body, orderId });
}

export async function startPayment(ctx: Ctx, input: StartPaymentInput): Promise<PaymentIntent> {
  const userId = requireUserId(ctx);
  const runtime = await paymentRuntime(ctx);
  if (!runtime.client.configured) throw new DomainError('PAYMENT_NOT_CONFIGURED');

  const appId = runtime.appId(input.channel);
  if (!appId) throw new DomainError('PAYMENT_CHANNEL_UNAVAILABLE');

  const openid = await resolveOpenid(ctx, userId, input);
  const now = ctx.clock.now();

  // --- transaction 1: claim or replay the attempt --------------------------
  const claim = await ctx.withTx(async (tx) => {
    const order = await repo.lockOrderForPayment(tx, input.orderId);
    if (!order || order.deletedAt !== null || order.userId !== userId) {
      throw new DomainError('PAYMENT_ORDER_NOT_FOUND');
    }
    if (order.status === 'cancelled' || order.status === 'refunded') {
      throw new DomainError('PAYMENT_ORDER_NOT_PAYABLE');
    }
    if (order.status !== 'pending_payment') {
      // Paid, shipped, received, completed: the money is already in.
      return { alreadyPaid: true as const, order };
    }
    if (order.payExpiresAt !== null && order.payExpiresAt.getTime() <= now.getTime()) {
      throw new DomainError('PAYMENT_ORDER_EXPIRED');
    }

    const context: PaymentContext = {
      tradeType: input.channel === 'wechat_h5' ? 'MWEB' : 'JSAPI',
      notifyUrl: NOTIFY_PATHS.transaction,
      description: describe(order.orderNo),
      ...(openid === null ? {} : { openid }),
      ...(input.returnUrl === undefined ? {} : { extra: { returnUrl: input.returnUrl } }),
    };

    const existing = await repo.lockOpenAttempt(tx, input.orderId);
    if (existing)
      return {
        alreadyPaid: false as const,
        order,
        attempt: reuse(existing, input, runtime, appId, userId, order.payableAmount),
      };

    const inserted = await repo.insertAttempt(tx, {
      orderId: order.id,
      outTradeNo: generateOutTradeNo(ctx.clock),
      channel: dbChannel(input.channel),
      mchId: runtime.mchId,
      appId,
      amount: order.payableAmount,
      payerUserId: userId,
      context,
    });
    if (inserted) return { alreadyPaid: false as const, order, attempt: inserted };

    // Lost the insert race against another tap. The winner's row is the truth.
    const winner = await repo.lockOpenAttempt(tx, input.orderId);
    if (!winner) throw new DomainError('PAYMENT_ATTEMPT_CONFLICT');
    return {
      alreadyPaid: false as const,
      order,
      attempt: reuse(winner, input, runtime, appId, userId, order.payableAmount),
    };
  });

  if (claim.alreadyPaid) {
    const paid = await repo.findPaidAttempt(ctx.db, input.orderId);
    if (!paid) throw new DomainError('PAYMENT_ORDER_ALREADY_PAID');
    return intentOf(paid, { jsapi: null, h5Url: null, alreadyPaid: true, expiresAt: null });
  }

  const attempt = claim.attempt;
  const expiresAt = expiryOf(claim.order.payExpiresAt, now, runtime.expiryMinutes);

  // --- the gateway call, outside any transaction ---------------------------
  const create = {
    outTradeNo: attempt.outTradeNo,
    description: attempt.context.description ?? describe(claim.order.orderNo),
    amount: Money.parse(attempt.amount),
    expiresAt,
    appId: attempt.appId,
  };

  try {
    if (input.channel === 'wechat_h5') {
      const { h5Url } = await runtime.client.createH5Transaction({
        ...create,
        ...(input.returnUrl === undefined ? {} : { returnUrl: input.returnUrl }),
      });
      await ctx.withTx((tx) =>
        repo.markAttemptSubmitted(tx, attempt.id, { prepayId: null, lastResult: 'h5 created' }),
      );
      return intentOf(
        { ...attempt, status: 'submitted' },
        {
          jsapi: null,
          h5Url,
          alreadyPaid: false,
          expiresAt,
        },
      );
    }

    if (openid === null) throw new DomainError('PAYMENT_OPENID_REQUIRED');
    const { prepayId } = await runtime.client.createJsapiTransaction({ ...create, openid });
    await ctx.withTx((tx) =>
      repo.markAttemptSubmitted(tx, attempt.id, { prepayId, lastResult: 'jsapi created' }),
    );
    const jsapi = runtime.client.jsapiPayParams({ appId: attempt.appId, prepayId });
    return intentOf(
      { ...attempt, status: 'submitted' },
      {
        jsapi,
        h5Url: null,
        alreadyPaid: false,
        expiresAt,
      },
    );
  } catch (error) {
    await recordCreateFailure(ctx, attempt.id, error);
    throw error;
  }
}

/**
 * A repeated tap replays the open attempt — but only if it is really the same
 * request (PAYC-004). A different channel, amount, merchant or payer means the
 * two requests disagree about what is being collected, and the stored row is
 * the one that was sent to the gateway, so the *new* request is refused.
 */
function reuse(
  existing: repo.AttemptRow,
  input: StartPaymentInput,
  runtime: PaymentRuntime,
  appId: string,
  userId: number,
  payableAmount: string,
): repo.AttemptRow {
  const same =
    existing.channel === input.channel &&
    existing.mchId === runtime.mchId &&
    existing.appId === appId &&
    existing.payerUserId === userId &&
    Money.parse(existing.amount).eq(Money.parse(payableAmount));
  if (!same) {
    throw new DomainError('PAYMENT_ATTEMPT_CONFLICT', {
      details: { outTradeNo: existing.outTradeNo, status: existing.status },
    });
  }
  return existing;
}

/**
 * Records what the gateway said about a create.
 *
 * A refusal is final for this attempt: `creating → failed`, and the shopper may
 * start another one. Anything unverifiable is `creating → unknown`, which keeps
 * the order un-cancellable until the reconciliation job knows more — refusing
 * to release is the *only* safe answer when the gateway may have accepted the
 * order we just sent it (PAYC-002).
 */
async function recordCreateFailure(ctx: Ctx, attemptId: number, error: unknown): Promise<void> {
  const refused = error instanceof DomainError && error.code === 'PAYMENT_GATEWAY_REFUSED';
  const message = error instanceof Error ? error.message : String(error);
  await ctx.withTx((tx) =>
    refused
      ? repo.markAttemptFailed(tx, attemptId, `create refused: ${message}`)
      : repo.markAttemptUnknown(tx, attemptId, `create unknown: ${message}`),
  );
}

async function resolveOpenid(
  ctx: Ctx,
  userId: number,
  input: StartPaymentInput,
): Promise<string | null> {
  if (input.channel === 'wechat_h5') return null;
  // A bound identity always wins: a shopper must not be able to direct a
  // payment into somebody else's openid by putting one in the request body.
  const bound = await findOpenid(ctx.db, userId, CHANNEL_APP[input.channel]);
  const openid = bound ?? input.openid ?? null;
  if (openid === null) throw new DomainError('PAYMENT_OPENID_REQUIRED');
  return openid;
}

function describe(orderNo: string): string {
  return `订单 ${orderNo}`.slice(0, PAY_DESCRIPTION_MAX);
}

function expiryOf(orderExpiry: Date | null, now: Date, minutes: number): Date {
  const fallback = new Date(now.getTime() + minutes * 60_000);
  if (orderExpiry === null) return fallback;
  return orderExpiry.getTime() < fallback.getTime() ? orderExpiry : fallback;
}

function intentOf(
  attempt: repo.AttemptRow,
  extra: {
    jsapi: PaymentIntent['jsapi'];
    h5Url: string | null;
    alreadyPaid: boolean;
    expiresAt: Date | null;
  },
): PaymentIntent {
  return {
    attemptId: toId(attempt.id),
    orderId: toId(attempt.orderId),
    outTradeNo: attempt.outTradeNo,
    channel: attempt.channel,
    amount: attempt.amount,
    status: attemptStatus(attempt.status),
    alreadyPaid: extra.alreadyPaid,
    jsapi: extra.jsapi,
    h5Url: extra.h5Url,
    expiresAt: extra.expiresAt === null ? null : extra.expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// cashier polling
// ---------------------------------------------------------------------------

/**
 * "Did my money land?"
 *
 * Reads the database only. A poll loop must never be able to make the shop call
 * WeChat: that is what the notification and the reconciliation job are for, and
 * an unauthenticated client deciding when we talk to the gateway is a denial of
 * service waiting to happen.
 */
export async function paymentStatus(ctx: Ctx, outTradeNo: string): Promise<PaymentStatusResult> {
  const userId = requireUserId(ctx);
  const attempt = await repo.findAttemptByOutTradeNo(ctx.db, outTradeNo);
  if (!attempt) throw new DomainError('PAYMENT_ATTEMPT_NOT_FOUND');

  const order = await repo.findOrderForPayment(ctx.db, attempt.orderId);
  if (!order || order.userId !== userId) throw new DomainError('PAYMENT_ATTEMPT_NOT_FOUND');

  return {
    outTradeNo: attempt.outTradeNo,
    orderId: toId(attempt.orderId),
    status: attemptStatus(attempt.status),
    // The cashier screen cares about the *order*, not about which attempt won.
    paid: order.paidAt !== null,
    paidAt: order.paidAt === null ? null : order.paidAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// settlement: the one place money becomes a state
// ---------------------------------------------------------------------------

export interface SettlementFacts {
  transactionId: string;
  /** What the gateway says it collected, in 分. */
  paidFen: number;
  payerOpenid: string | null;
  successTime: Date;
  mchId: string;
  /** `notify` or `query`; ends up in `payment_attempts.last_result`. */
  source: string;
}

export type SettlementOutcome =
  | { kind: 'paid'; orderId: number }
  | { kind: 'replay' }
  | { kind: 'exception'; exceptionId: number | null; reason: string };

/**
 * Turns a *verified* successful payment into state, inside the caller's
 * transaction.
 *
 * Both routes into this function — the notification and a reconciliation query
 * — hand it the same facts, so there is exactly one implementation of "money
 * arrived" and exactly one place where the awkward cases are decided:
 *
 *  - no attempt at all, or an amount that disagrees, or an order that was
 *    cancelled, or an order that a different transaction already paid: the
 *    money is real but unbookable, so it becomes a `payment_exceptions` row and
 *    an automatic refund effect. It is never silently kept and never quietly
 *    booked against the wrong order (PAY-011).
 *  - the same transaction arriving twice: a replay, and a no-op.
 */
export async function settlePayment(
  tx: Tx,
  ctx: Ctx,
  attempt: repo.AttemptRow | null,
  facts: SettlementFacts,
): Promise<SettlementOutcome> {
  if (!attempt) {
    return exception(tx, ctx, {
      orderId: null,
      paymentAttemptId: null,
      outTradeNo: null,
      reason: 'unmatched_payment',
      facts,
      context: { tradeType: 'JSAPI', ...(facts.payerOpenid ? { openid: facts.payerOpenid } : {}) },
    });
  }

  if (attempt.status === 'paid') {
    // The same money twice is a replay; different money on a paid attempt is a
    // second real payment, which is a refund case, not a no-op.
    if (attempt.transactionId === facts.transactionId) return { kind: 'replay' };
    return exception(tx, ctx, {
      orderId: attempt.orderId,
      paymentAttemptId: attempt.id,
      outTradeNo: attempt.outTradeNo,
      reason: 'duplicate_payment',
      facts,
      context: attempt.context,
    });
  }

  if (Money.parse(attempt.amount).fen !== facts.paidFen) {
    return exception(tx, ctx, {
      orderId: attempt.orderId,
      paymentAttemptId: attempt.id,
      outTradeNo: attempt.outTradeNo,
      reason: 'amount_mismatch',
      facts,
      context: attempt.context,
    });
  }

  const order = await repo.lockOrderForPayment(tx, attempt.orderId);
  if (!order) {
    return exception(tx, ctx, {
      orderId: null,
      paymentAttemptId: attempt.id,
      outTradeNo: attempt.outTradeNo,
      reason: 'unmatched_payment',
      facts,
      context: attempt.context,
    });
  }

  // The attempt collected money whatever the order thinks. Recording that is
  // not optional: `ensureNoOpenAttempts` must never answer `closed` for an
  // order whose money arrived.
  await repo.markAttemptPaid(tx, attempt.id, {
    transactionId: facts.transactionId,
    paidAt: facts.successTime,
    lastResult: `${facts.source}: SUCCESS`,
  });

  if (order.status === 'cancelled') {
    return exception(tx, ctx, {
      orderId: order.id,
      paymentAttemptId: attempt.id,
      outTradeNo: attempt.outTradeNo,
      reason: 'cancelled_order_payment',
      facts,
      context: attempt.context,
    });
  }

  const paid = await repo.markOrderPaid(tx, order.id, {
    paidAmount: attempt.amount,
    paidAt: facts.successTime,
    transactionNo: facts.transactionId,
  });

  if (!paid.won) {
    // Somebody else paid this order first — a second attempt, or an operator.
    return exception(tx, ctx, {
      orderId: order.id,
      paymentAttemptId: attempt.id,
      outTradeNo: attempt.outTradeNo,
      reason: 'duplicate_payment',
      facts,
      context: attempt.context,
    });
  }

  await repo.insertCapitalFlow(tx, {
    kind: 'order_payment',
    reference: attempt.outTradeNo,
    direction: 'in',
    amount: attempt.amount,
    orderId: order.id,
    userId: order.userId,
    mchId: facts.mchId,
    transactionId: facts.transactionId,
    note: `订单支付 ${order.orderNo}`,
    occurredAt: facts.successTime,
  });

  // Hooks run inside this transaction: stock commit, coupon marking, group-buy
  // team closing. A hook that throws rolls the payment back, which is correct —
  // an order whose team could not be closed must not be marked paid either.
  await onOrderPaid.dispatch(tx, ctx, {
    orderId: order.id,
    orderNo: order.orderNo,
    userId: order.userId,
    at: facts.successTime,
    paidAmount: Money.parse(attempt.amount),
    transactionId: facts.transactionId,
  });

  // Anything that talks to a third party (subscribe messages, printer, ERP)
  // hangs off this ledger row instead of this transaction.
  await recordEffect(tx, ctx, {
    scope: 'order',
    scopeId: String(order.id),
    eventType: 'order.paid',
    payload: {
      orderId: toId(order.id),
      orderNo: order.orderNo,
      userId: toId(order.userId),
      amount: attempt.amount,
      transactionId: facts.transactionId,
      paidAt: facts.successTime.toISOString(),
    },
  });

  return { kind: 'paid', orderId: order.id };
}

/**
 * What 支付异常待处理 says happened. The reason is an enum on the row and the
 * admin list colours it from its own map; a 站内信 has to spell it out, and
 * `core` cannot import the admin's.
 */
const EXCEPTION_REASONS: Record<repo.NewExceptionInput['reason'], string> = {
  duplicate_payment: '重复支付',
  cancelled_order_payment: '订单已取消',
  unmatched_payment: '无法匹配订单',
  amount_mismatch: '金额不符',
};

async function exception(
  tx: Tx,
  ctx: Ctx,
  input: {
    orderId: number | null;
    paymentAttemptId: number | null;
    outTradeNo: string | null;
    reason: repo.NewExceptionInput['reason'];
    facts: SettlementFacts;
    context: PaymentContext;
  },
): Promise<SettlementOutcome> {
  const row = await repo.insertException(tx, {
    orderId: input.orderId,
    paymentAttemptId: input.paymentAttemptId,
    mchId: input.facts.mchId,
    transactionId: input.facts.transactionId,
    outTradeNo: input.outTradeNo,
    reason: input.reason,
    paidAmount: Money.fromFen(input.facts.paidFen).toString(),
    context: input.context,
  });

  // `null` means the unique index caught a replay: the row is already on
  // somebody's list, and its refund effect is already recorded.
  const existing =
    row ??
    (await repo.findExceptionByTransaction(tx, input.facts.mchId, input.facts.transactionId));

  if (row) {
    ctx.logger.warn(
      {
        reason: input.reason,
        transactionId: input.facts.transactionId,
        outTradeNo: input.outTradeNo,
        orderId: input.orderId,
        exceptionId: row.id,
      },
      'payment exception recorded',
    );
    // Money the shop cannot book goes back by itself. An operator can still
    // stop it by ignoring the row before the effect runs.
    await recordEffect(tx, ctx, {
      scope: 'payment',
      scopeId: String(row.id),
      eventType: 'payment.exception.refund',
      payload: { exceptionId: toId(row.id), reason: input.reason },
    });

    // CR-2-e2. Inside the same `if (row)`, so a replayed callback that found
    // the row already there wakes nobody a second time — and inside the
    // settlement transaction, so an exception that rolls back is not announced
    // at all. The automatic refund above does not make this redundant: it can
    // fail, and somebody has to know money arrived that the shop cannot book.
    await notify(tx, ctx, {
      event: 'admin_payment_exception',
      subject: { scope: 'payment_exception', id: row.id },
      data: {
        exceptionId: row.id,
        outTradeNo: input.outTradeNo ?? input.facts.transactionId,
        amount: row.paidAmount,
        reason: EXCEPTION_REASONS[input.reason],
      },
    });
  }

  return { kind: 'exception', exceptionId: existing?.id ?? null, reason: input.reason };
}

// ---------------------------------------------------------------------------
// the transaction notification
// ---------------------------------------------------------------------------

export interface WebhookResult {
  status: number;
  body: { code: 'SUCCESS' | 'FAIL'; message: string };
}

const ACK: WebhookResult = { status: 200, body: { code: 'SUCCESS', message: '成功' } };

/**
 * Turns a webhook result into what `handle()` can return.
 *
 * `handle()` takes the status from the contract, so a route cannot answer 401
 * or 500 by returning a body — it has to throw. Both codes are registered, so
 * the status and the message still come from the contracts registry and the
 * route file keeps no logic of its own. WeChat only reads the status and, on a
 * 200, `code`; anything non-200 means "deliver this again", which is exactly
 * what both branches want.
 */
export function ackOrThrow(result: WebhookResult): WebhookResult['body'] {
  if (result.status === 200) return result.body;
  throw new DomainError(result.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL', {
    message: result.body.message,
  });
}

/**
 * `POST /api/v1/webhooks/wechat-pay`.
 *
 * The order of the first three steps is the whole security model and does not
 * change: **verify the signature, then insert the callback row, then act.**
 * Nothing before the verification touches the database, so an unsigned body
 * cannot even fill a table; nothing after the insert runs twice, because the
 * insert is the idempotency key (PAY-007).
 *
 * WeChat retries any non-200, so a failure we might recover from answers 500
 * and a body we will never accept answers 401. Success is acknowledged only
 * after the state change has committed.
 */
export async function handleTransactionNotify(
  ctx: Ctx,
  args: { headers: Record<string, string | null>; rawBody: string },
): Promise<WebhookResult> {
  const runtime = await paymentRuntime(ctx);
  if (!runtime.client.configured) {
    ctx.logger.error({}, 'payment notify arrived but the payment config is incomplete');
    return { status: 500, body: { code: 'FAIL', message: '支付未配置' } };
  }

  let notification;
  try {
    notification = await runtime.client.verifyNotification(args);
  } catch (error) {
    ctx.logger.warn({ err: error }, 'payment notify rejected before parsing');
    return { status: 401, body: { code: 'FAIL', message: '签名验证失败' } };
  }

  const resource = notification.resource;
  const outTradeNo = stringOrNull(resource.out_trade_no);
  const transactionId = stringOrNull(resource.transaction_id);
  const tradeState = stringOrNull(resource.trade_state);
  const mchId = stringOrNull(resource.mchid) ?? runtime.mchId;
  const amount = (resource.amount ?? {}) as { total?: unknown; payer_total?: unknown };
  const paidFen = positiveFen(amount.payer_total) ?? positiveFen(amount.total);

  try {
    return await ctx.withTx(async (tx) => {
      const callback = await repo.insertCallback(tx, {
        kind: 'transaction_success',
        mchId,
        providerNotifyId: notification.notifyId,
        outTradeNo,
        transactionId,
        signatureVerified: true,
        payload: resource,
      });
      // Already recorded: WeChat is retrying an acknowledgement it did not
      // receive, or two deliveries raced. Either way the work is done.
      if (!callback) return ACK;

      if (tradeState !== 'SUCCESS') {
        await repo.markCallbackProcessed(tx, callback.id, {
          at: ctx.clock.now(),
          result: `ignored: trade_state=${tradeState ?? 'null'}`,
        });
        return ACK;
      }
      if (transactionId === null) {
        await repo.markCallbackProcessed(tx, callback.id, {
          at: ctx.clock.now(),
          result: 'ignored: no transaction_id',
        });
        return ACK;
      }
      if (paidFen === null) {
        // A genuine WeChat signature over a body that does not say how much
        // money moved. There is nothing to book and nothing to refund — an
        // amount is what a refund is made of — so the row stays on the
        // callbacks table for a human and the delivery is acknowledged.
        // Answering 500 here would ask WeChat to redeliver the *same bytes*
        // forever, and they would never parse any better (GATEWAY-001).
        ctx.logger.error(
          { outTradeNo, transactionId, amount },
          'payment notify carried no usable amount',
        );
        await repo.markCallbackProcessed(tx, callback.id, {
          at: ctx.clock.now(),
          result: 'ignored: invalid amount',
        });
        return ACK;
      }
      if (mchId !== runtime.mchId) {
        // Correctly signed by WeChat, but for a merchant we are not configured
        // as. Money we cannot even attribute: a human looks at it (PAYC-005).
        ctx.logger.error({ mchId, expected: runtime.mchId }, 'payment notify merchant mismatch');
      }

      const attempt =
        outTradeNo === null ? null : await repo.lockAttemptByOutTradeNo(tx, outTradeNo);

      const outcome = await settlePayment(tx, ctx, attempt, {
        transactionId,
        paidFen,
        payerOpenid: stringOrNull((resource.payer as { openid?: string } | undefined)?.openid),
        successTime: parseInstant(stringOrNull(resource.success_time), ctx.clock.now()),
        mchId,
        source: 'notify',
      });

      await repo.markCallbackProcessed(tx, callback.id, {
        at: ctx.clock.now(),
        result: describeOutcome(outcome),
      });
      return ACK;
    });
  } catch (error) {
    // Nothing committed. Answering FAIL asks WeChat to deliver again, which is
    // exactly what we want: the alternative is acknowledging money we did not
    // record.
    ctx.logger.error({ err: error, outTradeNo }, 'payment notify failed');
    return { status: 500, body: { code: 'FAIL', message: '处理失败，请重试' } };
  }
}

function describeOutcome(outcome: SettlementOutcome): string {
  if (outcome.kind === 'paid') return `paid: order ${outcome.orderId}`;
  if (outcome.kind === 'replay') return 'ignored: already paid';
  return `exception: ${outcome.reason}`;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 分 as WeChat states them: a positive whole number, or nothing at all. */
function positiveFen(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseInstant(value: string | null, fallback: Date): Date {
  if (value === null) return fallback;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : new Date(parsed);
}

// ---------------------------------------------------------------------------
// the cancel path
// ---------------------------------------------------------------------------

export type PaymentState = 'closed' | 'paid' | 'unknown';

/**
 * `PaymentPort.ensureNoOpenAttempts` — the "payment versus cancel" guard.
 *
 * Database only: it runs inside the cancelling transaction with the order row
 * locked, so a network call here could hold that lock for as long as WeChat
 * feels like taking. An open attempt therefore answers `unknown` rather than
 * going to find out, and the caller is expected to have run
 * `closeOrderPayments` (which *does* talk to the gateway) beforehand.
 */
export async function ensureNoOpenAttempts(tx: Tx, orderId: number): Promise<PaymentState> {
  const attempts = await repo.listAttemptsForOrder(tx, orderId);
  if (attempts.some((a) => a.status === 'paid')) return 'paid';
  const open = attempts.filter((a) =>
    (repo.OPEN_ATTEMPT_STATUSES as readonly string[]).includes(a.status),
  );
  return open.length === 0 ? 'closed' : 'unknown';
}

/**
 * Asks the gateway to close every open attempt on an order, and reports what is
 * true afterwards.
 *
 * Call it **outside** a transaction, before cancelling. `closed` means no money
 * can arrive any more and the cancel may proceed; `paid` means money arrived
 * while we were asking and has now been booked — the order is paid and must not
 * be cancelled; `unknown` means the gateway did not answer and the order keeps
 * every reservation it holds until the reconciliation job resolves it
 * (QUEUE-003 / QUEUE-004).
 */
export async function closeOrderPayments(ctx: Ctx, orderId: number): Promise<PaymentState> {
  const attempts = await repo.listAttemptsForOrder(ctx.db, orderId);
  if (attempts.some((a) => a.status === 'paid')) return 'paid';

  const open = attempts.filter((a) =>
    (repo.OPEN_ATTEMPT_STATUSES as readonly string[]).includes(a.status),
  );
  if (open.length === 0) return 'closed';

  let result: PaymentState = 'closed';
  for (const attempt of open) {
    const state = await closeAttempt(ctx, attempt);
    if (state === 'paid') return 'paid';
    if (state === 'unknown') result = 'unknown';
  }
  return result;
}

/** One attempt, closed or explained. Never "assumed". */
async function closeAttempt(ctx: Ctx, attempt: repo.AttemptRow): Promise<PaymentState> {
  const runtime = await paymentRuntime(ctx);
  if (!runtime.client.configured) return 'unknown';
  if (!sameMerchant(ctx, attempt, runtime)) {
    await ctx.withTx((tx) => repo.markAttemptUnknown(tx, attempt.id, MERCHANT_MISMATCH));
    return 'unknown';
  }

  await ctx.withTx((tx) => repo.markAttemptClosing(tx, attempt.id, 'closing requested'));

  try {
    await runtime.client.closeTransaction(attempt.outTradeNo);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'PAYMENT_GATEWAY_REFUSED') {
      // The usual refusal is ORDERPAID: the shopper paid while we were closing.
      // Ask what actually happened rather than deciding here.
      return reconcileAttempt(ctx, attempt.id);
    }
    await ctx.withTx((tx) =>
      repo.markAttemptUnknown(tx, attempt.id, `close unknown: ${messageOf(error)}`),
    );
    return 'unknown';
  }

  await ctx.withTx((tx) =>
    repo.markAttemptClosed(tx, attempt.id, {
      confirmedAt: ctx.clock.now(),
      lastResult: 'closed: gateway confirmed',
    }),
  );
  return 'closed';
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 400);
}

/**
 * PAYC-005 — the merchant on the attempt must still be the configured one.
 *
 * An attempt records the merchant it was created under, and that record is the
 * truth about where the money is. If the configuration has since been pointed at
 * a different 商户号 — a migration, a second shop, a mistyped field — then a
 * close or a query sent now would ask the *wrong* merchant about an order it has
 * never heard of, and the honest "no such order" that came back would look like
 * a confirmed negative. That is the shape of releasing stock on an order the old
 * merchant is still happily collecting.
 *
 * So: no gateway call, no state change, `unknown`, and a human reads
 * 支付商户信息不一致，请人工核对后处理 on the attempt.
 */
const MERCHANT_MISMATCH = 'merchant mismatch: 支付商户信息不一致，请人工核对后处理';

function sameMerchant(ctx: Ctx, attempt: repo.AttemptRow, runtime: PaymentRuntime): boolean {
  if (attempt.mchId === runtime.mchId) return true;
  ctx.logger.error(
    { attemptId: attempt.id, attemptMchId: attempt.mchId, configuredMchId: runtime.mchId },
    'payment attempt merchant no longer matches the configuration',
  );
  return false;
}

// ---------------------------------------------------------------------------
// reconciliation
// ---------------------------------------------------------------------------

/**
 * Asks the gateway what really happened to one attempt, and records it.
 *
 * This is the only way out of `unknown`, and it is driven entirely by the
 * frozen `out_trade_no` (PAYC-002): no guessing from elapsed time, no
 * "probably closed", no re-creating the order under a new number.
 */
export async function reconcileAttempt(ctx: Ctx, attemptId: number): Promise<PaymentState> {
  const attempt = await repo.findAttempt(ctx.db, attemptId);
  if (!attempt) throw new DomainError('PAYMENT_ATTEMPT_NOT_FOUND');
  if (attempt.status === 'paid') return 'paid';
  if (attempt.status === 'closed' || attempt.status === 'failed') return 'closed';

  const runtime = await paymentRuntime(ctx);
  if (!runtime.client.configured) return 'unknown';
  if (!sameMerchant(ctx, attempt, runtime)) {
    await ctx.withTx((tx) => repo.markAttemptUnknown(tx, attempt.id, MERCHANT_MISMATCH));
    return 'unknown';
  }

  let remote: GatewayTransaction | null;
  try {
    remote = await runtime.client.queryTransaction(attempt.outTradeNo);
  } catch (error) {
    await ctx.withTx((tx) =>
      repo.markAttemptUnknown(tx, attempt.id, `query unknown: ${messageOf(error)}`),
    );
    return 'unknown';
  }

  // A confirmed "no such order" is a confirmed negative: the gateway never took
  // it, so nothing can arrive under this number ever again.
  if (remote === null) {
    await ctx.withTx((tx) =>
      repo.markAttemptClosed(tx, attempt.id, {
        confirmedAt: ctx.clock.now(),
        lastResult: 'closed: gateway has no such order',
      }),
    );
    return 'closed';
  }

  if (remote.tradeState === 'SUCCESS' || remote.tradeState === 'REFUND') {
    const outcome = await ctx.withTx(async (tx) => {
      const locked = await repo.lockAttemptByOutTradeNo(tx, attempt.outTradeNo);
      return settlePayment(tx, ctx, locked, {
        transactionId: remote.transactionId ?? attempt.outTradeNo,
        paidFen: remote.payerTotalFen || remote.totalFen,
        payerOpenid: remote.openid,
        successTime: parseInstant(remote.successTime, ctx.clock.now()),
        mchId: remote.mchId || runtime.mchId,
        source: 'query',
      });
    });
    ctx.logger.info(
      { attemptId: attempt.id, outcome: describeOutcome(outcome) },
      'payment reconciled as paid',
    );
    return 'paid';
  }

  if (remote.tradeState === 'CLOSED' || remote.tradeState === 'PAYERROR') {
    await ctx.withTx((tx) =>
      repo.markAttemptClosed(tx, attempt.id, {
        confirmedAt: ctx.clock.now(),
        lastResult: `closed: gateway says ${remote.tradeState}`,
      }),
    );
    return 'closed';
  }

  // NOTPAY / USERPAYING: still collectible. Nothing may be released.
  await ctx.withTx((tx) =>
    repo.markAttemptSubmitted(tx, attempt.id, {
      prepayId: attempt.prepayId,
      lastResult: `query: ${remote.tradeState}`,
    }),
  );
  return 'unknown';
}

/**
 * Refunds one payment exception through the original channel.
 *
 * Runs from the effect handler and from the operator's button, and is safe to
 * call twice: the refund number is frozen on the row by
 * `claimExceptionForRefund`, so a retry asks the gateway about the same refund
 * rather than issuing a second one.
 */
export async function refundException(
  ctx: Ctx,
  exceptionId: number,
  options: { note?: string; operatorAdminId?: number | null } = {},
): Promise<repo.ExceptionRow> {
  const claimed = await ctx.withTx(async (tx) => {
    const row = await repo.lockException(tx, exceptionId);
    if (!row) throw new DomainError('PAYMENT_EXCEPTION_NOT_FOUND');
    if (row.status === 'refunded' || row.status === 'ignored') {
      throw new DomainError('PAYMENT_EXCEPTION_NOT_ACTIONABLE', {
        details: { status: row.status },
      });
    }
    if (row.transactionId === '') throw new DomainError('PAYMENT_EXCEPTION_NOT_REFUNDABLE');

    const { won } = await repo.claimExceptionForRefund(tx, row.id, {
      refundNo: row.refundNo ?? generateOrderNo(ctx.clock, { prefix: 'X' }),
      operatorAdminId: options.operatorAdminId ?? ctx.actor.id,
      note: options.note ?? null,
    });
    // `refunding` already: another worker holds it. Re-reading gives us its
    // frozen refund number, and the gateway call below is idempotent on it.
    const fresh = await repo.lockException(tx, row.id);
    return { row: fresh ?? row, claimed: won };
  });

  const row = claimed.row;
  if (row.status === 'refunded' || row.status === 'ignored') return row;
  if (row.refundNo === null) throw new DomainError('PAYMENT_EXCEPTION_NOT_ACTIONABLE');

  const runtime = await paymentRuntime(ctx);
  if (!runtime.client.configured) throw new DomainError('PAYMENT_NOT_CONFIGURED');

  const amount = Money.parse(row.paidAmount);
  try {
    const refund = await runtime.client.createRefund({
      outRefundNo: row.refundNo,
      outTradeNo: row.outTradeNo ?? row.refundNo,
      transactionId: row.transactionId,
      refundAmount: amount,
      totalAmount: amount,
      reason: '异常支付原路退回',
    });

    const settled = refund.status === 'SUCCESS';
    return await ctx.withTx(async (tx) => {
      await repo.settleException(tx, row.id, {
        status: settled ? 'refunded' : 'refund_unknown',
        at: ctx.clock.now(),
        refundRequest: {
          outRefundNo: refund.outRefundNo,
          refundId: refund.refundId,
          status: refund.status,
          refundFen: refund.refundFen,
        },
      });
      if (settled) await writeExceptionFlow(tx, ctx, row, refund.refundId);
      const fresh = await repo.findException(tx, row.id);
      return fresh ?? row;
    });
  } catch (error) {
    const refused = error instanceof DomainError && error.code === 'PAYMENT_GATEWAY_REFUSED';
    await ctx.withTx((tx) =>
      repo.settleException(tx, row.id, {
        status: refused ? 'refund_failed' : 'refund_unknown',
        at: ctx.clock.now(),
        refundRequest: { error: messageOf(error) },
      }),
    );
    throw error;
  }
}

async function writeExceptionFlow(
  tx: Tx,
  ctx: Ctx,
  row: repo.ExceptionRow,
  refundId: string | null,
): Promise<void> {
  await repo.insertCapitalFlow(tx, {
    kind: 'exception_refund',
    reference: row.refundNo ?? String(row.id),
    direction: 'out',
    amount: row.paidAmount,
    orderId: row.orderId,
    userId: null,
    mchId: row.mchId,
    transactionId: refundId ?? row.transactionId,
    note: `异常支付退款 ${row.transactionId}`,
    occurredAt: ctx.clock.now(),
  });
}

/**
 * Settles an exception whose refund was submitted but whose result was lost.
 * Asks by the frozen merchant refund number, never by re-submitting.
 */
export async function recheckException(ctx: Ctx, exceptionId: number): Promise<repo.ExceptionRow> {
  const row = await repo.findException(ctx.db, exceptionId);
  if (!row) throw new DomainError('PAYMENT_EXCEPTION_NOT_FOUND');
  if (row.refundNo === null) throw new DomainError('PAYMENT_EXCEPTION_NOT_ACTIONABLE');

  const runtime = await paymentRuntime(ctx);
  if (!runtime.client.configured) throw new DomainError('PAYMENT_NOT_CONFIGURED');

  const refund = await runtime.client.queryRefund(row.refundNo);
  if (refund === null) {
    // The gateway never took the refund: the row goes back to being actionable.
    await ctx.withTx((tx) =>
      repo.settleException(tx, row.id, {
        status: 'refund_failed',
        at: ctx.clock.now(),
        refundRequest: { error: 'gateway has no such refund' },
      }),
    );
    const fresh = await repo.findException(ctx.db, row.id);
    return fresh ?? row;
  }

  return ctx.withTx(async (tx) => {
    const status =
      refund.status === 'SUCCESS'
        ? ('refunded' as const)
        : refund.status === 'PROCESSING'
          ? ('refund_unknown' as const)
          : ('refund_failed' as const);
    await repo.settleException(tx, row.id, {
      status,
      at: ctx.clock.now(),
      refundRequest: { outRefundNo: refund.outRefundNo, status: refund.status },
    });
    if (status === 'refunded') await writeExceptionFlow(tx, ctx, row, refund.refundId);
    const fresh = await repo.findException(tx, row.id);
    return fresh ?? row;
  });
}

/**
 * Applies a refund notification that belongs to a **payment exception** rather
 * than to an after-sales request.
 *
 * The refund webhook lives in the refund domain (it is the one that knows about
 * `refunds` rows), but exception refunds are minted here under their own `X`
 * number, so the webhook hands anything it cannot match back to this function.
 * Runs inside the webhook's transaction, which already holds the callback row,
 * so the duplicate-delivery defence is the caller's and this only has to be a
 * conditional update.
 */
export async function applyExceptionRefundNotification(
  tx: Tx,
  ctx: Ctx,
  args: { refundNo: string; status: string; gatewayRefundId: string | null },
): Promise<string | null> {
  const row = await repo.lockExceptionByRefundNo(tx, args.refundNo);
  if (!row) return null;
  if (row.status === 'refunded' || row.status === 'ignored') return 'ignored: already settled';

  const status =
    args.status === 'SUCCESS'
      ? ('refunded' as const)
      : args.status === 'PROCESSING'
        ? ('refund_unknown' as const)
        : ('refund_failed' as const);

  const { won } = await repo.settleException(tx, row.id, {
    status,
    at: ctx.clock.now(),
    refundRequest: { outRefundNo: args.refundNo, status: args.status, source: 'notify' },
  });
  if (!won) return 'ignored: not in refunding';
  if (status === 'refunded') await writeExceptionFlow(tx, ctx, row, args.gatewayRefundId);
  return `exception ${row.id}: ${status}`;
}
