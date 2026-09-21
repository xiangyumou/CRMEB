import { z } from 'zod';
import { id, instant, money, pageQuery, paged, sortQuery } from '../_conventions/common';
import { productKind } from '../cart/schemas';

/**
 * Checkout and order shapes.
 *
 * Three families live here:
 *
 *  - the **draft** the shopper is looking at (`checkoutPreview*`), which is
 *    recomputed on the server on every call and never trusted from the client;
 *  - the **order** itself (`orderDetail`, `orderListItem`);
 *  - the **create** body, which is the preview's input plus an idempotency key.
 *
 * The create body deliberately repeats the preview body instead of carrying a
 * "preview token": the server recomputes everything either way, and a token
 * would only be a place for a stale price to hide. What the client *may* send
 * is `expectedPayableAmount` — see `checkoutCreateBody`.
 */

// ---------------------------------------------------------------------------
// enums (hand-copied from the PostgreSQL enums; the service asserts they match)
// ---------------------------------------------------------------------------

/** Mirrors `orders_status`. */
export const orderStatus = z.enum([
  'pending_payment',
  'paid',
  'shipped',
  'received',
  'completed',
  'cancelled',
  'refunded',
]);
export type OrderStatus = z.infer<typeof orderStatus>;

/** Mirrors `orders_fulfillment_status`. Read-only for this stream; B2 moves it. */
export const orderFulfillmentStatus = z.enum(['unfulfilled', 'partially_fulfilled', 'fulfilled']);
export type OrderFulfillmentStatus = z.infer<typeof orderFulfillmentStatus>;

/** Mirrors `orders_refund_status`. */
export const orderRefundStatus = z.enum(['none', 'requested', 'partially_refunded', 'refunded']);
export type OrderRefundStatus = z.infer<typeof orderRefundStatus>;

/** Mirrors `orders_kind`. `groupbuy` and `presale` are driven by stream D's `OrderKindHandler`. */
export const orderKind = z.enum(['normal', 'groupbuy', 'presale']);
export type OrderKind = z.infer<typeof orderKind>;

/** Who asked for the cancellation. Mirrors the `OrderCancelledEvent.reason` union in ports.ts. */
export const orderCancelReason = z.enum(['user', 'timeout', 'admin', 'payment-failed']);
export type OrderCancelReason = z.infer<typeof orderCancelReason>;

// ---------------------------------------------------------------------------
// checkout preview
// ---------------------------------------------------------------------------

/**
 * Where the lines come from.
 *
 * `cart` prices the ticked rows (or the named subset); `buy-now` prices one
 * variant that never entered the cart. Legacy modelled 立即购买 as a hidden
 * cart row with `is_new = 1` and then had to remember to delete it; here the
 * two are one union and nothing is written until the order is created.
 */
export const checkoutSource = z.enum(['cart', 'buy-now']);
export type CheckoutSource = z.infer<typeof checkoutSource>;

/**
 * What both `preview` and `create` need to know. Kept as a plain object so
 * `create` can extend it; the cross-field rule is attached to each of the two
 * exported schemas, because a `.refine()`d schema can no longer be extended.
 */
const checkoutInput = z.object({
  source: checkoutSource.default('cart'),
  /** `source: 'cart'` — the rows to price. Empty means "every ticked, available row". */
  cartItemIds: z.array(id).max(200).default([]),
  /** `source: 'buy-now'` — the single variant being bought. */
  item: z.object({ skuId: id, quantity: z.number().int().min(1).max(9999) }).optional(),
  /** Omit for the shopper's default address; `null` explicitly prices without one. */
  addressId: id.nullish(),
  /** The coupon the shopper picked in `/api/v1/user-coupons/applicable`. */
  userCouponId: id.nullish(),
  kind: orderKind.default('normal'),
  /** Opaque payload for the `OrderKindHandler` of a non-`normal` order (stream D). */
  kindMeta: z.record(z.string(), z.unknown()).optional(),
});

