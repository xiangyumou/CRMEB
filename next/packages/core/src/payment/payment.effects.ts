import { registerEffectHandler } from '../effects';
import { DomainError } from '../kernel/errors';
import { refundException } from './payment.service';
import { findException } from './payment.repo';

/**
 * Payment's post-commit side effects.
 *
 * Exactly one, and it is the one that moves money: when a verified payment
 * cannot be booked against an order, the callback transaction records a
 * `payment_exceptions` row *and* this effect, in the same transaction. The
 * refund then happens after that transaction has committed, which is the only
 * ordering that cannot lose money — an in-transaction gateway call would either
 * refund something we then rolled back, or roll back a refund the gateway
 * already made.
 *
 * Delivery is at-least-once, so the handler has to be idempotent. It is,
 * twice over: `claimExceptionForRefund` freezes the refund number on the row
 * and only moves `open|refund_failed → refunding`, and WeChat itself treats a
 * repeated `out_refund_no` with the same amount as the same refund.
 *
 * A row an operator has already handled (`refunded`, `ignored`) makes the
 * handler a no-op rather than an error: the human beat the machine to it, which
 * is a success, not a failure to retry.
 */
export function registerPaymentEffects(): void {
  registerEffectHandler('payment', 'payment.exception.refund', async (ctx, effect) => {
    const exceptionId = Number(effect.scopeId);
    if (!Number.isInteger(exceptionId)) {
      throw new Error(`payment.exception.refund: 非法 scopeId ${effect.scopeId}`);
    }

    const row = await findException(ctx.db, exceptionId);
    if (!row) {
      ctx.logger.warn({ exceptionId }, 'payment exception vanished before its refund ran');
      return;
    }
    if (row.status === 'refunded' || row.status === 'ignored') return;
    if (row.transactionId === '') return;

    try {
      await refundException(ctx, exceptionId, { operatorAdminId: null });
    } catch (error) {
      // A gateway refusal is final for this attempt — retrying a NOTENOUGH
      // eight times helps nobody — so the row is left `refund_failed` for an
      // operator and the effect is allowed to finish. Anything else throws, and
      // the ledger's backoff brings it round again.
      if (error instanceof DomainError && error.code === 'PAYMENT_GATEWAY_REFUSED') {
        ctx.logger.error(
          { exceptionId, err: error },
          'automatic exception refund refused by the gateway; left for an operator',
        );
        return;
      }
      throw error;
    }
  });
}
