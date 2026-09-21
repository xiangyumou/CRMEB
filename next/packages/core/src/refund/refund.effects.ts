import { registerEffectHandler } from '../effects';
import * as repo from './refund.repo';
import { executeRefund } from './refund.service';

/**
 * Refund's post-commit side effect.
 *
 * Exactly one, and it is the one that moves money: approving a `refund_only`, or
 * confirming that returned goods arrived, records `refund.execute` in the same
 * transaction as the decision. The gateway call then happens after that
 * transaction commits — the only ordering that cannot lose money, because an
 * in-transaction call would either refund something we then rolled back, or roll
 * back a refund WeChat already made.
 *
 * Delivery is at-least-once, so the handler has to be idempotent. It is: the
 * claim inside `executeRefund` only moves a row out of a state that allows
 * execution, and `out_refund_no` is frozen on the row, so a re-send is the same
 * refund as far as WeChat is concerned.
 *
 * The handler deliberately does **not** throw on a refusal or on an unknown
 * answer. Retrying a NOTENOUGH eight times helps nobody, and an `unknown` row is
 * the reconciliation sweep's job, not the ledger's — both leave a row an
 * operator can see and act on, which is what the 待处理 console is for.
 */
export function registerRefundEffects(): void {
  registerEffectHandler('refund', 'refund.execute', async (ctx, effect) => {
    const refundId = Number(effect.scopeId);
    if (!Number.isInteger(refundId)) {
      throw new Error(`refund.execute: 非法 scopeId ${effect.scopeId}`);
    }

    const row = await repo.findRefund(ctx.db, refundId);
    if (!row) {
      ctx.logger.warn({ refundId }, 'refund vanished before its gateway call ran');
      return;
    }
    // A human, a sweep or the buyer got there first. Not a failure.
    if (!(repo.OPEN_REFUND_STATUSES as readonly string[]).includes(row.status)) return;
    if (row.status === 'applied') return;

    const result = await executeRefund(ctx, refundId);
    if (result.status === 'failed' || result.status === 'unknown') {
      ctx.logger.error(
        { refundId, result: result.status, message: result.message },
        'automatic refund did not settle; left for an operator',
      );
    }
  });
}
