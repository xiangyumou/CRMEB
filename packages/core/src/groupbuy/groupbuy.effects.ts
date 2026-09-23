import type { Tx } from '@shop/db';
import type { Ctx } from '../kernel/context';
import { registerEffectHandler, type Effect } from '../effects/index';
import { refundSystemInitiated } from '../refund';
import { settleGroup } from './groupbuy.jobs';

/**
 * What the group-buy domain does *after* the transaction commits.
 *
 * Anything that calls a third party happens after commit, via the effects
 * ledger — never inside the transaction. A notification sent inside it would
 * let a WeChat timeout roll back a team that had genuinely completed, so there
 * is no flag to opt in: every notification is an effect, always.
 *
 * Four event types, recorded in `groupbuy.order.ts` and `groupbuy.jobs.ts` —
 * and `groupbuy.settle` also by 立即成团 (`groupbuy.service.ts`):
 *
 * | scope      | event_type         | when                                        |
 * | ---------- | ------------------ | ------------------------------------------- |
 * | `order`    | `groupbuy.join`    | a paid order took a seat                    |
 * | `groupbuy` | `groupbuy.settle`  | a team succeeded or failed                  |
 * | `order`    | `groupbuy.refund`  | the shop owes money nobody asked it for     |
 * | `groupbuy` | `groupbuy.expire`  | a team's clock ran out (delayed)            |
 *
 * `groupbuy.expire` is the timer, and it is an effect rather than a delayed
 * queue job for the reason the checkout service states about `order.autoCancel`:
 * a queue is not transactional, and an enqueue inside the transaction that
 * created the team can be delivered before — or without — the row it names. The
 * effects ledger is written in that same transaction and `run_at` carries the
 * delay, so the timer exists exactly when the team does.
 */

// ---------------------------------------------------------------------------
// the system-initiated refund
// ---------------------------------------------------------------------------

/**
 * How a failed team gives the money back.
 *
 * The default is `refundSystemInitiated` from `refund/index.ts`. The port
 * exists because a unit test that wants to watch the effect handler should not
 * have to stand up a paid order, a payment attempt and a refundable line;
 * `registerAutoRefundPort` lets it substitute a spy.
 *
 * What it is *not* is an extension point: the only registration outside a test
 * is the default below, and anything that opens a `refunds` row still goes
 * through the refund domain's own entry point, ceiling check and all.
 */
export interface AutoRefundPort {
  refund(
    tx: Tx,
    ctx: Ctx,
    input: { orderId: number; reason: 'groupbuy_failed'; note?: string },
  ): Promise<{ refundId: number; created: boolean }>;
}

const defaultAutoRefundPort: AutoRefundPort = {
  refund: (tx, ctx, input) => refundSystemInitiated(tx, ctx, input),
};

let autoRefundPort: AutoRefundPort = defaultAutoRefundPort;

export function registerAutoRefundPort(port: AutoRefundPort): void {
  autoRefundPort = port;
}

/** Test helper: puts the real refund entry point back. */
export function clearAutoRefundPort(): void {
  autoRefundPort = defaultAutoRefundPort;
}

export function peekAutoRefundPort(): AutoRefundPort {
  return autoRefundPort;
}

interface RefundPayload {
  orderId: string;
  groupId: string;
  reason: string;
}

/**
 * Gives a member their money back when the team did not happen.
 *
 * One transaction per member, opened here rather than by the sweep that
 * recorded the effect: a team of five that fails is five refunds, and one bad
 * order — a line that shipped between the sweep and the effect, say — must not
 * roll back the other four. The ledger's `UNIQUE (scope, scope_id,
 * event_type)` gives exactly one effect per member's order however many sweeps
 * run, and `refundSystemInitiated` is idempotent per `(orderId, reason)` on top
 * of that, so a retried effect finds the refund it already opened and returns
 * it instead of opening a second.
 *
 * A throw here is still the right failure: the dispatcher retries eight times
 * and then parks the row as `unknown`, where the 待处理任务 console lists it
 * (it filters `scope in ('payment','refund','order')`, and this effect's scope
 * is `order`) and an operator settles it by hand. Swallowing the error would
 * lose a shopper's money quietly.
 */
async function handleRefundEffect(ctx: Ctx, effect: Effect): Promise<void> {
  const payload = effect.payload as RefundPayload;
  const orderId = Number(payload.orderId);
  const port = autoRefundPort;
  const result = await ctx.withTx((tx) =>
    port.refund(tx, ctx, {
      orderId,
      reason: 'groupbuy_failed',
      note: `拼团 ${payload.groupId} ${payload.reason === 'seat_lost' ? '名额已满' : '未成团'}`,
    }),
  );
  ctx.logger.info(
    {
      orderId: payload.orderId,
      groupId: payload.groupId,
      refundId: String(result.refundId),
      created: result.created,
    },
    'groupbuy: failed team refunded',
  );
}

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

/**
 * The two notification effects have no message of their own: the notification
 * domain owns 订阅消息 / 公众号模板消息 and has no template mapped to
 * `groupbuy.join` or `groupbuy.settle`.
 *
 * They are registered here as logging no-ops rather than left unregistered,
 * because an unhandled effect retries eight times and then parks as `unknown`,
 * which would fill the operators' 待处理任务 console with rows nobody can act
 * on. A logged no-op is honest: the state change happened, the message did not.
 */
async function logOnly(ctx: Ctx, effect: Effect): Promise<void> {
  ctx.logger.info(
    {
      scope: effect.scope,
      scopeId: effect.scopeId,
      event: effect.eventType,
      payload: effect.payload,
    },
    'groupbuy effect: no notification transport registered (stream E2)',
  );
}

// ---------------------------------------------------------------------------
// the expiry timer
// ---------------------------------------------------------------------------

/**
 * Settles one team the moment its clock runs out.
 *
 * Idempotent and safe to arrive late: `settleGroup` re-reads the group under a
 * lock and every transition it makes is conditional, so a team that already
 * succeeded, failed or was settled by the sweep is left exactly as it is.
 */
async function handleExpiryEffect(ctx: Ctx, effect: Effect): Promise<void> {
  const payload = effect.payload as { groupId: string };
  const result = await settleGroup(ctx, Number(payload.groupId));
  if (result.outcome !== 'unchanged') {
    ctx.logger.info({ ...result }, 'groupbuy: team settled on its own timer');
  }
}

/** Idempotent; `registerEffectHandler` replaces by `(scope, eventType)`. */
export function registerGroupbuyEffects(): void {
  registerEffectHandler('order', 'groupbuy.join', logOnly);
  registerEffectHandler('groupbuy', 'groupbuy.settle', logOnly);
  registerEffectHandler('order', 'groupbuy.refund', handleRefundEffect);
  registerEffectHandler('groupbuy', 'groupbuy.expire', handleExpiryEffect);
}