const buyNowNeedsAnItem = {
  check: (body: { source: CheckoutSource; item?: unknown }) =>
    body.source !== 'buy-now' || body.item !== undefined,
  message: '立即购买需要指定商品',
  path: ['item'] as const,
};

export const checkoutPreviewBody = checkoutInput.refine(buyNowNeedsAnItem.check, {
  message: buyNowNeedsAnItem.message,
  path: [...buyNowNeedsAnItem.path],
});
export type CheckoutPreviewBody = z.infer<typeof checkoutPreviewBody>;

/** The receiver snapshot as the preview and the order both show it. */
export const orderReceiver = z.object({
  addressId: id.nullable(),
  name: z.string(),
  phone: z.string(),
  province: z.string(),
  city: z.string(),
  district: z.string().nullable(),
  detail: z.string(),
  postCode: z.string().nullable(),
});
export type OrderReceiver = z.infer<typeof orderReceiver>;

export const orderReceiverExample = {
  addressId: '301',
  name: '张三',
  phone: '13800138000',
  province: '浙江省',
  city: '杭州市',
  district: '西湖区',
  detail: '文三路 100 号 3 单元 501',
  postCode: '310012',
} satisfies OrderReceiver;

/**
 * One priced line.
 *
 * `discountAmount` is this line's exact share of `couponDiscount` — the shares
 * are split with `Money.allocate`, so they always add back up to the order
 * total and a later partial refund never has to re-prorate.
 */
export const checkoutLine = z.object({
  /** Stable key within the order. Becomes `order_items.item_key`. */
  itemKey: z.string(),
  productId: id,
  skuId: id,
  /** Present when the line came from the cart, so the client can tick it off. */
  cartItemId: id.nullable(),
  productName: z.string(),
  productImageUrl: z.string(),
  productKind,
  skuImageUrl: z.string().nullable(),
  specText: z.string(),
  unitName: z.string().nullable(),
  quantity: z.number().int().min(1),
  unitPrice: money,
  originalUnitPrice: money.nullable(),
  /** `unitPrice * quantity`, before any discount. */
  subtotal: money,
  discountAmount: money,
  /** `subtotal - discountAmount`. Becomes `order_items.total_amount`. */
  totalAmount: money,
});
export type CheckoutLine = z.infer<typeof checkoutLine>;

export const checkoutLineExample = {
  itemKey: 'sku-21',
  productId: '11',
  skuId: '21',
  cartItemId: '5001',
  productName: '有机三只松鼠坚果礼盒',
  productImageUrl: 'https://cdn.example.com/p/11.jpg',
  productKind: 'physical',
  skuImageUrl: 'https://cdn.example.com/sku/21.jpg',
  specText: '混合装|1000g',
  unitName: '盒',
  quantity: 2,
  unitPrice: '60.00',
  originalUnitPrice: '88.00',
  subtotal: '120.00',
  discountAmount: '10.00',
  totalAmount: '110.00',
} satisfies CheckoutLine;

/**
 * One line of the 优惠明细 panel: what a marketing rule took off and why.
 *
 * Produced by the `PricingContributor`s in `core/src/order/ports.ts` plus the
 * coupon, in the order they were applied. `amount` is negative for a discount.
 */
export const priceAdjustment = z.object({
  /** `<domain>:<rule>`, e.g. `coupon:full-reduction`. */
  source: z.string(),
  label: z.string(),
  amount: z.string().regex(/^-?(0|[1-9]\d{0,9})\.\d{2}$/, '金额格式不正确'),
});
export type PriceAdjustment = z.infer<typeof priceAdjustment>;

