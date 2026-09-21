import { registerRefundEffects } from './refund.effects';

/**
 * The refund domain's public surface.
 *
 * CONVENTIONS: a domain in `core` may import another domain only through its
 * `index.ts`. So this file is the contract between after-sales and everybody
 * else, and `refund.repo.ts` is private — nothing outside this folder may write
 * a `refunds` row.
 *
 * ## Direction of dependency
 *
 * `refund → payment`, never the other way. The refund domain is the one that
 * knows about `refunds` rows, so it owns the **refund webhook**
 * (`handleRefundNotify`) and hands anything it does not recognise back to
 * payment, whose exception refunds carry their own `X` numbers.
 *
 * ## What other streams call
 *
 * | Function                | Caller | When                                          |
 * | ----------------------- | ------ | --------------------------------------------- |
 * | `handleRefundNotify`    | route  | `POST /api/v1/webhooks/wechat-refund`         |
 * | `executeRefund`         | C only | the effect handler and the admin retry        |
 * | `reconcileStaleRefunds` | worker | the sweep                                     |
 *
 * There is deliberately no "create a refund on behalf of a user" export. A
 * group-buy that fails (`is_automatic`) is a future caller and will get its own
 * entry point with its own ceiling check; nothing may insert a `refunds` row by
 * reaching past this file.
 */

export {
  applicableItems,
  apply,
  cancel,
  detail,
  executeRefund,
  handleRefundNotify,
  hide,
  myDetail,
  myList,
  reconcileRefund,
  refundReasons,
  settleRefundSucceeded,
  submitReturnShipment,
  REFUND_REASONS,
  type ExecuteResult,
} from './refund.service';

export {
  adminApprove,
  adminDetail,
  adminList,
  adminReceiveReturn,
  adminReject,
  adminRemark,
  adminRetry,
} from './refund.admin';

export {
  reconcileStaleRefunds,
  type RefundSweepOptions,
  type RefundSweepReport,
} from './refund.jobs';

export { refundConfig, returnAddress, type RefundConfig } from './refund.config';
export { refundPermissions } from './permissions';
export { registerRefundEffects } from './refund.effects';

/**
 * Wires the domain into the platform. Called once per process from the gen'd
 * bootstrap; kept separate from definition so a unit test can import a service
 * without acquiring a global handler.
 */
export function registerRefundDomain(): void {
  registerRefundEffects();
}
