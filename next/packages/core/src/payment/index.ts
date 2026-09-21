import { registerPaymentPort } from '../order/ports';
import { registerPaymentEffects } from './payment.effects';
import { closeOrderPayments, ensureNoOpenAttempts } from './payment.service';

/**
 * The payment domain's public surface.
 *
 * CONVENTIONS: a domain in `core` may import another domain only through its
 * `index.ts`. So this file is the contract between payment and everybody else,
 * and `payment.repo.ts` in particular is private — nothing outside this folder
 * may write a `payment_attempts` row.
 *
 * ## What other streams call
 *
 * | Function                | Caller | When                                            |
 * | ----------------------- | ------ | ----------------------------------------------- |
 * | `closeOrderPayments`    | B1     | **before** cancelling an order, outside the tx  |
 * | `ensureNoOpenAttempts`  | B1     | inside the cancelling transaction (the port)    |
 * | `settlePayment`         | C only | the one place money becomes state               |
 * | `payClient`             | refund | the gateway client, already configured          |
 * | `recordCallback`        | refund | the refund webhook's idempotency insert         |
 * | `applyExceptionRefundNotification` | refund | a refund notification with an `X` number |
 *
 * The cancel path is two calls, not one, and the order matters. The port may
 * not make a network call — it runs inside a transaction with the order row
 * locked — so it can only report what the database already knows. B1 therefore
 * calls `closeOrderPayments(ctx, orderId)` first, outside the transaction, and
 * only proceeds to cancel if it answered `closed`. `paid` means the money
 * arrived and the order is now paid; `unknown` means the gateway did not
 * answer, and **nothing may be released** — not stock, not the coupon
 * (QUEUE-003 / QUEUE-004).
 */

export {
  ackOrThrow,
  applyExceptionRefundNotification,
  closeOrderPayments,
  ensureNoOpenAttempts,
  handleTransactionNotify,
  payClient,
  paymentRuntime,
  paymentStatus,
  reconcileAttempt,
  recheckException,
  refundException,
  settlePayment,
  startPayment,
  type PaymentRuntime,
  type PaymentState,
  type SettlementFacts,
  type SettlementOutcome,
  type StartPaymentInput,
  type WebhookResult,
} from './payment.service';

export {
  adminExceptionDetail,
  adminFlowSummary,
  adminIgnoreException,
  adminListAttempts,
  adminListEffects,
  adminListExceptions,
  adminListFlows,
  adminRecheckException,
  adminRefundException,
  adminRetryEffect,
} from './payment.admin';

export {
  closeExpiredPayments,
  recheckExceptionRefunds,
  reconcileStalePayments,
  type SweepOptions,
  type SweepReport,
} from './payment.jobs';

export {
  NOTIFY_PATHS,
  paymentConfig,
  paymentCredentials,
  type PaymentConfig,
} from './payment.config';
export { paymentPermissions } from './permissions';
export { registerPaymentEffects } from './payment.effects';

/**
 * The refund domain needs exactly two things from payment's tables: the
 * attempt a refund goes back through, and the callback ledger that makes a
 * replayed refund notification a no-op. Both are re-exported rather than
 * reached for.
 */
export {
  findAttempt as findPaymentAttempt,
  findAttemptByOutTradeNo as findPaymentAttemptByOutTradeNo,
  findPaidAttempt as findPaidPaymentAttempt,
  insertCallback as recordCallback,
  insertCapitalFlow as recordCapitalFlow,
  markCallbackProcessed,
  type AttemptRow as PaymentAttemptRow,
} from './payment.repo';

/**
 * Wires the domain into the platform.
 *
 * Called once per process from the gen'd bootstrap. Registration is separate
 * from definition so a unit test can import a service without acquiring a
 * global port, and so `resetOrderPorts()` in a test can put it back.
 */
export function registerPaymentDomain(): void {
  registerPaymentPort({ ensureNoOpenAttempts, closeOrderPayments });
  registerPaymentEffects();
}
