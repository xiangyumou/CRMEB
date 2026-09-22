import type { Tx } from '@shop/db';
import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { registerEffectHandler, type Effect } from '../effects/index';
import { settleGroup } from './groupbuy.jobs';

/**
 * What the group-buy domain does *after* the transaction commits.
 *
 * CONVENTIONS: "Anything that calls a third party happens after commit, via the
 * effects ledger — never inside the transaction." Legacy ran the 拼团 success
 * notifications inside the pink transaction unless the caller remembered to
 * pass `deferEffects` (`StorePinkServices::pinkComplete` →
 * `executeDeferredEffect`), which meant a WeChat timeout could roll back a team
 * that had genuinely completed. Here there is no flag: every notification is an
 * effect, always.
 *
 * Four event types, all recorded in `groupbuy.order.ts` and `groupbuy.jobs.ts`:
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
// CR-3-d: the missing system-initiated refund entry point
// ---------------------------------------------------------------------------

/**
 * A local stand-in for an export stream C has not written.
 *
 * `core/src/refund/index.ts`:
 *
 * > There is deliberately no "create a refund on behalf of a user" export. A
 * > group-buy that fails (`is_automatic`) is a future caller and will get its
 * > own entry point with its own ceiling check.
 *
 * So this stream declares the shape it needs and registers nothing. When C
 * exports `refundSystemInitiated`, `registerGroupbuyDomain()` gains one line
 * forwarding to it and this interface is deleted.
 */
export interface AutoRefundPort {
  refund(
    tx: Tx,
    ctx: Ctx,
    input: { orderId: number; reason: 'groupbuy_failed'; note?: string },
  ): Promise<void>;
}

let autoRefundPort: AutoRefundPort | undefined;

export function registerAutoRefundPort(port: AutoRefundPort): void {
  autoRefundPort = port;
}

/** Test helper, and the reset a process that re-registers domains needs. */
export function clearAutoRefundPort(): void {
  autoRefundPort = undefined;
}

export function peekAutoRefundPort(): AutoRefundPort | undefined {
  return autoRefundPort;
}

interface RefundPayload {
  orderId: string;
  groupId: string;
  reason: string;
}

/**
 * With no port registered this **throws**, on purpose.
 *
 * The dispatcher retries and then parks the row as `unknown`, where stream C's
 * `GET /admin-api/payment-effects` console lists it (it filters
 * `scope in ('payment','refund','order')`, and this effect's scope is `order`)
 * and an operator refunds it by hand. Silently succeeding would lose a
 * shopper's money; silently skipping would lose the evidence.
 */
async function handleRefundEffect(ctx: Ctx, effect: Effect): Promise<void> {
  const payload = effect.payload as RefundPayload;
  const orderId = Number(payload.orderId);
  const port = autoRefundPort;
  if (!port) {
    throw new DomainError('INTERNAL', {
      message: `拼团失败退款需人工处理：订单 ${payload.orderId}（拼团 ${payload.groupId}）尚无系统退款入口，见 CR-3-d`,
      details: { orderId: payload.orderId, groupId: payload.groupId, reason: payload.reason },
    });
  }
  await ctx.withTx((tx) =>
    port.refund(tx, ctx, {
      orderId,
      reason: 'groupbuy_failed',
      note: `拼团 ${payload.groupId} ${payload.reason === 'seat_lost' ? '名额已满' : '未成团'}`,
    }),
  );
}

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

/**
 * The two notification effects have no handler of their own yet: stream E2 owns
 * 订阅消息 / 公众号模板消息 and will register `groupbuy.join` and
 * `groupbuy.settle` against its own template mapping.
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