export const checkoutPreview = z.object({
  lines: z.array(checkoutLine),
  receiver: orderReceiver.nullable(),
  /** True when any line is physical, i.e. an address is required to create the order. */
  addressRequired: z.boolean(),
  totalQuantity: z.number().int().min(1),
  /** Sum of the line subtotals. Becomes `orders.items_amount`. */
  itemsAmount: money,
  freightAmount: money,
  /**
   * Every goods-level discount added together: the coupon plus each
   * `PricingContributor`. It is what `orders.coupon_discount` stores and what
   * the per-line `discountAmount`s sum to. See `docs/rewrite/status/b1.md`.
   */
  couponDiscount: money,
  adjustments: z.array(priceAdjustment),
  /** `itemsAmount + freightAmount - couponDiscount`, floored at zero. */
  payableAmount: money,
  /** Echoed back so the client can tell a rejected coupon from an accepted one. */
  userCouponId: id.nullable(),
  /** Minutes the shopper will have to pay once the order exists. */
  payWindowMinutes: z.number().int().min(1),
  /** Answers the buyer must fill in, copied from `products.custom_form`. */
  customFormFields: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.enum([
          'text',
          'textarea',
          'number',
          'date',
          'select',
          'radio',
          'checkbox',
          'image',
        ]),
        required: z.boolean(),
        options: z.array(z.string()).optional(),
        placeholder: z.string().optional(),
      }),
    )
    .default([]),
});
export type CheckoutPreview = z.infer<typeof checkoutPreview>;

export const checkoutPreviewExample = {
  lines: [checkoutLineExample],
  receiver: orderReceiverExample,
  addressRequired: true,
  totalQuantity: 2,
  itemsAmount: '120.00',
  freightAmount: '8.00',
  couponDiscount: '10.00',
  adjustments: [{ source: 'coupon:full-reduction', label: '满 100 减 10', amount: '-10.00' }],
  payableAmount: '118.00',
  userCouponId: '9001',
  payWindowMinutes: 30,
  customFormFields: [],
} satisfies CheckoutPreview;

// ---------------------------------------------------------------------------
// order creation
// ---------------------------------------------------------------------------

export const checkoutCreateBody = checkoutInput
  .extend({
    /**
     * Client-generated, unique per submit attempt. A second POST with the same
     * key returns the order the first one created instead of creating another.
     *
     * Legacy guarded this with a Redis lock that was never tested and could not
     * survive a restart (`CacheService::lock('orderCreate…')`, risk matrix §2);
     * here it is a uniqueness constraint in the same transaction as the order.
     */
    idempotencyKey: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, '幂等键格式不正确'),
    buyerRemark: z.string().max(512).optional(),
    /** Answers to `products.custom_form`, keyed by field. */
    customForm: z.record(z.string(), z.unknown()).optional(),
    /**
     * What the shopper was shown. When present and the server's recomputation
     * disagrees, the order is refused with `ORDER_PRICE_CHANGED` instead of
     * charging a price nobody agreed to (risk matrix §1, "SKU swap between
     * confirm and create").
     */
    expectedPayableAmount: money.optional(),
  })
  .refine(buyNowNeedsAnItem.check, {
    message: buyNowNeedsAnItem.message,
    path: [...buyNowNeedsAnItem.path],
  });
export type CheckoutCreateBody = z.infer<typeof checkoutCreateBody>;

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------

export const orderItem = z.object({
  id,
  itemKey: z.string(),
  productId: id,
  skuId: id,
  productName: z.string(),
  productImageUrl: z.string(),
  productKind,
  specText: z.string(),
  skuImageUrl: z.string().nullable(),
  unitName: z.string().nullable(),
  quantity: z.number().int().min(1),
  unitPrice: money,
  originalUnitPrice: money.nullable(),
  discountAmount: money,
  totalAmount: money,
  refundedQuantity: z.number().int().min(0),
  shippedQuantity: z.number().int().min(0),
});
export type OrderItem = z.infer<typeof orderItem>;

export const orderItemExample = {
  id: '7001',
  itemKey: 'sku-21',
  productId: '11',
  skuId: '21',
  productName: '有机三只松鼠坚果礼盒',
  productImageUrl: 'https://cdn.example.com/p/11.jpg',
  productKind: 'physical',
  specText: '混合装|1000g',
  skuImageUrl: 'https://cdn.example.com/sku/21.jpg',
  unitName: '盒',
  quantity: 2,
  unitPrice: '60.00',
  originalUnitPrice: '88.00',
  discountAmount: '10.00',
  totalAmount: '110.00',
  refundedQuantity: 0,
  shippedQuantity: 0,
} satisfies OrderItem;

