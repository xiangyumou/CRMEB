import { defineErrors } from '../_conventions/errors';

/**
 * Refund error codes.
 *
 * The interesting ones are the four that exist because of a *database* rule,
 * so that a race surfaces as a refusal a shopper can read rather than a 500:
 *
 *  - `REFUND_ALREADY_OPEN` — the partial unique index
 *    `refund_items(order_item_id) WHERE is_open` refused the insert. Two
 *    simultaneous applications on one line: one wins, the other reads this.
 *  - `REFUND_EXCEEDS_PAID` — the cumulative ceiling under the order-row lock,
 *    backstopped by `orders_refunded_within_paid` (REFUND-007).
 *  - `REFUND_AMOUNT_MISMATCH` — a retry arrived carrying a different amount
 *    from the one frozen at creation. Refused, never silently ignored the way
 *    the legacy `applyRefund` did (REFUND-005).
 *  - `REFUND_STATE_UNKNOWN` — the gateway's answer was lost. The frozen
 *    `out_refund_no` is queryable; it is never re-sent under a new number.
 */
export const refundErrors = defineErrors({
  /** The order does not exist, is soft-deleted, or belongs to somebody else. */
  REFUND_ORDER_NOT_FOUND: { status: 404, message: '订单不存在' },
  /** Unpaid, cancelled, or already fully refunded: there is nothing to give back. */
  REFUND_ORDER_NOT_REFUNDABLE: { status: 409, message: '该订单当前无法申请退款' },
  /** A line id that is not on this order, or a quantity beyond what is left. */
  REFUND_LINE_INVALID: { status: 422, message: '退款商品或数量不正确' },
  /** `refund_items_open_uq` refused: that line is already inside an in-flight refund. */
  REFUND_ALREADY_OPEN: { status: 409, message: '该商品已有正在处理的售后申请' },
  /** The request would push the order's refunded total past what was collected. */
  REFUND_EXCEEDS_PAID: { status: 409, message: '退款金额超过实付金额' },
  /** Nothing to refund: every chosen line computes to zero. */
  REFUND_AMOUNT_ZERO: { status: 422, message: '退款金额必须大于 0' },
  /** Freight was asked for after the order shipped. */
  REFUND_FREIGHT_NOT_REFUNDABLE: { status: 409, message: '订单已发货，运费不可退' },

  /** The refund does not exist, is soft-deleted, or belongs to somebody else. */
  REFUND_NOT_FOUND: { status: 404, message: '售后单不存在' },
  /** Approve / reject / cancel / receive-return arrived for a status that does not allow it. */
  REFUND_NOT_ACTIONABLE: { status: 409, message: '该售后单当前状态无法执行此操作' },
  /** Return shipment info on a `refund_only`, or before the request was approved. */
  REFUND_RETURN_NOT_EXPECTED: { status: 409, message: '该售后单无需填写退货物流' },

  /**
   * A retry disagrees with the frozen request. `details` carries
   * `{ frozenAmount, requestedAmount }` so support can see both.
   */
  REFUND_AMOUNT_MISMATCH: { status: 409, message: '退款金额与已冻结的申请不一致，请人工核对' },
  /** The order has no WeChat payment to refund through (no attempt, or no transaction id). */
  REFUND_NO_ORIGINAL_PAYMENT: { status: 409, message: '该订单没有可原路退回的支付记录' },
  /** The gateway refused the refund with a business code. `details` carries it. */
  REFUND_GATEWAY_REFUSED: { status: 502, message: '退款网关拒绝了本次请求，请稍后重试' },
  /** The gateway's answer was lost. Nothing is restored; the frozen number is queried later. */
  REFUND_STATE_UNKNOWN: { status: 409, message: '退款结果未知，请人工核对后处理' },
});

export type RefundErrorCode = keyof typeof refundErrors;
