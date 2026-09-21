import { defineErrors } from '../_conventions/errors';

/**
 * Order error codes.
 *
 * One code per decision the caller can act on, not per internal branch. The
 * shopper can do something different about "库存不足" and about "地址不存在";
 * they can do nothing different about which of five reasons made a coupon
 * unusable, which is why that one stays a single `COUPON_NOT_USABLE` in the
 * coupon domain.
 *
 * The three cancellation codes are the cancel-vs-pay decision table from the
 * brief, verbatim: the gateway says `closed` (cancel proceeds), `paid`
 * (`ORDER_ALREADY_PAID`, and the order is marked paid first) or `unknown`
 * (`ORDER_PAYMENT_STATE_UNKNOWN`, and nothing at all is released).
 */
export const orderErrors = defineErrors({
  /** Unknown id, somebody else's order, or hidden by its owner. Same message for all three. */
  ORDER_NOT_FOUND: { status: 404, message: '订单不存在' },

  // --- checkout -----------------------------------------------------------
  /** No cart row was ticked, or every ticked row turned out to be unsellable. */
  ORDER_EMPTY: { status: 422, message: '没有可结算的商品' },
  /** A line's product is deleted, `draft`, `off_shelf`, or its variant is hidden. `details: { skuIds }`. */
  ORDER_ITEM_UNAVAILABLE: { status: 409, message: '部分商品已下架，请重新选择' },
  /**
   * The stock reservation came back short. `details` carries the lines that
   * could not be satisfied, so the client can mark them in place.
   */
  ORDER_OUT_OF_STOCK: { status: 409, message: '部分商品库存不足' },
  /** `products.purchase_limit_mode`. `details: { skuId, limit }`. */
  ORDER_PURCHASE_LIMIT_REACHED: { status: 409, message: '超出该商品的限购数量' },
  /** `products.min_purchase_quantity`. `details: { skuId, minimum }`. */
  ORDER_BELOW_MIN_PURCHASE: { status: 422, message: '未达到该商品的起购数量' },
  /** A `virtual_card` line may only ever carry one unit (SCHEMA.md §3.3). */
  ORDER_VIRTUAL_CARD_QUANTITY: { status: 422, message: '卡密商品每单只能购买 1 件' },
  /** Physical goods with no address chosen and no default address on file. */
  ORDER_ADDRESS_REQUIRED: { status: 422, message: '请选择收货地址' },
  /** The named address does not exist, was deleted, or belongs to somebody else. */
  ORDER_ADDRESS_NOT_FOUND: { status: 404, message: '收货地址不存在' },
  /** A required `products.custom_form` field was not answered. `details: { fields }`. */
  ORDER_CUSTOM_FORM_INCOMPLETE: { status: 422, message: '请填写完整的商品表单' },
  /**
   * `expectedPayableAmount` disagreed with the server's recomputation: a price,
   * a coupon or a freight rule moved between 确认订单 and 提交订单.
   * `details: { expected, actual }`.
   */
  ORDER_PRICE_CHANGED: { status: 409, message: '商品价格有变动，请重新确认订单' },

  // --- cancellation -------------------------------------------------------
  /** The order is not in `pending_payment` any more — already cancelled, or already moving on. */
  ORDER_NOT_CANCELLABLE: { status: 409, message: '订单当前状态不可取消' },
  /**
   * The gateway reported the money arrived while the cancellation was in
   * flight. The order has been marked paid; nothing was released.
   */
  ORDER_ALREADY_PAID: { status: 409, message: '订单已支付，无法取消' },
  /**
   * The gateway would not say whether an attempt can still succeed. Nothing is
   * released — not the stock, not the coupon — and the caller retries later.
   * Never guess (risk matrix §4, QUEUE-004).
   */
  ORDER_PAYMENT_STATE_UNKNOWN: { status: 409, message: '支付状态确认失败，请稍后重试' },
  /**
   * The coupon could not be returned, so the whole cancellation rolled back —
   * the stock was never touched and the order is still live (QUEUE-006/007).
   */
  ORDER_COUPON_RELEASE_FAILED: { status: 409, message: '优惠券退回失败，请稍后重试' },
});

export type OrderErrorCode = keyof typeof orderErrors;