export const orderListItem = z.object({
  id,
  orderNo: z.string(),
  kind: orderKind,
  status: orderStatus,
  fulfillmentStatus: orderFulfillmentStatus,
  refundStatus: orderRefundStatus,
  totalQuantity: z.number().int().min(1),
  itemsAmount: money,
  freightAmount: money,
  couponDiscount: money,
  payableAmount: money,
  paidAmount: money.nullable(),
  /** `null` once the order left `pending_payment`. The client counts down to it. */
  payExpiresAt: instant.nullable(),
  createdAt: instant,
  items: z.array(orderItem),
});
export type OrderListItem = z.infer<typeof orderListItem>;

export const orderListItemExample = {
  id: '9001',
  orderNo: '202602011000000010123456',
  kind: 'normal',
  status: 'pending_payment',
  fulfillmentStatus: 'unfulfilled',
  refundStatus: 'none',
  totalQuantity: 2,
  itemsAmount: '120.00',
  freightAmount: '8.00',
  couponDiscount: '10.00',
  payableAmount: '118.00',
  paidAmount: null,
  payExpiresAt: '2026-02-01T10:30:00+08:00',
  createdAt: '2026-02-01T10:00:00+08:00',
  items: [orderItemExample],
} satisfies OrderListItem;

export const orderDetail = orderListItem.extend({
  receiver: orderReceiver,
  buyerRemark: z.string().nullable(),
  customForm: z.record(z.string(), z.unknown()).nullable(),
  userCouponId: id.nullable(),
  paidAt: instant.nullable(),
  shippedAt: instant.nullable(),
  receivedAt: instant.nullable(),
  completedAt: instant.nullable(),
  cancelledAt: instant.nullable(),
  cancelReason: z.string().nullable(),
});
export type OrderDetail = z.infer<typeof orderDetail>;

export const orderDetailExample = {
  ...orderListItemExample,
  receiver: orderReceiverExample,
  buyerRemark: '请在工作日送达',
  customForm: null,
  userCouponId: '9001',
  paidAt: null,
  shippedAt: null,
  receivedAt: null,
  completedAt: null,
  cancelledAt: null,
  cancelReason: null,
} satisfies OrderDetail;

/**
 * The storefront's 我的订单 tabs. They are not `orders.status` values: 待收货
 * covers `shipped`, and 已完成 covers both `received` and `completed`, exactly
 * as the uni-app tab bar has always shown them.
 */
export const orderListTab = z.enum([
  'all',
  'unpaid',
  'unshipped',
  'shipping',
  'unreceived',
  'finished',
  'cancelled',
  'refunding',
]);
export type OrderListTab = z.infer<typeof orderListTab>;

export const orderListQuery = pageQuery
  .extend({
    tab: orderListTab.default('all'),
    /** Order number or product name substring. */
    keyword: z.string().max(64).optional(),
  })
  .extend(sortQuery(['createdAt', 'payableAmount']).shape);
export type OrderListQuery = z.infer<typeof orderListQuery>;

export const pagedOrders = paged(orderListItem);

/** The badge numbers on the tab bar. One query, not eight. */
export const orderCounts = z.object({
  all: z.number().int().min(0),
  unpaid: z.number().int().min(0),
  unshipped: z.number().int().min(0),
  unreceived: z.number().int().min(0),
  finished: z.number().int().min(0),
  cancelled: z.number().int().min(0),
  refunding: z.number().int().min(0),
});
export type OrderCounts = z.infer<typeof orderCounts>;

export const orderCountsExample = {
  all: 12,
  unpaid: 1,
  unshipped: 2,
  unreceived: 3,
  finished: 5,
  cancelled: 1,
  refunding: 0,
} satisfies OrderCounts;

export const orderCancelBody = z.object({
  /** Free text the buyer typed, shown in the order timeline. */
  reason: z.string().max(255).optional(),
});
export type OrderCancelBody = z.infer<typeof orderCancelBody>;
