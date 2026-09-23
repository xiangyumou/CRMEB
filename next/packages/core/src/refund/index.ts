import { registerStaffRefundPort } from '../order';
import { staffApprove, staffDetail, staffList, staffReject, staffRemark } from './refund.admin';
import { registerRefundEffects } from './refund.effects';
import { registerRefundNotificationEvents } from './refund.notifications';

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
 * | `refundSystemInitiated` | D / D2 | a failed group buy, an expired presale        |
 *
 * There is still no "create a refund on behalf of a user" export, and there
 * never will be: `apply` needs a `ctx` whose actor is the buyer. What CR-3-d
 * added is the other thing — a refund the **shop** owes without anybody asking,
 * with its own ceiling check and no approval step
 * (`refund.system.service.ts`). Nothing may insert a `refunds` row by reaching
 * past this file.
 */

// `detail` (any after-sale by id, no ownership check) is deliberately not here
// (CR-6-k2): the storefront reads through `myDetail`, the admin through
// `adminDetail`, and in-domain callers import it from `./refund.service`.
export {
  applicableItems,
  apply,
  cancel,
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
  refundSystemInitiated,
  type SystemRefundInput,
  type SystemRefundReason,
  type SystemRefundResult,
} from './refund.system.service';

export {
  reconcileStaleRefunds,
  type RefundSweepOptions,
  type RefundSweepReport,
} from './refund.jobs';

export { refundConfig, returnAddress, type RefundConfig } from './refund.config';
export { refundPermissions } from './permissions';
export { registerRefundEffects } from './refund.effects';
export { REFUND_EXCEPTION_EVENT, registerRefundNotificationEvents } from './refund.notifications';

/**
 * Wires the domain into the platform. Called once per process from the gen'd
 * bootstrap; kept separate from definition so a unit test can import a service
 * without acquiring a global handler.
 */
export function registerRefundDomain(): void {
  registerRefundEffects();
  // CR-4-k2 / CR-5-k2: a gateway answer that does not match the refund.
  registerRefundNotificationEvents();
  // B2's staff console owns the phone-sized surface, this domain owns the
  // money. The port used to forward into the admin services, whose admin atoms
  // a staff actor can never hold, so every staff request answered 403
  // (CR-14-k). It now gets the staff entry points: they accept only a `staff`
  // actor (the `auth: 'staff'` allow-list is the gate), reach only what the
  // phone has, and share the transition code with the console, so 同意 on the
  // phone and 同意 in the console still move the row the same way. Until this
  // runs, the staff routes answer INTERNAL.
  registerStaffRefundPort({
    list: staffList,
    detail: staffDetail,
    approve: (ctx, params, body) =>
      staffApprove(ctx, {
        ...params,
        ...(body.remark === undefined ? {} : { remark: body.remark }),
      }),
    reject: (ctx, params, body) => staffReject(ctx, { ...params, ...body }),
    // 售后备注 is the one staff action that is not the console's: it appends to
    // the refund's log instead of overwriting `refunds.admin_remark` (CR-4-h §2).
    remark: (ctx, params, body) => staffRemark(ctx, { ...params, ...body }),
  });
}
