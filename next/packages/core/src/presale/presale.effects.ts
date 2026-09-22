import type { Tx } from '@shop/db';
import type { Ctx } from '../kernel/context';
import { registerEffectHandler, type Effect } from '../effects/index';
import { refundSystemInitiated } from '../refund';

/**
 * What the presale domain does *after* the transaction commits.
 *
 * CONVENTIONS: "Anything that calls a third party happens after commit, via the
 * effects ledger — never inside the transaction." Legacy sent the 预售发货提醒
 * from inside the order-paid path, so a WeChat timeout could roll back a
 * payment that had genuinely landed. Here there is no flag and no exception:
 * every notification is an effect, always.
 *
 * Five event types, all recorded in `presale.order.ts` and `presale.jobs.ts`:
 *
 * | scope     | event_type         | when                                            |
 * | --------- | ------------------ | ----------------------------------------------- |
 * | `order`   | `presale.paid`     | a presale order was paid; 发货承诺 is now fixed |
 * | `order`   | `presale.released` | a cancel or refund gave the campaign units back |
 * | `order`   | `presale.refund`   | the shop owes money nobody asked it for         |
 * | `presale` | `presale.opened`   | a campaign's sale window opened                 |
 * | `presale` | `presale.closed`   | a campaign's sale window closed                 |
 *
 * Four of the five are notifications with no transport yet (stream E2 owns
 * 订阅消息 / 公众号模板消息). `presale.refund` is the exception: it moves
 * money, through the refund domain's own entry point.
 */

// ---------------------------------------------------------------------------
// CR-3-d: the system-initiated refund
// ---------------------------------------------------------------------------

/**
 * How a presale gives the money back.
 *
 * CR-3-d was accepted and `refund/index.ts` now exports
 * `refundSystemInitiated`, so this is no longer a stand-in for a missing
 * export — it is an ordinary seam, declared the way stream D declared group
 * buy's. It stays because a unit test that wants to watch the effect handler
 * should not have to stand up a paid order, a payment attempt and a refundable
 * line; `registerAutoRefundPort` lets it substitute a spy, and the default is
 * the real thing.
 *
 * What it is *not* is an extension point: the only registration outside a test
 * is the default below, and anything that opens a `refunds` row still goes
 * through the refund domain's own entry point, ceiling check and all.
 *
 * Presale needs it for one case, and it is a case that involves a shopper's
 * money: `total_quota` is a ceiling on units **sold** and sales are counted
 * when the money arrives (STOCK-004), so a payment can be refused by a quota
 * that filled while it was in flight. The order is not rolled back — the money
 * is already ours — so it has to be given back.
 */
export interface AutoRefundPort {
  refund(
    tx: Tx,
    ctx: Ctx,
    input: { orderId: number; reason: 'presale_expired'; note?: string },
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
  activityId: string;
  reason: string;
}

/**
 * Gives a shopper their money back when the campaign could not sell to them.
 *
 * The transaction is opened here rather than by the payment that recorded the
 * effect, because the payment's own transaction had to commit: the money
 * arrived, and `presale_stock_ledger` had to record the units going back
 * whatever the refund does afterwards. `UNIQUE (scope, scope_id, event_type)`
 * gives exactly one effect per order however many payment callbacks arrive,
 * and `refundSystemInitiated` is idempotent per `(orderId, reason)` on top of
 * that, so a retried effect finds the refund it already opened and returns it
 * instead of opening a second.
 *
 * A throw here is still the right failure: the dispatcher retries eight times
 * and then parks the row as `unknown`, where the 待处理任务 console lists it
 * (it filters `scope in ('payment','refund','order')`, and this effect's scope
 * is `order`) and an operator settles it by hand. Swallowing the error would
 * lose a shopper's money quietly.
 */
async function handleRefundEffect(ctx: Ctx, effect: Effect): Promise<void> {
  const payload = effect.payload as RefundPayload;
  const port = autoRefundPort;
  const result = await ctx.withTx((tx) =>
    port.refund(tx, ctx, {
      orderId: Number(payload.orderId),
      reason: 'presale_expired',
      note: `预售活动 ${payload.activityId} 限购总量已满，无法发货`,
    }),
  );
  ctx.logger.info(
    {
      orderId: payload.orderId,
      activityId: payload.activityId,
      refundId: String(result.refundId),
      created: result.created,
    },
    'presale: a payment the campaign could not honour was refunded',
  );
}

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

/**
 * The four notification effects have no transport yet: stream E2 owns 订阅消息
 * / 公众号模板消息 and will register them against its own template mapping.
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
    'presale effect: no notification transport registered (stream E2)',
  );
}

/** Idempotent; `registerEffectHandler` replaces by `(scope, eventType)`. */
export function registerPresaleEffects(): void {
  registerEffectHandler('order', 'presale.paid', logOnly);
  registerEffectHandler('order', 'presale.released', logOnly);
  registerEffectHandler('order', 'presale.refund', handleRefundEffect);
  registerEffectHandler('presale', 'presale.opened', logOnly);
  registerEffectHandler('presale', 'presale.closed', logOnly);
}
